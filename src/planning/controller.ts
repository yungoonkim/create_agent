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
import type { OfflinePlanningConfig } from "./config.js";

export interface PlanningRunInput {
  readonly requirements: string;
  readonly scopeContract: ScopeContract;
}

export interface PlanningRunResult {
  readonly decision: PlanningDecision["type"];
  readonly state: PlanningLoopState;
  readonly approval?: ApprovalRecord;
}

export interface PlanningLoopControllerOptions {
  readonly config: OfflinePlanningConfig;
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
    const { config, memory } = this.options;
    const projectId = config.projectId;
    let lastState: PlanningLoopState | undefined;
    let operation = "validate";
    try {
      const state = await memory.getPlanningLoopState(projectId);
      if (state !== undefined) {
        throw new Error(`A previous run is ${state.status}; automatic resume is not supported. State was preserved.`);
      }

      operation = "load original requirements";
      const storedRequirements = await memory.getRequirements(projectId);
      if (storedRequirements === undefined) await memory.createRequirements(projectId, input.requirements);
      else if (storedRequirements !== input.requirements) {
        throw new Error("Original requirements differ from the project memory; create an approved Scope change first.");
      }
      const settledDecisions = await memory.getSettledDecisions(projectId);

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
      const initialState: PlanningLoopState = {
        projectId,
        scopeContractId: scope.id,
        scopeVersion: scope.version,
        iterationCount: 0,
        maxIterations: config.planning.maxIterations,
        status: "drafting",
      };
      await memory.savePlanningLoopState(initialState);
      lastState = initialState;

      let currentPlan: PlanDraft | undefined;
      let previousReview: PlanReview | undefined;
      let iterationCount = 0;

      while (true) {
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
          ...this.stateBase(scope, iterationCount),
          status: "reviewing",
          currentPlanVersion: currentPlan.version,
        });
        await memory.savePlanningLoopState(reviewingState);
        lastState = reviewingState;

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
            ...this.stateBase(scope, iterationCount),
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
    const base = this.stateBase(scope, iterationCount);
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

  private stateBase(scope: ScopeContract, iterationCount: number): Pick<PlanningLoopState, "projectId" | "scopeContractId" | "scopeVersion" | "iterationCount" | "maxIterations"> {
    return {
      projectId: scope.projectId,
      scopeContractId: scope.id,
      scopeVersion: scope.version,
      iterationCount,
      maxIterations: this.options.config.planning.maxIterations,
    };
  }

  private stateFor(previous: PlanningLoopState | undefined, next: PlanningLoopState): PlanningLoopState {
    if (previous !== undefined && !canTransitionPlanningState(previous.status, next.status)) {
      throw new Error(`Invalid Planning Loop state transition: ${previous.status} → ${next.status}.`);
    }
    return next;
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
