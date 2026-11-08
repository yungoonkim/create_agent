import type { TaskStateManager, TaskStatus } from "../core/types.js";
import type { DevelopmentState, DevelopmentTask } from "./contracts.js";
import { FileDevelopmentStore } from "./memory-store.js";
import { requireApprovedPlan } from "./plan-approval.js";
import type { PlanningApprovalStore } from "./plan-approval.js";
import { parseResult, parseReview, parseTask, text, validateGraph } from "./validation.js";

const transitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  pending: ["ready", "blocked", "cancelled"], ready: ["in_progress", "blocked", "cancelled"],
  in_progress: ["awaiting_review", "blocked", "cancelled"],
  awaiting_review: ["approved", "rework", "blocked", "cancelled"],
  approved: [], rework: ["ready", "blocked", "cancelled"], blocked: ["pending", "cancelled"], cancelled: [],
};

/** Project-scoped manual orchestration. It never invokes an Agent Runtime. */
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
    const state = await this.change(taskId, nextStatus, rationale, (task) => task);
    return findTask(state, taskId);
  }

  async assign(taskId: string, agentId: string, rationale: string): Promise<DevelopmentState> {
    text(agentId);
    return this.change(taskId, "in_progress", rationale, (task) => ({ ...task, assignedAgentId: agentId }));
  }

  async submit(taskId: string, rawResult: unknown, rationale: string): Promise<DevelopmentState> {
    const result = parseResult(rawResult);
    return this.change(taskId, "awaiting_review", rationale, (task) => {
      if (task.expectedArtifacts.some((artifact) => !result.artifacts.includes(artifact))) throw new Error("Result must list every expected artifact; claims still require manual review.");
      return { ...task, result };
    });
  }

  async review(taskId: string, rawReview: unknown, rationale: string): Promise<DevelopmentState> {
    const review = parseReview(rawReview);
    return this.change(taskId, review.passed ? "approved" : "rework", rationale, (task) => {
      if (review.passed && task.acceptanceCriteria.some((criterion) => !review.checks.some((check) => check.name === criterion && check.passed))) {
        throw new Error("Passing review must cover every acceptance criterion by name.");
      }
      return { ...task, review };
    });
  }

  private async change(
    taskId: string, next: TaskStatus, rationale: string,
    amend: (task: DevelopmentTask) => DevelopmentTask,
  ): Promise<DevelopmentState> {
    text(rationale);
    const state = await this.state();
    const source = await requireApprovedPlan(this.planning, this.projectId, state.source.planId);
    if (JSON.stringify(source) !== JSON.stringify(state.source)) throw new Error("Approved plan snapshot changed; tasks were preserved.");
    const current = findTask(state, taskId);
    if (!transitions[current.status].includes(next)) throw new Error(`Invalid task transition: ${current.status} -> ${next}.`);
    if (next === "awaiting_review" && current.result !== undefined) throw new Error("An attempt already has a submitted result.");
    const amended = amend(current);
    if (next === "approved" && (amended.review?.passed !== true || amended.result === undefined)) {
      throw new Error("Approval requires a submitted result and a passing manual review.");
    }
    if (next === "rework" && amended.review?.passed !== false) throw new Error("Rework requires a failed manual review.");
    const tasks = state.tasks.map((task): DevelopmentTask => {
      if (task.id !== taskId) return task;
      if (next === "ready" || next === "pending") {
        // Clear the current attempt; prior results remain in the immutable event snapshots.
        const { result: _result, review: _review, assignedAgentId: _assigned, ...base } = amended;
        return { ...base, status: next };
      }
      return { ...amended, status: next };
    });
    validateGraph(tasks);
    const released = next === "approved" ? releaseReady(tasks) : tasks;
    const events = [...state.events, {
      at: this.now(), taskId, action: `${current.status}->${next}`, rationale,
      before: current, after: findTask({ ...state, tasks: released }, taskId),
    }];
    for (const task of released) {
      const before = tasks.find((item) => item.id === task.id);
      if (before !== undefined && before.status !== task.status) events.push({
        at: this.now(), taskId: task.id, action: "pending->ready", rationale: "All dependencies were manually approved.", before, after: task,
      });
    }
    return this.store.save({
      ...state, revision: state.revision + 1, tasks: released, events,
    }, state.revision);
  }
}

function findTask(state: DevelopmentState, id: string): DevelopmentTask {
  const task = state.tasks.find((item) => item.id === id);
  if (task === undefined) throw new Error(`Unknown task: ${id}.`);
  return task;
}

function releaseReady(tasks: readonly DevelopmentTask[]): readonly DevelopmentTask[] {
  return tasks.map((task) => task.status === "pending" && task.dependsOn.every((id) => tasks.some((other) => other.id === id && other.status === "approved"))
    ? { ...task, status: "ready" } : task);
}
