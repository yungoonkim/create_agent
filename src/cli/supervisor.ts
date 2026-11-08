import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadLivePlanningConfig, loadPlanningConfig, resolveProjectPath } from "../planning/config.js";
import { FilePlanningMemoryStore } from "../planning/memory-store.js";
import { FakePlanningWriter } from "../planning/fake-writer.js";
import { FakePlanningReviewer } from "../planning/fake-reviewer.js";
import { createVertexAiClient, GeminiPlanningReviewer, GeminiPlanningWriter } from "../planning/google-genai.js";
import { FileDevelopmentStore } from "../development/memory-store.js";
import { record, text } from "../development/validation.js";
import { SupervisorController } from "../supervisor/controller.js";
import { FileSupervisorStore } from "../supervisor/memory-store.js";
import { GeminiSupervisorProposer } from "../supervisor/google-genai.js";
import type { SupervisorProposer } from "../supervisor/contracts.js";

async function main(): Promise<void> {
  const commands: Readonly<Record<string, readonly string[]>> = {
    start: ["file"], questions: [], answer: ["file"], "propose-scope": [], "approve-scope": ["reason"], "reject-scope": ["reason"],
    plan: [], "approve-plan": ["reason"], "propose-tasks": [], "configure-verification": ["file"], "initialize-tasks": [], report: [],
    "collect-feedback": [], "request-scope-change": ["reason"], "propose-scope-change": [],
    "approve-scope-change": ["reason"], "reject-scope-change": ["reason"], "resume-plan": [],
  };
  const [command, ...values] = process.argv.slice(2);
  if (command === undefined || !Object.hasOwn(commands, command)) throw new Error(`Usage: supervisor <${Object.keys(commands).join("|")}> --config <file> ...`);
  const args = new Map<string, string>();
  const required = ["config", ...(commands[command] ?? [])];
  const allowed = new Set([...required, "fixture"]);
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index], value = values[index + 1];
    if (key === undefined || !key.startsWith("--") || !allowed.has(key.slice(2)) || value === undefined || value.startsWith("--") || args.has(key.slice(2))) throw new Error("Unknown, duplicate or missing argument.");
    args.set(key.slice(2), value);
  }
  const arg = (key: string) => text(args.get(key));
  required.forEach(arg);
  const root = resolve(process.cwd());
  const readText = (file: string) => readFile(resolveProjectPath(root, file), "utf8");
  const readJson = async (file: string): Promise<unknown> => JSON.parse(await readText(file));
  const raw = record(await readJson(arg("config")));
  const fake = record(record(raw.planning).writer).providerId === "fake";
  const offlineConfig = fake ? await loadPlanningConfig(arg("config"), root) : undefined;
  const config = offlineConfig ?? await loadLivePlanningConfig(arg("config"), root);
  if (!fake && args.has("fixture")) throw new Error("Fixtures are allowed only with fake models.");
  const memory = new FilePlanningMemoryStore(config.memory.directory);
  const store = new FileSupervisorStore(config.memory.directory);
  const modelCommands = ["questions", "propose-scope", "plan", "propose-tasks", "propose-scope-change", "resume-plan"];
  // Report/approval/intake never require credentials or construct a provider client.
  const live = !fake && modelCommands.includes(command);
  const confirm = async (phrase: string, label: string): Promise<string> => {
    const prompt = createInterface({ input: stdin, output: stdout });
    try { const answer = (await prompt.question(`${label}\nType ${phrase}: `)).trim(); if (answer !== phrase) throw new Error("Confirmation did not match."); return answer; }
    finally { prompt.close(); }
  };
  if (live) {
    console.log(JSON.stringify({ model: config.planning.writer.model, reviewer: config.planning.reviewer.model, projectId: config.projectId, data: await store.get(config.projectId) }, null, 2));
    await confirm("CALL", "This sends the stored request, answers and relevant Scope/Plan to Vertex AI and may incur charges.");
  }
  const client = live ? createVertexAiClient() : undefined;
  const unavailable = async (): Promise<never> => { throw new Error("Fake proposals need --fixture <TEST/STUB JSON file>."); };
  let proposer: SupervisorProposer = { questions: unavailable, scope: unavailable, tasks: unavailable };
  if (client !== undefined) proposer = new GeminiSupervisorProposer(client, config.planning.writer, (usage) => store.appendUsage(usage));
  else if (args.has("fixture")) {
    const fixture = record(await readJson(arg("fixture")));
    if (fixture.label !== "TEST/STUB") throw new Error("Fixture must be labeled TEST/STUB.");
    proposer = { questions: async () => fixture.questions, scope: async () => fixture.scope, tasks: async () => fixture.orders };
  }
  const controller = new SupervisorController({ config, memory, store,
    developmentStore: new FileDevelopmentStore(config.memory.directory), proposer,
    writer: client === undefined ? new FakePlanningWriter() : new GeminiPlanningWriter(client, memory),
    reviewer: client === undefined ? new FakePlanningReviewer(offlineConfig?.planning.scenario ?? "improve-once") : new GeminiPlanningReviewer(client, memory) });
  let result: unknown;
  switch (command) {
    case "start": result = await controller.start(await readText(arg("file"))); break;
    case "questions": result = await controller.questions(); break;
    case "answer": result = await controller.answer(await readJson(arg("file"))); break;
    case "propose-scope": result = await controller.proposeScope(); break;
    case "approve-scope": case "reject-scope": {
      const state = await store.get(config.projectId);
      if (state?.scope === undefined) throw new Error("No Scope proposal.");
      console.log(JSON.stringify(state.scope, null, 2));
      const phrase = `${command === "approve-scope" ? "APPROVE" : "REJECT"} ${state.scope.id} v${state.scope.version}`;
      result = await controller.decideScope(command === "approve-scope", await confirm(phrase, "Review the exact Scope above."), arg("reason")); break;
    }
    case "plan": result = await controller.plan(); break;
    case "approve-plan": {
      const planning = await memory.getPlanningLoopState(config.projectId);
      if (planning?.currentPlanVersion === undefined) throw new Error("No plan to approve.");
      const plan = await memory.getPlanDraft(config.projectId, `${config.projectId}-plan`, planning.currentPlanVersion);
      if (plan === undefined) throw new Error("No plan to approve.");
      console.log(plan.content);
      result = await controller.approvePlan(await confirm(`APPROVE ${plan.id} v${plan.version}`, "Review the plan above."), arg("reason")); break;
    }
    case "propose-tasks": result = await controller.proposeTasks(); break;
    case "configure-verification": result = await controller.configureVerification(await readJson(arg("file"))); break;
    case "initialize-tasks": {
      const state = await store.get(config.projectId);
      if (state === undefined) throw new Error("No task proposal.");
      console.log(JSON.stringify(state.taskProposal, null, 2));
      result = await controller.initializeTasks(await confirm(`ACCEPT TASKS r${state.revision}`, "Review tasks before initializing manual development.")); break;
    }
    case "report": result = await controller.report(); break;
    case "collect-feedback": result = await controller.continuation().collectFeedback(); break;
    case "request-scope-change": result = await controller.continuation().requestScopeChange(arg("reason")); break;
    case "propose-scope-change": result = await controller.continuation().proposeScopeChange(); break;
    case "resume-plan": result = await controller.continuation().resumePlan(); break;
    case "approve-scope-change": case "reject-scope-change": {
      const item = (await store.get(config.projectId))?.continuations?.at(-1);
      if (item?.proposedScope === undefined) throw new Error("No Scope change proposal.");
      console.log(JSON.stringify({ baseScope: item.baseScope, reason: item.reason, proposedScope: item.proposedScope, changeApprovalId: item.changeApprovalId, scopeApprovalId: item.scopeApprovalId }, null, 2));
      const approved = command === "approve-scope-change";
      const phrase = `${approved ? "APPROVE" : "REJECT"} CHANGE ${item.id} ${item.proposedScope.id} v${item.proposedScope.version}`;
      result = await controller.continuation().decideScopeChange(approved, await confirm(phrase, "This explicitly decides BOTH the Scope change request and the complete new Scope snapshot above. No model is called."), arg("reason")); break;
    }
  }
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error: unknown) => { console.error(`[ADTF] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
