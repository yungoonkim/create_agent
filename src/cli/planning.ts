import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FakePlanningReviewer } from "../planning/fake-reviewer.js";
import { FakePlanningWriter } from "../planning/fake-writer.js";
import { FilePlanningMemoryStore } from "../planning/memory-store.js";
import { PlanningLoopController } from "../planning/controller.js";
import { loadPlanningConfig, parseDemoApprovalFixture, parseScopeContract, resolveProjectPath } from "../planning/config.js";

interface CliArguments {
  readonly config: string;
  readonly scope: string;
  readonly approvalFixture: string;
  readonly requirements: string;
}

async function main(): Promise<void> {
  const projectRoot = resolve(process.cwd());
  const args = parseArguments(process.argv.slice(2));
  const config = await loadPlanningConfig(args.config, projectRoot);
  const scopeRaw: unknown = JSON.parse(await readFile(resolveProjectPath(projectRoot, args.scope), "utf8"));
  const scope = parseScopeContract(scopeRaw, config.projectId);
  const approvalRaw: unknown = JSON.parse(await readFile(resolveProjectPath(projectRoot, args.approvalFixture), "utf8"));
  const approvalFixture = parseDemoApprovalFixture(approvalRaw, scope);
  const requirements = await readFile(resolveProjectPath(projectRoot, args.requirements), "utf8");
  if (requirements.trim().length === 0) throw new Error("Requirements file must not be empty.");

  const memory = new FilePlanningMemoryStore(config.memory.directory);
  await memory.importDemoFixture(scope, approvalFixture);
  const controller = new PlanningLoopController({
    config,
    memory,
    writer: new FakePlanningWriter(),
    reviewer: new FakePlanningReviewer(config.planning.scenario),
    onLog: (message) => console.log(message),
  });

  console.log("[ADTF] Planning Loop 시작 (오프라인, LLM API 호출 없음)");
  console.log(`[Project] ${config.projectId}`);
  console.log(`[Scope] 오프라인 데모 승인 fixture 사용 — 실제 사용자 승인이 아님 (${scope.id} v${scope.version})`);
  console.log(`[Memory] ${config.memory.directory}`);

  const result = await controller.run({ requirements, scopeContract: scope });
  console.log(`[Controller] ${result.decision}`);
  if (result.state.status === "awaiting_approval") {
    console.log(`[ADTF] 사용자 최종 승인 대기 (approval: ${result.state.approvalId})`);
  } else if (result.state.status === "awaiting_scope_change_approval") {
    console.log(`[ADTF] Scope 변경 승인 대기 (request: ${result.state.changeRequestId})`);
  } else if (result.state.status === "awaiting_user_input") {
    console.log(`[ADTF] 사용자 입력 대기: ${result.state.reason}`);
  } else if (result.state.status === "limit_reached" || result.state.status === "failed") {
    console.log(`[ADTF] 안전 중단: ${result.state.reason}`);
  }
  console.log(`[Memory] 산출물 위치: ${config.memory.directory}/projects/${config.projectId}`);
}

function parseArguments(values: readonly string[]): CliArguments {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[index + 1];
    if (key === undefined || !key.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error("Usage: planning --config <file> --scope <file> --approval-fixture <file> --requirements <file>");
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
    if (!["--config", "--scope", "--approval-fixture", "--requirements"].includes(key)) {
      throw new Error(`Unknown argument ${key}.`);
    }
  }
  return {
    config: read("--config"),
    scope: read("--scope"),
    approvalFixture: read("--approval-fixture"),
    requirements: read("--requirements"),
  };
}

main().catch((error: unknown) => {
  console.error(`[ADTF] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
