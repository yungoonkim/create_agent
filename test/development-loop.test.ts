import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { approvePlan, FileDevelopmentStore, ManualDevelopmentController } from "../src/development/index.js";
import { parseDevelopmentState } from "../src/development/validation.js";
import { parsePlanningConfig } from "../src/planning/config.js";
import { PlanningLoopController } from "../src/planning/controller.js";
import { FakePlanningReviewer } from "../src/planning/fake-reviewer.js";
import { FakePlanningWriter } from "../src/planning/fake-writer.js";
import { FilePlanningMemoryStore } from "../src/planning/memory-store.js";
import type { ScopeContract } from "../src/planning/contracts.js";

const definitions = [
  { id: "task-a", title: "Draft", description: "Draft the scoped deliverable", dependsOn: [], expectedArtifacts: ["draft.md"], acceptanceCriteria: ["Draft addresses REQ-1"], verificationMethod: "Read draft.md against REQ-1" },
  { id: "task-b", title: "Handoff", description: "Document the approved deliverable", dependsOn: ["task-a"], expectedArtifacts: ["handoff.md"], acceptanceCriteria: ["Handoff links the approved draft"], verificationMethod: "Read handoff.md and check the link" },
];
const result = { summary: "Worker reports a draft", artifacts: ["draft.md"] };
const passing = { passed: true, summary: "Manual review accepted", checks: [{ name: "Draft addresses REQ-1", passed: true, details: "Reviewer inspected the draft and its REQ-1 section." }] };

async function harness(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), "adtf-development-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configRaw = {
    projectId: "manual-project", planning: {
      writer: { providerId: "fake", modelId: "fake-writer" }, reviewer: { providerId: "fake", modelId: "fake-reviewer" },
      maxIterations: 3, requireUserApproval: true, scenario: "improve-once",
    }, memory: { type: "file", directory: "memory" },
  };
  const config = parsePlanningConfig(configRaw, root);
  const planning = new FilePlanningMemoryStore(config.memory.directory);
  const scope: ScopeContract = {
    id: "manual-scope", projectId: config.projectId, version: 1, goal: "Plan a scoped deliverable",
    requiredFeatures: [{ id: "REQ-1", statement: "Produce a draft and handoff" }], excludedFeatures: [],
    technicalConstraints: ["Manual development only"], createdAt: "2026-11-08T00:00:00.000Z",
  };
  await planning.createScopeContract(scope);
  const scopeApproval = await planning.request(scope.projectId, `Scope Contract ${scope.id} v1`);
  await planning.recordDecision(scopeApproval.id, "approved", "TEST: explicit Scope approval in an isolated fixture.");
  await planning.createScopeApprovalRecord({ projectId: scope.projectId, scopeContractId: scope.id, approvalId: scopeApproval.id });
  const loop = new PlanningLoopController({ config, memory: planning, writer: new FakePlanningWriter(), reviewer: new FakePlanningReviewer("improve-once") });
  const run = await loop.run({ requirements: "Produce a scoped draft and handoff", scopeContract: scope });
  assert.equal(run.state.status, "awaiting_approval");
  const planId = `${scope.projectId}-plan`;
  const store = new FileDevelopmentStore(config.memory.directory);
  const controller = new ManualDevelopmentController(scope.projectId, planning, store);
  await writeFile(join(root, "config.json"), JSON.stringify(configRaw));
  return { root, config, planning, scope, run, planId, store, controller };
}

test("pending final approval blocks development; approval binds exact current plan", async (t) => {
  const h = await harness(t);
  await assert.rejects(h.controller.initialize(h.planId, definitions), /user-approved/);
  await assert.rejects(approvePlan(h.planning, h.scope.projectId, "wrong-plan", "TEST approval"), /match/);
  const source = await approvePlan(h.planning, h.scope.projectId, h.planId, "TEST final approval");
  assert.equal(source.planVersion, 2);
  assert.equal((await h.planning.getPlanningLoopState(h.scope.projectId))?.status, "user_approved");
  assert.deepEqual(await approvePlan(h.planning, h.scope.projectId, h.planId, "TEST retry"), source);
  await h.controller.initialize(h.planId, definitions);
  await assert.rejects(h.controller.initialize(h.planId, definitions), /revision conflict/);
});

test("manual assignment, submission and review release only approved dependencies", async (t) => {
  const h = await harness(t);
  await approvePlan(h.planning, h.scope.projectId, h.planId, "TEST final approval");
  const state = await h.controller.initialize(h.planId, definitions);
  assert.deepEqual(state.tasks.map((task) => task.status), ["ready", "pending"]);
  await assert.rejects(h.controller.assign("task-b", "worker", "Premature"), /transition/);
  await h.controller.assign("task-a", "worker-a", "Manual delegation");
  await h.controller.submit("task-a", result, "Reported output; review still required");
  assert.equal((await h.controller.get("task-b"))?.status, "pending");
  await h.controller.review("task-a", passing, "Reviewer inspected output");
  assert.deepEqual((await h.controller.state()).tasks.map((task) => task.status), ["approved", "ready"]);
  assert.equal((await h.controller.state()).events.at(-1)?.action, "pending->ready");
  const restarted = new ManualDevelopmentController(h.scope.projectId, h.planning, new FileDevelopmentStore(h.config.memory.directory));
  assert.deepEqual(await restarted.state(), await h.controller.state());
});

test("graphs reject cycles, duplicates, unknown dependencies and foreign or preapproved tasks", async (t) => {
  const h = await harness(t);
  await approvePlan(h.planning, h.scope.projectId, h.planId, "TEST final approval");
  const first = definitions[0]!;
  for (const tasks of [
    [], [first, first], [{ ...first, dependsOn: [first.id] }], [{ ...first, dependsOn: ["missing"] }],
    [{ ...first, dependsOn: ["task-b"] }, definitions[1]], [{ ...first, projectId: "other" }],
    [{ ...first, status: "approved" }], [{ ...first, result }], [{ ...first, id: "../escape" }],
  ]) await assert.rejects(h.controller.initialize(h.planId, tasks));
  assert.equal(await h.store.get(h.scope.projectId), undefined);
});

test("state transitions cannot bypass assignment, results, review, or acceptance coverage", async (t) => {
  const h = await harness(t);
  await approvePlan(h.planning, h.scope.projectId, h.planId, "TEST final approval");
  await h.controller.initialize(h.planId, definitions);
  await assert.rejects(h.controller.transition("task-a", "in_progress", "Bypass assignment"), /assigned agent/);
  await h.controller.assign("task-a", "worker", "Delegated");
  await assert.rejects(h.controller.transition("task-a", "awaiting_review", "Bypass output"), /submitted result/);
  await assert.rejects(h.controller.submit("task-a", { ...result, artifacts: [] }, "Invalid output"));
  await assert.rejects(h.controller.submit("task-a", { ...result, artifacts: ["other.md"] }, "Wrong output"));
  await h.controller.submit("task-a", result, "Submitted");
  const revision = (await h.controller.state()).revision;
  await assert.rejects(h.controller.transition("task-a", "approved", "Bypass review"), /passing manual review/);
  await assert.rejects(h.controller.review("task-a", { ...passing, checks: [] }, "No checks"));
  await assert.rejects(h.controller.review("task-a", { ...passing, checks: [{ name: "Other check", passed: true, details: "Checked" }] }, "Missing criterion"), /every acceptance/);
  await assert.rejects(h.controller.review("task-a", { ...passing, checks: [{ name: "Draft addresses REQ-1", passed: false, details: "Missing" }] }, "Contradiction"), /failed check/);
  assert.equal((await h.controller.state()).revision, revision);
});

test("failed manual review retains history through explicit rework and fresh attempts", async (t) => {
  const h = await harness(t);
  await approvePlan(h.planning, h.scope.projectId, h.planId, "TEST final approval");
  await h.controller.initialize(h.planId, definitions);
  await h.controller.assign("task-a", "worker", "Delegated");
  await h.controller.submit("task-a", result, "Submitted");
  const failed = { passed: false, summary: "Missing required details", checks: [{ name: "Draft addresses REQ-1", passed: false, details: "REQ-1 is absent" }] };
  await h.controller.review("task-a", failed, "Manual inspection failed");
  assert.equal((await h.controller.get("task-a"))?.status, "rework");
  assert.equal((await h.controller.get("task-b"))?.status, "pending");
  await h.controller.transition("task-a", "ready", "Explicitly allow another manual attempt");
  const state = await h.controller.state();
  assert.equal(state.tasks[0]?.result, undefined);
  assert.deepEqual(state.events.at(-1)?.before?.result, result);
  assert.equal(state.events.at(-1)?.before?.review?.passed, false);
  await h.controller.assign("task-a", "worker-2", "New delegation");
  await h.controller.submit("task-a", result, "Corrected output");
  assert.equal((await h.controller.get("task-a"))?.review, undefined);
});

test("blocking, resuming and cancelling require legal manual transitions", async (t) => {
  const h = await harness(t);
  await approvePlan(h.planning, h.scope.projectId, h.planId, "TEST final approval");
  await h.controller.initialize(h.planId, definitions);
  await h.controller.transition("task-a", "blocked", "Environment unavailable");
  await assert.rejects(h.controller.assign("task-a", "worker", "Cannot run"), /transition/);
  await h.controller.transition("task-a", "pending", "Environment restored");
  await h.controller.transition("task-a", "ready", "Dependencies checked");
  await h.controller.transition("task-a", "cancelled", "User cancelled");
  await assert.rejects(h.controller.transition("task-a", "ready", "Cannot resurrect"), /transition/);
  await assert.rejects(h.controller.transition("task-b", "ready", "Dependency cancelled"), /dependencies/);
});

test("a changed or no-longer-approved plan blocks further mutations without losing tasks", async (t) => {
  const h = await harness(t);
  await approvePlan(h.planning, h.scope.projectId, h.planId, "TEST final approval");
  await h.controller.initialize(h.planId, definitions);
  const before = await h.controller.state();
  const file = join(h.config.memory.directory, "projects", h.scope.projectId, "planning", "plans", h.planId, "v2.json");
  const plan = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...plan, content: "Tampered content" }));
  await assert.rejects(h.controller.assign("task-a", "worker", "Changed plan"), /snapshot changed/);
  assert.deepEqual(await h.controller.state(), before);
});

test("demo Scope approvals cannot authorize development", async (t) => {
  const h = await harness(t);
  const link = await h.planning.getScopeApprovalRecord(h.scope.projectId, h.scope.id);
  const file = join(h.config.memory.directory, "approvals", `${link!.approvalId}.json`);
  const approval = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...approval, rationale: "DEMO FIXTURE: not a real decision" }));
  await assert.rejects(approvePlan(h.planning, h.scope.projectId, h.planId, "TEST final approval"), /real approved Scope/);
});

test("rejected final approval cannot be silently changed to approved", async (t) => {
  const h = await harness(t);
  assert.equal(h.run.state.status, "awaiting_approval");
  if (h.run.state.status !== "awaiting_approval") throw new Error("Expected pending approval.");
  await h.planning.recordDecision(h.run.state.approvalId, "rejected", "TEST user rejection");
  await assert.rejects(approvePlan(h.planning, h.scope.projectId, h.planId, "Cannot override"), /rejected/);
  await assert.rejects(h.controller.initialize(h.planId, definitions), /user-approved/);
});

test("changed Scope content and a new planning approval state block existing task mutations", async (t) => {
  const h = await harness(t);
  await approvePlan(h.planning, h.scope.projectId, h.planId, "TEST final approval");
  await h.controller.initialize(h.planId, definitions);
  const file = join(h.config.memory.directory, "projects", h.scope.projectId, "scope", "v1.json");
  await writeFile(file, JSON.stringify({ ...h.scope, goal: "Tampered scope" }));
  await assert.rejects(h.controller.assign("task-a", "worker", "Changed Scope"), /snapshot changed/);
  await writeFile(file, JSON.stringify(h.scope));
  await h.planning.savePlanningLoopState(h.run.state);
  await assert.rejects(h.controller.assign("task-a", "worker", "Approval no longer current"), /user-approved/);
  assert.equal((await h.controller.get("task-a"))?.status, "ready");
});

test("optimistic revisions and file locks prevent simultaneous task mutations", async (t) => {
  const h = await harness(t);
  await approvePlan(h.planning, h.scope.projectId, h.planId, "TEST final approval");
  const state = await h.controller.initialize(h.planId, definitions);
  const writes = await Promise.allSettled([
    h.controller.assign("task-a", "worker-1", "Concurrent delegation one"),
    h.controller.assign("task-a", "worker-2", "Concurrent delegation two"),
  ]);
  assert.equal(writes.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(writes.filter((item) => item.status === "rejected").length, 1);
  const current = await h.controller.state();
  assert.equal(current.revision, 2);
  await assert.rejects(h.store.save({ ...state, revision: 2 }, 1), /revision conflict/);
  const lock = join(h.config.memory.directory, "projects", h.scope.projectId, "development", "state.json.lock");
  await writeFile(lock, "interrupted writer");
  await assert.rejects(h.controller.transition("task-a", "blocked", "Lock present"), /locked/);
  assert.equal(await readFile(lock, "utf8"), "interrupted writer");
  assert.deepEqual(await h.controller.state(), current);
});

test("persisted state rejects corrupt versions, missing project, false approval and edited history", async (t) => {
  const h = await harness(t);
  await approvePlan(h.planning, h.scope.projectId, h.planId, "TEST final approval");
  const state = await h.controller.initialize(h.planId, definitions);
  assert.throws(() => parseDevelopmentState({ ...state, schemaVersion: 2 }, h.scope.projectId));
  assert.throws(() => parseDevelopmentState(state, "other-project"));
  assert.throws(() => parseDevelopmentState({ ...state, tasks: [{ ...state.tasks[0], status: "approved" }] }, h.scope.projectId));
  assert.throws(() => parseDevelopmentState({ ...state, tasks: [{ ...state.tasks[0], projectId: undefined }] }, h.scope.projectId));
  await assert.rejects(h.store.save({ ...state, revision: 2, events: [{ at: new Date().toISOString(), action: "replace", rationale: "Overwrite history" }] }, 1), /immutable/);
  await assert.rejects(h.store.get("../escape"));
  await assert.rejects(h.store.save({ ...state, revision: 2, tasks: state.tasks.map((task) => ({ ...task, title: "Changed definition" })), events: [...state.events, { at: new Date().toISOString(), action: "edit", rationale: "Changed" }] }, 1), /immutable/);
});

test("CLI completes final approval and manual development in an isolated offline project", async (t) => {
  const h = await harness(t);
  const cliPath = resolve("dist/src/cli/development.js");
  function cli(command: string, args: string[] = [], input?: string) {
    const response = spawnSync(process.execPath, [cliPath, command, "--config", "config.json", ...args], { cwd: h.root, encoding: "utf8", ...(input === undefined ? {} : { input }) });
    assert.equal(response.status, 0, response.stderr);
    return response.stdout;
  }
  const denied = spawnSync(process.execPath, [cliPath, "plan-approve", "--config", "config.json", "--plan", h.planId, "--reason", "TEST"], { cwd: h.root, encoding: "utf8", input: "NO\n" });
  assert.equal(denied.status, 1);
  assert.equal((await h.planning.getPlanningLoopState(h.scope.projectId))?.status, "awaiting_approval");
  cli("plan-approve", ["--plan", h.planId, "--reason", "TEST explicit final decision"], `APPROVE ${h.planId} v2\n`);
  await writeFile(join(h.root, "tasks.json"), JSON.stringify(definitions));
  cli("init", ["--plan", h.planId, "--file", "tasks.json"]);
  cli("assign", ["--task", "task-a", "--agent", "worker", "--reason", "Manual delegation"]);
  await writeFile(join(h.root, "result.json"), JSON.stringify(result));
  cli("submit", ["--task", "task-a", "--file", "result.json", "--reason", "Worker report"]);
  await writeFile(join(h.root, "review.json"), JSON.stringify(passing));
  cli("review", ["--task", "task-a", "--file", "review.json", "--reason", "Manual inspection"]);
  const state = JSON.parse(cli("list"));
  assert.equal(state.tasks[0].status, "approved");
  assert.equal(state.tasks[1].status, "ready");
});
