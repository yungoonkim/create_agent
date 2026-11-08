import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { GeminiPlanningReviewer, GeminiPlanningWriter, createVertexAiClient } from "../planning/google-genai.js";
import { FilePlanningMemoryStore } from "../planning/memory-store.js";
import { PlanningLoopController } from "../planning/controller.js";
import {
  loadLivePlanningConfig,
  parseScopeContract,
  resolveProjectPath,
} from "../planning/config.js";
import type { ScopeContract } from "../planning/contracts.js";

interface CliArguments {
  readonly config: string;
  readonly scope: string;
  readonly requirements: string;
}

async function main(): Promise<void> {
  const projectRoot = resolve(process.cwd());
  const args = parseArguments(process.argv.slice(2));
  const config = await loadLivePlanningConfig(args.config, projectRoot);
  const gcpProject = process.env.GOOGLE_CLOUD_PROJECT;
  if (gcpProject === undefined || gcpProject.trim().length === 0) {
    throw new Error("Set GOOGLE_CLOUD_PROJECT to the GCP project used for Vertex AI.");
  }
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
  const scopeRaw: unknown = JSON.parse(await readFile(resolveProjectPath(projectRoot, args.scope), "utf8"));
  const scope = parseScopeContract(scopeRaw, config.projectId);
  const requirements = await readFile(resolveProjectPath(projectRoot, args.requirements), "utf8");
  if (requirements.trim().length === 0) throw new Error("Requirements file must not be empty.");

  const memory = new FilePlanningMemoryStore(config.memory.directory);
  await verifyScopeSnapshot(memory, scope);
  const storedRequirements = await memory.getRequirements(config.projectId);
  if (storedRequirements !== undefined && storedRequirements !== requirements) {
    throw new Error("Requirements differ from the stored project source; update them through an approved Scope change.");
  }

  console.log("[ADTF] This live run sends the requirements, approved Scope, and plan context to Vertex AI.");
  console.log(`[Vertex AI] project=${gcpProject}, location=${location}`);
  console.log(`[Models] Writer=${config.planning.writer.model.modelId}, Reviewer=${config.planning.reviewer.model.modelId}`);
  console.log("[Requirements to be sent]\n" + requirements);
  console.log("[Scope to be approved and sent]\n" + JSON.stringify(scope, null, 2));
  if (!(await confirm("Type CALL to continue (requests may incur Google Cloud charges): ", "CALL"))) {
    console.log("[ADTF] Stopped before making any model request.");
    return;
  }

  await ensureScopeApproved(memory, scope);
  const client = createVertexAiClient({ project: gcpProject, location });
  const controller = new PlanningLoopController({
    config,
    memory,
    writer: new GeminiPlanningWriter(client, memory),
    reviewer: new GeminiPlanningReviewer(client, memory),
    onLog: (message) => console.log(message),
  });
  const result = await controller.run({ requirements, scopeContract: scope });
  console.log(`[Controller] ${result.decision}`);
  if (result.state.status === "awaiting_approval") {
    console.log(`[ADTF] Final plan awaits a separate user approval (approval: ${result.state.approvalId}).`);
  } else if (result.state.status === "awaiting_scope_change_approval") {
    console.log(`[ADTF] Scope change awaits separate approval (request: ${result.state.changeRequestId}).`);
  } else if (result.state.status === "awaiting_user_input") {
    console.log(`[ADTF] User input required: ${result.state.reason}`);
  } else if (result.state.status === "limit_reached" || result.state.status === "failed") {
    console.log(`[ADTF] Safe stop: ${result.state.reason}`);
  }
  console.log(`[Memory] ${config.memory.directory}/projects/${config.projectId}`);
}

async function verifyScopeSnapshot(memory: FilePlanningMemoryStore, scope: ScopeContract): Promise<void> {
  const existing = await memory.getScopeContract(scope.projectId, scope.version);
  if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(scope)) {
    throw new Error("Stored Scope Contract differs from the supplied version; approved snapshots are immutable.");
  }
  if (existing === undefined) await memory.createScopeContract(scope);
}

async function ensureScopeApproved(memory: FilePlanningMemoryStore, scope: ScopeContract): Promise<void> {
  const link = await memory.getScopeApprovalRecord(scope.projectId, scope.id);
  const existingApproval = link === undefined ? undefined : await memory.get(link.approvalId);
  if (
    existingApproval !== undefined && existingApproval.projectId === scope.projectId &&
    existingApproval.subject === `Scope Contract ${scope.id} v${scope.version}` &&
    existingApproval.status === "approved"
  ) return;
  if (existingApproval !== undefined && existingApproval.status !== "pending") {
    throw new Error("The stored Scope approval is not approved; create a new Scope version and review it.");
  }

  const approval = existingApproval ?? await memory.request(scope.projectId, `Scope Contract ${scope.id} v${scope.version}`);
  const phrase = `APPROVE ${scope.id} v${scope.version}`;
  if (!(await confirm(`Review the supplied Scope and ${phrase} to record your approval: `, phrase))) {
    await memory.recordDecision(approval.id, "rejected", "User did not approve this Scope in the live CLI.");
    throw new Error("Scope was not approved; no model request was made.");
  }
  await memory.recordDecision(approval.id, "approved", "Approved interactively in the live Planning CLI.");
  await memory.createScopeApprovalRecord({
    projectId: scope.projectId,
    scopeContractId: scope.id,
    approvalId: approval.id,
  });
}

async function confirm(prompt: string, expected: string): Promise<boolean> {
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    return (await readline.question(prompt)).trim() === expected;
  } finally {
    readline.close();
  }
}

function parseArguments(values: readonly string[]): CliArguments {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[index + 1];
    if (key === undefined || !key.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error("Usage: planning-gemini --config <file> --scope <file> --requirements <file>");
    }
    if (parsed.has(key)) throw new Error(`Argument ${key} was provided more than once.`);
    parsed.set(key, value);
    index += 1;
  }
  const read = (key: string): string => {
    const value = parsed.get(key);
    if (value === undefined) throw new Error(`Missing required argument ${key}.`);
    return value;
  };
  for (const key of parsed.keys()) {
    if (!["--config", "--scope", "--requirements"].includes(key)) throw new Error(`Unknown argument ${key}.`);
  }
  return { config: read("--config"), scope: read("--scope"), requirements: read("--requirements") };
}

main().catch((error: unknown) => {
  console.error(`[ADTF] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
