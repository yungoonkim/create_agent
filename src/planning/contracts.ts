import type { ApprovalId, LlmModelConfig, ProjectId } from "../core/types.js";

export type ScopeContractId = string;
export type PlanId = string;
export type PlanReviewId = string;
export type ScopeChangeRequestId = string;

export interface ScopeRequirement {
  readonly id: string;
  readonly statement: string;
}

/** Immutable snapshot. Approval state lives in ApprovalManager; approved changes create a higher version. */
export interface ScopeContract {
  readonly id: ScopeContractId;
  readonly projectId: ProjectId;
  readonly version: number;
  readonly goal: string;
  readonly requiredFeatures: readonly ScopeRequirement[];
  readonly excludedFeatures: readonly ScopeRequirement[];
  readonly technicalConstraints: readonly string[];
  readonly scheduleConstraint?: string;
  readonly budgetConstraint?: string;
  readonly createdAt: string;
}

export interface ScopeApprovalRecord {
  /** Links the immutable scope snapshot to the source-of-truth ApprovalManager record. */
  readonly projectId: ProjectId;
  readonly scopeContractId: ScopeContractId;
  readonly approvalId: ApprovalId;
}

export interface ScopeChangeRequest {
  readonly id: ScopeChangeRequestId;
  readonly projectId: ProjectId;
  readonly baseScopeContractId: ScopeContractId;
  readonly baseScopeVersion: number;
  readonly rationale: string;
  readonly proposedChanges: readonly string[];
  readonly approvalId: ApprovalId;
}

export type PlanDraftStatus = "draft" | "ready_for_review" | "superseded";

export interface PlanDraft {
  readonly id: PlanId;
  readonly projectId: ProjectId;
  readonly version: number;
  readonly scopeContractId: ScopeContractId;
  readonly scopeVersion: number;
  readonly content: string;
  readonly status: PlanDraftStatus;
  readonly createdAt: string;
}

export type ReviewSeverity = "info" | "minor" | "major" | "critical";
export type ReviewIssueKind =
  | "omission"
  | "contradiction"
  | "scope_violation"
  | "implementation_risk"
  | "unverifiable";

export interface ReviewIssue {
  readonly id: string;
  readonly kind: ReviewIssueKind;
  readonly severity: ReviewSeverity;
  readonly description: string;
  readonly suggestedDirection: string;
  readonly relatedRequirementId?: string;
}

export type PlanReviewOutcome = "pass" | "revise" | "needs_user_input" | "failed";

export const REVIEW_CHECK_IDS = ["decision_provenance", "scope_compliance", "behavior_and_errors",
  "data_integrity", "acceptance_criteria", "revision_resolution", "clarity"] as const;
export type ReviewCheckId = typeof REVIEW_CHECK_IDS[number];
export type ReviewCheckStatus = "satisfied" | "missing" | "needs_user_input" | "not_applicable";
export interface ReviewQualityItem {
  readonly status: ReviewCheckStatus;
  /** Verbatim excerpts from the current Plan, not invented section references. */
  readonly evidence: readonly string[];
  /** New Gemini responses select lines; the adapter extracts evidence text itself. */
  readonly evidenceLines?: readonly number[];
  readonly rationale: string;
}
export interface ReviewQualityAssessment {
  readonly version: 1;
  readonly requirements: readonly (ReviewQualityItem & { readonly requirementId: string })[];
  readonly checks: readonly (ReviewQualityItem & { readonly id: ReviewCheckId })[];
}

export const STORAGE_AUDIT_STATES = ["absent", "present_empty", "invalid", "valid", "read_error"] as const;
export interface StorageAudit {
  readonly format: "json" | "other" | "none" | "unclear";
  readonly evidenceLines: readonly number[];
  readonly evidence: readonly string[];
  readonly rationale: string;
  readonly cases: readonly {
    readonly state: typeof STORAGE_AUDIT_STATES[number];
    readonly action: "initialize" | "load" | "preserve_and_block" | "reset_or_overwrite" | "unspecified";
    readonly verdict: "consistent" | "unsafe" | "needs_user_input";
    readonly evidenceLines: readonly number[];
    readonly evidence: readonly string[];
    readonly authorizationScopeIds: readonly string[];
    readonly rationale: string;
  }[];
}

export interface PlanReview {
  readonly id: PlanReviewId;
  readonly projectId: ProjectId;
  readonly planId: PlanId;
  readonly planVersion: number;
  readonly scopeContractId: ScopeContractId;
  readonly scopeVersion: number;
  readonly outcome: PlanReviewOutcome;
  readonly issues: readonly ReviewIssue[];
  readonly suggestions: readonly string[];
  readonly scopeViolation: boolean;
  readonly userJudgmentRequired: boolean;
  readonly reviewedAt: string;
  /** Absent only for legacy reviews and offline fixtures; mandatory for new Gemini reviews. */
  readonly qualityAssessment?: ReviewQualityAssessment;
  readonly challengeCompleted?: boolean;
  /** Present for new challenge reviews; older immutable reviews remain readable. */
  readonly storageAudit?: StorageAudit;
}

export interface PlanningWriterContext {
  readonly projectId: ProjectId;
  readonly originalRequirements: string;
  readonly approvedScope: ScopeContract;
  readonly settledDecisions: readonly string[];
  readonly currentDraft?: PlanDraft;
  readonly reviewFeedback?: PlanReview;
}

export interface PlanningReviewerContext {
  readonly projectId: ProjectId;
  readonly originalRequirements: string;
  readonly approvedScope: ScopeContract;
  readonly currentPlan: PlanDraft;
  readonly settledDecisions: readonly string[];
  readonly previousReviews?: readonly PlanReview[];
}

/** Port contracts only; implementations may use a fake or a runtime-backed adapter. */
export interface PlanningWriter {
  write(context: PlanningWriterContext, role: PlanningRoleConfig): Promise<PlanDraft>;
}

export interface PlanningReviewer {
  review(context: PlanningReviewerContext, role: PlanningRoleConfig): Promise<PlanReview>;
}

export type PlanningLoopStatus =
  | "drafting"
  | "reviewing"
  | "revising"
  | "awaiting_user_input"
  | "awaiting_scope_change_approval"
  | "awaiting_approval"
  | "user_approved"
  | "limit_reached"
  | "failed"
  | "stopped";

interface PlanningLoopBase {
  readonly projectId: ProjectId;
  readonly scopeContractId: ScopeContractId;
  readonly scopeVersion: number;
  readonly iterationCount: number;
  readonly maxIterations: number;
  /** Binds a resumed run to its durable supervisor authorization. */
  readonly continuationId?: string;
  /** One explicit review retry per project, durably reserved before any model call. */
  readonly reviewRetry?: {
    readonly planId: string;
    readonly planVersion: number;
    readonly sourceHash: string;
    readonly reason: string;
    readonly startedAt: string;
  };
}

export type PlanningLoopState =
  | (PlanningLoopBase & { readonly status: "drafting"; readonly currentPlanVersion?: number })
  | (PlanningLoopBase & { readonly status: "reviewing"; readonly currentPlanVersion: number })
  | (PlanningLoopBase & {
      readonly status: "revising";
      readonly currentPlanVersion: number;
      readonly previousReviewId: PlanReviewId;
    })
  | (PlanningLoopBase & {
      readonly status: "awaiting_user_input";
      readonly currentPlanVersion: number;
      readonly reviewId: PlanReviewId;
      readonly reason: string;
    })
  | (PlanningLoopBase & {
      readonly status: "awaiting_scope_change_approval";
      readonly currentPlanVersion: number;
      readonly changeRequestId: ScopeChangeRequestId;
    })
  | (PlanningLoopBase & {
      readonly status: "awaiting_approval";
      readonly currentPlanVersion: number;
      readonly reviewId: PlanReviewId;
      readonly approvalId: ApprovalId;
    })
  | (PlanningLoopBase & {
      readonly status: "user_approved";
      readonly currentPlanVersion: number;
      readonly approvalId: ApprovalId;
    })
  | (PlanningLoopBase & {
      readonly status: "limit_reached";
      readonly currentPlanVersion: number;
      readonly reason: string;
    })
  | (PlanningLoopBase & {
      readonly status: "failed" | "stopped";
      readonly currentPlanVersion?: number;
      readonly reason: string;
    });

export type PlanningDecision =
  | { readonly type: "REVISE"; readonly feedback: string; readonly nextVersion: number }
  | { readonly type: "REQUEST_USER_INPUT"; readonly questions: readonly string[] }
  | { readonly type: "REQUEST_USER_APPROVAL"; readonly planId: PlanId; readonly version: number }
  | {
      readonly type: "REQUEST_SCOPE_CHANGE_APPROVAL";
      readonly planId: PlanId;
      readonly version: number;
      readonly issueIds: readonly string[];
      readonly reason: string;
    }
  | { readonly type: "STOP_LIMIT_REACHED"; readonly reason: string }
  | { readonly type: "FAILED"; readonly reason: string };

export interface PlanningDecisionInput {
  readonly review: PlanReview;
  readonly currentPlan: PlanDraft;
  /** Scope snapshot whose approval was confirmed by the Controller. */
  readonly approvedScope: ScopeContract;
  readonly iterationCount: number;
  readonly maxIterations: number;
  readonly previousReview?: PlanReview;
}

export interface PlanningRoleConfig {
  readonly model: LlmModelConfig;
  readonly personaId: string;
}

/** Writer and Reviewer may use distinct provider/model selections. */
export interface PlanningModelConfig {
  readonly writer: PlanningRoleConfig;
  readonly reviewer: PlanningRoleConfig;
}

export interface TokenUsageRecord {
  readonly projectId: ProjectId;
  readonly planId: PlanId;
  readonly iteration: number;
  readonly role: "writer" | "reviewer";
  readonly reviewStage?: "assessment" | "challenge";
  readonly providerId: string;
  readonly modelId: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly reasoningTokens?: number;
  readonly outcome: "success" | "failure";
  readonly durationMs: number;
  readonly error?: string;
  readonly recordedAt: string;
}

export interface PlanningErrorRecord {
  readonly projectId: ProjectId;
  readonly occurredAt: string;
  readonly operation: string;
  readonly message: string;
  readonly lastState?: PlanningLoopState;
}

/** Contract only; implementations must isolate projects and append immutable versions. */
export interface PlanningMemoryStore {
  appendError(record: PlanningErrorRecord): Promise<void>;
  getRequirements(projectId: ProjectId): Promise<string | undefined>;
  createRequirements(projectId: ProjectId, requirements: string): Promise<void>;
  getSettledDecisions(projectId: ProjectId): Promise<readonly string[]>;
  getScopeContract(projectId: ProjectId, scopeVersion: number): Promise<ScopeContract | undefined>;
  createScopeContract(contract: ScopeContract): Promise<void>;
  createScopeApprovalRecord(record: ScopeApprovalRecord): Promise<void>;
  getScopeApprovalRecord(
    projectId: ProjectId,
    scopeContractId: ScopeContractId,
  ): Promise<ScopeApprovalRecord | undefined>;
  createScopeChangeRequest(request: ScopeChangeRequest): Promise<void>;
  getScopeChangeRequest(projectId: ProjectId, requestId: ScopeChangeRequestId): Promise<ScopeChangeRequest | undefined>;
  createPlanDraft(draft: PlanDraft): Promise<void>;
  getPlanDraft(projectId: ProjectId, planId: PlanId, version: number): Promise<PlanDraft | undefined>;
  createPlanReview(review: PlanReview): Promise<void>;
  getPlanReview(projectId: ProjectId, planId: PlanId, version: number): Promise<PlanReview | undefined>;
  getPlanningLoopState(projectId: ProjectId): Promise<PlanningLoopState | undefined>;
  savePlanningLoopState(state: PlanningLoopState): Promise<void>;
  appendTokenUsage(record: TokenUsageRecord): Promise<void>;
}
