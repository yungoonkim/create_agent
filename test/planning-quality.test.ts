import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GoogleGenAI } from "@google/genai";
import { REVIEW_CHECK_IDS, type PlanDraft, type PlanReview, type ReviewQualityAssessment, type ScopeContract } from "../src/planning/contracts.js";
import { decideAfterReview, parsePlanReview, validatePlanReview } from "../src/planning/policy.js";
import { GeminiPlanningReviewer } from "../src/planning/google-genai.js";
import { FilePlanningMemoryStore } from "../src/planning/memory-store.js";
import { PlanningLoopController } from "../src/planning/controller.js";
import { parsePlanningConfig } from "../src/planning/config.js";
import { bindReviewEvidence } from "../src/planning/review-quality.js";
import { STORAGE_AUDIT_STATES, type StorageAudit } from "../src/planning/contracts.js";
import { bindStorageAudit, parseStorageAudit } from "../src/planning/storage-audit.js";

const noStorageAudit = { format: "none", evidenceLines: [], cases: [], rationale: "No JSON storage format is specified by this structural test fixture." };

const scope: ScopeContract = { id: "scope-1", projectId: "quality-test", version: 1, goal: "A bounded plan",
  requiredFeatures: [{ id: "REQ-1", statement: "Save a record" }], excludedFeatures: [], technicalConstraints: [], createdAt: "2026-01-01T00:00:00Z" };
const plan: PlanDraft = { id: "quality-test-plan", projectId: scope.projectId, version: 1, scopeContractId: scope.id,
  scopeVersion: 1, content: "Save a record. Failed saves preserve the previous record.", status: "ready_for_review", createdAt: scope.createdAt };
function quality(): ReviewQualityAssessment {
  const item = { status: "satisfied" as const, evidence: ["Save a record."], rationale: "The rule is stated." };
  return { version: 1, requirements: [{ ...item, requirementId: "REQ-1" }], checks: REVIEW_CHECK_IDS.map((id) => ({ ...item, id })) };
}
function review(qualityAssessment: ReviewQualityAssessment | undefined = quality()): PlanReview {
  return { id: "review-1", projectId: scope.projectId, planId: plan.id, planVersion: 1, scopeContractId: scope.id, scopeVersion: 1,
    outcome: "pass", issues: [], suggestions: [], scopeViolation: false, userJudgmentRequired: false, reviewedAt: scope.createdAt,
    ...(qualityAssessment === undefined ? {} : { qualityAssessment }) };
}
const decide = (r: PlanReview, iterationCount = 1) => decideAfterReview({ review: r, currentPlan: plan, approvedScope: scope, iterationCount, maxIterations: 2 });

test("quality coverage rejects missing, duplicate and invented required IDs or mandatory checks", () => {
  for (const q of [
    { ...quality(), requirements: [] },
    { ...quality(), requirements: [...quality().requirements, ...quality().requirements] },
    { ...quality(), requirements: [{ ...quality().requirements[0]!, requirementId: "invented" }] },
    { ...quality(), checks: quality().checks.slice(1) },
    { ...quality(), checks: quality().checks.map(() => quality().checks[0]!) },
  ]) {
    assert.throws(() => validatePlanReview(review(q), plan, scope), { code: "REVIEW_INVALID_FIELD" });
    assert.equal(decide(review(q)).type, "FAILED");
  }
});

test("quality evidence must exist in the current draft and satisfied findings cannot omit evidence", () => {
  const q = quality();
  assert.throws(() => validatePlanReview(review({ ...q, requirements: [{ ...q.requirements[0]!, evidence: ["A fabricated guarantee"] }] }), plan, scope));
  assert.throws(() => parsePlanReview(review({ ...q, requirements: [{ ...q.requirements[0]!, evidence: [] }] })));
  assert.throws(() => parsePlanReview(review({ ...q, requirements: [{ ...q.requirements[0]!, status: "not_applicable" }] })));
  assert.throws(() => parsePlanReview(review({ ...q, checks: q.checks.map((entry) => ({ ...entry, status: "not_applicable" })) })));
  assert.doesNotThrow(() => validatePlanReview(review({ ...q, requirements: [{ ...q.requirements[0]!, evidence: ["Save   a\nrecord."] }] }), plan, scope));
});

test("missing checklist findings override model pass, retain feedback and respect the iteration limit", () => {
  const q = quality();
  const r = review({ ...q, checks: q.checks.map((entry) => entry.id === "behavior_and_errors"
    ? { ...entry, status: "missing", evidence: [], rationale: "Specify failed save behavior." } : entry) });
  const result = decide(r);
  assert.equal(result.type, "REVISE");
  if (result.type === "REVISE") assert.match(result.feedback, /Specify failed save behavior/);
  assert.equal(decide(r, 2).type, "STOP_LIMIT_REACHED");
  assert.equal(decide(review()).type, "REQUEST_USER_APPROVAL");
});

test("unresolved user choices cannot hide in a passing assessment", () => {
  const q = quality();
  const result = decide(review({ ...q, requirements: [{ ...q.requirements[0]!, status: "needs_user_input", evidence: [], rationale: "Should due dates be required?" }] }));
  assert.equal(result.type, "REQUEST_USER_INPUT");
  if (result.type === "REQUEST_USER_INPUT") assert.match(result.questions.join("\n"), /Should due dates/);
});

test("new Gemini reviews require the quality protocol; legacy review data still parses unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "adtf-quality-adapter-"));
  try {
    const memory = new FilePlanningMemoryStore(root);
    const legacy = { ...review() }; delete (legacy as { qualityAssessment?: ReviewQualityAssessment }).qualityAssessment;
    assert.deepEqual(parsePlanReview(legacy), legacy);
    let response: unknown = legacy;
    const client = { models: { generateContent: async (input: { config: { responseJsonSchema: { properties: Record<string, unknown> } } }) =>
      ({ text: JSON.stringify(input.config.responseJsonSchema.properties.storageAudit === undefined ? response : { issues: [], questions: [], storageAudit: noStorageAudit }) }) } } as unknown as GoogleGenAI;
    const adapter = new GeminiPlanningReviewer(client, memory);
    const context = { projectId: scope.projectId, currentPlan: plan, approvedScope: scope, originalRequirements: "Save a record", settledDecisions: [] };
    const role = { model: { providerId: "vertex-ai", modelId: "gemini-3.8-flash" }, personaId: "reviewer" };
    await assert.rejects(adapter.review(context, role), /mandatory quality/);
    const withLines = { ...quality(), requirements: quality().requirements.map((row) => ({ ...row, evidenceLines: [1] })),
      checks: quality().checks.map((row) => ({ ...row, evidenceLines: [1] })) };
    response = review(withLines);
    assert.deepEqual((await adapter.review(context, role)).qualityAssessment, {
      ...withLines, requirements: withLines.requirements.map((row) => ({ ...row, evidence: [plan.content] })),
      checks: withLines.checks.map((row) => ({ ...row, evidence: [plan.content] })),
    });
    response = review({ ...withLines, checks: [] });
    await assert.rejects(adapter.review(context, role), /qualityAssessment/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a final counterexample blocks an initially passing review, with separate usage stages", async () => {
  const root = await mkdtemp(join(tmpdir(), "adtf-quality-challenge-"));
  try {
    const memory = new FilePlanningMemoryStore(root);
    const records: { reviewStage?: string }[] = [];
    memory.appendTokenUsage = async (record) => { records.push(record); };
    const q = quality();
    const located = { ...q, requirements: q.requirements.map((row) => ({ ...row, evidenceLines: [1] })),
      checks: q.checks.map((row) => ({ ...row, evidenceLines: [1] })) };
    let calls = 0;
    const client = { models: { generateContent: async () => ({ text: JSON.stringify(++calls === 1 ? review(located) : {
      issues: [{ kind: "contradiction", severity: "major", description: "Failed writes overwrite the original in another section.",
        suggestedDirection: "Preserve the original on failure.", relatedRequirementId: "REQ-1" }], questions: [], storageAudit: noStorageAudit,
    }) }) } } as unknown as GoogleGenAI;
    const result = await new GeminiPlanningReviewer(client, memory).review({ projectId: scope.projectId, currentPlan: plan,
      approvedScope: scope, originalRequirements: "Save a record", settledDecisions: [] },
      { model: { providerId: "vertex-ai", modelId: "gemini-3.8-flash" }, personaId: "reviewer" });
    assert.equal(calls, 2);
    assert.equal(result.challengeCompleted, true);
    assert.equal(decide(result).type, "REVISE");
    assert.deepEqual(records.map((row) => row.reviewStage), ["assessment", "challenge"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function storageAudit(overrides: Partial<StorageAudit["cases"][number]> = {}): StorageAudit {
  return parseStorageAudit(bindStorageAudit({ format: "json", evidenceLines: [1], rationale: "A declared JSON storage design.",
    cases: STORAGE_AUDIT_STATES.map((state) => ({ state, action: state === "absent" ? "initialize" : state === "valid" ? "load" : "preserve_and_block",
      verdict: "consistent", evidenceLines: [1], authorizationScopeIds: [], rationale: `Plan behavior for ${state}.`,
      ...(state === "present_empty" ? overrides : {}) })) }, plan));
}

test("an existing empty JSON reset cannot pass merely because both model verdicts say consistent", () => {
  const r = { ...review(), challengeCompleted: true, storageAudit: storageAudit({ action: "initialize" }) };
  const decision = decide(r);
  assert.equal(decision.type, "REVISE");
  if (decision.type === "REVISE") assert.match(decision.feedback, /승인 Scope 근거가 없습니다/);
  assert.equal(decide(r, 2).type, "STOP_LIMIT_REACHED");
  assert.equal(decide({ ...review(), storageAudit: storageAudit() }).type, "REQUEST_USER_APPROVAL");
});

test("explicit Scope-authorized disposable JSON reset and valid empty non-JSON data are allowed", () => {
  const authorized: ScopeContract = { ...scope, requiredFeatures: [{ id: "REQ-1", statement: "Discard invalid cache values and start an empty cache." }] };
  const r = { ...review(), storageAudit: storageAudit({ action: "reset_or_overwrite", authorizationScopeIds: ["requirement:REQ-1"] }) };
  assert.equal(decideAfterReview({ review: r, currentPlan: plan, approvedScope: authorized, iterationCount: 1, maxIterations: 2 }).type, "REQUEST_USER_APPROVAL");
  const textAudit = parseStorageAudit(bindStorageAudit({ format: "other", evidenceLines: [1], rationale: "Plain text treats empty text as valid.", cases: [] }, plan));
  assert.equal(decide({ ...review(), storageAudit: textAudit }).type, "REQUEST_USER_APPROVAL");
});

test("storage audits reject omitted/duplicate states, fabricated Scope authority and stale evidence", () => {
  const audit = storageAudit();
  for (const broken of [{ ...audit, cases: audit.cases.slice(1) }, { ...audit, cases: audit.cases.map(() => audit.cases[0]!) }]) {
    assert.throws(() => parsePlanReview({ ...review(), storageAudit: broken }));
  }
  assert.throws(() => validatePlanReview({ ...review(), storageAudit: storageAudit({ authorizationScopeIds: ["invented-source"] }) }, plan, scope));
  assert.throws(() => validatePlanReview({ ...review(), storageAudit: { ...audit, evidence: ["Invented storage guarantee"] } }, plan, scope));
  assert.deepEqual(parsePlanReview({ ...review(), storageAudit: audit }).storageAudit, audit);
});

test("unspecified storage behavior is a revision and explicit unresolved product choice is a question", () => {
  assert.equal(decide({ ...review(), storageAudit: storageAudit({ action: "unspecified" }) }).type, "REVISE");
  const result = decide({ ...review(), storageAudit: storageAudit({ verdict: "needs_user_input", rationale: "Should this data be disposable?" }) });
  assert.equal(result.type, "REQUEST_USER_INPUT");
  if (result.type === "REQUEST_USER_INPUT") assert.match(result.questions.join("\n"), /disposable/);
});

test("challenge failure cannot return the earlier pass and retains provider-reported failure tokens", async () => {
  const root = await mkdtemp(join(tmpdir(), "adtf-quality-challenge-failure-"));
  try {
    const memory = new FilePlanningMemoryStore(root);
    const records: { outcome: string; inputTokens?: number; reviewStage?: string }[] = [];
    memory.appendTokenUsage = async (record) => { records.push(record); };
    const q = quality();
    const located = { ...q, requirements: q.requirements.map((row) => ({ ...row, evidenceLines: [1] })),
      checks: q.checks.map((row) => ({ ...row, evidenceLines: [1] })) };
    let calls = 0;
    const client = { models: { generateContent: async () => ({ text: ++calls === 1 ? JSON.stringify(review(located)) : "invalid JSON",
      usageMetadata: { promptTokenCount: 7 } }) } } as unknown as GoogleGenAI;
    await assert.rejects(new GeminiPlanningReviewer(client, memory).review({ projectId: scope.projectId, currentPlan: plan,
      approvedScope: scope, originalRequirements: "Save a record", settledDecisions: [] },
      { model: { providerId: "vertex-ai", modelId: "gemini-3.8-flash" }, personaId: "reviewer" }));
    assert.equal(calls, 2);
    assert.equal(records[1]?.outcome, "failure");
    assert.equal(records[1]?.inputTokens, 7);
    assert.equal(records[1]?.reviewStage, "challenge");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("evidence locations bind excerpts in code and cannot point outside or at unrelated lines", () => {
  const q = quality();
  const located = { ...q, requirements: q.requirements.map((row) => ({ ...row, evidenceLines: [1] })),
    checks: q.checks.map((row) => ({ ...row, evidenceLines: [1] })) };
  const bound = bindReviewEvidence(located, plan);
  assert.doesNotThrow(() => validatePlanReview(review(bound as ReviewQualityAssessment), plan, scope));
  assert.throws(() => bindReviewEvidence({ ...located, requirements: [{ ...located.requirements[0]!, evidenceLines: [999] }] }, plan));
  assert.throws(() => bindReviewEvidence(q, plan));
  assert.throws(() => validatePlanReview(review(located), { ...plan, content: plan.content + "\nA different line" }, scope));
});

test("Controller persists quality evidence and withholds final approval when model pass has a missing rule", async () => {
  const root = await mkdtemp(join(tmpdir(), "adtf-quality-controller-"));
  try {
    const memory = new FilePlanningMemoryStore(join(root, "memory"));
    await memory.importDemoFixture(scope, { approval: { id: "scope-approval", projectId: scope.projectId,
      subject: `Scope Contract ${scope.id} v1`, status: "approved", rationale: "DEMO FIXTURE: quality test" },
      scopeApproval: { projectId: scope.projectId, scopeContractId: scope.id, approvalId: "scope-approval" } });
    const config = parsePlanningConfig({ projectId: scope.projectId, planning: { writer: { providerId: "fake", modelId: "writer" },
      reviewer: { providerId: "fake", modelId: "reviewer" }, maxIterations: 1, requireUserApproval: true, scenario: "always-revise" },
      memory: { type: "file", directory: "memory" } }, root);
    const q = quality();
    const r = review({ ...q, requirements: [{ ...q.requirements[0]!, status: "missing", evidence: [], rationale: "Failure rule is incomplete." }] });
    const controller = new PlanningLoopController({ config, memory, writer: { write: async () => plan }, reviewer: { review: async () => r } });
    const result = await controller.run({ requirements: "Save a record", scopeContract: scope });
    assert.equal(result.decision, "STOP_LIMIT_REACHED");
    assert.equal(result.approval, undefined);
    assert.deepEqual((await memory.getPlanReview(scope.projectId, plan.id, 1))?.qualityAssessment, r.qualityAssessment);
    assert.equal((await memory.getPlanningLoopState(scope.projectId))?.status, "limit_reached");
  } finally { await rm(root, { recursive: true, force: true }); }
});
