import { isDeepStrictEqual } from "node:util";
import { assertSafeStorageId, parseScopeContract } from "../planning/config.js";
import { parsePlanningLoopState } from "../planning/memory-store.js";
import type { PlanningLoopState } from "../planning/contracts.js";
import { record, strings, text } from "../development/validation.js";
import type { PlanningContinuation, SupervisorState } from "./contracts.js";

export function parseContinuations(raw: unknown, projectId: string): PlanningContinuation[] {
  if (!Array.isArray(raw)) throw new Error("Invalid continuation history.");
  const result = raw.map((item: unknown): PlanningContinuation => {
    const value = record(item), base = parsePlanningLoopState(value.base);
    const id = text(value.id), planId = text(value.planId);
    assertSafeStorageId(id, "Continuation ID"); assertSafeStorageId(planId, "Plan ID");
    if (base.projectId !== projectId || base.currentPlanVersion === undefined || !["awaiting_user_input", "awaiting_scope_change_approval", "awaiting_approval", "user_approved"].includes(base.status)) throw new Error("Invalid continuation base.");
    if (!["answers", "scope_change", "revision"].includes(String(value.kind)) || !["awaiting_answers", "ready", "requested", "proposed", "approved", "rejected", "started", "completed"].includes(String(value.status))) throw new Error("Invalid continuation kind/status.");
    if (typeof value.baseHash !== "string" || !/^[a-f0-9]{64}$/.test(value.baseHash)) throw new Error("Invalid continuation source hash.");
    const baseScope = parseScopeContract(value.baseScope, projectId);
    if (baseScope.id !== base.scopeContractId || baseScope.version !== base.scopeVersion) throw new Error("Continuation base Scope mismatch.");
    const questionIds = strings(value.questionIds);
    questionIds.forEach((question) => assertSafeStorageId(question, "Question ID"));
    if (new Set(questionIds).size !== questionIds.length) throw new Error("Duplicate continuation question.");
    const optionalId = (key: string) => { const idValue = text(value[key]); assertSafeStorageId(idValue, key); return idValue; };
    const proposedScope = value.proposedScope === undefined ? undefined : parseScopeContract(value.proposedScope, projectId);
    if (proposedScope !== undefined && (proposedScope.version <= baseScope.version || proposedScope.id === baseScope.id)) throw new Error("Scope change requires a new version.");
    if (value.kind === "answers") {
      if (base.status !== "awaiting_user_input" || questionIds.length === 0 || !["awaiting_answers", "ready", "started", "completed"].includes(String(value.status)) || proposedScope !== undefined || value.changeApprovalId !== undefined || value.scopeApprovalId !== undefined || value.scopeChangeRequestId !== undefined) throw new Error("Invalid answer continuation.");
    } else if (value.kind === "revision") {
      if (base.status !== "awaiting_approval" || questionIds.length !== 0 || !["ready", "started", "completed"].includes(String(value.status)) || proposedScope !== undefined || value.changeApprovalId !== undefined || value.scopeApprovalId !== undefined || value.scopeChangeRequestId !== undefined) throw new Error("Invalid plan revision continuation.");
    } else if (questionIds.length !== 0 || !["requested", "proposed", "approved", "rejected", "started", "completed"].includes(String(value.status)) || value.changeApprovalId === undefined || value.scopeChangeRequestId === undefined ||
        (["proposed", "approved", "rejected", "started", "completed"].includes(String(value.status)) && (proposedScope === undefined || value.scopeApprovalId === undefined))) throw new Error("Invalid Scope change continuation.");
    return { id, planId, base, baseScope, baseHash: value.baseHash, questionIds, kind: value.kind as PlanningContinuation["kind"], status: value.status as PlanningContinuation["status"],
      reason: text(value.reason), createdAt: text(value.createdAt),
      ...(value.scopeChangeRequestId === undefined ? {} : { scopeChangeRequestId: optionalId("scopeChangeRequestId") }),
      ...(value.changeApprovalId === undefined ? {} : { changeApprovalId: optionalId("changeApprovalId") }),
      ...(proposedScope === undefined ? {} : { proposedScope }),
      ...(value.scopeApprovalId === undefined ? {} : { scopeApprovalId: optionalId("scopeApprovalId") }) };
  });
  if (new Set(result.map((item) => item.id)).size !== result.length || result.slice(0, -1).some(isPendingContinuation)) throw new Error("Overlapping continuation history.");
  return result;
}

export function isPendingContinuation(item: PlanningContinuation): boolean {
  return item.status !== "completed" && !(item.status === "rejected" && item.base.status !== "awaiting_scope_change_approval");
}
export function activeContinuation(state: SupervisorState): PlanningContinuation | undefined {
  const last = state.continuations?.at(-1);
  return last !== undefined && isPendingContinuation(last) ? last : undefined;
}
export function assertNoPendingContinuation(state: SupervisorState): void {
  if (activeContinuation(state) !== undefined) throw new Error("Finish or reject the pending continuation first.");
}
export function continuationNextAction(state: SupervisorState, planning?: PlanningLoopState): string | undefined {
  const item = activeContinuation(state);
  if (item === undefined) return undefined;
  if (item.status === "awaiting_answers") return "answer";
  if (item.status === "requested") return "propose-scope-change";
  if (item.status === "proposed") return "approve-scope-change or reject-scope-change";
  if (item.status === "started" && !isDeepStrictEqual(planning, item.base) && !(planning?.continuationId === item.id && isCompletedRun(planning, item))) return "STOP: interrupted Planning run; automatic replay is disabled.";
  if (item.base.iterationCount >= item.base.maxIterations) return "STOP: Planning iteration budget is exhausted.";
  return "resume-plan";
}
export function isCompletedRun(state: PlanningLoopState, item: PlanningContinuation): boolean {
  return state.continuationId === item.id && (state.currentPlanVersion ?? 0) > item.base.currentPlanVersion! && ["awaiting_user_input", "awaiting_scope_change_approval", "awaiting_approval", "limit_reached", "failed", "stopped", "user_approved"].includes(state.status);
}
