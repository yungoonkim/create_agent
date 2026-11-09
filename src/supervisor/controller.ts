import type { DevelopmentState } from "../development/contracts.js";
import { ManualDevelopmentController } from "../development/controller.js";
import { FileDevelopmentStore } from "../development/memory-store.js";
import { approvePlan, requireApprovedPlan, type PlanningApprovalStore } from "../development/plan-approval.js";
import { record, strings, text } from "../development/validation.js";
import { parseScopeContract, type LivePlanningConfig, type OfflinePlanningConfig } from "../planning/config.js";
import { PlanningLoopController } from "../planning/controller.js";
import type { PlanningReviewer, PlanningWriter, ScopeContract } from "../planning/contracts.js";
import type { SupervisorProposer, SupervisorState } from "./contracts.js";
import { FileSupervisorStore } from "./memory-store.js";
import { parseOrders, same } from "./validation.js";
import { PlanningContinuationController } from "./continuation.js";
import { activeContinuation, assertNoPendingContinuation, continuationNextAction } from "./continuation-validation.js";
import { buildUserReviewTable, type UserReviewTable } from "../planning/user-review.js";
import type { PlanDraft } from "../planning/contracts.js";

export interface SupervisorOptions {
  readonly config: LivePlanningConfig | OfflinePlanningConfig;
  readonly memory: PlanningApprovalStore;
  readonly store: FileSupervisorStore;
  readonly developmentStore: FileDevelopmentStore;
  readonly proposer: SupervisorProposer;
  readonly writer: PlanningWriter;
  readonly reviewer: PlanningReviewer;
  readonly now?: () => string;
}

export class SupervisorController {
  private readonly now: () => string;
  private readonly projectId: string;
  constructor(private readonly options: SupervisorOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.projectId = options.config.projectId;
  }

  async start(originalRequest: string): Promise<SupervisorState> {
    text(originalRequest);
    return this.options.store.update(this.projectId, async (previous) => {
      if (previous !== undefined || await this.options.memory.getRequirements(this.projectId) !== undefined ||
          await this.options.memory.getPlanningLoopState(this.projectId) !== undefined || await this.options.developmentStore.get(this.projectId) !== undefined) {
        throw new Error("Project already exists; use a new project ID. Existing data was preserved.");
      }
      return { schemaVersion: 1, projectId: this.projectId, revision: 1, phase: "intake", originalRequest,
        clarifications: [], events: [{ at: this.now(), action: "start", detail: "Original request recorded unchanged." }] };
    });
  }

  async questions(): Promise<SupervisorState> {
    return this.change("questions", "Clarification proposal recorded.", async (state) => {
      this.phase(state, "intake", "ready_for_scope");
      const questions = strings(await this.options.proposer.questions(state));
      if (new Set(questions).size !== questions.length) throw new Error("Duplicate clarification question.");
      return { ...state, phase: questions.length === 0 ? "ready_for_scope" : "awaiting_answers",
        clarifications: [...state.clarifications, ...questions.map((question, index) => ({ id: `Q-${state.clarifications.length + index + 1}`, question }))] };
    });
  }

  async answer(raw: unknown): Promise<SupervisorState> {
    const answers = record(raw);
    if (Object.keys(answers).length === 0) throw new Error("At least one answer is required.");
    return this.change("answer", "User answers recorded.", async (state) => {
      this.phase(state, "awaiting_answers");
      for (const [id, answer] of Object.entries(answers)) {
        text(answer);
        if (!state.clarifications.some((item) => item.id === id && item.answer === undefined)) throw new Error("Unknown or already answered question.");
      }
      const clarifications = state.clarifications.map((item) => Object.hasOwn(answers, item.id) ? { ...item, answer: text(answers[item.id]) } : item);
      const pending = clarifications.some((item) => item.answer === undefined);
      const continuation = activeContinuation(state);
      if (continuation?.kind === "answers") {
        return { ...state, clarifications, phase: pending ? "awaiting_answers" : "scope_approved",
          continuations: [...state.continuations!.slice(0, -1), { ...continuation, status: pending ? "awaiting_answers" : "ready" }] };
      }
      return { ...state, clarifications, phase: pending ? "awaiting_answers" : "ready_for_scope" };
    });
  }

  async proposeScope(): Promise<SupervisorState> {
    return this.change("propose-scope", "Unapproved Scope proposal recorded.", async (state) => {
      this.phase(state, "ready_for_scope");
      const raw = record(await this.options.proposer.scope(state));
      // Identity, version and timestamp are owned by the controller, never the model.
      const version = state.revision + 1;
      const scope = parseScopeContract({ ...raw, id: `scope-v${version}`, projectId: this.projectId, version, createdAt: this.now() }, this.projectId);
      if (scope.requiredFeatures.length === 0 || new Set([...scope.requiredFeatures, ...scope.excludedFeatures].map((item) => item.id)).size !== scope.requiredFeatures.length + scope.excludedFeatures.length) throw new Error("Scope needs required features and distinct feature IDs.");
      const approval = await this.options.memory.request(this.projectId, `Scope Contract ${scope.id} v${scope.version}`);
      return { ...state, phase: "scope_proposed", scope, scopeApprovalId: approval.id };
    });
  }

  async decideScope(approved: boolean, confirmation: string, rationale: string): Promise<SupervisorState> {
    text(rationale);
    return this.change(approved ? "approve-scope" : "reject-scope", rationale, async (state) => {
      this.phase(state, "scope_proposed");
      const scope = this.scope(state);
      if (confirmation !== `${approved ? "APPROVE" : "REJECT"} ${scope.id} v${scope.version}`) throw new Error("Scope confirmation does not match current proposal.");
      await this.ensureScope(state);
      const approval = await this.options.memory.get(state.scopeApprovalId!);
      if (approval?.status === "pending") await this.options.memory.recordDecision(approval.id, approved ? "approved" : "rejected", rationale);
      else if (approval?.status !== (approved ? "approved" : "rejected")) throw new Error("Scope decision conflicts with existing approval.");
      return { ...state, phase: approved ? "scope_approved" : "ready_for_scope" };
    });
  }

  async plan(): Promise<SupervisorState> {
    return this.change("plan", "Planning state saved separately; consult report for the next action.", async (state) => {
      this.phase(state, "scope_approved");
      await this.ensureScope(state);
      if (await this.options.memory.getPlanningLoopState(this.projectId) !== undefined) throw new Error("Planning already exists; consult report. Automatic replay/resume is disabled.");
      const writer: PlanningWriter = { write: async (context, role) => {
        const plan = await this.options.writer.write(context, role);
        if (plan.id !== this.planId()) throw new Error("Supervisor Writer must use the project plan ID.");
        return plan;
      } };
      await new PlanningLoopController({ config: this.options.config, memory: this.options.memory, writer,
        reviewer: this.options.reviewer, now: this.now }).run({ requirements: state.originalRequest, scopeContract: this.scope(state),
          clarificationDecisions: state.clarifications.map((item) => `${item.id}: ${item.question}\nUser answer: ${item.answer!}`) });
      return state;
    });
  }

  async approvePlan(confirmation: string, rationale: string): Promise<SupervisorState> {
    return this.change("approve-plan", text(rationale), async (state) => {
      this.phase(state, "scope_approved");
      assertNoPendingContinuation(state);
      const planning = await this.options.memory.getPlanningLoopState(this.projectId);
      if (planning?.currentPlanVersion === undefined || confirmation !== `APPROVE ${this.planId()} v${planning.currentPlanVersion}`) throw new Error("Plan confirmation does not match current plan.");
      await approvePlan(this.options.memory, this.projectId, this.planId(), rationale);
      return state;
    });
  }

  async retryReview(reason: string): Promise<SupervisorState> {
    text(reason);
    return this.change("retry-review", reason, async (state) => {
      this.phase(state, "scope_approved");
      assertNoPendingContinuation(state);
      if (state.taskProposal !== undefined || await this.options.developmentStore.get(this.projectId) !== undefined) throw new Error("Review retry is unavailable after task proposal/initialization.");
      await this.ensureScope(state);
      const planning = await this.options.memory.getPlanningLoopState(this.projectId);
      if (planning === undefined) throw new Error("No Planning state to retry.");
      await new PlanningLoopController({ config: this.options.config, memory: this.options.memory,
        writer: this.options.writer, reviewer: this.options.reviewer, now: this.now }).retryReview({
          requirements: state.originalRequest, scopeContract: this.scope(state),
          clarificationDecisions: state.clarifications.map((item) => `${item.id}: ${item.question}\nUser answer: ${item.answer!}`),
        }, this.planId(), planning, reason);
      return state;
    });
  }

  async proposeTasks(): Promise<SupervisorState> {
    return this.change("propose-tasks", "Work orders proposed; no workers have been run.", async (state) => {
      this.phase(state, "scope_approved");
      assertNoPendingContinuation(state);
      await this.ensureScope(state);
      const source = await requireApprovedPlan(this.options.memory, this.projectId, this.planId());
      const plan = await this.options.memory.getPlanDraft(this.projectId, source.planId, source.planVersion);
      if (plan === undefined) throw new Error("Approved plan missing.");
      const orders = parseOrders(await this.options.proposer.tasks(state, this.scope(state), plan), this.projectId, this.scope(state));
      if (!same(source, await requireApprovedPlan(this.options.memory, this.projectId, this.planId()))) throw new Error("Approved source changed during task proposal.");
      return { ...state, phase: "tasks_proposed", taskProposal: { source, orders } };
    });
  }

  async reviseTasks(reason: string): Promise<SupervisorState> {
    const rationale = text(reason);
    return this.change("revise-tasks", "Unaccepted work orders revised; previous proposal preserved.", async (state) => {
      this.phase(state, "tasks_proposed");
      if (await this.options.developmentStore.get(this.projectId) !== undefined) throw new Error("Initialized tasks cannot be revised.");
      await this.ensureScope(state);
      const previous = state.taskProposal!;
      const source = await requireApprovedPlan(this.options.memory, this.projectId, this.planId());
      if (!same(previous.source, source)) throw new Error("Task proposal source is stale.");
      const plan = await this.options.memory.getPlanDraft(this.projectId, source.planId, source.planVersion);
      if (plan === undefined) throw new Error("Approved plan missing.");
      const orders = parseOrders(await this.options.proposer.tasks({ ...state, taskRevision: { reason: rationale, previousOrders: previous.orders } }, this.scope(state), plan), this.projectId, this.scope(state));
      if (!same(source, await requireApprovedPlan(this.options.memory, this.projectId, this.planId()))) throw new Error("Approved source changed during task revision.");
      return { ...state, taskProposal: { source, orders }, taskRevisions: [...state.taskRevisions ?? [], { reason: rationale, previous, revisedAt: this.now() }] };
    });
  }

  async initializeTasks(confirmation: string): Promise<SupervisorState> {
    return this.change("initialize-tasks", "Operator accepted proposed tasks. Worker runtime remains disconnected.", async (state) => {
      this.phase(state, "tasks_proposed");
      await this.ensureScope(state);
      if (confirmation !== `ACCEPT TASKS r${state.revision}`) throw new Error("Task confirmation does not match proposal revision.");
      const proposal = state.taskProposal!;
      if (!same(proposal.source, await requireApprovedPlan(this.options.memory, this.projectId, this.planId()))) throw new Error("Task proposal source is stale.");
      const existing = await this.options.developmentStore.get(this.projectId);
      if (existing === undefined) await this.development().initialize(this.planId(), proposal.orders.map(({ task: { attemptCount: _attempt, reworkCount: _rework, ...definition } }) => definition));
      else if (!this.matchesInitialized(existing, state)) throw new Error("Development tasks differ; preserved existing tasks.");
      return { ...state, phase: "tasks_initialized" };
    });
  }

  async configureVerification(raw: unknown): Promise<SupervisorState> {
    const profiles = record(raw);
    if (Object.keys(profiles).length === 0) throw new Error("At least one verification profile is required.");
    return this.change("configure-verification", "Operator supplied command IDs and rework budgets; command policy remains external.", async (state) => {
      this.phase(state, "tasks_proposed");
      const proposal = state.taskProposal!;
      if (Object.keys(profiles).some((id) => !proposal.orders.some((order) => order.task.id === id))) throw new Error("Unknown task profile.");
      const orders = parseOrders(proposal.orders.map((order) => {
        if (!Object.hasOwn(profiles, order.task.id)) return order;
        const profile = record(profiles[order.task.id]);
        return { ...order, task: { ...order.task, verificationProfile: profile.verificationProfile, maxReworkAttempts: profile.maxReworkAttempts } };
      }), this.projectId, this.scope(state), true);
      return { ...state, taskProposal: { ...proposal, orders } };
    });
  }

  async report(): Promise<unknown> {
    const state = await this.options.store.get(this.projectId);
    if (state === undefined) throw new Error("Start supervisor intake first.");
    const planning = await this.options.memory.getPlanningLoopState(this.projectId);
    const development = await this.options.developmentStore.get(this.projectId);
    const plan = planning?.currentPlanVersion === undefined ? undefined : await this.options.memory.getPlanDraft(this.projectId, this.planId(), planning.currentPlanVersion);
    const review = plan === undefined ? undefined : await this.options.memory.getPlanReview(this.projectId, plan.id, plan.version);
    const planningErrors = await this.options.memory.getPlanningErrors(this.projectId);
    const scopeApproval = state.scopeApprovalId === undefined ? undefined : await this.options.memory.get(state.scopeApprovalId);
    const planApproval = planning?.status === "awaiting_approval" || planning?.status === "user_approved" ? await this.options.memory.get(planning.approvalId) : undefined;
    const scopeChangeRequest = planning?.status === "awaiting_scope_change_approval" ? await this.options.memory.getScopeChangeRequest(this.projectId, planning.changeRequestId) : undefined;
    const tasks = development?.tasks ?? [];
    let sourceCurrent = true;
    const source = development?.source ?? state.taskProposal?.source;
    if (source !== undefined) {
      try { sourceCurrent = same(source, await requireApprovedPlan(this.options.memory, this.projectId, this.planId())) && same(state.scope, await this.options.memory.getScopeContract(this.projectId, source.scopeVersion)); }
      catch { sourceCurrent = false; }
    }
    const counts = Object.fromEntries(["pending", "ready", "in_progress", "awaiting_review", "approved", "rework", "blocked", "cancelled"].map((status) => [status, tasks.filter((task) => task.status === status).length]));
    const exhausted = planning !== undefined && planning.iterationCount >= planning.maxIterations && ["awaiting_user_input", "awaiting_scope_change_approval"].includes(planning.status);
    const userReview = plan === undefined ? undefined : (await this.reviewPlan()).table;
    return { projectId: this.projectId, supervisor: state, scopeApproval, planning, plan, review, planApproval, scopeChangeRequest, planningErrors, userReview,
      nextAction: sourceCurrent ? exhausted ? "STOP: Planning iteration budget is exhausted." : continuationNextAction(state, planning) ?? this.nextAction(state, planning?.status) : "STOP: approved source changed or is unavailable.",
      progress: { counts, sourceCurrent, completed: sourceCurrent && tasks.length > 0 && tasks.every((task) => task.status === "approved"),
        evidencePassed: tasks.filter((task) => task.evidence?.outcome === "passed").length,
        evidenceFailed: tasks.filter((task) => task.evidence?.outcome === "failed").length,
        unverified: tasks.filter((task) => task.evidence === undefined).length,
        note: "Evidence counts describe stored checks, not fresh verification. Manual approvals and objective evidence are separate." },
      tasks, workOrders: state.taskProposal?.orders.map((order) => ({ ...order, instruction: this.instruction(state, order.task.id, plan?.content) })),
      workerRuntimeConnected: false };
  }

  async reviewPlan(): Promise<{ readonly plan: PlanDraft; readonly table: UserReviewTable }> {
    const memory = this.options.memory;
    const supervisor = await this.options.store.get(this.projectId);
    const planning = await memory.getPlanningLoopState(this.projectId);
    if (planning?.currentPlanVersion === undefined) throw new Error("저장된 기획이 없습니다. report로 오류와 저장 상태를 확인하세요. 이 명령은 모델을 호출하지 않습니다.");
    const plan = await memory.getPlanDraft(this.projectId, this.planId(), planning.currentPlanVersion);
    if (plan === undefined) throw new Error("현재 버전의 저장 기획을 찾을 수 없습니다.");
    const scope = await memory.getScopeContract(this.projectId, plan.scopeVersion);
    if (scope === undefined) throw new Error("기획 출처 Scope를 찾을 수 없습니다.");
    const review = await memory.getPlanReview(this.projectId, plan.id, plan.version);
    const link = await memory.getScopeApprovalRecord(this.projectId, scope.id);
    const scopeApproval = link === undefined ? undefined : await memory.get(link.approvalId);
    const planApproval = "approvalId" in planning ? await memory.get(planning.approvalId) : undefined;
    const errors = await memory.getPlanningErrors(this.projectId);
    if (!same(planning, await memory.getPlanningLoopState(this.projectId)) || !same(supervisor, await this.options.store.get(this.projectId))) throw new Error("기획 상태가 읽는 동안 변경됐습니다. 완료 후 검토표를 다시 생성하세요.");
    return { plan, table: buildUserReviewTable({ scope, plan, planning, errors, sourceCurrent: supervisor?.scope === undefined || same(supervisor.scope, scope),
      ...(review === undefined ? {} : { review }), ...(scopeApproval === undefined ? {} : { scopeApproval }),
      ...(planApproval === undefined ? {} : { planApproval }) }) };
  }

  development(): ManualDevelopmentController {
    return new ManualDevelopmentController(this.projectId, this.options.memory, this.options.developmentStore, this.now);
  }

  continuation(): PlanningContinuationController { return new PlanningContinuationController(this.options); }

  private async change(action: string, detail: string, mutate: (state: SupervisorState) => Promise<SupervisorState>): Promise<SupervisorState> {
    return this.options.store.update(this.projectId, async (state) => {
      if (state === undefined) throw new Error("Start supervisor intake first.");
      const next = await mutate(state);
      return { ...next, revision: state.revision + 1, events: [...state.events, { at: this.now(), action, detail }] };
    });
  }
  private phase(state: SupervisorState, ...allowed: readonly SupervisorState["phase"][]): void {
    if (!allowed.includes(state.phase)) throw new Error(`Operation is not allowed in ${state.phase}.`);
  }
  private scope(state: SupervisorState): ScopeContract {
    if (state.scope === undefined) throw new Error("Scope proposal missing.");
    return state.scope;
  }
  private planId(): string { return `${this.projectId}-plan`; }
  private async ensureScope(state: SupervisorState): Promise<void> {
    const scope = this.scope(state), memory = this.options.memory;
    const approval = state.scopeApprovalId === undefined ? undefined : await memory.get(state.scopeApprovalId);
    if (approval === undefined || approval.projectId !== this.projectId || approval.subject !== `Scope Contract ${scope.id} v${scope.version}`) throw new Error("Invalid Scope approval link.");
    const stored = await memory.getScopeContract(this.projectId, scope.version);
    if (stored === undefined) await memory.createScopeContract(scope);
    else if (!same(stored, scope)) throw new Error("Scope snapshot changed.");
    const link = await memory.getScopeApprovalRecord(this.projectId, scope.id);
    if (link === undefined) await memory.createScopeApprovalRecord({ projectId: this.projectId, scopeContractId: scope.id, approvalId: approval.id });
    else if (link.approvalId !== approval.id) throw new Error("Scope approval link changed.");
  }
  private matchesInitialized(existing: DevelopmentState, state: SupervisorState): boolean {
    return same(existing.source, state.taskProposal?.source) && existing.revision === 1 && same(existing.tasks.map(({ status: _status, ...task }) => task), state.taskProposal?.orders.map(({ task: { status: _status, ...task } }) => task));
  }
  private instruction(state: SupervisorState, taskId: string, planContent?: string): string {
    const order = state.taskProposal!.orders.find((item) => item.task.id === taskId)!;
    return ["PROPOSED WORK ORDER — no execution or completion claimed.", `Approved plan: ${state.taskProposal!.source.planId} v${state.taskProposal!.source.planVersion} (${state.taskProposal!.source.contentHash})`,
      `Task: ${order.task.id}: ${order.task.title}`, order.task.description,
      `Requirements: ${order.requirementIds.join(", ")}`, `Dependencies: ${order.task.dependsOn.join(", ") || "none"}`,
      `Artifacts: ${order.task.expectedArtifacts.join(", ")}`, `Acceptance: ${order.task.acceptanceCriteria.join("; ")}`,
      `Verification: ${order.task.verificationMethod}`, `Excluded: ${this.scope(state).excludedFeatures.map((item) => item.statement).join("; ")}`,
      `Constraints: ${this.scope(state).technicalConstraints.join("; ")}`,
      `Schedule: ${this.scope(state).scheduleConstraint ?? "unspecified"}; Budget: ${this.scope(state).budgetConstraint ?? "unspecified"}`,
      `Approved plan content:\n${planContent ?? "Unavailable; do not execute until the approved plan is loaded."}`,
      "Report artifacts and checks honestly. Stop and request a Scope change for extra features. Operator approval is required; never claim independent verification from a worker report."].join("\n");
  }
  private nextAction(state: SupervisorState, planningStatus?: string): string {
    if (state.phase === "scope_approved") {
      if (planningStatus === undefined) return "plan";
      if (planningStatus === "awaiting_approval") return "approve-plan";
      if (planningStatus === "user_approved") return "propose-tasks";
      if (planningStatus === "awaiting_user_input") return "collect-feedback";
      if (planningStatus === "awaiting_scope_change_approval") return "request-scope-change";
      return `STOP: Planning ${planningStatus}; inspect stored review/change request. Automatic resume is unavailable.`;
    }
    return ({ intake: "questions", awaiting_answers: "answer", ready_for_scope: "propose-scope", scope_proposed: "approve-scope or reject-scope", tasks_proposed: "initialize-tasks", tasks_initialized: "Use development commands for assignment, submission, verification and review." } as const)[state.phase];
  }
}
