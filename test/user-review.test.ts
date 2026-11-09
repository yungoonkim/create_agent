import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type { GoogleGenAI } from "@google/genai";
import type { PlanDraft, PlanReview, PlanningRoleConfig, ScopeContract, PlanningErrorRecord } from "../src/planning/contracts.js";
import { FilePlanningMemoryStore } from "../src/planning/memory-store.js";
import { PlanningLoopController } from "../src/planning/controller.js";
import { GeminiPlanningReviewer, GeminiPlanningWriter } from "../src/planning/google-genai.js";
import { assertCompleteOutput, ModelOutputError } from "../src/planning/model-output.js";
import { bindReviewEvidence } from "../src/planning/review-quality.js";
import { bindStorageAudit, parseStorageAudit, hasExplicitReadFailure } from "../src/planning/storage-audit.js";
import { decideAfterReview, parsePlanReview, validatePlanReview } from "../src/planning/policy.js";
import { parsePlanningConfig } from "../src/planning/config.js";
import { buildUserReviewTable, renderUserReviewTable } from "../src/planning/user-review.js";
import { exportUserReviewBundle } from "../src/planning/review-export.js";

const fixture = await import(new URL("../../examples/planning-review-demo/fixture.mjs", import.meta.url).href) as {
  scope: ScopeContract; content: string; assessment: Record<string, unknown>; challenge: Record<string, unknown>;
};
const { scope, content } = fixture;
const plan: PlanDraft = { id: `${scope.projectId}-plan`, projectId: scope.projectId, version: 1, scopeContractId: scope.id,
  scopeVersion: 1, content, status: "ready_for_review", createdAt: scope.createdAt };
const role: PlanningRoleConfig = { model: { providerId: "vertex-ai", modelId: "gemini-3.8-flash" }, personaId: "test" };
const scopeApproval = { id: "book-scope-approved", projectId: scope.projectId, subject: `Scope Contract ${scope.id} v1`, status: "approved" as const,
  rationale: "DEMO FIXTURE: new synthetic books case, not an actual user decision." };
function review(): PlanReview {
  return validatePlanReview({ ...structuredClone(fixture.assessment), id: "review-1", projectId: scope.projectId, planId: plan.id,
    planVersion: 1, scopeContractId: scope.id, scopeVersion: 1, reviewedAt: scope.createdAt,
    qualityAssessment: bindReviewEvidence(fixture.assessment.qualityAssessment, plan),
    challengeCompleted: true, storageAudit: bindStorageAudit(fixture.challenge.storageAudit, plan) }, plan, scope);
}
const state = { projectId: scope.projectId, scopeContractId: scope.id, scopeVersion: 1, iterationCount: 1, maxIterations: 3,
  status: "awaiting_approval" as const, currentPlanVersion: 1, reviewId: "review-1", approvalId: "plan-approval" };
const decide = (r: PlanReview, iterationCount = 1) => decideAfterReview({ review: r, currentPlan: plan, approvedScope: scope, iterationCount, maxIterations: 3 });
async function harness(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), "adtf-book-check-")); t.after(() => rm(root, { recursive: true, force: true }));
  const memory = new FilePlanningMemoryStore(join(root, "memory"));
  await memory.importDemoFixture(scope, { approval: scopeApproval, scopeApproval: { projectId: scope.projectId, scopeContractId: scope.id, approvalId: scopeApproval.id } });
  const config = parsePlanningConfig({ projectId: scope.projectId, planning: { writer: { providerId: "fake", modelId: "writer" }, reviewer: { providerId: "fake", modelId: "reviewer" },
    maxIterations: 3, requireUserApproval: true, scenario: "improve-once" }, memory: { type: "file", directory: "memory" } }, root);
  return { root, memory, config };
}
function client(responses: unknown[], seen: unknown[] = []): GoogleGenAI {
  return { models: { generateContent: async (request: unknown) => { seen.push(request); if (!responses.length) throw new Error("Unexpected automatic model replay"); return responses.shift(); } } } as unknown as GoogleGenAI;
}
const complete = (value: unknown) => ({ text: JSON.stringify(value), candidates: [{ finishReason: "STOP" }] });

test("explicit incomplete finishes cannot masquerade as valid output; missing legacy metadata remains accepted", () => {
  assert.throws(() => assertCompleteOutput({ text: "{}", candidates: [{ finishReason: "MAX_TOKENS" }] }, "assessment"), ModelOutputError);
  assert.throws(() => assertCompleteOutput({ text: "ok", candidates: [{ finishReason: "SAFETY" }] }, "writer"), /MODEL_OUTPUT_INCOMPLETE/);
  assert.doesNotThrow(() => assertCompleteOutput({ text: "legacy" }, "writer"));
  assert.doesNotThrow(() => assertCompleteOutput({ text: "ok", candidates: [{ finishReason: "STOP" }] }, "writer"));
});

test("truncated Writer preserves partial text/usage, saves no draft or approval, and never restarts automatically", async t => {
  const h = await harness(t); const requests: unknown[] = [];
  const writer = new GeminiPlanningWriter(client([{ text: "# Partial book plan", candidates: [{ finishReason: "MAX_TOKENS" }], usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 9, thoughtsTokenCount: 8 } }], requests), h.memory);
  const controller = new PlanningLoopController({ ...h, writer: { write: c => writer.write(c, role) }, reviewer: { review: async () => { throw new Error("No review of partial draft"); } } });
  await assert.rejects(controller.run({ requirements: scope.goal, scopeContract: scope }), /MODEL_OUTPUT_LIMIT/);
  assert.equal(requests.length, 1); assert.equal(await h.memory.getPlanDraft(scope.projectId, plan.id, 1), undefined);
  const errors = await h.memory.getPlanningErrors(scope.projectId);
  assert.equal(errors[0]?.modelOutputFailure?.partialText, "# Partial book plan");
  assert.equal(errors[0]?.modelOutputFailure?.stage, "writer");
  assert.equal((await h.memory.getPlanningLoopState(scope.projectId))?.status, "drafting");
  const usage = await readFile(join(h.memory.rootDirectory, "projects", scope.projectId, "planning", "usage.jsonl"), "utf8");
  assert.match(usage, /"outcome":"failure"/); assert.match(usage, /"outputTokens":9/);
  await assert.rejects(controller.run({ requirements: scope.goal, scopeContract: scope }), /automatic resume/);
  assert.equal(requests.length, 1); assert.deepEqual(await h.memory.get(scopeApproval.id), scopeApproval);
});

test("truncated counterexample retains saved draft and failure tokens, never returns the earlier pass", async t => {
  const h = await harness(t); const requests: unknown[] = [];
  const reviewer = new GeminiPlanningReviewer(client([complete(fixture.assessment), { text: JSON.stringify(fixture.challenge), candidates: [{ finishReason: "MAX_TOKENS" }], usageMetadata: { candidatesTokenCount: 30, thoughtsTokenCount: 60 } }], requests), h.memory);
  const controller = new PlanningLoopController({ ...h, writer: { write: async () => plan }, reviewer: { review: c => reviewer.review(c, role) } });
  await assert.rejects(controller.run({ requirements: scope.goal, scopeContract: scope }), /MODEL_OUTPUT_LIMIT/);
  assert.equal(requests.length, 2); assert.deepEqual(await h.memory.getPlanDraft(scope.projectId, plan.id, 1), plan);
  assert.equal(await h.memory.getPlanReview(scope.projectId, plan.id, 1), undefined);
  const stored = await h.memory.getPlanningLoopState(scope.projectId); assert.equal(stored?.status, "reviewing"); assert.equal(stored?.iterationCount, 0);
  const errors = await h.memory.getPlanningErrors(scope.projectId); assert.equal(errors[0]?.modelOutputFailure?.stage, "challenge");
  const table = buildUserReviewTable({ scope, plan, planning: stored!, scopeApproval, errors });
  assert.ok(table.rows.every(r => r.status === "needs_check")); assert.match(renderUserReviewTable(table), /토큰 한도/);
  const usage = await readFile(join(h.memory.rootDirectory, "projects", scope.projectId, "planning", "usage.jsonl"), "utf8");
  assert.match(usage, /"failureCode":"MODEL_OUTPUT_LIMIT"/); assert.match(usage, /"reasoningTokens":60/);
  assert.equal((requests[1] as { config: { maxOutputTokens: number; httpOptions: { retryOptions: { attempts: number } } } }).config.maxOutputTokens, 16000);
  assert.equal((requests[1] as { config: { httpOptions: { retryOptions: { attempts: number } } } }).config.httpOptions.retryOptions.attempts, 1);
});

test("Scope correction revises the draft; actual requirement change still needs separate approval and legacy stays conservative", () => {
  const issue = { id: "scope-book", kind: "scope_violation" as const, severity: "minor" as const, description: "Draft added excluded book recommendations", suggestedDirection: "Remove recommendations", relatedRequirementId: "BOOK-1", dispositionReason: "Existing Scope already excludes recommendations; repair draft." };
  const before = JSON.stringify(scope);
  assert.equal(decide({ ...review(), scopeViolation: true, issues: [{ ...issue, scopeDisposition: "revise_plan" }] }).type, "REVISE");
  assert.equal(decide({ ...review(), scopeViolation: true, issues: [{ ...issue, scopeDisposition: "revise_plan" }] }, 3).type, "STOP_LIMIT_REACHED");
  assert.equal(decide({ ...review(), scopeViolation: true, issues: [{ ...issue, scopeDisposition: "change_scope" }] }).type, "REQUEST_SCOPE_CHANGE_APPROVAL");
  assert.equal(decide({ ...review(), scopeViolation: true, issues: [{ ...issue, scopeDisposition: "clarify" }] }).type, "REQUEST_USER_INPUT");
  assert.equal(decide({ ...review(), scopeViolation: true, issues: [issue] }).type, "REQUEST_SCOPE_CHANGE_APPROVAL");
  assert.throws(() => parsePlanReview({ ...review(), issues: [{ ...issue, scopeDisposition: "not_applicable" }] }));
  assert.equal(JSON.stringify(scope), before);
});

test("generic corrupt-data citations cannot establish a read-operation exception; valid exception evidence stays usable", () => {
  const good = review(); const old = good.storageAudit!;
  const bad = { ...old, cases: old.cases.map(c => c.state === "read_error" ? { ...c, trigger: { evidenceLines: [9], evidence: [content.split("\n")[8]!] } } : c) };
  assert.equal(decide({ ...good, storageAudit: bad }).type, "REVISE");
  assert.equal(decide(good).type, "REQUEST_USER_APPROVAL");
  assert.equal(hasExplicitReadFailure(["손상된 JSON은 원본을 보존하고 읽기 전용으로 표시한다."]), false);
  assert.equal(hasExplicitReadFailure(["readFile throws EACCES: preserve file and block edits."]), true);
  assert.equal(hasExplicitReadFailure(["getItem 예외는 처리하지 않는다."]), false);
  const invalid = structuredClone(old); const read = invalid.cases.find(c => c.state === "read_error")!;
  assert.throws(() => validatePlanReview({ ...good, storageAudit: { ...invalid, cases: [...invalid.cases.filter(c => c !== read), { ...read, trigger: { evidenceLines: [999], evidence: ["invented"] } }] } }, plan, scope));
});

test("Controller repairs an excluded recommendation within the same Scope and leaves final approval pending", async t => {
  const h = await harness(t); let writes = 0;
  const original = { ...plan, content: content + "\n자동 책 추천도 추가한다." };
  const issue = { id: "remove-extra", kind: "scope_violation" as const, severity: "minor" as const,
    relatedRequirementId: "BOOK-1", description: "Excluded recommendations added", suggestedDirection: "Remove them", scopeDisposition: "revise_plan" as const, dispositionReason: "Keep the same approved exclusions." };
  const result = await new PlanningLoopController({ ...h,
    writer: { write: async c => { writes++; assert.deepEqual(c.approvedScope, scope); return writes === 1 ? original : { ...plan, version: 2 }; } },
    reviewer: { review: async c => ({ ...review(), id: `review-${c.currentPlan.version}`, planVersion: c.currentPlan.version,
      ...(c.currentPlan.version === 1 ? { outcome: "revise" as const, scopeViolation: true, issues: [issue] } : {}) }) },
  }).run({ requirements: scope.goal, scopeContract: scope });
  assert.equal(writes, 2); assert.equal(result.state.status, "awaiting_approval"); assert.equal(result.state.iterationCount, 2);
  assert.equal(result.approval?.status, "pending");
  assert.deepEqual(await h.memory.getScopeContract(scope.projectId, 1), scope); assert.equal(await h.memory.getScopeContract(scope.projectId, 2), undefined);
  assert.equal((await h.memory.getPlanDraft(scope.projectId, plan.id, 1))?.content, original.content);
});

test("normal/failure/check evidence is mandatory for new Gemini assessments; missing behavior overrides a pass", async t => {
  const h = await harness(t); const good = review(); const q = good.qualityAssessment!;
  const incomplete = { ...good, qualityAssessment: { ...q, requirements: q.requirements.map((r,i) => i === 0 ? { ...r, behaviorEvidence: { ...r.behaviorEvidence!, failure: { evidenceLines: [], evidence: [] } } } : r) } };
  assert.equal(decide(incomplete).type, "REVISE");
  const raw = structuredClone(fixture.assessment) as { qualityAssessment: { requirements: { behaviorEvidence?: unknown }[] } };
  delete raw.qualityAssessment.requirements[0]!.behaviorEvidence;
  await assert.rejects(new GeminiPlanningReviewer(client([complete(raw)]), h.memory).review({ projectId: scope.projectId, originalRequirements: scope.goal, approvedScope: scope, currentPlan: plan, settledDecisions: [] }, role), /mandatory behavioral evidence/);
});

test("user table exposes source-backed model claims, holes and conflicts without claiming implementation or fixture approval", () => {
  const good = review(); const table = buildUserReviewTable({ scope, plan, planning: state, review: good, scopeApproval });
  assert.ok(table.rows.every(r => r.status === "reflected")); assert.equal(table.scopeApproval, "fixture");
  assert.equal(table.implementationVerification, "not_performed"); assert.equal(table.finalPlanApproval, "unconfirmed");
  const changed = { ...good, issues: [{ id: "book-conflict", kind: "contradiction" as const, severity: "major" as const, relatedRequirementId: "BOOK-2", description: "No delete confirmation", suggestedDirection: "Add confirmation" }] };
  assert.equal(buildUserReviewTable({ scope, plan, planning: state, review: changed, scopeApproval }).rows[1]?.status, "conflicting");
  const missing = { ...good, issues: [{ ...changed.issues[0]!, kind: "omission" as const, relatedRequirementId: "BOOK-1" }] };
  assert.equal(buildUserReviewTable({ scope, plan, planning: state, review: missing, scopeApproval }).rows[0]?.status, "missing");
  const legacy = { ...good, qualityAssessment: { ...good.qualityAssessment!, requirements: good.qualityAssessment!.requirements.map(({ behaviorEvidence: _b, ...row }) => row) } };
  assert.ok(buildUserReviewTable({ scope, plan, planning: state, review: legacy, scopeApproval }).rows.every(r => r.status === "needs_check"));
  assert.match(renderUserReviewTable(table), /L10/); assert.match(renderUserReviewTable(table), /사용자 승인이나 실제 테스트 통과가 아닙니다/);
  const unsafe = { ...table, rows: table.rows.map(r => ({ ...r, approvedCondition: '<script>alert(1)</script>|[x](https://example.invalid)' })) };
  assert.ok(!renderUserReviewTable(unsafe).includes('<script>'));
});

test("stale, mismatched and incomplete reviews cannot supply a confident user-table result", () => {
  for (const changed of [{ ...review(), planVersion: 2 }, { ...review(), projectId: "other" }]) {
    const table = buildUserReviewTable({ scope, plan, planning: state, review: changed, scopeApproval });
    assert.ok(table.rows.every(r => r.status === "needs_check" && r.normal.evidence.length === 0));
  }
  const working = { ...state, status: "reviewing" as const };
  assert.ok(buildUserReviewTable({ scope, plan, planning: working, review: review(), scopeApproval }).rows.every(r => r.status === "needs_check"));
  assert.ok(buildUserReviewTable({ scope, plan, planning: state, review: review(), scopeApproval, sourceCurrent: false }).rows.every(r => r.status === "needs_check"));
  assert.throws(() => buildUserReviewTable({ scope: { ...scope, version: 2 }, plan }));
});

test("review export preserves exact content and prevents overwrites or use with a changed source", async t => {
  const h = await harness(t); const table = buildUserReviewTable({ scope, plan, planning: state, review: review(), scopeApproval });
  const target = join(h.root, "export"); await exportUserReviewBundle(target, plan, table);
  assert.equal(await readFile(join(target, "plan.md"), "utf8"), content);
  assert.equal(JSON.parse(await readFile(join(target, "bundle.json"), "utf8")).complete, true);
  await assert.rejects(exportUserReviewBundle(target, plan, table), /EEXIST/);
  await assert.rejects(exportUserReviewBundle(join(h.root, "bad"), { ...plan, content: "changed" }, table), /differs/);
  assert.equal(await readFile(join(target, "plan.md"), "utf8"), content);
});

async function snapshot(root: string): Promise<string> {
  const rows: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = join(dir, entry.name); if (entry.isDirectory()) await walk(file); else rows.push(file + await readFile(file, "utf8"));
    }
  }
  await walk(root); return rows.join("\n");
}

test("live-config review-plan CLI exports existing data without ADC, CALL, approval mutation or model usage", async t => {
  const h = await harness(t);
  await new PlanningLoopController({ ...h, writer: { write: async () => plan }, reviewer: { review: async () => review() } }).run({ requirements: scope.goal, scopeContract: scope });
  const configFile = join(h.root, "live.json");
  await writeFile(configFile, JSON.stringify({ projectId: scope.projectId, planning: { writer: { providerId: "vertex-ai", modelId: role.model.modelId }, reviewer: { providerId: "vertex-ai", modelId: role.model.modelId }, maxIterations: 3, requireUserApproval: true }, memory: { type: "file", directory: "memory" } }));
  const before = await snapshot(h.memory.rootDirectory);
  const result = await promisify(execFile)(process.execPath, [resolve("dist/src/cli/supervisor.js"), "review-plan", "--config", "live.json", "--output", "readable"], { cwd: h.root,
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: join(h.root,"missing-adc"), GOOGLE_CLOUD_PROJECT: "", GOOGLE_CLOUD_LOCATION: "" }, timeout: 15000 });
  const output = JSON.parse(result.stdout); assert.equal(output.modelCalls, 0); assert.equal(output.approvalChanged, false);
  assert.equal(await snapshot(h.memory.rootDirectory), before);
  assert.equal(JSON.parse(await readFile(join(h.root,"readable/review.json"),"utf8")).implementationVerification, "not_performed");
});

test("stored diagnostic data with invalid shape or project binding is rejected", async t => {
  const h = await harness(t);
  await h.memory.appendError({ projectId: scope.projectId, occurredAt: scope.createdAt, operation: "review", message: "bad", modelOutputFailure: { code: "bad" } } as unknown as PlanningErrorRecord);
  await assert.rejects(h.memory.getPlanningErrors(scope.projectId), /Invalid model output failure/);
});
