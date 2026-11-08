import type { AgentResult, TaskStatus, VerificationResult } from "../core/types.js";
import { assertSafeProjectId, assertSafeStorageId } from "../planning/config.js";
import type { DevelopmentState, DevelopmentTask } from "./contracts.js";
import { artifactPath, count, hash, parseVerificationEvidence, parseVerificationProfile } from "../verification/validation.js";

export const statuses: readonly TaskStatus[] = ["pending", "ready", "in_progress", "awaiting_review", "blocked", "approved", "rework", "cancelled"];

export function record(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Expected a JSON object.");
  return raw as Record<string, unknown>;
}

export function text(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) throw new Error("Expected a nonempty string.");
  return raw;
}

export function strings(raw: unknown, nonempty = false): string[] {
  if (!Array.isArray(raw) || (nonempty && raw.length === 0)) throw new Error("Expected an array of strings.");
  return raw.map((item: unknown) => text(item));
}

function positive(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 1) throw new Error("Expected a positive integer.");
  return raw;
}

export function parseResult(raw: unknown): AgentResult {
  const value = record(raw);
  return { summary: text(value.summary), artifacts: strings(value.artifacts, true) };
}

export function parseReview(raw: unknown): VerificationResult {
  const value = record(raw);
  if (typeof value.passed !== "boolean" || !Array.isArray(value.checks) || value.checks.length === 0) {
    throw new Error("A manual review needs passed and at least one check.");
  }
  const checks = value.checks.map((rawCheck: unknown) => {
    const check = record(rawCheck);
    if (typeof check.passed !== "boolean") throw new Error("Invalid check result.");
    return { name: text(check.name), passed: check.passed, details: text(check.details) };
  });
  if (new Set(checks.map((check) => check.name)).size !== checks.length) throw new Error("Duplicate review check.");
  if (value.passed && checks.some((check) => !check.passed)) throw new Error("A failed check cannot pass review.");
  return { passed: value.passed, summary: text(value.summary), checks };
}

export function parseTask(raw: unknown, projectId: string, initial = false): DevelopmentTask {
  const value = record(raw);
  const id = text(value.id);
  assertSafeStorageId(id, "Task ID");
  if ((!initial || value.projectId !== undefined) && value.projectId !== projectId) throw new Error("Task belongs to another project.");
  const status = initial ? "pending" : text(value.status);
  if (!statuses.includes(status as TaskStatus)) throw new Error("Unknown task status.");
  if (initial && (value.assignedAgentId !== undefined || value.result !== undefined || value.review !== undefined || (value.status !== undefined && value.status !== "pending"))) {
    throw new Error("New tasks must be pending and have no assignment, result or review.");
  }
  const profile = value.verificationProfile === undefined ? undefined : parseVerificationProfile(value.verificationProfile);
  if (initial && [value.attemptCount, value.reworkCount, value.evidence, value.blockReason].some((item) => item !== undefined)) throw new Error("New tasks cannot import attempts or evidence.");
  if (profile === undefined && [value.maxReworkAttempts, value.attemptCount, value.reworkCount, value.evidence, value.blockReason].some((item) => item !== undefined)) throw new Error("Evidence fields require a verification profile.");
  const maxReworkAttempts = profile === undefined ? undefined : count(value.maxReworkAttempts, 100);
  const attemptCount = profile === undefined ? undefined : initial ? 0 : count(value.attemptCount);
  const reworkCount = profile === undefined ? undefined : initial ? 0 : count(value.reworkCount);
  if (reworkCount !== undefined && (reworkCount > maxReworkAttempts! || reworkCount > attemptCount!)) throw new Error("Inconsistent rework counters.");
  if (value.blockReason !== undefined && (status !== "blocked" || !["environment", "verification_limit", "manual"].includes(String(value.blockReason)))) throw new Error("Invalid blocked task reason.");
  const task: DevelopmentTask = {
    id, projectId, status: status as TaskStatus,
    title: text(value.title), description: text(value.description),
    dependsOn: strings(value.dependsOn), expectedArtifacts: strings(value.expectedArtifacts, true),
    acceptanceCriteria: strings(value.acceptanceCriteria, true), verificationMethod: text(value.verificationMethod),
    ...(value.assignedAgentId === undefined ? {} : { assignedAgentId: text(value.assignedAgentId) }),
    ...(value.result === undefined ? {} : { result: parseResult(value.result) }),
    ...(value.review === undefined ? {} : { review: parseReview(value.review) }),
    ...(profile === undefined ? {} : { verificationProfile: profile, maxReworkAttempts: maxReworkAttempts!, attemptCount: attemptCount!, reworkCount: reworkCount! }),
    ...(value.evidence === undefined ? {} : { evidence: parseVerificationEvidence(value.evidence) }),
    ...(value.blockReason === undefined ? {} : { blockReason: value.blockReason as "environment" | "verification_limit" | "manual" }),
  };
  if (profile !== undefined) {
    task.expectedArtifacts.forEach(artifactPath);
    if (["in_progress", "awaiting_review", "approved", "rework"].includes(task.status) && attemptCount! < 1) throw new Error("Active profiled tasks require an assignment attempt.");
    if (task.status === "rework" && reworkCount! >= maxReworkAttempts!) throw new Error("An exhausted rework allowance must block the task.");
    const evidence = task.evidence;
    if (evidence !== undefined) {
      if (task.result === undefined || evidence.projectId !== projectId || evidence.taskId !== id || evidence.attempt !== attemptCount || evidence.resultHash !== hash(task.result) || evidence.profileHash !== hash(profile)) {
        throw new Error("Evidence does not match the task, attempt or submitted result.");
      }
      if (evidence.outcome === "passed") {
        const paths = new Set([...task.expectedArtifacts, ...profile.inputFiles]);
        if (evidence.artifacts.length !== paths.size || evidence.artifacts.some((item) => !paths.has(item.path)) ||
            JSON.stringify(evidence.commands.map((item) => item.id)) !== JSON.stringify(profile.commandIds)) throw new Error("Passing evidence must cover every declared input and command.");
      }
    }
    if (task.status === "approved" && evidence?.outcome !== "passed") throw new Error("Profiled approval requires passing collected evidence.");
  }
  if (["in_progress", "awaiting_review", "approved", "rework"].includes(task.status) && task.assignedAgentId === undefined) {
    throw new Error("Active tasks require an assigned agent.");
  }
  if (["awaiting_review", "approved", "rework"].includes(task.status) && task.result === undefined) {
    throw new Error("Review states require a submitted result.");
  }
  if (task.status === "approved" && task.review?.passed !== true) throw new Error("Approved task needs a passing review.");
  if (task.status === "approved" && task.acceptanceCriteria.some((criterion) => !task.review?.checks.some((check) => check.name === criterion && check.passed))) {
    throw new Error("Approved task must cover every acceptance criterion.");
  }
  if (task.result !== undefined && task.expectedArtifacts.some((artifact) => !task.result?.artifacts.includes(artifact))) throw new Error("Submitted result is missing an expected artifact.");
  if (task.status === "rework" && task.review?.passed !== false) throw new Error("Rework needs a failed review.");
  return task;
}

export function validateGraph(tasks: readonly DevelopmentTask[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (byId.size !== tasks.length || tasks.length === 0) throw new Error("Task IDs must be unique; at least one task is required.");
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(task: DevelopmentTask): void {
    if (visiting.has(task.id)) throw new Error("Cyclic task dependency.");
    if (visited.has(task.id)) return;
    visiting.add(task.id);
    if (new Set(task.dependsOn).size !== task.dependsOn.length) throw new Error("Duplicate dependency.");
    for (const id of task.dependsOn) {
      const dependency = byId.get(id);
      if (dependency === undefined) throw new Error(`Unknown dependency: ${id}.`);
      visit(dependency);
    }
    visiting.delete(task.id);
    visited.add(task.id);
  }
  for (const task of tasks) visit(task);
  for (const task of tasks) {
    if (["ready", "in_progress", "awaiting_review", "approved", "rework"].includes(task.status) &&
        task.dependsOn.some((id) => byId.get(id)?.status !== "approved")) {
      throw new Error("Task dependencies must be approved before execution or review.");
    }
  }
}

export function parseDevelopmentState(raw: unknown, expectedProjectId: string): DevelopmentState {
  const value = record(raw);
  assertSafeProjectId(expectedProjectId);
  if (value.schemaVersion !== 1 || value.projectId !== expectedProjectId) throw new Error("Unsupported development state or project mismatch.");
  const source = record(value.source);
  const planId = text(source.planId);
  const scopeContractId = text(source.scopeContractId);
  const approvalId = text(source.approvalId);
  [planId, scopeContractId, approvalId].forEach((id) => assertSafeStorageId(id));
  const contentHash = text(source.contentHash);
  if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new Error("Invalid plan content hash.");
  if (!Array.isArray(value.tasks) || !Array.isArray(value.events) || value.events.length === 0) throw new Error("Missing tasks or history.");
  const tasks = value.tasks.map((item: unknown) => parseTask(item, expectedProjectId));
  validateGraph(tasks);
  for (const task of tasks) {
    if (task.evidence !== undefined && task.evidence.sourceHash !== contentHash) throw new Error("Evidence belongs to a different approved source snapshot.");
  }
  return {
    schemaVersion: 1, projectId: expectedProjectId, revision: positive(value.revision),
    source: { planId, planVersion: positive(source.planVersion), scopeContractId, scopeVersion: positive(source.scopeVersion), approvalId, contentHash },
    tasks,
    events: value.events.map((rawEvent: unknown) => {
      const event = record(rawEvent);
      const at = text(event.at);
      if (Number.isNaN(Date.parse(at))) throw new Error("Invalid history timestamp.");
      if (event.taskId !== undefined && !tasks.some((task) => task.id === event.taskId)) throw new Error("Unknown history task.");
      for (const snapshot of [event.before, event.after]) {
        if (snapshot !== undefined && record(snapshot).id !== event.taskId) throw new Error("History task snapshot mismatch.");
        if (snapshot !== undefined && record(snapshot).evidence !== undefined && record(record(snapshot).evidence).sourceHash !== contentHash) throw new Error("Historical evidence source mismatch.");
      }
      return {
        at, action: text(event.action), rationale: text(event.rationale),
        ...(event.taskId === undefined ? {} : { taskId: text(event.taskId) }),
        ...(event.before === undefined ? {} : { before: parseTask(event.before, expectedProjectId) }),
        ...(event.after === undefined ? {} : { after: parseTask(event.after, expectedProjectId) }),
      };
    }),
  };
}
