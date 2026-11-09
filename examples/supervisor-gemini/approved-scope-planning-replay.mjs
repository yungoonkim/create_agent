// Independent live-model acceptance using an exact copy of the approved Scope.
// The primary workflow and approval decisions are never modified.
import assert from "node:assert/strict";
import { access, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLivePlanningConfig } from "../../dist/src/planning/config.js";
import { FilePlanningMemoryStore } from "../../dist/src/planning/memory-store.js";
import { PlanningLoopController } from "../../dist/src/planning/controller.js";
import { createVertexAiClient, GeminiPlanningWriter, GeminiPlanningReviewer } from "../../dist/src/planning/google-genai.js";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const runId = "approved-scope-replay-20261108";
const runRoot = join(repository, "../scratch", runId);
const output = join(repository, "docs/acceptance/2026-11-08", runId);
const primary = join(repository, ".adtf/projects/supervisor-gemini-acceptance");
const sourceFiles = [join(primary, "supervisor/state.json"), join(primary, "planning/state.json")];
const fingerprint = async () => Promise.all(sourceFiles.map(async (file) => createHash("sha256").update(await readFile(file)).digest("hex")));
const before = await fingerprint();
const supervisor = JSON.parse(await readFile(sourceFiles[0], "utf8"));
assert.equal(supervisor.phase, "tasks_proposed");
await assert.rejects(access(`${sourceFiles[0]}.lock`), { code: "ENOENT" });
const approvalPath = join(repository, ".adtf/approvals", `${supervisor.scopeApprovalId}.json`);
const approval = JSON.parse(await readFile(approvalPath, "utf8"));
assert.equal(approval.status, "approved");
// mkdir without recursive intentionally prevents accidental replay of an existing run.
await mkdir(runRoot);
await mkdir(output);
const rawConfig = JSON.parse(await readFile(join(repository, "examples/supervisor-gemini/config.json"), "utf8"));
await writeFile(join(runRoot, "config.json"), JSON.stringify(rawConfig));
const config = await loadLivePlanningConfig("config.json", runRoot);
const memory = new FilePlanningMemoryStore(config.memory.directory);
await memory.createScopeContract(supervisor.scope);
await mkdir(join(config.memory.directory, "approvals"), { recursive: true });
await cp(approvalPath, join(config.memory.directory, "approvals", `${approval.id}.json`));
await memory.createScopeApprovalRecord({ projectId: config.projectId, scopeContractId: supervisor.scope.id, approvalId: approval.id });
const manifest = { runId, kind: "independent live-model acceptance", projectId: config.projectId,
  isolation: "Separate memory root; project identity retained to preserve the genuine Scope approval binding",
  scopeId: supervisor.scope.id, scopeVersion: supervisor.scope.version, scopeApprovalId: approval.id,
  note: "No new Scope, user approval, task initialization, product implementation or Agent Runtime execution" };
await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const client = createVertexAiClient();
const result = await new PlanningLoopController({ config, memory,
  writer: new GeminiPlanningWriter(client, memory), reviewer: new GeminiPlanningReviewer(client, memory),
  onLog: (line) => console.error(`[${runId}] ${line}`) }).run({ requirements: supervisor.originalRequest,
  scopeContract: supervisor.scope, clarificationDecisions: [
    ...supervisor.clarifications.map((item) => `${item.id}: ${item.question}\nUser answer: ${item.answer}`),
    `User requested detail corrections under the approved Scope:\n${await readFile(join(repository, "examples/supervisor-gemini/revision-v1-request.md"), "utf8")}`,
  ] });
assert.deepEqual(await fingerprint(), before);
const planningRoot = join(config.memory.directory, "projects", config.projectId, "planning");
const planId = `${config.projectId}-plan`;
const reviews = [];
for (const file of await readdir(join(planningRoot, "plans", planId))) {
  const plan = JSON.parse(await readFile(join(planningRoot, "plans", planId, file), "utf8"));
  await writeFile(join(output, `plan-v${plan.version}.json`), JSON.stringify(plan, null, 2) + "\n");
  await writeFile(join(output, `plan-v${plan.version}.md`), plan.content.split("\n").map((line) => line.trimEnd()).join("\n") + "\n");
}
for (const file of await readdir(join(planningRoot, "reviews", planId))) {
  const review = JSON.parse(await readFile(join(planningRoot, "reviews", planId, file), "utf8"));
  reviews.push(review);
  await writeFile(join(output, `review-v${review.planVersion}.json`), JSON.stringify(review, null, 2) + "\n");
}
await cp(join(planningRoot, "usage.jsonl"), join(output, "usage.jsonl"));
await writeFile(join(output, "state.json"), JSON.stringify(result.state, null, 2) + "\n");
await writeFile(join(output, "result.json"), JSON.stringify({ ...manifest, decision: result.decision,
  status: result.state.status, currentPlanVersion: result.state.currentPlanVersion, iterationCount: result.state.iterationCount,
  reviewerRevisionRequests: reviews.filter((review) => review.outcome === "revise").length,
  reviews: reviews.map((review) => ({ version: review.planVersion, outcome: review.outcome, issues: review.issues })),
  primaryUnchanged: true, finalUserApprovalRecorded: false }, null, 2) + "\n");
console.log(JSON.stringify({ runId, decision: result.decision, status: result.state.status, version: result.state.currentPlanVersion, iterations: result.state.iterationCount, primaryUnchanged: true }));
