import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { PlanDraft, PlanReview, ScopeContract, StorageValidation } from "../src/planning/contracts.js";
import { decideAfterReview } from "../src/planning/policy.js";
import { storageValidationChecks } from "../src/planning/storage-audit.js";
import { compactReviewContext } from "../src/planning/review-context.js";
import { sessionFailureMessage } from "../src/cli/planning-session-errors.js";

const scope: ScopeContract = { id: "s", projectId: "p", version: 1, goal: "test", requiredFeatures: [], excludedFeatures: [], technicalConstraints: [], createdAt: "2026-11-10T00:00:00Z" };
const plan: PlanDraft = { id: "p-plan", projectId: "p", version: 2, scopeContractId: "s", scopeVersion: 1, content: "load rule\ncandidate rule\ninvalid input preserves original", status: "ready_for_review", createdAt: scope.createdAt };
const at = (n: number) => ({ evidenceLines: [n], evidence: [plan.content.split("\n")[n - 1]!] });
const empty = () => ({ evidenceLines: [], evidence: [] });
const validation = (names: readonly string[]): StorageValidation => ({ version: 2, rationale: "TEST/STUB", rules: names.map(rule => ({ rule, status: "supported", load: at(1), candidate: at(2), acceptance: empty(), rationale: "TEST/STUB claims group coverage" })),
  acceptanceGroups: [{ ruleIndexes: [1], acceptance: at(3), rationale: "TEST/STUB actual connection only to first rule" }] });
function review(names: readonly string[], version: number): PlanReview {
  return { id: `r-${version}`, projectId: "p", planId: plan.id, planVersion: version, scopeContractId: "s", scopeVersion: 1,
    outcome: "pass", issues: [], suggestions: [], scopeViolation: false, userJudgmentRequired: false, reviewedAt: scope.createdAt,
    storageAudit: { format: "json", evidenceLines: [1], evidence: at(1).evidence, rationale: "TEST/STUB", validation: { ...validation(names), acceptanceGroups: [] },
      cases: ["absent", "present_empty", "invalid", "valid", "read_error"].map(state => ({ state: state as "absent", action: state === "absent" ? "initialize" as const : state === "valid" ? "load" as const : "preserve_and_block" as const,
        verdict: "consistent" as const, ...at(1), authorizationScopeIds: [], rationale: "TEST/STUB" })) } };
}
test("supported claims cannot borrow group evidence that does not list their rule", () => {
  const v = validation(["field-a", "field-b"]); const before = JSON.stringify(v);
  const checks = storageValidationChecks(v);
  assert.equal(checks[0]!.blocked, false); assert.equal(checks[0]!.acceptanceSources[0]!.label, "공유 사례 1");
  assert.equal(checks[1]!.blocked, true); assert.equal(checks[1]!.modelConflict, true);
  assert.equal(checks[1]!.acceptanceSources.length, 0);
  assert.match(checks[1]!.problems.join(" "), /연결 근거 없음/);
  assert.equal(JSON.stringify(v), before);
});
test("same blocking issues stop technically; reordered legacy positions do not prove recurrence", () => {
  const previous = review(["field-a", "field-b"], 1);
  const decide = (current: PlanReview) => decideAfterReview({ review: current, previousReview: previous, currentPlan: plan, approvedScope: scope, iterationCount: 1, maxIterations: 3 });
  const repeated = decide(review(["field-a", "field-b"], 2));
  assert.equal(repeated.type, "STOP_REPEATED_REVIEW_ISSUES");
  if (repeated.type === "STOP_REPEATED_REVIEW_ISSUES") assert.match(repeated.reason, /사용자 취향 질문이 아니라/);
  assert.equal(decide(review(["field-b", "field-a"], 2)).type, "REVISE");
  const question = { ...review(["field-a", "field-b"], 2), outcome: "needs_user_input" as const, userJudgmentRequired: true, suggestions: ["Which date display do you want?"] };
  assert.equal(decide(question).type, "REQUEST_USER_INPUT");
});
test("repeated optional minor suggestions do not stop a passing plan", () => {
  const { storageAudit: omitted, ...base } = review([], 2); void omitted;
  const current = { ...base, issues: [{ id: "minor", kind: "implementation_risk" as const, severity: "minor" as const, description: "Optional suggestion", suggestedDirection: "Consider later" }] };
  assert.equal(decideAfterReview({ review: current, previousReview: { ...current, planVersion: 1 }, currentPlan: plan, approvedScope: scope, iterationCount: 1, maxIterations: 3 }).type, "REQUEST_USER_APPROVAL");
});
test("compact feedback preserves actual issues, questions and derived blockers without copying audit quotations", () => {
  const source = { ...review(["field-a", "field-b"], 1), suggestions: ["Question"], userJudgmentRequired: true };
  const before = JSON.stringify(source); const compact = compactReviewContext(source, true);
  assert.deepEqual(compact.issues, source.issues); assert.deepEqual(compact.suggestions, source.suggestions);
  assert.equal(compact.userJudgmentRequired, true);
  assert.ok(compact.requiredCorrections?.["issue-storage-validation-1"]);
  assert.ok(compact.requiredCorrections?.["issue-storage-validation-2"]);
  assert.ok(compact.requiredCorrections?.["question:1"]);
  assert.equal("storageAudit" in compact, false);
  assert.equal(compact.sourceReviewSha256, createHash("sha256").update(before).digest("hex"));
  assert.equal(JSON.stringify(source), before);
});
test("session errors reveal local missing paths and locks without leaking arbitrary provider messages", () => {
  const path = "C:\\adtf-data\\parking\\ledger\\calls";
  const missing = sessionFailureMessage(Object.assign(new Error("local error"), { code: "ENOENT", syscall: "scandir", path }));
  assert.equal(missing.code, "LOCAL_PATH_MISSING"); assert.ok(missing.message.includes(path));
  const locked = sessionFailureMessage(Object.assign(new Error("local error"), { code: "EEXIST", syscall: "open", path: "C:\\data\\session.lock" }));
  assert.equal(locked.code, "LOCAL_ALREADY_EXISTS"); assert.match(locked.message, /자동으로 삭제하지/);
  const secret = "Scope api_key=do-not-expose-this";
  assert.ok(!sessionFailureMessage(new Error(secret)).message.includes(secret));
  assert.equal(sessionFailureMessage(new Error("REQUEST_BUDGET: need 3, remaining 0")).code, "REQUEST_BUDGET");
  assert.equal(sessionFailureMessage(new Error("Recovery artifact manifest mismatch.")).code, "SOURCE_INTEGRITY");
});
