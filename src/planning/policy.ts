import type {
  PlanningDecision,
  PlanningDecisionInput,
  PlanningLoopStatus,
  PlanDraft,
  PlanReview,
  ReviewIssue,
  ReviewSeverity,
  ScopeContract,
  ScopeRequirement,
} from "./contracts.js";
import { parseReviewQuality, qualityFindings, validateReviewQuality } from "./review-quality.js";
import { parseStorageAudit, storageAuditFindings, validateStorageAudit } from "./storage-audit.js";

const allowedTransitions: Readonly<Record<PlanningLoopStatus, readonly PlanningLoopStatus[]>> = {
  drafting: ["reviewing", "awaiting_user_input", "failed", "stopped"],
  reviewing: [
    "revising",
    "awaiting_user_input",
    "awaiting_scope_change_approval",
    "awaiting_approval",
    "limit_reached",
    "failed",
    "stopped",
  ],
  revising: ["reviewing", "awaiting_user_input", "failed", "stopped"],
  awaiting_user_input: ["drafting", "stopped", "failed"],
  awaiting_scope_change_approval: ["drafting", "stopped", "failed"],
  awaiting_approval: ["user_approved", "drafting", "stopped", "failed"],
  user_approved: ["drafting"],
  limit_reached: [],
  failed: [],
  stopped: [],
};

/** State transition policy only; it does not mutate or persist loop state. */
export function canTransitionPlanningState(
  current: PlanningLoopStatus,
  next: PlanningLoopStatus,
): boolean {
  return allowedTransitions[current].includes(next);
}

/** Exact structural comparison only. Semantic scope interpretation remains a reviewer/user responsibility. */
export type ScopeComparison =
  | { readonly kind: "project_mismatch"; readonly requiresApproval: true }
  | { readonly kind: "invalid_version"; readonly requiresApproval: true }
  | { readonly kind: "unchanged"; readonly requiresApproval: false; readonly semanticAssessment: "not_performed" }
  | {
      readonly kind: "changed";
      readonly requiresApproval: true;
      readonly semanticAssessment: "not_performed";
      readonly changedSections: readonly string[];
    };

export function compareScopeContracts(approved: ScopeContract, proposed: ScopeContract): ScopeComparison {
  if (approved.projectId !== proposed.projectId) {
    return { kind: "project_mismatch", requiresApproval: true };
  }
  if (proposed.version <= approved.version) {
    return { kind: "invalid_version", requiresApproval: true };
  }

  const changedSections: string[] = [];
  if (approved.goal !== proposed.goal) changedSections.push("goal");
  if (stableRequirements(approved.requiredFeatures) !== stableRequirements(proposed.requiredFeatures)) {
    changedSections.push("requiredFeatures");
  }
  if (stableRequirements(approved.excludedFeatures) !== stableRequirements(proposed.excludedFeatures)) {
    changedSections.push("excludedFeatures");
  }
  if (stableStrings(approved.technicalConstraints) !== stableStrings(proposed.technicalConstraints)) {
    changedSections.push("technicalConstraints");
  }
  if (approved.scheduleConstraint !== proposed.scheduleConstraint) changedSections.push("scheduleConstraint");
  if (approved.budgetConstraint !== proposed.budgetConstraint) changedSections.push("budgetConstraint");

  if (changedSections.length === 0) {
    return { kind: "unchanged", requiresApproval: false, semanticAssessment: "not_performed" };
  }
  return { kind: "changed", requiresApproval: true, semanticAssessment: "not_performed", changedSections };
}

function stableRequirements(requirements: readonly ScopeRequirement[]): string {
  const sorted = requirements
    .map(({ id, statement }) => ({ id, statement }))
    .sort((left, right) => left.id.localeCompare(right.id) || left.statement.localeCompare(right.statement));
  return JSON.stringify(sorted);
}

function stableStrings(values: readonly string[]): string {
  return JSON.stringify([...values].sort());
}

/**
 * Chooses the next action from a version-bound review. User approval is always
 * a separate action, and scope changes are routed to their own approval path.
 */
export function decideAfterReview(input: PlanningDecisionInput): PlanningDecision {
  const { review, currentPlan, approvedScope } = input;
  if (currentPlan.projectId !== approvedScope.projectId) {
    return { type: "FAILED", reason: "Current plan and approved scope belong to different projects." };
  }
  if (review.projectId !== currentPlan.projectId) {
    return { type: "FAILED", reason: "Review belongs to a different project." };
  }
  if (review.planId !== currentPlan.id || review.planVersion !== currentPlan.version) {
    return { type: "FAILED", reason: "Review does not match the current plan version." };
  }
  if (
    !Number.isInteger(currentPlan.version) ||
    currentPlan.version < 1 ||
    !Number.isInteger(approvedScope.version) ||
    approvedScope.version < 1 ||
    !Number.isInteger(input.iterationCount) ||
    !Number.isInteger(input.maxIterations) ||
    input.iterationCount < 0 ||
    input.maxIterations < 1 ||
    input.iterationCount > input.maxIterations
  ) {
    return { type: "FAILED", reason: "Plan, approved scope, or planning iteration state is invalid." };
  }
  if (input.previousReview !== undefined) {
    if (input.previousReview.projectId !== currentPlan.projectId) {
      return { type: "FAILED", reason: "Previous review belongs to a different project." };
    }
    if (input.previousReview.planId !== currentPlan.id) {
      return { type: "FAILED", reason: "Previous review belongs to a different plan." };
    }
    if (
      !Number.isInteger(input.previousReview.planVersion) ||
      input.previousReview.planVersion < 1 ||
      input.previousReview.planVersion >= currentPlan.version
    ) {
      return { type: "FAILED", reason: "Previous review is not for an earlier plan version." };
    }
  }
  if (
    currentPlan.scopeContractId !== approvedScope.id ||
    currentPlan.scopeVersion !== approvedScope.version
  ) {
    return {
      type: "REQUEST_SCOPE_CHANGE_APPROVAL",
      planId: currentPlan.id,
      version: currentPlan.version,
      issueIds: [],
      reason: "Current plan references a scope version other than the approved scope.",
    };
  }
  if (review.scopeContractId !== approvedScope.id || review.scopeVersion !== approvedScope.version) {
    return { type: "FAILED", reason: "Review does not match the approved Scope version." };
  }
  if (review.qualityAssessment !== undefined) {
    try { validateReviewQuality(parseReviewQuality(review.qualityAssessment), currentPlan, approvedScope); }
    catch { return { type: "FAILED", reason: "Review quality coverage or Plan evidence is invalid." }; }
  }
  if (review.storageAudit !== undefined) {
    try { validateStorageAudit(parseStorageAudit(review.storageAudit), currentPlan, approvedScope); }
    catch { return { type: "FAILED", reason: "Review storage audit coverage or evidence is invalid." }; }
  }
  if (review.outcome === "failed") return { type: "FAILED", reason: "Reviewer reported a failed review." };
  const scopeIssues = review.issues.filter((issue) => issue.kind === "scope_violation");
  const scopeIssueIds = scopeIssues.map((issue) => issue.id);
  if (review.scopeViolation || scopeIssueIds.length > 0) {
    if (scopeIssueIds.length === 0) {
      return {
        type: "REQUEST_USER_INPUT",
        questions: ["Reviewer flagged a scope violation but did not provide a structured scope issue."],
      };
    }
    // Legacy issues retain the conservative approval route; new issues must state how to resolve them.
    if (scopeIssues.some(issue => issue.scopeDisposition === undefined || issue.scopeDisposition === "change_scope")) return {
      type: "REQUEST_SCOPE_CHANGE_APPROVAL", planId: review.planId, version: review.planVersion, issueIds: scopeIssueIds,
      reason: "Reviewer identified a scope change requiring separate approval; approved Scope was not modified.",
    };
    if (scopeIssues.some(issue => issue.scopeDisposition === "clarify")) return {
      type: "REQUEST_USER_INPUT", questions: scopeIssues.filter(issue => issue.scopeDisposition === "clarify")
        .map(issue => `${issue.description} — ${issue.dispositionReason}`),
    };
  }
  const findings = qualityFindings(review);
  const storageFindings = storageAuditFindings(review.storageAudit);
  const questions = [...findings.filter((finding) => finding.status === "needs_user_input").map((finding) => finding.message), ...storageFindings.questions];
  if (review.outcome === "needs_user_input" || review.userJudgmentRequired || questions.length > 0) {
    return { type: "REQUEST_USER_INPUT", questions: [...questions, ...review.suggestions] };
  }

  const blockingIssues = [...review.issues, ...storageFindings.issues].filter(
    (issue) => issue.severity === "major" || issue.severity === "critical",
  );
  const repeatedIssues = findUnresolvedRepeatedIssues(review, input.previousReview);
  if (repeatedIssues.length > 0) {
    return {
      type: "REQUEST_USER_INPUT",
      questions: [
        `The same issue remains at the same or higher severity: ${repeatedIssues.map((issue) => issue.id).join(", ")}.`,
      ],
    };
  }

  const needsRevision = review.outcome === "revise" || blockingIssues.length > 0 || findings.length > 0 || scopeIssues.length > 0;
  if (!needsRevision) {
    return { type: "REQUEST_USER_APPROVAL", planId: review.planId, version: review.planVersion };
  }
  if (review.issues.length === 0 && review.suggestions.length === 0 && findings.length === 0 && storageFindings.issues.length === 0) {
    return { type: "FAILED", reason: "Reviewer requested revision without actionable feedback." };
  }

  if (input.iterationCount >= input.maxIterations) {
    return { type: "STOP_LIMIT_REACHED", reason: "Maximum planning review iterations reached." };
  }

  return {
    type: "REVISE",
    feedback: [
      ...review.issues.map((issue) => `${issue.id}: ${issue.description} — ${issue.suggestedDirection}`),
      ...storageFindings.issues.map((issue) => `${issue.id}: ${issue.description} — ${issue.suggestedDirection}`),
      ...review.suggestions,
      ...findings.map((finding) => finding.message),
    ].join("\n"),
    nextVersion: review.planVersion + 1,
  };
}

const severityRank: Readonly<Record<ReviewSeverity, number>> = {
  info: 0,
  minor: 1,
  major: 2,
  critical: 3,
};

function findUnresolvedRepeatedIssues(
  current: PlanReview,
  previous: PlanReview | undefined,
): readonly ReviewIssue[] {
  if (previous === undefined) return [];

  return [...current.issues, ...storageAuditFindings(current.storageAudit).issues].filter((issue) => {
    const earlier = [...previous.issues, ...storageAuditFindings(previous.storageAudit).issues].find((candidate) => candidate.id === issue.id);
    if (earlier === undefined || earlier.kind !== issue.kind) return false;
    if (earlier.relatedRequirementId !== issue.relatedRequirementId) return false;
    return severityRank[issue.severity] >= severityRank[earlier.severity];
  });
}

export type ReviewValidationErrorCode =
  | "REVIEW_INVALID_FIELD"
  | "REVIEW_PROJECT_MISMATCH"
  | "REVIEW_PLAN_MISMATCH"
  | "REVIEW_VERSION_MISMATCH"
  | "REVIEW_SCOPE_MISMATCH"
  | "REVIEW_PLAN_NOT_FOUND"
  | "REVIEW_DUPLICATE";

export class ReviewValidationError extends Error {
  constructor(readonly code: ReviewValidationErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ReviewValidationError";
  }
}

/** Parse external or persisted data without treating quality findings as schema errors. */
export function parsePlanReview(raw: unknown): PlanReview {
  const value = reviewRecord(raw, "Review");
  if (!Array.isArray(value.issues)) throw invalidReviewField("issues");
  const issueValues: readonly unknown[] = value.issues;
  const issues = issueValues.map((entry): ReviewIssue => {
    const item = reviewRecord(entry, "Review issue");
    return {
      id: reviewIdentifier(item.id, "issue.id"),
      kind: reviewChoice(item.kind, ["omission", "contradiction", "scope_violation", "implementation_risk", "unverifiable"], "issue.kind"),
      severity: reviewChoice(item.severity, ["info", "minor", "major", "critical"], "issue.severity"),
      description: reviewString(item.description, "issue.description"),
      suggestedDirection: reviewString(item.suggestedDirection, "issue.suggestedDirection"),
      ...(item.relatedRequirementId === undefined
        ? {}
        : { relatedRequirementId: reviewString(item.relatedRequirementId, "issue.relatedRequirementId") }),
      ...(item.scopeDisposition === undefined ? {} : {
        scopeDisposition: reviewChoice(item.scopeDisposition, ["not_applicable", "revise_plan", "change_scope", "clarify"], "issue.scopeDisposition"),
        dispositionReason: reviewString(item.dispositionReason, "issue.dispositionReason"),
      }),
    };
  });
  if (issues.some(issue => issue.scopeDisposition !== undefined &&
    (issue.kind === "scope_violation" ? issue.scopeDisposition === "not_applicable" : issue.scopeDisposition !== "not_applicable"))) throw invalidReviewField("issue.scopeDisposition does not match issue kind");
  if (new Set(issues.map((issue) => issue.id)).size !== issues.length) throw invalidReviewField("issues: duplicate IDs");
  const reviewedAt = reviewString(value.reviewedAt, "reviewedAt");
  if (Number.isNaN(Date.parse(reviewedAt))) throw invalidReviewField("reviewedAt");
  let qualityAssessment: PlanReview["qualityAssessment"];
  if (value.qualityAssessment !== undefined) {
    try { qualityAssessment = parseReviewQuality(value.qualityAssessment); }
    catch { throw invalidReviewField("qualityAssessment"); }
  }
  let storageAudit: PlanReview["storageAudit"];
  if (value.storageAudit !== undefined) {
    try { storageAudit = parseStorageAudit(value.storageAudit); }
    catch { throw invalidReviewField("storageAudit"); }
  }
  return {
    id: reviewIdentifier(value.id, "id"),
    projectId: reviewIdentifier(value.projectId, "projectId"),
    planId: reviewIdentifier(value.planId, "planId"),
    planVersion: reviewVersion(value.planVersion, "planVersion"),
    scopeContractId: reviewIdentifier(value.scopeContractId, "scopeContractId"),
    scopeVersion: reviewVersion(value.scopeVersion, "scopeVersion"),
    outcome: reviewChoice(value.outcome, ["pass", "revise", "needs_user_input", "failed"], "outcome"),
    issues,
    suggestions: reviewStrings(value.suggestions, "suggestions"),
    scopeViolation: reviewBoolean(value.scopeViolation, "scopeViolation"),
    userJudgmentRequired: reviewBoolean(value.userJudgmentRequired, "userJudgmentRequired"),
    reviewedAt,
    ...(qualityAssessment === undefined ? {} : { qualityAssessment }),
    ...(value.challengeCompleted === undefined ? {} : { challengeCompleted: reviewBoolean(value.challengeCompleted, "challengeCompleted") }),
    ...(storageAudit === undefined ? {} : { storageAudit }),
  };
}

/** Structural/reference gate used before formal Review persistence. */
export function validatePlanReview(raw: unknown, plan: PlanDraft, approvedScope: ScopeContract): PlanReview {
  const review = parsePlanReview(raw);
  if (review.projectId !== plan.projectId || plan.projectId !== approvedScope.projectId) {
    throw new ReviewValidationError("REVIEW_PROJECT_MISMATCH", "Review, Plan, and Scope must belong to the same project.");
  }
  if (review.planId !== plan.id) throw new ReviewValidationError("REVIEW_PLAN_MISMATCH", "Review references another Plan.");
  if (review.planVersion !== plan.version) {
    throw new ReviewValidationError("REVIEW_VERSION_MISMATCH", "Review references another Plan version.");
  }
  if (
    review.scopeContractId !== plan.scopeContractId || review.scopeVersion !== plan.scopeVersion ||
    review.scopeContractId !== approvedScope.id || review.scopeVersion !== approvedScope.version
  ) {
    throw new ReviewValidationError("REVIEW_SCOPE_MISMATCH", "Review must reference the Plan's approved Scope version.");
  }
  if (review.qualityAssessment !== undefined) {
    try { validateReviewQuality(review.qualityAssessment, plan, approvedScope); }
    catch { throw invalidReviewField("qualityAssessment coverage or Plan evidence"); }
  }
  if (review.storageAudit !== undefined) {
    try { validateStorageAudit(review.storageAudit, plan, approvedScope); }
    catch { throw invalidReviewField("storageAudit coverage or evidence"); }
  }
  return review;
}

function invalidReviewField(field: string): ReviewValidationError {
  return new ReviewValidationError("REVIEW_INVALID_FIELD", `Missing or invalid ${field}.`);
}

function isReviewRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reviewRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isReviewRecord(value)) throw invalidReviewField(field);
  return value;
}

function reviewString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw invalidReviewField(field);
  return value;
}

function reviewIdentifier(value: unknown, field: string): string {
  const result = reviewString(value, field);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(result)) throw invalidReviewField(field);
  return result;
}

function reviewVersion(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw invalidReviewField(field);
  return value;
}

function reviewBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw invalidReviewField(field);
  return value;
}

function reviewStrings(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw invalidReviewField(field);
  const entries: readonly unknown[] = value;
  return entries.map((item) => reviewString(item, field));
}

function isReviewChoice<const T extends readonly string[]>(value: unknown, choices: T): value is T[number] {
  return typeof value === "string" && choices.some((choice) => choice === value);
}

function reviewChoice<const T extends readonly string[]>(value: unknown, choices: T, field: string): T[number] {
  if (!isReviewChoice(value, choices)) throw invalidReviewField(field);
  return value;
}
