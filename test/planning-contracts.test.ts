import assert from "node:assert/strict";
import test from "node:test";
import type {
  PlanDraft,
  PlanReview,
  PlanningDecisionInput,
  PlanningModelConfig,
  PlanningReviewer,
  PlanningReviewerContext,
  PlanningWriter,
  ReviewIssue,
  ScopeApprovalRecord,
  ScopeContract,
  TokenUsageRecord,
} from "../src/planning/contracts.js";
import { canTransitionPlanningState, compareScopeContracts, decideAfterReview } from "../src/planning/policy.js";

const scope: ScopeContract = {
  id: "scope-1",
  projectId: "project-1",
  version: 1,
  goal: "Create a planning tool",
  requiredFeatures: [{ id: "REQ-1", statement: "Create a plan" }],
  excludedFeatures: [{ id: "EX-1", statement: "No web UI" }],
  technicalConstraints: ["TypeScript strict"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const plan: PlanDraft = {
  id: "plan-1",
  projectId: scope.projectId,
  version: 1,
  scopeContractId: scope.id,
  scopeVersion: scope.version,
  content: "A versioned plan",
  status: "ready_for_review",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const planV2: PlanDraft = { ...plan, version: 2 };

function createReview(overrides: Partial<PlanReview> = {}): PlanReview {
  return {
    id: "review-1",
    projectId: plan.projectId,
    planId: plan.id,
    planVersion: plan.version,
    scopeContractId: scope.id,
    scopeVersion: scope.version,
    outcome: "pass",
    issues: [],
    suggestions: [],
    scopeViolation: false,
    userJudgmentRequired: false,
    reviewedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function decisionInput(
  review: PlanReview,
  overrides: Partial<Omit<PlanningDecisionInput, "review">> = {},
): PlanningDecisionInput {
  const currentPlan = overrides.currentPlan ?? plan;
  const approvedScope = overrides.approvedScope ?? scope;
  const iterationCount = overrides.iterationCount ?? 0;
  const maxIterations = overrides.maxIterations ?? 3;
  return {
    review,
    currentPlan,
    approvedScope,
    iterationCount,
    maxIterations,
    ...(overrides.previousReview === undefined ? {} : { previousReview: overrides.previousReview }),
  };
}

function issue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    id: "ISSUE-1",
    kind: "omission",
    severity: "major",
    description: "A required feature is missing",
    suggestedDirection: "Add the requirement to the plan",
    relatedRequirementId: "REQ-1",
    ...overrides,
  };
}

function previousReview(issues: readonly ReviewIssue[]): PlanReview {
  return createReview({ id: "review-0", planVersion: 1, outcome: "revise", issues });
}

function currentReview(issues: readonly ReviewIssue[], outcome: PlanReview["outcome"] = "revise"): PlanReview {
  return createReview({ id: "review-2", planVersion: 2, outcome, issues });
}

test("review must match the current project, plan ID, and version", () => {
  assert.equal(decideAfterReview(decisionInput(createReview())).type, "REQUEST_USER_APPROVAL");
  assert.equal(decideAfterReview(decisionInput(createReview({ projectId: "project-2" }))).type, "FAILED");
  assert.equal(decideAfterReview(decisionInput(createReview({ planId: "plan-other" }))).type, "FAILED");
  assert.equal(decideAfterReview(decisionInput(createReview({ planVersion: 2 }))).type, "FAILED");
});

test("prior review must belong to this project and plan and precede the current version", () => {
  const review = currentReview([], "pass");
  const currentInput = { currentPlan: planV2 };
  assert.equal(
    decideAfterReview(decisionInput(review, { ...currentInput, previousReview: previousReview([]) })).type,
    "REQUEST_USER_APPROVAL",
  );
  assert.equal(
    decideAfterReview(decisionInput(review, {
      ...currentInput,
      previousReview: { ...previousReview([]), projectId: "project-2" },
    })).type,
    "FAILED",
  );
  assert.equal(
    decideAfterReview(decisionInput(review, {
      ...currentInput,
      previousReview: { ...previousReview([]), planId: "plan-other" },
    })).type,
    "FAILED",
  );
  for (const version of [2, 3]) {
    assert.equal(
      decideAfterReview(decisionInput(review, {
        ...currentInput,
        previousReview: { ...previousReview([]), planVersion: version },
      })).type,
      "FAILED",
    );
  }
});

test("a passing review with a major issue requests revision, not approval", () => {
  const review = createReview({ outcome: "pass", issues: [issue()] });
  assert.equal(decideAfterReview(decisionInput(review)).type, "REVISE");
});

test("a scope violation in a passing review takes the scope approval path", () => {
  const review = createReview({
    outcome: "pass",
    scopeViolation: true,
    issues: [issue({ id: "ISSUE-SCOPE", kind: "scope_violation", severity: "critical" })],
  });
  assert.equal(decideAfterReview(decisionInput(review)).type, "REQUEST_SCOPE_CHANGE_APPROVAL");
});

test("scope approval IDs include only change requests and retain the legacy route", () => {
  const change = issue({ id: "CHANGE", kind: "scope_violation", scopeDisposition: "change_scope", dispositionReason: "New feature requested" });
  const legacy = issue({ id: "LEGACY", kind: "scope_violation" });
  const repair = issue({ id: "REPAIR", kind: "scope_violation", scopeDisposition: "revise_plan", dispositionReason: "Repair within Scope" });
  const clarify = issue({ id: "CLARIFY", kind: "scope_violation", scopeDisposition: "clarify", dispositionReason: "Choose behavior" });
  const ordinary = issue({ id: "DEFECT" });
  const review = createReview({ outcome: "revise", scopeViolation: true, issues: [change, repair, clarify, ordinary, legacy] });
  const decision = decideAfterReview(decisionInput(review));
  assert.equal(decision.type, "REQUEST_SCOPE_CHANGE_APPROVAL");
  if (decision.type === "REQUEST_SCOPE_CHANGE_APPROVAL") assert.deepEqual(decision.issueIds, ["CHANGE", "LEGACY"]);
});

test("clarification and question sources are ordered, deduplicated, and ordinary suggestions stay separate", () => {
  const clarify = issue({ id: "CLARIFY", kind: "scope_violation", scopeDisposition: "clarify", dispositionReason: "Choose behavior", description: "Which option?" });
  const review = createReview({ outcome: "revise", scopeViolation: true, issues: [clarify], suggestions: ["Optional sorting improvement"] });
  const decision = decideAfterReview(decisionInput(review));
  assert.equal(decision.type, "REQUEST_USER_INPUT");
  if (decision.type === "REQUEST_USER_INPUT") assert.deepEqual(decision.questions, ["Which option? — Choose behavior"]);
});

test("a user-input flag without a question fails closed, while legacy scope flags remain actionable", () => {
  for (const overrides of [{ outcome: "needs_user_input" as const }, { userJudgmentRequired: true }]) {
    const result = decideAfterReview(decisionInput(createReview(overrides)));
    assert.deepEqual(result, { type: "FAILED", reason: "Reviewer requested user input without an actionable question." });
  }
  const blocked = createReview({ outcome: "needs_user_input", userJudgmentRequired: true, issues: [issue({ severity: "critical" })] });
  assert.equal(decideAfterReview(decisionInput(blocked)).type, "FAILED");
  const repeated = decideAfterReview(decisionInput(currentReview([issue({ severity: "critical" })], "needs_user_input"),
    { currentPlan: planV2, previousReview: previousReview([issue({ severity: "critical" })]) }));
  assert.equal(repeated.type, "STOP_REPEATED_REVIEW_ISSUES");
  const scopeChange = createReview({ outcome: "needs_user_input", issues: [issue({ kind: "scope_violation" })] });
  assert.equal(decideAfterReview(decisionInput(scopeChange)).type, "REQUEST_SCOPE_CHANGE_APPROVAL");
  const legacy = decideAfterReview(decisionInput(createReview({ scopeViolation: true })));
  assert.equal(legacy.type, "REQUEST_USER_INPUT");
  if (legacy.type === "REQUEST_USER_INPUT") assert.equal(legacy.questions.length, 1);
});

test("a plan based on a scope other than the active approved version is blocked", () => {
  const outOfScopePlan = { ...plan, scopeContractId: "scope-unapproved", scopeVersion: 2 };
  const result = decideAfterReview(decisionInput(createReview(), { currentPlan: outOfScopePlan }));
  assert.equal(result.type, "REQUEST_SCOPE_CHANGE_APPROVAL");
});

test("review pass still requires explicit user approval", () => {
  const result = decideAfterReview(decisionInput(createReview()));
  assert.deepEqual(result, { type: "REQUEST_USER_APPROVAL", planId: plan.id, version: plan.version });
});

test("repeat detection considers issue ID, kind, related requirement, and severity progression", () => {
  const prior = previousReview([issue({ severity: "major" })]);
  const runWith = (current: ReviewIssue) =>
    decideAfterReview(decisionInput(currentReview([current]), { currentPlan: planV2, previousReview: prior }));

  assert.equal(runWith(issue({ severity: "minor" })).type, "REVISE");
  assert.equal(runWith(issue({ severity: "major" })).type, "STOP_REPEATED_REVIEW_ISSUES");
  assert.equal(runWith(issue({ severity: "critical" })).type, "STOP_REPEATED_REVIEW_ISSUES");
  assert.equal(runWith(issue({ kind: "contradiction" })).type, "REVISE");
  assert.equal(runWith(issue({ id: "ISSUE-2" })).type, "REVISE");
  assert.equal(runWith(issue({ relatedRequirementId: "REQ-OTHER" })).type, "REVISE");
});

test("confirmed repeated blockers stop before questions, but first or different issues still ask", () => {
  for (const severity of ["major", "critical"] as const) {
    const prior = previousReview([issue({ severity })]);
    const question = currentReview([issue({ severity })], "needs_user_input");
    const withQuestion = { ...question, userJudgmentRequired: true, suggestions: ["Which display format?"] };
    const source = { currentPlan: planV2, previousReview: prior };
    assert.equal(decideAfterReview(decisionInput(withQuestion, source)).type, "STOP_REPEATED_REVIEW_ISSUES");
    assert.equal(decideAfterReview(decisionInput(withQuestion, { currentPlan: planV2 })).type, "REQUEST_USER_INPUT");
    assert.equal(decideAfterReview(decisionInput({ ...withQuestion, issues: [issue({ id: "OTHER", severity })] }, source)).type, "REQUEST_USER_INPUT");
  }
});

test("review iteration limit stops revision and invalid counters fail closed", () => {
  const revise = createReview({ outcome: "revise", issues: [issue()] });
  assert.equal(decideAfterReview(decisionInput(revise, { iterationCount: 3 })).type, "STOP_LIMIT_REACHED");
  assert.equal(decideAfterReview(decisionInput(revise, { iterationCount: 4 })).type, "FAILED");
  assert.equal(decideAfterReview(decisionInput(revise, { maxIterations: 0 })).type, "FAILED");
});

test("a final allowed passing Review can still await explicit user approval", () => {
  assert.equal(decideAfterReview(decisionInput(createReview(), { iterationCount: 3, maxIterations: 3 })).type, "REQUEST_USER_APPROVAL");
});

test("invalid planning transitions are rejected", () => {
  assert.equal(canTransitionPlanningState("reviewing", "revising"), true);
  assert.equal(canTransitionPlanningState("reviewing", "awaiting_scope_change_approval"), true);
  assert.equal(canTransitionPlanningState("user_approved", "reviewing"), false);
});

test("scope comparison is structural, versioned, and project isolated", () => {
  const sameScopeNextVersion = { ...scope, id: "scope-2", version: 2 } satisfies ScopeContract;
  assert.equal(compareScopeContracts(scope, sameScopeNextVersion).kind, "unchanged");

  const changedScope = {
    ...sameScopeNextVersion,
    requiredFeatures: [...scope.requiredFeatures, { id: "REQ-2", statement: "Add another requirement" }],
  } satisfies ScopeContract;
  const comparison = compareScopeContracts(scope, changedScope);
  assert.equal(comparison.kind, "changed");
  assert.equal(comparison.requiresApproval, true);
  if (comparison.kind === "changed") assert.deepEqual(comparison.changedSections, ["requiredFeatures"]);
  assert.equal(compareScopeContracts(scope, { ...changedScope, projectId: "project-2" }).kind, "project_mismatch");
});

test("Writer and Reviewer ports can be stubbed without invoking a model", () => {
  const context: PlanningReviewerContext = {
    projectId: plan.projectId,
    originalRequirements: "Create a bounded planning loop",
    approvedScope: scope,
    currentPlan: plan,
    settledDecisions: ["Keep Runtime separate from model selection"],
  };
  const writer = { write: async () => plan } satisfies PlanningWriter;
  const reviewer = { review: async () => createReview() } satisfies PlanningReviewer;
  assert.equal(context.currentPlan.scopeVersion, context.approvedScope.version);
  assert.equal(typeof writer.write, "function");
  assert.equal(typeof reviewer.review, "function");
});

test("Writer and Reviewer use distinct model selections when configured", () => {
  const models = {
    writer: { model: { providerId: "provider-a", modelId: "writer-model" }, personaId: "planning-writer" },
    reviewer: { model: { providerId: "provider-b", modelId: "review-model" }, personaId: "planning-reviewer" },
  } satisfies PlanningModelConfig;
  assert.notEqual(models.writer.model.modelId, models.reviewer.model.modelId);
});

test("optional token fields are valid when absent and remain available on the declared type", () => {
  const usage: TokenUsageRecord = {
    projectId: plan.projectId,
    planId: plan.id,
    iteration: 1,
    role: "writer",
    providerId: "provider-a",
    modelId: "writer-model",
    outcome: "success",
    durationMs: 120,
    recordedAt: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(usage.inputTokens, undefined);
  assert.equal(usage.outputTokens, undefined);
});

test("scope approval is a separate record linked to the immutable scope snapshot", () => {
  const approval = {
    projectId: scope.projectId,
    scopeContractId: scope.id,
    approvalId: "approval-scope-1",
  } satisfies ScopeApprovalRecord;
  assert.equal(approval.scopeContractId, scope.id);
});
