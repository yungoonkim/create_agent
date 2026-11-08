import type { DevelopmentTask, ApprovedPlanReference } from "../development/contracts.js";
import type { PlanDraft, ScopeContract, PlanningLoopState } from "../planning/contracts.js";

export interface Clarification {
  readonly id: string;
  readonly question: string;
  readonly answer?: string;
}

export interface SupervisorContext {
  readonly projectId: string;
  readonly originalRequest: string;
  readonly clarifications: readonly Clarification[];
  readonly scopeChange?: { readonly baseScope: ScopeContract; readonly reason: string; readonly proposedChanges: readonly string[] };
}

export interface PlanningContinuation {
  readonly id: string;
  readonly kind: "answers" | "scope_change";
  readonly status: "awaiting_answers" | "ready" | "requested" | "proposed" | "approved" | "rejected" | "started" | "completed";
  readonly base: PlanningLoopState;
  readonly planId: string;
  readonly baseScope: ScopeContract;
  readonly baseHash: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly questionIds: readonly string[];
  readonly scopeChangeRequestId?: string;
  readonly changeApprovalId?: string;
  readonly proposedScope?: ScopeContract;
  readonly scopeApprovalId?: string;
}

export const SUPERVISOR_FAILURE_KINDS = ["authentication", "permission", "model_not_found", "rate_limit", "invalid_request", "provider_unavailable", "network", "provider_error", "invalid_response"] as const;
export type SupervisorFailureKind = typeof SUPERVISOR_FAILURE_KINDS[number];

export interface SupervisorUsageRecord {
  readonly id: string;
  readonly projectId: string;
  readonly operation: "questions" | "scope" | "tasks";
  readonly providerId: "vertex-ai";
  readonly modelId: string;
  readonly outcome: "success" | "failure";
  readonly durationMs: number;
  readonly recordedAt: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly failureKind?: SupervisorFailureKind;
  readonly httpStatus?: number;
}

export interface WorkOrder {
  readonly task: DevelopmentTask;
  readonly requirementIds: readonly string[];
}

/** Proposals only. Model outputs cannot approve, assign, run commands, or report completion. */
export interface SupervisorProposer {
  questions(context: SupervisorContext): Promise<unknown>;
  scope(context: SupervisorContext): Promise<unknown>;
  tasks(context: SupervisorContext, scope: ScopeContract, plan: PlanDraft): Promise<unknown>;
}

export interface SupervisorState extends SupervisorContext {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly phase: "intake" | "awaiting_answers" | "ready_for_scope" | "scope_proposed" | "scope_approved" | "tasks_proposed" | "tasks_initialized";
  readonly scope?: ScopeContract;
  readonly scopeApprovalId?: string;
  readonly taskProposal?: { readonly source: ApprovedPlanReference; readonly orders: readonly WorkOrder[] };
  readonly continuations?: readonly PlanningContinuation[];
  readonly events: readonly { readonly at: string; readonly action: string; readonly detail: string }[];
}
