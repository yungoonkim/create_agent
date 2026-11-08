import { parseScopeContract, assertSafeProjectId, assertSafeStorageId } from "../planning/config.js";
import { parseTask, record, strings, text, validateGraph } from "../development/validation.js";
import { artifactPath } from "../verification/validation.js";
import { isDeepStrictEqual } from "node:util";
import type { ApprovedPlanReference } from "../development/contracts.js";
import type { ScopeContract } from "../planning/contracts.js";
import type { SupervisorState, WorkOrder } from "./contracts.js";

export function parseOrders(raw: unknown, projectId: string, scope: ScopeContract, operatorProfiles = false): WorkOrder[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("Expected nonempty work orders.");
  const required = new Set(scope.requiredFeatures.map((feature) => feature.id));
  const covered = new Set<string>();
  const orders = raw.map((item: unknown) => {
    const value = record(item);
    const definition = { ...record(value.task) };
    // Normalized, not-yet-started operator profiles carry zero counters in snapshots.
    if (operatorProfiles && definition.attemptCount === 0) delete definition.attemptCount;
    if (operatorProfiles && definition.reworkCount === 0) delete definition.reworkCount;
    const task = parseTask(definition, projectId, true);
    // A model cannot install executable verification policy or decide rework budgets.
    if (!operatorProfiles && (task.verificationProfile !== undefined || task.maxReworkAttempts !== undefined)) throw new Error("Verification profiles require separate operator configuration.");
    task.expectedArtifacts.forEach(artifactPath);
    const requirementIds = strings(value.requirementIds, true);
    if (new Set(requirementIds).size !== requirementIds.length) throw new Error("Duplicate requirement reference.");
    for (const id of requirementIds) {
      if (!required.has(id)) throw new Error(`Unknown or excluded requirement: ${id}`);
      covered.add(id);
    }
    return { task, requirementIds };
  });
  validateGraph(orders.map((order) => order.task));
  if (covered.size !== required.size) throw new Error("Work orders must cover every required feature.");
  return orders;
}

export function parseSource(raw: unknown): ApprovedPlanReference {
  const value = record(raw);
  const planId = text(value.planId), scopeContractId = text(value.scopeContractId), approvalId = text(value.approvalId);
  for (const id of [planId, scopeContractId, approvalId]) assertSafeStorageId(id, "approval source ID");
  if (typeof value.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(value.contentHash)) throw new Error("Invalid source hash.");
  return { planId, scopeContractId, approvalId, contentHash: value.contentHash, planVersion: positive(value.planVersion), scopeVersion: positive(value.scopeVersion) };
}

export function parseSupervisorState(raw: unknown, projectId: string): SupervisorState {
  const value = record(raw);
  assertSafeProjectId(projectId);
  if (value.schemaVersion !== 1 || value.projectId !== projectId) throw new Error("Invalid supervisor state identity.");
  const phase = text(value.phase);
  const phases: readonly string[] = ["intake", "awaiting_answers", "ready_for_scope", "scope_proposed", "scope_approved", "tasks_proposed", "tasks_initialized"];
  if (!phases.includes(phase) || !Array.isArray(value.clarifications) || !Array.isArray(value.events)) throw new Error("Invalid supervisor state.");
  const clarifications = value.clarifications.map((rawItem: unknown) => {
    const item = record(rawItem);
    const id = text(item.id); assertSafeStorageId(id, "question ID");
    return { id, question: text(item.question), ...(item.answer === undefined ? {} : { answer: text(item.answer) }) };
  });
  if (new Set(clarifications.map((item) => item.id)).size !== clarifications.length) throw new Error("Duplicate question ID.");
  if (phase === "awaiting_answers" ? clarifications.every((item) => item.answer !== undefined) : clarifications.some((item) => item.answer === undefined)) throw new Error("Question answers do not match phase.");
  const scope = value.scope === undefined ? undefined : parseScopeContract(value.scope, projectId);
  const scopeApprovalId = value.scopeApprovalId === undefined ? undefined : text(value.scopeApprovalId);
  if (scopeApprovalId !== undefined) assertSafeStorageId(scopeApprovalId, "scope approval ID");
  if (["scope_proposed", "scope_approved", "tasks_proposed", "tasks_initialized"].includes(phase) && (scope === undefined || scopeApprovalId === undefined)) throw new Error("Scope and approval link required.");
  let taskProposal: SupervisorState["taskProposal"];
  if (value.taskProposal !== undefined) {
    const proposal = record(value.taskProposal);
    if (scope === undefined) throw new Error("Task proposal requires Scope.");
    const source = parseSource(proposal.source);
    if (source.scopeContractId !== scope.id || source.scopeVersion !== scope.version) throw new Error("Task proposal has stale Scope.");
    taskProposal = { source, orders: parseOrders(proposal.orders, projectId, scope, true) };
  }
  if (["tasks_proposed", "tasks_initialized"].includes(phase) !== (taskProposal !== undefined)) throw new Error("Task proposal does not match phase.");
  return {
    schemaVersion: 1, projectId, revision: positive(value.revision), phase: phase as SupervisorState["phase"],
    originalRequest: text(value.originalRequest), clarifications,
    ...(scope === undefined ? {} : { scope }), ...(scopeApprovalId === undefined ? {} : { scopeApprovalId }),
    ...(taskProposal === undefined ? {} : { taskProposal }),
    events: value.events.map((rawEvent: unknown) => { const event = record(rawEvent); return { at: text(event.at), action: text(event.action), detail: text(event.detail) }; }),
  };
}

export function same(a: unknown, b: unknown): boolean { return isDeepStrictEqual(a, b); }
function positive(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 1) throw new Error("Expected positive integer.");
  return raw;
}
