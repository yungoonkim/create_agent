import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { hash } from "../verification/validation.js";
import { parseScopeContract } from "../planning/config.js";
import { PlanningLoopController } from "../planning/controller.js";
import type { PlanningLoopState, ScopeContract } from "../planning/contracts.js";
import { validatePlanReview } from "../planning/policy.js";
import { text } from "../development/validation.js";
import type { SupervisorOptions } from "./controller.js";
import type { PlanningContinuation, SupervisorState } from "./contracts.js";
import { activeContinuation, assertNoPendingContinuation, isCompletedRun } from "./continuation-validation.js";

/** Explicit user decisions before a bounded new draft. Never replays an interrupted model call. */
export class PlanningContinuationController {
  private readonly now: () => string;
  private readonly projectId: string;
  constructor(private readonly options: SupervisorOptions) {
    this.now = options.now ?? (() => new Date().toISOString()); this.projectId = options.config.projectId;
  }

  async collectFeedback(): Promise<SupervisorState> {
    return this.change("collect-feedback", async (state) => {
      await this.beforeRequest(state, false);
      const base = await this.current();
      if (base.status !== "awaiting_user_input") throw new Error("Planning is not awaiting user input.");
      const snapshots = await this.snapshots(base);
      const questions = [...new Set(base.reason.split("\n").filter((item) => item.trim().length > 0))];
      const additions = questions.map((question, index) => ({ id: `Q-${state.clarifications.length + index + 1}`, question }));
      const continuation: PlanningContinuation = { ...this.baseRecord(base, snapshots.scope, snapshots.fingerprint, base.reason),
        kind: "answers", status: "awaiting_answers", questionIds: additions.map((item) => item.id) };
      return { ...state, phase: "awaiting_answers", clarifications: [...state.clarifications, ...additions], continuations: [...state.continuations ?? [], continuation] };
    });
  }

  async requestPlanRevision(reason: string): Promise<SupervisorState> {
    const rationale = text(reason);
    return this.change("request-plan-revision", async (state) => {
      await this.beforeRequest(state);
      const base = await this.current();
      if (base.status !== "awaiting_approval" || (await this.options.memory.get(base.approvalId))?.status !== "pending") throw new Error("Plan revision requires a reviewed plan awaiting final approval.");
      const snapshots = await this.snapshots(base);
      const continuation: PlanningContinuation = { ...this.baseRecord(base, snapshots.scope, snapshots.fingerprint, rationale),
        kind: "revision", status: "ready", questionIds: [] };
      return { ...state, continuations: [...state.continuations ?? [], continuation] };
    });
  }

  async requestScopeChange(reason?: string): Promise<SupervisorState> {
    return this.change("request-scope-change", async (state) => {
      await this.beforeRequest(state);
      const base = await this.current();
      if (!["awaiting_user_input", "awaiting_scope_change_approval", "awaiting_approval", "user_approved"].includes(base.status)) throw new Error("Scope change requires a reviewed plan before task proposal.");
      const snapshots = await this.snapshots(base);
      let request;
      if (base.status === "awaiting_scope_change_approval") {
        request = await this.options.memory.getScopeChangeRequest(this.projectId, base.changeRequestId);
        if (request === undefined) throw new Error("Scope change request missing.");
      } else {
        const rationale = text(reason);
        const approval = await this.options.memory.request(this.projectId, `Scope change for plan ${this.planId()} v${base.currentPlanVersion!}`);
        request = { id: `change-${approval.id}`, projectId: this.projectId, baseScopeContractId: snapshots.scope.id, baseScopeVersion: snapshots.scope.version, rationale, proposedChanges: [rationale], approvalId: approval.id };
        await this.options.memory.createScopeChangeRequest(request);
      }
      const approval = await this.options.memory.get(request.approvalId);
      if (request.baseScopeContractId !== base.scopeContractId || request.baseScopeVersion !== base.scopeVersion || approval?.status !== "pending" || approval.projectId !== this.projectId || approval.subject !== `Scope change for plan ${this.planId()} v${base.currentPlanVersion!}`) throw new Error("Invalid pending Scope change request.");
      const continuation: PlanningContinuation = { ...this.baseRecord(base, snapshots.scope, snapshots.fingerprint, request.rationale),
        kind: "scope_change", status: "requested", questionIds: [], scopeChangeRequestId: request.id, changeApprovalId: approval.id };
      return { ...state, continuations: [...state.continuations ?? [], continuation] };
    });
  }

  async proposeScopeChange(): Promise<SupervisorState> {
    return this.change("propose-scope-change", async (state) => {
      const item = this.pending(state);
      if (item.kind !== "scope_change" || item.status !== "requested") throw new Error("Scope change is not awaiting a proposal.");
      if (item.base.iterationCount >= item.base.maxIterations) throw new Error("Planning iteration budget is exhausted; no Scope proposal model call was made.");
      await this.assertBase(item);
      const request = await this.options.memory.getScopeChangeRequest(this.projectId, item.scopeChangeRequestId!);
      if (request === undefined) throw new Error("Change request missing.");
      const raw = await this.options.proposer.scope({ projectId: this.projectId, originalRequest: state.originalRequest, clarifications: state.clarifications,
        scopeChange: { baseScope: item.baseScope, reason: item.reason, proposedChanges: request.proposedChanges } });
      const version = Math.max(state.revision + 1, item.baseScope.version + 1);
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Invalid Scope proposal.");
      const proposedScope = parseScopeContract({ ...raw, projectId: this.projectId, id: `scope-v${version}`, version, createdAt: this.now() }, this.projectId);
      if (proposedScope.requiredFeatures.length === 0 || new Set([...proposedScope.requiredFeatures, ...proposedScope.excludedFeatures].map((feature) => feature.id)).size !== proposedScope.requiredFeatures.length + proposedScope.excludedFeatures.length) throw new Error("Scope feature IDs must be distinct and required features nonempty.");
      await this.assertBase(item);
      const approval = await this.options.memory.request(this.projectId, `Scope Contract ${proposedScope.id} v${version}`);
      return this.replace(state, { ...item, status: "proposed", proposedScope, scopeApprovalId: approval.id });
    });
  }

  async decideScopeChange(approved: boolean, confirmation: string, rationale: string): Promise<SupervisorState> {
    text(rationale);
    return this.change(approved ? "approve-scope-change" : "reject-scope-change", async (state) => {
      const item = this.pending(state);
      if (item.kind !== "scope_change" || item.status !== "proposed" || item.proposedScope === undefined) throw new Error("No Scope change proposal to decide.");
      await this.assertBase(item);
      const scope = item.proposedScope;
      if (confirmation !== `${approved ? "APPROVE" : "REJECT"} CHANGE ${item.id} ${scope.id} v${scope.version}`) throw new Error("Scope change confirmation does not match proposal.");
      await this.storeScope(scope, item.scopeApprovalId!);
      // The displayed confirmation explicitly covers both the change and its full Scope snapshot.
      await this.decide(item.changeApprovalId!, `Scope change for plan ${item.planId} v${item.base.currentPlanVersion!}`, approved, rationale);
      await this.decide(item.scopeApprovalId!, `Scope Contract ${scope.id} v${scope.version}`, approved, rationale);
      const next = this.replace(state, { ...item, status: approved ? "approved" : "rejected" });
      return approved ? { ...next, scope, scopeApprovalId: item.scopeApprovalId! } : next;
    });
  }

  async resumePlan(): Promise<SupervisorState> {
    // Save intent before touching Planning. A crash cannot erase the authorization or replay receipt.
    await this.change("start-continuation", async (state) => {
      const item = this.pending(state);
      if (!["ready", "approved", "rejected", "started"].includes(item.status)) throw new Error("Continuation still needs answers or a Scope decision.");
      if (item.kind === "answers" && item.questionIds.some((id) => !state.clarifications.some((question) => question.id === id && question.answer !== undefined))) throw new Error("Continuation answers are missing.");
      if (item.base.iterationCount >= item.base.maxIterations) throw new Error("Planning iteration budget is exhausted; no model call was made.");
      return this.replace(state, { ...item, status: "started" });
    });
    return this.change("finish-continuation", async (state) => {
      const item = this.pending(state);
      const current = await this.current();
      if (isCompletedRun(current, item)) {
        const expectedScope = await this.targetScope(item);
        if (current.scopeContractId !== expectedScope.id || current.scopeVersion !== expectedScope.version) throw new Error("Continuation receipt Scope mismatch.");
        return this.replace(state, { ...item, status: "completed" });
      }
      await this.assertBase(item);
      const scope = await this.targetScope(item);
      const decisions = state.clarifications.map((question) => `${question.id}: ${question.question}\nUser answer: ${question.answer!}`);
      let changeDecision: "approved" | "rejected" | undefined;
      if (item.kind === "scope_change") {
        changeDecision = await this.changeDecision(item);
        decisions.push(`User ${changeDecision} Scope change: ${item.reason}. ${changeDecision === "rejected" ? "Revise to comply with the original approved Scope; do not add the rejected change." : "Use only the newly approved Scope."}`);
      }
      const writer = this.options.writer;
      await new PlanningLoopController({ config: this.options.config, memory: this.options.memory,
        writer: { write: async (context, role) => { const plan = await writer.write(context, role); if (plan.id !== this.planId()) throw new Error("Supervisor Plan ID mismatch."); return plan; } },
        reviewer: this.options.reviewer, now: this.now }).resume({ requirements: state.originalRequest, scopeContract: scope, clarificationDecisions: decisions },
        { id: item.id, planId: item.planId, expectedState: item.base, kind: item.kind,
          ...(item.kind === "revision" ? { revisionReason: item.reason } : {}),
          ...(item.kind === "scope_change" ? { scopeChangeRequestId: item.scopeChangeRequestId!, scopeChangeDecision: changeDecision! } : {}) });
      return this.replace(state, { ...item, status: "completed" });
    });
  }

  private async beforeRequest(state: SupervisorState, requiresModelCapacity = true): Promise<void> {
    if (state.phase !== "scope_approved" || state.taskProposal !== undefined || await this.options.developmentStore.get(this.projectId) !== undefined) throw new Error("Continuation requires the planning phase before task proposal/initialization.");
    assertNoPendingContinuation(state);
    const planning = await this.current();
    if (requiresModelCapacity && planning.iterationCount >= planning.maxIterations) throw new Error("Planning iteration budget is exhausted; no model call was made.");
    if (!isDeepStrictEqual(state.scope, (await this.snapshots(planning)).scope)) throw new Error("Supervisor Scope differs from the current approved Planning source.");
  }
  private async current(): Promise<PlanningLoopState> {
    const state = await this.options.memory.getPlanningLoopState(this.projectId);
    if (state === undefined) throw new Error("Planning state missing."); return state;
  }
  private async snapshots(base: PlanningLoopState): Promise<{ scope: ScopeContract; fingerprint: string }> {
    if (base.currentPlanVersion === undefined) throw new Error("Current plan missing.");
    const memory = this.options.memory;
    const scope = await memory.getScopeContract(this.projectId, base.scopeVersion);
    const plan = await memory.getPlanDraft(this.projectId, this.planId(), base.currentPlanVersion);
    const review = await memory.getPlanReview(this.projectId, this.planId(), base.currentPlanVersion);
    if (scope === undefined || scope.id !== base.scopeContractId || plan === undefined || review === undefined) throw new Error("Continuation source missing.");
    validatePlanReview(review, plan, scope);
    const link = await memory.getScopeApprovalRecord(this.projectId, scope.id);
    const approval = link === undefined ? undefined : await memory.get(link.approvalId);
    if (approval?.status !== "approved" || approval.projectId !== this.projectId || approval.subject !== `Scope Contract ${scope.id} v${scope.version}` || approval.rationale?.startsWith("DEMO FIXTURE:") === true) throw new Error("Continuation needs a real approved base Scope.");
    return { scope, fingerprint: hash({ scope, plan, review }) };
  }
  private async assertBase(item: PlanningContinuation): Promise<void> {
    if (!isDeepStrictEqual(await this.current(), item.base)) throw new Error("Continuation base is stale or already started; automatic replay is disabled.");
    const snapshots = await this.snapshots(item.base);
    if (snapshots.fingerprint !== item.baseHash || !isDeepStrictEqual(snapshots.scope, item.baseScope)) throw new Error("Continuation source snapshots changed.");
  }
  private baseRecord(base: PlanningLoopState, baseScope: ScopeContract, baseHash: string, reason: string) {
    return { id: `continue-${randomUUID()}`, planId: this.planId(), base, baseScope, baseHash, reason, createdAt: this.now() };
  }
  private pending(state: SupervisorState): PlanningContinuation {
    const item = activeContinuation(state);
    if (item === undefined) throw new Error("No pending continuation."); return item;
  }
  private replace(state: SupervisorState, item: PlanningContinuation): SupervisorState {
    return { ...state, continuations: [...state.continuations!.slice(0, -1), item] };
  }
  private async changeDecision(item: PlanningContinuation): Promise<"approved" | "rejected"> {
    const decision = await this.options.memory.get(item.changeApprovalId!);
    if (decision?.projectId !== this.projectId || decision.subject !== `Scope change for plan ${item.planId} v${item.base.currentPlanVersion!}` || (decision.status !== "approved" && decision.status !== "rejected")) throw new Error("Scope change decision missing or invalid.");
    return decision.status;
  }
  private async targetScope(item: PlanningContinuation): Promise<ScopeContract> {
    if (item.kind === "answers" || item.kind === "revision" || await this.changeDecision(item) === "rejected") return item.baseScope;
    const scope = item.proposedScope!;
    const approval = await this.options.memory.get(item.scopeApprovalId!);
    const link = await this.options.memory.getScopeApprovalRecord(this.projectId, scope.id);
    const stored = await this.options.memory.getScopeContract(this.projectId, scope.version);
    if (approval?.status !== "approved" || approval.projectId !== this.projectId || approval.subject !== `Scope Contract ${scope.id} v${scope.version}` || link?.approvalId !== approval.id || !isDeepStrictEqual(stored, scope)) throw new Error("Changed Scope is not approved unchanged.");
    return scope;
  }
  private async storeScope(scope: ScopeContract, approvalId: string): Promise<void> {
    const stored = await this.options.memory.getScopeContract(this.projectId, scope.version);
    if (stored === undefined) await this.options.memory.createScopeContract(scope);
    else if (!isDeepStrictEqual(stored, scope)) throw new Error("Scope snapshot changed.");
    const link = await this.options.memory.getScopeApprovalRecord(this.projectId, scope.id);
    if (link === undefined) await this.options.memory.createScopeApprovalRecord({ projectId: this.projectId, scopeContractId: scope.id, approvalId });
    else if (link.approvalId !== approvalId) throw new Error("Scope approval link mismatch.");
  }
  private async decide(id: string, subject: string, approved: boolean, rationale: string): Promise<void> {
    const approval = await this.options.memory.get(id);
    if (approval?.projectId !== this.projectId || approval.subject !== subject) throw new Error("Invalid change approval.");
    if (approval.status === "pending") await this.options.memory.recordDecision(id, approved ? "approved" : "rejected", rationale);
    else if (approval.status !== (approved ? "approved" : "rejected")) throw new Error("Approval decision conflicts with recorded decision.");
  }
  private planId(): string { return `${this.projectId}-plan`; }
  private async change(action: string, mutate: (state: SupervisorState) => Promise<SupervisorState>): Promise<SupervisorState> {
    return this.options.store.update(this.projectId, async (state) => {
      if (state === undefined) throw new Error("Supervisor state missing.");
      const next = await mutate(state);
      return { ...next, revision: state.revision + 1, events: [...state.events, { at: this.now(), action, detail: "Explicit planning continuation; original requirements and snapshots preserved." }] };
    });
  }
}
