import type { DevelopmentTask, ApprovedPlanReference } from "../development/contracts.js";
import type { PlanDraft, ScopeContract } from "../planning/contracts.js";

export interface Clarification {
  readonly id: string;
  readonly question: string;
  readonly answer?: string;
}

export interface SupervisorContext {
  readonly projectId: string;
  readonly originalRequest: string;
  readonly clarifications: readonly Clarification[];
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
  readonly events: readonly { readonly at: string; readonly action: string; readonly detail: string }[];
}
