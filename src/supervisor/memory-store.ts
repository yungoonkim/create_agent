import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertSafeProjectId } from "../planning/config.js";
import type { SupervisorState, SupervisorUsageRecord } from "./contracts.js";
import { SUPERVISOR_FAILURE_KINDS } from "./contracts.js";
import { parseSupervisorState, same } from "./validation.js";

/** One supervisor command per project. Lock covers model calls and downstream writes. */
export class FileSupervisorStore {
  readonly rootDirectory: string;
  constructor(rootDirectory: string) { this.rootDirectory = resolve(rootDirectory); }
  private path(projectId: string): string {
    assertSafeProjectId(projectId);
    return join(this.rootDirectory, "projects", projectId, "supervisor", "state.json");
  }
  async get(projectId: string): Promise<SupervisorState | undefined> {
    try { return parseSupervisorState(JSON.parse(await readFile(this.path(projectId), "utf8")), projectId); }
    catch (error) { if (isCode(error, "ENOENT")) return undefined; throw error; }
  }
  async appendUsage(record: SupervisorUsageRecord): Promise<void> {
    if ((record.failureKind !== undefined && (record.outcome !== "failure" || !SUPERVISOR_FAILURE_KINDS.includes(record.failureKind))) ||
        (record.httpStatus !== undefined && (record.outcome !== "failure" || !Number.isInteger(record.httpStatus) || record.httpStatus < 100 || record.httpStatus > 599))) throw new Error("Invalid supervisor failure metadata.");
    if (!["questions", "scope", "tasks"].includes(record.operation) || !["success", "failure"].includes(record.outcome) || record.providerId !== "vertex-ai" || record.modelId.trim().length === 0 ||
        [record.durationMs, record.inputTokens, record.outputTokens, record.reasoningTokens].some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new Error("Invalid supervisor usage record.");
    const directory = dirname(this.path(record.projectId));
    await mkdir(directory, { recursive: true });
    await appendFile(join(directory, "usage.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  }
  async update(projectId: string, mutate: (state: SupervisorState | undefined) => Promise<SupervisorState>): Promise<SupervisorState> {
    const file = this.path(projectId);
    await mkdir(dirname(file), { recursive: true });
    const lock = await open(`${file}.lock`, "wx").catch((error: unknown) => {
      if (isCode(error, "EEXIST")) throw new Error("Supervisor is locked; state was preserved.");
      throw error;
    });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const current = await this.get(projectId);
      const next = parseSupervisorState(await mutate(current), projectId);
      if (next.revision !== (current?.revision ?? 0) + 1) throw new Error("Invalid supervisor revision.");
      if (current !== undefined && (current.originalRequest !== next.originalRequest ||
          !same(next.events.slice(0, current.events.length), current.events) || next.events.length <= current.events.length ||
          current.clarifications.some((item, index) => {
            const after = next.clarifications[index];
            return after?.id !== item.id || after.question !== item.question || (item.answer !== undefined && after.answer !== item.answer);
          }))) throw new Error("Original request, answers and history are immutable.");
      const oldTaskRevisions = current?.taskRevisions ?? [], newTaskRevisions = next.taskRevisions ?? [];
      if (newTaskRevisions.length < oldTaskRevisions.length || newTaskRevisions.length > oldTaskRevisions.length + 1 ||
          !same(newTaskRevisions.slice(0, oldTaskRevisions.length), oldTaskRevisions) ||
          (newTaskRevisions.length > oldTaskRevisions.length && !same(newTaskRevisions.at(-1)!.previous, current?.taskProposal))) throw new Error("Task revision history is immutable and must preserve the previous proposal.");
      if (current?.continuations !== undefined) {
        const old = current.continuations, updated = next.continuations ?? [];
        if (updated.length < old.length || !same(updated.slice(0, Math.max(0, old.length - 1)), old.slice(0, -1))) throw new Error("Continuation history is immutable.");
        const previous = old.at(-1), after = updated[old.length - 1];
        if (previous !== undefined && after !== undefined) {
          const { status: _status, proposedScope: _scope, scopeApprovalId: _approval, ...fixed } = previous;
          const { status: _nextStatus, proposedScope: _nextScope, scopeApprovalId: _nextApproval, ...nextFixed } = after;
          if (!same(fixed, nextFixed) || (previous.proposedScope !== undefined && (!same(previous.proposedScope, after.proposedScope) || previous.scopeApprovalId !== after.scopeApprovalId)) ||
              ((previous.status === "completed" || (previous.status === "rejected" && previous.base.status !== "awaiting_scope_change_approval")) && !same(previous, after))) throw new Error("Continuation source and decisions are immutable.");
        }
      }
      await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
      await rename(temporary, file);
      return next;
    } finally {
      try { await rm(temporary, { force: true }); }
      finally { try { await lock.close(); } finally { await rm(`${file}.lock`, { force: true }); } }
    }
  }
}
function isCode(error: unknown, code: string): boolean { return error instanceof Error && "code" in error && error.code === code; }
