import { createHash } from "node:crypto";
import type { ApprovalManager } from "../core/types.js";
import type { PlanDraft, PlanningLoopState, PlanningMemoryStore, ScopeContract } from "../planning/contracts.js";
import { decideAfterReview } from "../planning/policy.js";
import type { ApprovedPlanReference } from "./contracts.js";
import { text } from "./validation.js";

export type PlanningApprovalStore = PlanningMemoryStore & ApprovalManager;

async function loadPlan(memory: PlanningApprovalStore, projectId: string, planId: string, state: PlanningLoopState): Promise<{ plan: PlanDraft; scope: ScopeContract }> {
  if (state.currentPlanVersion === undefined) throw new Error("Planning state has no current plan.");
  const plan = await memory.getPlanDraft(projectId, planId, state.currentPlanVersion);
  if (plan === undefined || plan.scopeContractId !== state.scopeContractId || plan.scopeVersion !== state.scopeVersion) {
    throw new Error("Plan does not match the current Planning state.");
  }
  const scope = await memory.getScopeContract(projectId, plan.scopeVersion);
  const link = await memory.getScopeApprovalRecord(projectId, plan.scopeContractId);
  const approval = link === undefined ? undefined : await memory.get(link.approvalId);
  if (scope === undefined || scope.id !== plan.scopeContractId || approval?.status !== "approved" || approval.projectId !== projectId ||
      approval.subject !== `Scope Contract ${plan.scopeContractId} v${plan.scopeVersion}` ||
      approval.rationale?.startsWith("DEMO FIXTURE:") === true) {
    throw new Error("Development requires a real approved Scope, not a demo approval fixture.");
  }
  return { plan, scope };
}

export async function approvePlan(memory: PlanningApprovalStore, projectId: string, planId: string, rationale: string): Promise<ApprovedPlanReference> {
  text(rationale);
  const state = await memory.getPlanningLoopState(projectId);
  if (state === undefined || (state.status !== "awaiting_approval" && state.status !== "user_approved")) {
    throw new Error("Only a plan awaiting final user approval can be approved.");
  }
  const { plan } = await loadPlan(memory, projectId, planId, state);
  const approval = await memory.get(state.approvalId);
  if (approval === undefined || approval.projectId !== projectId || approval.subject !== `Approve plan ${plan.id} v${plan.version}`) {
    throw new Error("Final approval does not match the current plan.");
  }
  if (state.status === "awaiting_approval") {
    const review = await memory.getPlanReview(projectId, plan.id, plan.version);
    const scope = await memory.getScopeContract(projectId, plan.scopeVersion);
    if (review === undefined || review.id !== state.reviewId || scope === undefined ||
        decideAfterReview({ review, currentPlan: plan, approvedScope: scope, iterationCount: state.iterationCount, maxIterations: state.maxIterations }).type !== "REQUEST_USER_APPROVAL") {
      throw new Error("The current review does not permit final plan approval.");
    }
    if (approval.status === "pending") await memory.recordDecision(approval.id, "approved", rationale);
    else if (approval.status !== "approved") throw new Error("Final approval has already been rejected or changed.");
    // Approval is recorded first. A retry can finish the state update after interruption.
    await memory.savePlanningLoopState({
      projectId, scopeContractId: state.scopeContractId, scopeVersion: state.scopeVersion,
      iterationCount: state.iterationCount, maxIterations: state.maxIterations,
      currentPlanVersion: plan.version, status: "user_approved", approvalId: state.approvalId,
      ...(state.continuationId === undefined ? {} : { continuationId: state.continuationId }),
    });
  }
  return requireApprovedPlan(memory, projectId, planId);
}

export async function requireApprovedPlan(memory: PlanningApprovalStore, projectId: string, planId: string): Promise<ApprovedPlanReference> {
  const state = await memory.getPlanningLoopState(projectId);
  if (state?.status !== "user_approved") throw new Error("Development requires a user-approved current plan.");
  const { plan, scope } = await loadPlan(memory, projectId, planId, state);
  const approval = await memory.get(state.approvalId);
  if (approval?.status !== "approved" || approval.projectId !== projectId ||
      approval.subject !== `Approve plan ${plan.id} v${plan.version}`) throw new Error("Invalid final plan approval.");
  return {
    planId: plan.id, planVersion: plan.version, scopeContractId: plan.scopeContractId,
    scopeVersion: plan.scopeVersion, approvalId: approval.id,
    contentHash: createHash("sha256").update(JSON.stringify({ plan, scope })).digest("hex"),
  };
}
