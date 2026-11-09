import type { ApprovalManager, ApprovalRecord } from "../core/types.js";
import type {
  PlanDraft,
  PlanReview,
  PlanningDecision,
  PlanningErrorRecord,
  PlanningLoopState,
  PlanningMemoryStore,
  PlanningReviewer,
  PlanningReviewerContext,
  PlanningWriter,
  PlanningWriterContext,
  ScopeChangeRequest,
  ScopeContract,
} from "./contracts.js";
import { canTransitionPlanningState, decideAfterReview, validatePlanReview } from "./policy.js";
import type { LivePlanningConfig, OfflinePlanningConfig } from "./config.js";
import { assertSafeStorageId } from "./config.js";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { modelOutputFailure } from "./model-output.js";

export interface PlanningResumeAuthorization {
  readonly id: string;
  readonly planId: string;
  readonly expectedState: PlanningLoopState;
  readonly kind: "answers" | "scope_change" | "revision";
  readonly revisionReason?: string;
  readonly scopeChangeRequestId?: string;
  readonly scopeChangeDecision?: "approved" | "rejected";
}

export interface PlanningRunInput {
  readonly requirements: string;
  readonly scopeContract: ScopeContract;
  /** Persisted clarification answers supplied by the supervisor; never replace original requirements. */
  readonly clarificationDecisions?: readonly string[];
}

export interface PlanningRunResult {
  readonly decision: PlanningDecision["type"];
  readonly state: PlanningLoopState;
  readonly approval?: ApprovalRecord;
}

export interface PlanningLoopControllerOptions {
  readonly config: OfflinePlanningConfig | LivePlanningConfig;
  readonly memory: PlanningMemoryStore & ApprovalManager;
  readonly writer: PlanningWriter;
  readonly reviewer: PlanningReviewer;
  readonly now?: () => string;
  readonly onLog?: (message: string) => void;
}

export class PlanningLoopController {
  private readonly now: () => string;

  constructor(private readonly options: PlanningLoopControllerOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async run(input: PlanningRunInput): Promise<PlanningRunResult> {
    return this.execute(input);
  }

  async resume(input: PlanningRunInput, authorization: PlanningResumeAuthorization): Promise<PlanningRunResult> {
    return this.execute(input, authorization);
  }

  /** Caller must serialize project commands; this is an explicit retry, never automatic replay. */
  async retryReview(input: PlanningRunInput, planId: string, expectedState: PlanningLoopState, reason: string): Promise<PlanningRunResult> {
    return this.execute(input, undefined, { planId, expectedState, reason });
  }

  private async execute(input: PlanningRunInput, authorization?: PlanningResumeAuthorization,
    retry?: { readonly planId: string; readonly expectedState: PlanningLoopState; readonly reason: string }): Promise<PlanningRunResult> {
    const { config, memory } = this.options;
    const projectId = config.projectId;
    let lastState: PlanningLoopState | undefined;
    let operation = "validate";
    try {
      const state = await memory.getPlanningLoopState(projectId);
      if (state !== undefined && authorization === undefined && retry === undefined) {
        throw new Error(`A previous run is ${state.status}; automatic resume is not supported. State was preserved.`);
      }
      let currentPlan: PlanDraft | undefined;
      let previousReview: PlanReview | undefined;
      let iterationCount = 0;
      if (retry !== undefined) {
        assertSafeStorageId(retry.planId, "Retry Plan ID");
        if (state?.status !== "reviewing" || !isDeepStrictEqual(state, retry.expectedState) || state.reviewRetry !== undefined ||
          state.projectId !== projectId || state.maxIterations !== config.planning.maxIterations || state.iterationCount >= state.maxIterations ||
          typeof retry.reason !== "string" || retry.reason.trim().length === 0 || state.scopeContractId !== input.scopeContract.id || state.scopeVersion !== input.scopeContract.version) {
          throw new Error("Review retry needs an unchanged reviewing state, reason, unused retry and remaining original budget.");
        }
        currentPlan = await memory.getPlanDraft(projectId, retry.planId, state.currentPlanVersion);
        if (currentPlan === undefined || currentPlan.projectId !== projectId || currentPlan.scopeContractId !== state.scopeContractId || currentPlan.scopeVersion !== state.scopeVersion ||
          await memory.getPlanReview(projectId, retry.planId, state.currentPlanVersion) !== undefined) throw new Error("Review retry source is missing, mismatched or already reviewed.");
        iterationCount = state.iterationCount;
        if (iterationCount > 0) {
          previousReview = await memory.getPlanReview(projectId, retry.planId, currentPlan.version - 1);
          if (previousReview === undefined) throw new Error("Previous review is missing; retry cannot discard revision feedback.");
        }
      }
      if (authorization !== undefined) {
        if (state === undefined) throw new Error("No Planning state to resume.");
        ({ plan: currentPlan, review: previousReview } = await this.validateResume(input, authorization, state));
        iterationCount = state.iterationCount;
      }

      operation = "load original requirements";
      const storedRequirements = await memory.getRequirements(projectId);
      if (storedRequirements === undefined) await memory.createRequirements(projectId, input.requirements);
      else if (storedRequirements !== input.requirements) {
        throw new Error("Original requirements differ from the project memory; create an approved Scope change first.");
      }
      const settledDecisions = [
        ...await memory.getSettledDecisions(projectId),
        ...(input.clarificationDecisions ?? []),
        ...(authorization?.kind === "revision" ? [`User requested plan revision within the unchanged approved Scope:\n${authorization.revisionReason!}`] : []),
      ];

      operation = "load approved Scope";
      const scope = input.scopeContract;
      if (scope.projectId !== projectId) throw new Error("Scope Contract belongs to a different project.");
      const storedScope = await memory.getScopeContract(projectId, scope.version);
      if (
        storedScope === undefined ||
        storedScope.id !== scope.id ||
        scopeSnapshotKey(storedScope) !== scopeSnapshotKey(scope)
      ) {
        throw new Error("SCOPE_SNAPSHOT_MISMATCH: Scope Contract is not stored unchanged for this project and version.");
      }
      const link = await memory.getScopeApprovalRecord(projectId, scope.id);
      if (link === undefined) throw new Error("Scope Contract has no linked approval record.");
      const scopeApproval = await memory.get(link.approvalId);
      if (
        scopeApproval === undefined ||
        scopeApproval.projectId !== projectId ||
        scopeApproval.subject !== `Scope Contract ${scope.id} v${scope.version}` ||
        scopeApproval.status !== "approved"
      ) {
        throw new Error("Scope approval is missing, belongs to another project, or is not approved.");
      }

      operation = "start Planning Loop";
      let initialState: PlanningLoopState = {
        projectId,
        scopeContractId: scope.id,
        scopeVersion: scope.version,
        iterationCount,
        maxIterations: config.planning.maxIterations,
        status: "drafting",
        ...(authorization === undefined ? {} : { continuationId: authorization.id, currentPlanVersion: currentPlan!.version }),
      };
      if (authorization !== undefined) initialState = this.stateFor(state, initialState);
      if (retry !== undefined) initialState = { ...state!, reviewRetry: { planId: retry.planId, planVersion: currentPlan!.version,
        sourceHash: createHash("sha256").update(JSON.stringify({ scope, plan: currentPlan, requirements: input.requirements,
          settledDecisions })).digest("hex"), reason: retry.reason.trim(), startedAt: this.now() } };
      await memory.savePlanningLoopState(initialState);
      lastState = initialState;

      let retrySavedPlan = retry !== undefined;
      while (true) {
        if (!retrySavedPlan) {
          operation = "call Writer";
          this.log(`[Writer] ${currentPlan === undefined ? "Plan v1" : `Plan v${currentPlan.version + 1}`} 생성 요청`);
          const writerContext: PlanningWriterContext = {
            projectId,
            originalRequirements: input.requirements,
            approvedScope: scope,
            settledDecisions,
            ...(currentPlan === undefined ? {} : { currentDraft: currentPlan }),
            ...(previousReview === undefined ? {} : { reviewFeedback: previousReview }),
          };
          const nextPlan = await this.options.writer.write(writerContext, config.planning.writer);
          this.validateWriterResult(nextPlan, currentPlan, scope, projectId);

          operation = "save Plan Draft";
          await memory.createPlanDraft(nextPlan);
          currentPlan = nextPlan;
          this.log(`[Memory] Plan v${currentPlan.version} 저장`);
          const reviewingState = this.stateFor(lastState, {
            ...this.stateBase(scope, iterationCount, lastState.continuationId),
            status: "reviewing",
            currentPlanVersion: currentPlan.version,
          });
          await memory.savePlanningLoopState(reviewingState);
          lastState = reviewingState;
        }
        retrySavedPlan = false;
        if (currentPlan === undefined) throw new Error("Current Plan is missing.");
        const reviewingState = lastState;

        operation = "call Reviewer";
        this.log(`[Reviewer] Plan v${currentPlan.version} 검토 요청`);
        const reviewerContext: PlanningReviewerContext = {
          projectId,
          originalRequirements: input.requirements,
          approvedScope: scope,
          currentPlan,
          settledDecisions,
          ...(previousReview === undefined ? {} : { previousReviews: [previousReview] }),
        };
        const response = await this.options.reviewer.review(reviewerContext, config.planning.reviewer);
        iterationCount += 1;

        operation = "validate and save Plan Review";
        let review: PlanReview;
        try {
          review = validatePlanReview(response, currentPlan, scope);
          await memory.createPlanReview(review);
        } catch (error) {
          const reason = errorMessage(error);
          await memory.appendError({
            projectId,
            occurredAt: this.now(),
            operation,
            message: reason,
            lastState: reviewingState,
          });
          const failedState = this.stateFor(lastState, {
            ...this.stateBase(scope, iterationCount, lastState.continuationId),
            status: "failed",
            currentPlanVersion: currentPlan.version,
            reason,
          });
          await memory.savePlanningLoopState(failedState);
          lastState = failedState;
          this.log("[Policy] FAILED");
          return { decision: "FAILED", state: failedState };
        }

        operation = "evaluate Reviewer result";
        const decision = decideAfterReview({
          review,
          currentPlan,
          approvedScope: scope,
          iterationCount,
          maxIterations: config.planning.maxIterations,
          ...(previousReview === undefined ? {} : { previousReview }),
        });
        this.log(`[Policy] ${decision.type}`);
        const result = await this.applyDecision(decision, review, currentPlan, scope, iterationCount, lastState);
        lastState = result.state;
        if (decision.type === "REVISE") {
          previousReview = review;
          continue;
        }
        return result;
      }
    } catch (error) {
      const message = errorMessage(error);
      const record: PlanningErrorRecord = {
        projectId,
        occurredAt: this.now(),
        operation,
        message,
        ...(modelOutputFailure(error) === undefined ? {} : { modelOutputFailure: modelOutputFailure(error)! }),
        ...(lastState === undefined ? {} : { lastState }),
      };
      try {
        await memory.appendError(record);
      } catch (loggingError) {
        throw new AggregateError([error, loggingError], `${operation} failed and the error could not be recorded.`);
      }
      throw new Error(`${operation} failed: ${message}`, { cause: error });
    }
  }

  private async applyDecision(
    decision: PlanningDecision,
    review: PlanReview,
    plan: PlanDraft,
    scope: ScopeContract,
    iterationCount: number,
    previousState: PlanningLoopState,
  ): Promise<PlanningRunResult> {
    const { config, memory } = this.options;
    const base = this.stateBase(scope, iterationCount, previousState.continuationId);
    switch (decision.type) {
      case "REVISE": {
        const state = this.stateFor(previousState, {
          ...base,
          status: "revising",
          currentPlanVersion: plan.version,
          previousReviewId: review.id,
        });
        await memory.savePlanningLoopState(state);
        return { decision: decision.type, state };
      }
      case "REQUEST_USER_INPUT": {
        const state = this.stateFor(previousState, {
          ...base,
          status: "awaiting_user_input",
          currentPlanVersion: plan.version,
          reviewId: review.id,
          reason: decision.questions.join("\n") || "Reviewer requested user input.",
        });
        await memory.savePlanningLoopState(state);
        return { decision: decision.type, state };
      }
      case "REQUEST_SCOPE_CHANGE_APPROVAL": {
        const approval = await memory.request(config.projectId, `Scope change for plan ${plan.id} v${plan.version}`);
        const request: ScopeChangeRequest = {
          id: `change-${approval.id}`,
          projectId: config.projectId,
          baseScopeContractId: scope.id,
          baseScopeVersion: scope.version,
          rationale: decision.reason,
          proposedChanges: review.issues
            .filter((issue) => decision.issueIds.length === 0 || decision.issueIds.includes(issue.id))
            .map((issue) => `${issue.description} Suggested: ${issue.suggestedDirection}`),
          approvalId: approval.id,
        };
        await memory.createScopeChangeRequest(request);
        const state = this.stateFor(previousState, {
          ...base,
          status: "awaiting_scope_change_approval",
          currentPlanVersion: plan.version,
          changeRequestId: request.id,
        });
        await memory.savePlanningLoopState(state);
        return { decision: decision.type, state, approval };
      }
      case "REQUEST_USER_APPROVAL": {
        if (!config.planning.requireUserApproval) throw new Error("User approval is required by the offline policy.");
        const approval = await memory.request(config.projectId, `Approve plan ${plan.id} v${plan.version}`);
        const state = this.stateFor(previousState, {
          ...base,
          status: "awaiting_approval",
          currentPlanVersion: plan.version,
          reviewId: review.id,
          approvalId: approval.id,
        });
        await memory.savePlanningLoopState(state);
        return { decision: decision.type, state, approval };
      }
      case "STOP_LIMIT_REACHED": {
        const state = this.stateFor(previousState, {
          ...base,
          status: "limit_reached",
          currentPlanVersion: plan.version,
          reason: decision.reason,
        });
        await memory.savePlanningLoopState(state);
        return { decision: decision.type, state };
      }
      case "FAILED": {
        const state = this.stateFor(previousState, {
          ...base,
          status: "failed",
          currentPlanVersion: plan.version,
          reason: decision.reason,
        });
        await memory.savePlanningLoopState(state);
        return { decision: decision.type, state };
      }
    }
  }

  private validateWriterResult(
    draft: PlanDraft,
    current: PlanDraft | undefined,
    scope: ScopeContract,
    projectId: string,
  ): void {
    const expectedVersion = (current?.version ?? 0) + 1;
    if (
      draft.projectId !== projectId ||
      draft.scopeContractId !== scope.id ||
      draft.scopeVersion !== scope.version ||
      draft.version !== expectedVersion ||
      (current !== undefined && draft.id !== current.id)
    ) {
      throw new Error("Writer returned a Plan Draft with mismatched project, Scope, ID, or version.");
    }
  }

  private stateBase(scope: ScopeContract, iterationCount: number, continuationId?: string): Pick<PlanningLoopState, "projectId" | "scopeContractId" | "scopeVersion" | "iterationCount" | "maxIterations" | "continuationId"> {
    return {
      projectId: scope.projectId,
      scopeContractId: scope.id,
      scopeVersion: scope.version,
      iterationCount,
      maxIterations: this.options.config.planning.maxIterations,
      ...(continuationId === undefined ? {} : { continuationId }),
    };
  }

  private async validateResume(input: PlanningRunInput, authorization: PlanningResumeAuthorization, state: PlanningLoopState): Promise<{ plan: PlanDraft; review: PlanReview }> {
    const { memory, config } = this.options;
    assertSafeStorageId(authorization.id, "Continuation ID");
    assertSafeStorageId(authorization.planId, "Plan ID");
    if (!isDeepStrictEqual(state, authorization.expectedState) || state.projectId !== config.projectId ||
        state.currentPlanVersion === undefined || state.maxIterations !== config.planning.maxIterations || state.iterationCount >= state.maxIterations) {
      throw new Error("Resume source is stale, incompatible, or its iteration budget is exhausted.");
    }
    const plan = await memory.getPlanDraft(config.projectId, authorization.planId, state.currentPlanVersion);
    const scope = await memory.getScopeContract(config.projectId, state.scopeVersion);
    const review = await memory.getPlanReview(config.projectId, authorization.planId, state.currentPlanVersion);
    if (plan === undefined || scope === undefined || review === undefined || scope.id !== state.scopeContractId || plan.scopeContractId !== scope.id || plan.scopeVersion !== scope.version) throw new Error("Resume source snapshots are missing or mismatched.");
    validatePlanReview(review, plan, scope);
    if ((state.status === "awaiting_user_input" || state.status === "awaiting_approval") && state.reviewId !== review.id) throw new Error("Resume Review does not match the current state.");
    if (state.status === "awaiting_approval" || state.status === "user_approved") {
      const finalApproval = await memory.get(state.approvalId);
      if (finalApproval?.projectId !== config.projectId || finalApproval.subject !== `Approve plan ${plan.id} v${plan.version}` ||
          (state.status === "user_approved" ? finalApproval.status !== "approved" : !["pending", "approved"].includes(finalApproval.status)) ||
          decideAfterReview({ review, currentPlan: plan, approvedScope: scope, iterationCount: state.iterationCount, maxIterations: state.maxIterations }).type !== "REQUEST_USER_APPROVAL") throw new Error("Base Plan approval is invalid.");
    }
    const link = await memory.getScopeApprovalRecord(config.projectId, scope.id);
    const approval = link === undefined ? undefined : await memory.get(link.approvalId);
    if (approval?.status !== "approved" || approval.projectId !== config.projectId || approval.subject !== `Scope Contract ${scope.id} v${scope.version}` || approval.rationale?.startsWith("DEMO FIXTURE:") === true) throw new Error("Resume requires a real approved base Scope.");
    if (authorization.kind === "answers") {
      if (state.status !== "awaiting_user_input" || state.reviewId !== review.id || scopeSnapshotKey(scope) !== scopeSnapshotKey(input.scopeContract) ||
          input.clarificationDecisions === undefined || input.clarificationDecisions.length === 0 || input.clarificationDecisions.some((item) => typeof item !== "string" || item.trim().length === 0)) throw new Error("User answers and unchanged approved Scope are required.");
    } else if (authorization.kind === "revision") {
      if (state.status !== "awaiting_approval" || scopeSnapshotKey(scope) !== scopeSnapshotKey(input.scopeContract) ||
          typeof authorization.revisionReason !== "string" || authorization.revisionReason.trim().length === 0 ||
          authorization.scopeChangeRequestId !== undefined || authorization.scopeChangeDecision !== undefined ||
          (await memory.get(state.approvalId))?.status !== "pending") throw new Error("Plan revision needs a pending final approval, an explicit reason and unchanged approved Scope.");
    } else {
      if (!["awaiting_user_input", "awaiting_scope_change_approval", "awaiting_approval", "user_approved"].includes(state.status) || authorization.scopeChangeRequestId === undefined || authorization.scopeChangeDecision === undefined) throw new Error("Scope change cannot resume this Planning state.");
      const request = await memory.getScopeChangeRequest(config.projectId, authorization.scopeChangeRequestId);
      const decision = request === undefined ? undefined : await memory.get(request.approvalId);
      if (request === undefined || request.baseScopeContractId !== scope.id || request.baseScopeVersion !== scope.version || decision?.status !== authorization.scopeChangeDecision || decision.projectId !== config.projectId || decision.subject !== `Scope change for plan ${plan.id} v${plan.version}` ||
          (state.status === "awaiting_scope_change_approval" && state.changeRequestId !== request.id)) throw new Error("Scope change decision does not match the source.");
      if (authorization.scopeChangeDecision === "approved") {
        if (input.scopeContract.version <= scope.version || input.scopeContract.id === scope.id) throw new Error("Approved Scope change requires a new higher version.");
      } else if (state.status !== "awaiting_scope_change_approval" || scopeSnapshotKey(scope) !== scopeSnapshotKey(input.scopeContract)) throw new Error("Rejected change must revise under the original Scope.");
    }
    return { plan, review };
  }

  private stateFor(previous: PlanningLoopState | undefined, next: PlanningLoopState): PlanningLoopState {
    if (previous !== undefined && !canTransitionPlanningState(previous.status, next.status)) {
      throw new Error(`Invalid Planning Loop state transition: ${previous.status} → ${next.status}.`);
    }
    return { ...(previous?.reviewRetry === undefined ? {} : { reviewRetry: previous.reviewRetry }), ...next };
  }

  private log(message: string): void {
    this.options.onLog?.(message);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function scopeSnapshotKey(scope: ScopeContract): string {
  return JSON.stringify({
    id: scope.id,
    projectId: scope.projectId,
    version: scope.version,
    goal: scope.goal,
    requiredFeatures: [...scope.requiredFeatures]
      .map(({ id, statement }) => ({ id, statement }))
      .sort((left, right) => left.id.localeCompare(right.id) || left.statement.localeCompare(right.statement)),
    excludedFeatures: [...scope.excludedFeatures]
      .map(({ id, statement }) => ({ id, statement }))
      .sort((left, right) => left.id.localeCompare(right.id) || left.statement.localeCompare(right.statement)),
    technicalConstraints: [...scope.technicalConstraints].sort(),
    scheduleConstraint: scope.scheduleConstraint,
    budgetConstraint: scope.budgetConstraint,
    createdAt: scope.createdAt,
  });
}
