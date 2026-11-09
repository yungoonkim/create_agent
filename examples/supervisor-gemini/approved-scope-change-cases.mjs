// Run only after the user authorizes BOTH isolated decision branches on Scope v5.
import assert from "node:assert/strict";
import { access, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLivePlanningConfig } from "../../dist/src/planning/config.js";
import { FilePlanningMemoryStore } from "../../dist/src/planning/memory-store.js";
import { FileSupervisorStore } from "../../dist/src/supervisor/memory-store.js";
import { FileDevelopmentStore } from "../../dist/src/development/memory-store.js";
import { SupervisorController } from "../../dist/src/supervisor/controller.js";
import { createVertexAiClient, GeminiPlanningWriter, GeminiPlanningReviewer } from "../../dist/src/planning/google-genai.js";

assert.equal(process.argv[2], "--run-approved-test-cases", "User authorization is required before running decision branches");
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = join(repository, "../scratch/approved-scope-replay-20261108");
const output = join(repository, "docs/acceptance/2026-11-08/scope-change-test");
const primaryPath = join(repository, ".adtf/projects/supervisor-gemini-acceptance/supervisor/state.json");
const primaryBefore = await readFile(primaryPath, "utf8");
const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
const reviewedProposal = JSON.parse(await readFile(join(output, "proposal.json"), "utf8"));
const unavailable = async () => { throw new Error("No proposal or model call allowed on this branch"); };

async function branch(approved) {
  const label = approved ? "approve" : "reject";
  const root = join(repository, "../scratch", `approved-scope-change-${label}-20261108`);
  await mkdir(root); // Existing run must be inspected, not replayed.
  await cp(join(sourceRoot, ".adtf"), join(root, ".adtf"), { recursive: true });
  await cp(join(sourceRoot, "config.json"), join(root, "config.json"));
  const config = await loadLivePlanningConfig("config.json", root);
  const memory = new FilePlanningMemoryStore(config.memory.directory);
  const store = new FileSupervisorStore(config.memory.directory);
  const client = approved ? createVertexAiClient() : undefined;
  const controller = new SupervisorController({ config, memory, store, developmentStore: new FileDevelopmentStore(config.memory.directory),
    proposer: { questions: unavailable, scope: unavailable, tasks: unavailable },
    writer: client ? new GeminiPlanningWriter(client, memory) : { write: unavailable },
    reviewer: client ? new GeminiPlanningReviewer(client, memory) : { review: unavailable } });
  const before = await store.get(config.projectId);
  const item = before.continuations.at(-1);
  assert.equal(item.id, manifest.continuationId);
  assert.equal(item.status, "proposed");
  assert.deepEqual(item, reviewedProposal, "The exact reviewed proposal must be unchanged");
  const basePlan = await memory.getPlanDraft(config.projectId, item.planId, item.base.currentPlanVersion);
  const baseReview = await memory.getPlanReview(config.projectId, item.planId, item.base.currentPlanVersion);
  const scope = item.proposedScope;
  const resultDirectory = join(output, label);
  await mkdir(resultDirectory);
  await controller.continuation().decideScopeChange(approved, `${approved ? "APPROVE" : "REJECT"} CHANGE ${item.id} ${scope.id} v${scope.version}`,
    `사용자가 격리된 두 시험 복사본에서 승인/거절 분기를 각각 진행하도록 명시적으로 허용: ${label} 시험. primary 변경·제품 구현·팀원 실행 없음.`);
  if (approved) await controller.continuation().resumePlan();
  const final = await store.get(config.projectId);
  const planning = await memory.getPlanningLoopState(config.projectId);
  assert.deepEqual(await memory.getPlanDraft(config.projectId, item.planId, item.base.currentPlanVersion), basePlan);
  assert.deepEqual(await memory.getPlanReview(config.projectId, item.planId, item.base.currentPlanVersion), baseReview);
  assert.deepEqual(await memory.getScopeContract(config.projectId, item.baseScope.version), item.baseScope);
  assert.equal(final.taskProposal, undefined);
  const changeApproval = await memory.get(item.changeApprovalId);
  const scopeApproval = await memory.get(item.scopeApprovalId);
  assert.equal(changeApproval.status, approved ? "approved" : "rejected");
  assert.equal(scopeApproval.status, approved ? "approved" : "rejected");
  if (approved) {
    assert.equal(final.scope.version, scope.version);
    assert.equal(planning.scopeVersion, scope.version);
    assert.ok(planning.currentPlanVersion > item.base.currentPlanVersion);
    assert.ok(planning.iterationCount <= planning.maxIterations);
    assert.notEqual(planning.status, "user_approved");
    for (const kind of ["plans", "reviews"]) for (const file of await readdir(join(config.memory.directory, "projects", config.projectId, "planning", kind, item.planId))) {
      const value = JSON.parse(await readFile(join(config.memory.directory, "projects", config.projectId, "planning", kind, item.planId, file), "utf8"));
      const version = kind === "plans" ? value.version : value.planVersion;
      await writeFile(join(resultDirectory, `${kind}-v${version}.json`), JSON.stringify(value, null, 2) + "\n");
      if (kind === "plans") await writeFile(join(resultDirectory, `plan-v${version}.md`), value.content.split("\n").map((line) => line.trimEnd()).join("\n") + "\n");
    }
    await cp(join(config.memory.directory, "projects", config.projectId, "planning/usage.jsonl"), join(resultDirectory, "usage.jsonl"));
  } else {
    assert.deepEqual(final.scope, item.baseScope);
    assert.deepEqual(planning, item.base);
    assert.equal(final.continuations.at(-1).status, "rejected");
  }
  await writeFile(join(resultDirectory, "supervisor.json"), JSON.stringify(final, null, 2) + "\n");
  await writeFile(join(resultDirectory, "planning.json"), JSON.stringify(planning, null, 2) + "\n");
  await writeFile(join(resultDirectory, "decisions.json"), JSON.stringify({ changeApproval, scopeApproval }, null, 2) + "\n");
  const result = { branch: label, scopeVersion: final.scope.version, planVersion: planning.currentPlanVersion,
    planningStatus: planning.status, iterations: planning.iterationCount, maxIterations: planning.maxIterations,
    oldScopePlanReviewPreserved: true, noTasksOrAgentRuntime: true, finalPlanUserApprovalRecorded: false };
  await writeFile(join(resultDirectory, "result.json"), JSON.stringify(result, null, 2) + "\n");
  return result;
}

await assert.rejects(access(join(sourceRoot, ".adtf/projects/supervisor-gemini-acceptance/supervisor/state.json.lock")), { code: "ENOENT" });
const reject = await branch(false);
const approve = await branch(true);
assert.equal(await readFile(primaryPath, "utf8"), primaryBefore);
await writeFile(join(output, "results.json"), JSON.stringify({ label: "user-authorized isolated Scope change acceptance", reject, approve, primaryUnchanged: true }, null, 2) + "\n");
console.log(JSON.stringify({ reject, approve, primaryUnchanged: true }));
