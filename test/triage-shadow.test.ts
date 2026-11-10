import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningDecisionInput, PlanReview, ScopeContract } from "../src/planning/contracts.js";
import { buildShadowContext, validateShadowProposal, type ShadowContext, type ShadowProposal, type TriageCategory } from "../src/supervisor/triage-shadow.js";

const scope: ScopeContract = { id: "s", projectId: "p", version: 1, goal: "TEST/STUB local reminder", requiredFeatures: [{ id: "r1", statement: "Record a reminder" }],
  excludedFeatures: [{ id: "e1", statement: "External SMS" }], technicalConstraints: ["Preserve local data"], createdAt: "2026-11-10T00:00:00Z" };
const review: PlanReview = { id: "review1", projectId: "p", planId: "plan", planVersion: 1, scopeContractId: "s", scopeVersion: 1,
  outcome: "revise", scopeViolation: false, userJudgmentRequired: false, issues: [{ id: "loss", kind: "implementation_risk", severity: "critical", description: "Invalid input overwrites old data", suggestedDirection: "Preserve old data" }], suggestions: [], reviewedAt: scope.createdAt };
const input = (): PlanningDecisionInput => ({ approvedScope: scope, currentPlan: { id: "plan", projectId: "p", version: 1, scopeContractId: "s", scopeVersion: 1, content: "Invalid input overwrites old data.\nKeep saved records on validation failure.", status: "ready_for_review", createdAt: scope.createdAt }, review, iterationCount: 1, maxIterations: 2 });
const proposal = (context: ShadowContext, category: TriageCategory = "WRITER_REWORK"): ShadowProposal => ({ schemaVersion: 1, contextSha256: context.contextSha256, author: { kind: "manual_fixture", version: "test-v1" },
  findings: context.findings.map(f => ({ findingId: f.id, category, rationale: "TEST/STUB rationale; requires manual relevance review", proposedAction: "TEST/STUB preserve the data", evidenceRefs: [`finding:${f.id}`, "plan:L1", "scope:constraint:1"] })), summaryForUser: "TEST/STUB proposal only" });

test("shadow proposals preserve policy, inputs and authority even when their labels differ", () => {
  const source = input(), snapshot = JSON.stringify(source), context = buildShadowContext(source), contextSnapshot = JSON.stringify(context);
  assert.equal(context.baseline.type, "REVISE");
  for (const category of ["WRITER_REWORK", "REVIEWER_RECHECK", "ESCALATE_OR_STOP"] as const) {
    const result = validateShadowProposal(context, proposal(context, category));
    assert.equal(result.status, "structurally_valid_for_manual_inspection"); assert.deepEqual(result.baseline, context.baseline);
    assert.equal(result.semanticCorrectness, "not_evaluated"); assert.equal(result.executed, false); assert.equal(result.newModelCalls, 0);
  }
  assert.equal(JSON.stringify(source), snapshot); assert.equal(JSON.stringify(context), contextSnapshot);
  const stopped = buildShadowContext({ ...source, iterationCount: 2 });
  assert.equal(stopped.baseline.type, "STOP_LIMIT_REACHED");
  assert.equal(validateShadowProposal(stopped, proposal(stopped)).baseline.type, "STOP_LIMIT_REACHED");
});
test("shadow rejects omitted, duplicate, foreign findings and fabricated or stale references", () => {
  const context = buildShadowContext(input()), p = proposal(context), row = p.findings[0]!;
  const errors = (raw: unknown): readonly string[] => validateShadowProposal(context, raw).errors;
  assert.ok(errors({ ...p, findings: [] }).some(s => s.startsWith("OMITTED_FINDING:")));
  assert.ok(errors({ ...p, findings: [row, row] }).some(s => s.startsWith("DUPLICATE_FINDING:")));
  assert.ok(errors({ ...p, findings: [{ ...row, findingId: "foreign" }] }).some(s => s.startsWith("UNKNOWN_FINDING:")));
  assert.ok(errors({ ...p, findings: [{ ...row, evidenceRefs: ["finding:review:loss", "plan:L999"] }] }).some(s => s.startsWith("INVALID_REFERENCE:")));
  assert.ok(errors({ ...p, contextSha256: "old-context" }).includes("SOURCE_MISMATCH"));
  assert.ok(errors({ ...p, findings: [{ ...row, evidenceRefs: ["plan:L1"] }] }).some(s => s.startsWith("MISSING_FINDING_REFERENCE:")));
  assert.throws(() => validateShadowProposal({ ...context, baseline: { type: "FAILED", reason: "tampered" } }, p), /digest mismatch/);
});
test("technical blockers cannot become preferences and Reviewer SMS demand is not user scope authorization", () => {
  const context = buildShadowContext(input());
  for (const category of ["USER_CLARIFICATION", "SCOPE_CHANGE_REQUIRED"] as const) assert.ok(validateShadowProposal(context, proposal(context, category)).errors.some(s => s.startsWith("BLOCKER_DOWNGRADED:")));
  const source = input();
  const sms = { ...source, review: { ...review, issues: [{ id: "sms", kind: "scope_violation" as const, severity: "major" as const, description: "Reviewer demands SMS", suggestedDirection: "Add SMS", scopeDisposition: "change_scope" as const, dispositionReason: "TEST/STUB" }], scopeViolation: true } };
  const noRequest = buildShadowContext(sms);
  assert.ok(validateShadowProposal(noRequest, proposal(noRequest, "SCOPE_CHANGE_REQUIRED")).errors.some(s => s.startsWith("USER_REQUEST_REQUIRED:")));
  const requested = buildShadowContext(sms, "TEST/STUB explicit new user request: add SMS");
  const p = proposal(requested, "SCOPE_CHANGE_REQUIRED");
  const linked = { ...p, findings: p.findings.map(f => ({ ...f, evidenceRefs: [...f.evidenceRefs, "user:request"] })) };
  assert.equal(validateShadowProposal(requested, linked).status, "structurally_valid_for_manual_inspection");
  assert.equal(validateShadowProposal(requested, linked).baseline.type, "REQUEST_SCOPE_CHANGE_APPROVAL");
});
test("genuine questions and empty pass reviews stay separate from final approval", () => {
  const source = input(), questions = buildShadowContext({ ...source, review: { ...review, issues: [], outcome: "needs_user_input", userJudgmentRequired: true, suggestions: ["Which reminder time do you want?"] } });
  assert.equal(questions.baseline.type, "REQUEST_USER_INPUT");
  assert.equal(validateShadowProposal(questions, proposal(questions, "USER_CLARIFICATION")).status, "structurally_valid_for_manual_inspection");
  const pass = buildShadowContext({ ...source, review: { ...review, issues: [], outcome: "pass" } });
  assert.equal(pass.baseline.type, "REQUEST_USER_APPROVAL"); assert.equal(pass.findings.length, 0);
  assert.equal(validateShadowProposal(pass, proposal(pass)).executed, false);
  assert.equal(validateShadowProposal(pass, { ...proposal(pass), finalApprovalCreated: true }).status, "rejected");
});
test("invalid input sources and malformed proposals fail without broadening the execution API", () => {
  assert.throws(() => buildShadowContext({ ...input(), review: { ...review, planVersion: 2 } }));
  assert.throws(() => buildShadowContext({ ...input(), iterationCount: 3 }));
  const context = buildShadowContext(input());
  for (const raw of [undefined, null, [], {}, { ...proposal(context), author: { kind: "live", version: "unknown" } }]) assert.equal(validateShadowProposal(context, raw).status, "rejected");
});
