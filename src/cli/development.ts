import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  loadLivePlanningConfig, loadPlanningConfig, resolveProjectPath,
} from "../planning/config.js";
import { FilePlanningMemoryStore } from "../planning/memory-store.js";
import { approvePlan, FileDevelopmentStore, ManualDevelopmentController } from "../development/index.js";
import { record, statuses, text } from "../development/validation.js";
import type { TaskStatus } from "../core/types.js";

async function main(): Promise<void> {
  const [command, ...values] = process.argv.slice(2);
  const commands: Readonly<Record<string, readonly string[]>> = {
    "plan-approve": ["plan", "reason"], init: ["plan", "file"], list: [],
    assign: ["task", "agent", "reason"], submit: ["task", "file", "reason"],
    review: ["task", "file", "reason"], transition: ["task", "status", "reason"],
  };
  if (command === undefined || !Object.hasOwn(commands, command)) throw new Error("Usage: development <plan-approve|init|list|assign|submit|review|transition> --config <file> ...");
  const args = new Map<string, string>();
  const allowed = new Set(["config", ...(commands[command] ?? [])]);
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (key === undefined || !key.startsWith("--") || !allowed.has(key.slice(2)) || value === undefined || value.startsWith("--") || args.has(key.slice(2))) {
      throw new Error("Unknown, duplicate, or missing command argument.");
    }
    args.set(key.slice(2), value);
  }
  const arg = (key: string) => text(args.get(key));
  for (const key of allowed) arg(key);
  const root = resolve(process.cwd());
  const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(resolveProjectPath(root, file), "utf8"));
  const configRaw = record(await readJson(arg("config")));
  const writer = record(record(configRaw.planning).writer);
  const config = writer.providerId === "fake" ? await loadPlanningConfig(arg("config"), root) : await loadLivePlanningConfig(arg("config"), root);
  const planning = new FilePlanningMemoryStore(config.memory.directory);
  const controller = new ManualDevelopmentController(config.projectId, planning, new FileDevelopmentStore(config.memory.directory));
  if (command === "plan-approve") {
    const state = await planning.getPlanningLoopState(config.projectId);
    const version = state?.currentPlanVersion;
    if (version === undefined) throw new Error("No plan to approve.");
    const plan = await planning.getPlanDraft(config.projectId, arg("plan"), version);
    if (plan === undefined) throw new Error("Plan not found.");
    console.log(plan.content);
    const phrase = `APPROVE ${plan.id} v${version}`;
    const prompt = createInterface({ input: stdin, output: stdout });
    try {
      if ((await prompt.question(`Final plan approval: type ${phrase}: `)).trim() !== phrase) throw new Error("Plan approval was not confirmed.");
    } finally { prompt.close(); }
    console.log(JSON.stringify(await approvePlan(planning, config.projectId, plan.id, arg("reason")), null, 2));
    return;
  }
  let result: unknown;
  switch (command) {
    case "init": result = await controller.initialize(arg("plan"), await readJson(arg("file"))); break;
    case "list": result = await controller.state(); break;
    case "assign": result = await controller.assign(arg("task"), arg("agent"), arg("reason")); break;
    case "submit": result = await controller.submit(arg("task"), await readJson(arg("file")), arg("reason")); break;
    case "review": result = await controller.review(arg("task"), await readJson(arg("file")), arg("reason")); break;
    case "transition": {
      const status = arg("status");
      if (!statuses.includes(status as TaskStatus) || !["ready", "pending", "blocked", "cancelled"].includes(status)) {
        throw new Error("Use assign, submit and review for execution states; transition supports ready, pending, blocked, cancelled.");
      }
      result = await controller.transition(arg("task"), status as TaskStatus, arg("reason"));
      break;
    }
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(`[ADTF] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
