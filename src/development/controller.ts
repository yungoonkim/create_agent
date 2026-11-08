import type { TaskStateManager, TaskStatus } from "../core/types.js";
import type { DevelopmentState, DevelopmentTask } from "./contracts.js";
import { FileDevelopmentStore } from "./memory-store.js";
import { requireApprovedPlan } from "./plan-approval.js";
import type { PlanningApprovalStore } from "./plan-approval.js";
import { parseResult, parseReview, parseTask, text, validateGraph } from "./validation.js";
import type { EvidenceVerificationEngine } from "../verification/contracts.js";
import { assertEvidenceCurrent } from "../verification/files.js";
import { parseVerificationEvidence } from "../verification/validation.js";

const transitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  pending: ["ready", "blocked", "cancelled"], ready: ["in_progress", "blocked", "cancelled"],
  in_progress: ["awaiting_review", "blocked", "cancelled"],
  awaiting_review: ["approved", "rework", "blocked", "cancelled"],
  approved: [], rework: ["ready", "blocked", "cancelled"], blocked: ["pending", "cancelled"], cancelled: [],
};
type NextStatus = TaskStatus | ((task: DevelopmentTask) => TaskStatus);

/** Supervisory state management. Assignment never invokes an Agent Runtime. */
export class ManualDevelopmentController implements TaskStateManager {
  constructor(
    private readonly projectId: string,
    private readonly planning: PlanningApprovalStore,
    private readonly store: FileDevelopmentStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async initialize(planId: string, rawTasks: unknown): Promise<DevelopmentState> {
    const source = await requireApprovedPlan(this.planning, this.projectId, planId);
    if (!Array.isArray(rawTasks)) throw new Error("Task definitions must be a JSON array.");
    const tasks = rawTasks.map((raw: unknown) => parseTask(raw, this.projectId, true));
    validateGraph(tasks);
    return this.store.save({
      schemaVersion: 1, projectId: this.projectId, revision: 1, source,
      tasks: releaseReady(tasks),
      events: [{ at: this.now(), action: "initialize", rationale: `Manual task breakdown from approved plan ${planId}.` }],
    }, 0);
  }

  async state(): Promise<DevelopmentState> {
    const state = await this.store.get(this.projectId);
    if (state === undefined) throw new Error("Development tasks have not been initialized.");
    return state;
  }

  async get(taskId: string): Promise<DevelopmentTask | undefined> {
    return (await this.state()).tasks.find((task) => task.id === taskId);
  }

  async transition(taskId: string, nextStatus: TaskStatus, rationale: string): Promise<DevelopmentTask> {
    return findTask(await this.change(taskId, nextStatus, rationale, (task) => task), taskId);
  }

  async assign(taskId: string, agentId: string, rationale: string): Promise<DevelopmentState> {
    text(agentId);
    return this.change(taskId, "in_progress", rationale, (task) => ({
      ...task, assignedAgentId: agentId,
      ...(task.verificationProfile === undefined ? {} : { attemptCount: (task.attemptCount ?? 0) + 1 }),
    }));
  }

  async submit(taskId: string, rawResult: unknown, rationale: string): Promise<DevelopmentState> {
    const result = parseResult(rawResult);
    return this.change(taskId, "awaiting_review", rationale, (task) => {
      if (task.expectedArtifacts.some((artifact) => !result.artifacts.includes(artifact))) throw new Error("Result must list every expected artifact; claims still require review.");
      return { ...task, result };
    });
  }

  async verify(taskId: string, engine: EvidenceVerificationEngine, rationale: string): Promise<DevelopmentState> {
    text(rationale);
    const previous = await this.state();
    // Keep the project lock throughout collection so duplicate commands cannot run concurrently.
    return this.store.update(this.projectId, previous.revision, async (state) => {
      if (state === undefined) throw new Error("Development state disappeared.");
      await this.assertSource(state);
      const task = findTask(state, taskId);
      if (task.status !== "awaiting_review" || task.result === undefined || task.verificationProfile === undefined) {
        throw new Error("Verify requires a profiled task awaiting review with a submitted result.");
      }
      const evidence = parseVerificationEvidence(await engine.verify(task, task.result));
      await this.assertSource(state);
      const amended = parseTask({ ...task, evidence }, this.projectId);
      let next: TaskStatus = "awaiting_review";
      let decision = amended;
      if (evidence.outcome === "failed") {
        next = failureStatus(task);
        decision = { ...amended, review: { passed: false, summary: evidence.summary, checks: evidence.checks }, ...(next === "blocked" ? { blockReason: "verification_limit" } : {}) };
      } else if (evidence.outcome === "blocked") {
        next = "blocked";
        decision = { ...amended, blockReason: "environment" };
      }
      return this.nextState(state, task, decision, next, rationale, `verify:${evidence.outcome}`, true);
    });
  }

  async review(taskId: string, rawReview: unknown, rationale: string): Promise<DevelopmentState> {
    const review = parseReview(rawReview);
    return this.change(taskId, review.passed ? "approved" : failureStatus, rationale, async (task) => {
      if (review.passed && task.acceptanceCriteria.some((criterion) => !review.checks.some((check) => check.name === criterion && check.passed))) {
        throw new Error("Passing review must cover every acceptance criterion by name.");
      }
      if (task.verificationProfile !== undefined && review.passed) {
        if (task.evidence?.outcome !== "passed") throw new Error("Collected passing verification evidence is required before approval.");
      }
      return {
        ...task, review,
        ...(!review.passed && failureStatus(task) === "blocked" ? { blockReason: "verification_limit" as const } : {}),
      };
    });
  }

  private async assertSource(state: DevelopmentState): Promise<void> {
    const source = await requireApprovedPlan(this.planning, this.projectId, state.source.planId);
    if (JSON.stringify(source) !== JSON.stringify(state.source)) throw new Error("Approved plan snapshot changed; tasks were preserved.");
  }

  private async change(taskId: string, desired: NextStatus, rationale: string, amend: (task: DevelopmentTask) => DevelopmentTask | Promise<DevelopmentTask>): Promise<DevelopmentState> {
    text(rationale);
    const previous = await this.state();
    return this.store.update(this.projectId, previous.revision, async (state) => {
      if (state === undefined) throw new Error("Development state disappeared.");
      await this.assertSource(state);
      const current = findTask(state, taskId);
      const next = typeof desired === "function" ? desired(current) : desired;
      const updated = await this.nextState(state, current, await amend(current), next, rationale, `${current.status}->${next}`);
      await this.assertSource(state);
      return updated;
    });
  }

  private async nextState(state: DevelopmentState, current: DevelopmentTask, amended: DevelopmentTask, next: TaskStatus, rationale: string, action: string, verification = false): Promise<DevelopmentState> {
    if (!(verification && next === "awaiting_review") && !transitions[current.status].includes(next)) throw new Error(`Invalid task transition: ${current.status} -> ${next}.`);
    if (current.blockReason === "verification_limit" && next !== "cancelled") throw new Error("Rework limit reached; this task cannot be resumed by a state reset.");
    if (next === "awaiting_review" && current.result !== undefined && !verification) throw new Error("An attempt already has a submitted result.");
    if (next === "approved" && (amended.review?.passed !== true || amended.result === undefined)) throw new Error("Approval requires a submitted result and a passing manual review.");
    if (next === "approved" && amended.verificationProfile !== undefined) {
      if (amended.evidence?.outcome !== "passed") throw new Error("Collected passing verification evidence is required before approval.");
      await assertEvidenceCurrent(amended.evidence);
    }
    if (next === "rework" && amended.review?.passed !== false) throw new Error("Rework requires a failed review.");
    let changed = amended;
    if (next === "ready" || next === "pending") {
      const needsRework = current.verificationProfile !== undefined && (current.review?.passed === false || current.evidence?.outcome === "failed");
      if (needsRework && (current.reworkCount ?? 0) >= (current.maxReworkAttempts ?? 0)) throw new Error("Rework limit reached.");
      const { result: _result, review: _review, assignedAgentId: _assigned, evidence: _evidence, blockReason: _reason, ...base } = changed;
      changed = { ...base, ...(needsRework ? { reworkCount: (current.reworkCount ?? 0) + 1 } : {}) };
    }
    if (next !== "blocked") {
      const { blockReason: _reason, ...base } = changed;
      changed = base;
    } else if (changed.verificationProfile !== undefined && changed.blockReason === undefined) {
      changed = { ...changed, blockReason: "manual" };
    }
    const tasks = state.tasks.map((task): DevelopmentTask => task.id === current.id ? { ...changed, status: next } : task);
    validateGraph(tasks);
    const released = next === "approved" ? releaseReady(tasks) : tasks;
    const events = [...state.events, { at: this.now(), taskId: current.id, action, rationale, before: current, after: findTask({ ...state, tasks: released }, current.id) }];
    for (const task of released) {
      const before = tasks.find((item) => item.id === task.id);
      if (before !== undefined && before.status !== task.status) events.push({ at: this.now(), taskId: task.id, action: "pending->ready", rationale: "All dependencies were approved.", before, after: task });
    }
    return { ...state, revision: state.revision + 1, tasks: released, events };
  }
}

function failureStatus(task: DevelopmentTask): TaskStatus {
  return task.verificationProfile !== undefined && (task.reworkCount ?? 0) >= (task.maxReworkAttempts ?? 0) ? "blocked" : "rework";
}
function findTask(state: DevelopmentState, id: string): DevelopmentTask {
  const task = state.tasks.find((item) => item.id === id);
  if (task === undefined) throw new Error(`Unknown task: ${id}.`);
  return task;
}
function releaseReady(tasks: readonly DevelopmentTask[]): readonly DevelopmentTask[] {
  return tasks.map((task) => task.status === "pending" && task.dependsOn.every((id) => tasks.some((other) => other.id === id && other.status === "approved")) ? { ...task, status: "ready" } : task);
}
