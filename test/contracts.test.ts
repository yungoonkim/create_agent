import assert from "node:assert/strict";
import test from "node:test";
import type {
  ApprovalRecord,
  LlmModelConfig,
  LoopPolicy,
  ProjectRecord,
  RuntimeModelCompatibility,
  RuntimeTarget,
  TaskRecord,
} from "../src/core/types.js";

test("core records can be represented without a runtime or provider dependency", () => {
  const project = {
    id: "project-1",
    name: "Example",
    goals: [{ id: "goal-1", statement: "Deliver an approved outcome" }],
    createdAt: "2026-01-01T00:00:00.000Z",
  } satisfies ProjectRecord;
  const task = {
    id: "task-1",
    projectId: project.id,
    title: "Define scope",
    description: "Prepare a reviewable plan",
    status: "pending",
    dependsOn: [],
  } satisfies TaskRecord;
  const approval = {
    id: "approval-1",
    projectId: project.id,
    subject: "Project plan",
    status: "pending",
  } satisfies ApprovalRecord;
  const policy = { maxIterations: 3, stopOnUserRejection: true } satisfies LoopPolicy;
  const model = { providerId: "provider-example", modelId: "model-example" } satisfies LlmModelConfig;
  const runtime = { runtimeId: "codex", model } satisfies RuntimeTarget;
  const compatibility = {
    runtimeId: runtime.runtimeId,
    providerId: model.providerId,
    modelId: model.modelId,
    status: "unknown",
  } satisfies RuntimeModelCompatibility;

  assert.equal(task.projectId, approval.projectId);
  assert.equal(policy.maxIterations, 3);
  assert.equal(compatibility.status, "unknown");
});
