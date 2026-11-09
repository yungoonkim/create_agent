import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import type { GoogleGenAI } from "@google/genai";
import { SupervisorController } from "../src/supervisor/controller.js";
import { FileSupervisorStore } from "../src/supervisor/memory-store.js";
import { parseOrders, parseSupervisorState } from "../src/supervisor/validation.js";
import { GeminiSupervisorProposer } from "../src/supervisor/google-genai.js";
import type { SupervisorProposer, SupervisorUsageRecord } from "../src/supervisor/contracts.js";
import { FilePlanningMemoryStore } from "../src/planning/memory-store.js";
import { parsePlanningConfig, type FakeReviewScenario } from "../src/planning/config.js";
import { FakePlanningWriter } from "../src/planning/fake-writer.js";
import { FakePlanningReviewer } from "../src/planning/fake-reviewer.js";
import { FileDevelopmentStore } from "../src/development/memory-store.js";
import { LocalVerificationEngine } from "../src/verification/engine.js";
import { record } from "../src/development/validation.js";
import type { PlanningReviewer } from "../src/planning/contracts.js";

const passingReviewer: PlanningReviewer = { review: async (context) => ({ id: `review-${context.currentPlan.version}`,
  projectId: context.projectId, planId: context.currentPlan.id, planVersion: context.currentPlan.version,
  scopeContractId: context.approvedScope.id, scopeVersion: context.approvedScope.version, outcome: "pass", issues: [],
  suggestions: [], scopeViolation: false, userJudgmentRequired: false, reviewedAt: "2026-11-09T00:00:00Z" }) };

const request = "  작은 매장의 재고와 유통기한을 관리하고 싶어.\n";
const scopeBody = { goal: "TEST/STUB inventory CLI", requiredFeatures: [{ id: "REQ-1", statement: "Local inventory records" }, { id: "REQ-2", statement: "Expiry list" }], excludedFeatures: [{ id: "EX-1", statement: "Web UI and payments" }], technicalConstraints: ["Local JSON, no network"] };
const orders = [
  { requirementIds: ["REQ-1"], task: { id: "storage", title: "TEST/STUB storage", description: "Produce a stub storage artifact", dependsOn: [], expectedArtifacts: ["storage.txt"], acceptanceCriteria: ["Storage fixture matches"], verificationMethod: "Node assertion and manual review" } },
  { requirementIds: ["REQ-2"], task: { id: "expiry", title: "TEST/STUB expiry", description: "Produce a stub expiry artifact", dependsOn: ["storage"], expectedArtifacts: ["expiry.txt"], acceptanceCriteria: ["Expiry fixture matches"], verificationMethod: "Manual review" } },
];
const rawConfig = { projectId: "supervisor-test", planning: { writer: { providerId: "fake", modelId: "fake-writer", personaId: "planning-writer" }, reviewer: { providerId: "fake", modelId: "fake-reviewer", personaId: "planning-reviewer" }, maxIterations: 3, requireUserApproval: true, scenario: "improve-once" }, memory: { type: "file", directory: ".adtf" } };

async function harness(t: { after(fn: () => Promise<void>): void }, scenario: FakeReviewScenario = "improve-once") {
  const root = await mkdtemp(join(tmpdir(), "adtf-supervisor-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = parsePlanningConfig({ ...rawConfig, planning: { ...rawConfig.planning, scenario } }, root);
  const memory = new FilePlanningMemoryStore(config.memory.directory);
  const store = new FileSupervisorStore(config.memory.directory);
  const developmentStore = new FileDevelopmentStore(config.memory.directory);
  const seen: unknown[] = [];
  const proposer: SupervisorProposer = { questions: async () => ["재고 단위와 저장 방식은?", "유통기한 날짜 기준은?"], scope: async (context) => { seen.push(context); return scopeBody; }, tasks: async () => orders };
  const options = { config, memory, store, developmentStore, proposer, writer: new FakePlanningWriter(), reviewer: new FakePlanningReviewer(scenario) };
  const controller = new SupervisorController(options);
  const ready = async () => {
    await controller.start(request); await controller.questions();
    await controller.answer({ "Q-1": "로트별 수량, 로컬 JSON", "Q-2": "오늘까지 만료" });
    return controller.proposeScope();
  };
  const approvedScope = async () => {
    const state = await ready();
    await controller.decideScope(true, `APPROVE ${state.scope!.id} v${state.scope!.version}`, "TEST isolated explicit Scope approval");
  };
  const approvedPlan = async () => {
    await approvedScope(); await controller.plan();
    const state = await memory.getPlanningLoopState(config.projectId);
    await controller.approvePlan(`APPROVE ${config.projectId}-plan v${state!.currentPlanVersion!}`, "TEST isolated explicit plan approval");
  };
  return { root, config, memory, store, developmentStore, seen, options, controller, ready, approvedScope, approvedPlan };
}

test("unaccepted task revisions preserve prior orders and approval source, and invalidate stale acceptance", async (t) => {
  const h = await harness(t); await h.approvedPlan();
  const previous = await h.controller.proposeTasks();
  let seen: unknown;
  const fresh = new SupervisorController({ ...h.options, proposer: { ...h.options.proposer, tasks: async (context) => {
    seen = context.taskRevision;
    return orders.map((order) => ({ ...order, task: { ...order.task, description: `${order.task.description} TEST revised details` } }));
  } } });
  const revised = await fresh.reviseTasks("TEST clarify CLI and numeric rules");
  assert.deepEqual(record(seen).previousOrders, previous.taskProposal!.orders);
  assert.equal(record(seen).reason, "TEST clarify CLI and numeric rules");
  assert.deepEqual(revised.taskProposal!.source, previous.taskProposal!.source);
  assert.deepEqual(revised.taskRevisions![0]!.previous, previous.taskProposal);
  assert.match(revised.taskProposal!.orders[0]!.task.description, /revised details/);
  await assert.rejects(fresh.initializeTasks(`ACCEPT TASKS r${previous.revision}`), /revision/);
  await assert.rejects(h.store.update(h.config.projectId, async (state) => ({ ...state!, revision: state!.revision + 1, taskRevisions: state!.taskRevisions!.map((item) => ({ ...item, reason: "rewrite history" })), events: [...state!.events, { action: "bad", at: "now", detail: "bad" }] })), /immutable/);
  assert.throws(() => parseSupervisorState({ ...revised, taskRevisions: revised.taskRevisions!.map((item) => ({ ...item, previous: { ...item.previous, source: { ...item.previous.source, contentHash: "a".repeat(64) } } })) }, h.config.projectId), /different approved source/);
  await fresh.initializeTasks(`ACCEPT TASKS r${revised.revision}`);
  await assert.rejects(fresh.reviseTasks("TEST too late"), /tasks_initialized/);
});

test("invalid or stale task revisions cannot replace the current proposal or history", async (t) => {
  const h = await harness(t); await h.approvedPlan(); await h.controller.proposeTasks();
  const before = await h.store.get(h.config.projectId);
  const invalid = new SupervisorController({ ...h.options, proposer: { ...h.options.proposer, tasks: async () => [orders[0]] } });
  await assert.rejects(invalid.reviseTasks("TEST incomplete coverage"), /cover every/);
  assert.deepEqual(await h.store.get(h.config.projectId), before);
  let calls = 0;
  const guarded = new SupervisorController({ ...h.options, proposer: { ...h.options.proposer, tasks: async () => { calls++; return orders; } } });
  const state = (await h.memory.getPlanningLoopState(h.config.projectId))!;
  const file = join(h.config.memory.directory, "projects", h.config.projectId, "planning", "plans", `${h.config.projectId}-plan`, `v${state.currentPlanVersion!}.json`);
  const plan = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  await writeFile(file, JSON.stringify({ ...plan, content: "TEST changed after approval" }));
  await assert.rejects(guarded.reviseTasks("TEST stale source")); assert.equal(calls, 0);
  assert.deepEqual(await h.store.get(h.config.projectId), before);
});

test("supervisor preserves raw request and immutable answers across process-style reloads", async (t) => {
  const h = await harness(t);
  await h.controller.start(request);
  await assert.rejects(h.controller.start("replace"), /already exists/);
  await assert.rejects(h.controller.proposeScope(), /intake/);
  await h.controller.questions();
  await h.controller.answer({ "Q-1": "local JSON" });
  await assert.rejects(h.controller.proposeScope(), /awaiting_answers/);
  await assert.rejects(h.controller.answer({ "Q-1": "change" }), /already answered/);
  await assert.rejects(h.controller.answer({ unknown: "x" }), /Unknown/);
  const reloaded = new SupervisorController(h.options);
  await reloaded.answer({ "Q-2": "today inclusive" });
  const state = await reloaded.proposeScope();
  assert.equal(state.originalRequest, request);
  assert.equal(state.clarifications[0]?.answer, "local JSON");
  assert.equal(record(h.seen[0]).originalRequest, request);
  const before = await h.store.get(h.config.projectId);
  await assert.rejects(h.store.update(h.config.projectId, async (s) => ({ ...s!, originalRequest: "edited", revision: s!.revision + 1, events: [...s!.events, { at: "now", action: "bad", detail: "bad" }] })), /immutable/);
  assert.deepEqual(await h.store.get(h.config.projectId), before);
});

test("scope and final plan gates prevent premature planning and task decomposition", async (t) => {
  const h = await harness(t);
  const scope = await h.ready();
  assert.equal((await h.memory.get(scope.scopeApprovalId!))?.status, "pending");
  await assert.rejects(h.controller.plan(), /scope_proposed/);
  await assert.rejects(h.controller.decideScope(true, "APPROVE wrong v1", "TEST"), /confirmation/);
  await h.controller.decideScope(true, `APPROVE ${scope.scope!.id} v${scope.scope!.version}`, "TEST explicit approval");
  await assert.rejects(h.controller.proposeTasks(), /user-approved/);
  await h.controller.plan();
  const planning = await h.memory.getPlanningLoopState(h.config.projectId);
  assert.equal(planning?.status, "awaiting_approval");
  assert.equal(planning?.currentPlanVersion, 2);
  assert.equal(await h.memory.getRequirements(h.config.projectId), request);
  const plan = await h.memory.getPlanDraft(h.config.projectId, `${h.config.projectId}-plan`, 2);
  assert.match(plan!.content, /로트별 수량, 로컬 JSON/);
  await assert.rejects(h.controller.proposeTasks(), /user-approved/);
  await assert.rejects(h.controller.approvePlan("APPROVE wrong v2", "TEST"), /confirmation/);
  await h.controller.approvePlan(`APPROVE ${h.config.projectId}-plan v2`, "TEST explicit plan approval");
  const tasks = await h.controller.proposeTasks();
  assert.equal(tasks.taskProposal!.orders.length, 2);
  assert.equal(await h.developmentStore.get(h.config.projectId), undefined);
  await assert.rejects(h.controller.initializeTasks("ACCEPT TASKS r1"), /confirmation/);
  await h.controller.initializeTasks(`ACCEPT TASKS r${tasks.revision}`);
  assert.deepEqual((await h.controller.development().state()).tasks.map((task) => task.status), ["ready", "pending"]);
  const report = record(await h.controller.report());
  assert.equal(report.workerRuntimeConnected, false);
  assert.equal(record(report.progress).completed, false);
  assert.equal(record(report.progress).unverified, 2);
  assert.match(JSON.stringify(report.workOrders), /Web UI and payments/);
});

test("rejected Scope stays rejected; new proposal uses a distinct immutable snapshot", async (t) => {
  const h = await harness(t);
  const first = await h.ready();
  await h.controller.decideScope(false, `REJECT ${first.scope!.id} v${first.scope!.version}`, "TEST require narrower scope");
  await assert.rejects(h.controller.plan(), /ready_for_scope/);
  const next = await h.controller.proposeScope();
  assert.notEqual(next.scope!.version, first.scope!.version);
  assert.equal((await h.memory.get(first.scopeApprovalId!))?.status, "rejected");
  assert.deepEqual(await h.memory.getScopeContract(h.config.projectId, first.scope!.version), first.scope);
});

test("empty clarification proposal can proceed; failed task proposal does not alter approved source", async (t) => {
  const h = await harness(t);
  const controller = new SupervisorController({ ...h.options, proposer: { ...h.options.proposer, questions: async () => [], tasks: async () => [orders[0]] } });
  await controller.start(request); assert.equal((await controller.questions()).phase, "ready_for_scope");
  const proposed = await controller.proposeScope();
  await controller.decideScope(true, `APPROVE ${proposed.scope!.id} v${proposed.scope!.version}`, "TEST scope");
  await controller.plan(); await controller.approvePlan(`APPROVE ${h.config.projectId}-plan v2`, "TEST plan");
  const before = await h.store.get(h.config.projectId);
  await assert.rejects(controller.proposeTasks(), /every required/);
  assert.deepEqual(await h.store.get(h.config.projectId), before);
  assert.equal((await h.memory.getPlanningLoopState(h.config.projectId))?.status, "user_approved");
});

test("Scope approval interrupted after decision can finish on explicit retry", async (t) => {
  const h = await harness(t); const proposed = await h.ready();
  const original = h.memory.recordDecision.bind(h.memory);
  let fail = true;
  h.memory.recordDecision = async (...args) => { const decision = await original(...args); if (fail) { fail = false; throw new Error("TEST interrupted after decision"); } return decision; };
  const phrase = `APPROVE ${proposed.scope!.id} v${proposed.scope!.version}`;
  await assert.rejects(h.controller.decideScope(true, phrase, "TEST explicit scope"), /interrupted/);
  assert.equal((await h.memory.get(proposed.scopeApprovalId!))?.status, "approved");
  assert.equal((await h.store.get(h.config.projectId))?.phase, "scope_proposed");
  await h.controller.decideScope(true, phrase, "TEST explicit retry");
  assert.equal((await h.store.get(h.config.projectId))?.phase, "scope_approved");
});

for (const scenario of ["scope-violation", "needs-user-input", "always-revise", "stale-review"] as const) {
  test(`supervisor stops safely for Planning ${scenario} without approving or replaying`, async (t) => {
    const h = await harness(t, scenario);
    await h.approvedScope(); await h.controller.plan();
    const before = await h.memory.getPlanningLoopState(h.config.projectId);
    await assert.rejects(h.controller.approvePlan(`APPROVE ${h.config.projectId}-plan v${before!.currentPlanVersion!}`, "TEST forbidden"));
    await assert.rejects(h.controller.proposeTasks(), /user-approved/);
    await assert.rejects(h.controller.plan(), /already exists/);
    assert.deepEqual(await h.memory.getPlanningLoopState(h.config.projectId), before);
    const action = String(record(await h.controller.report()).nextAction);
    assert.match(action, scenario === "needs-user-input" ? /collect-feedback/ : scenario === "scope-violation" ? /request-scope-change/ : /STOP/);
  });
}

test("task proposals validate coverage, dependencies, completion claims and unsafe artifacts", async (t) => {
  const h = await harness(t); const state = await h.ready(); const scope = state.scope!;
  assert.throws(() => parseOrders([orders[0]], h.config.projectId, scope), /every required/);
  assert.throws(() => parseOrders([{ ...orders[0], requirementIds: ["EX-1"] }], h.config.projectId, scope), /excluded/);
  assert.throws(() => parseOrders(orders.map((o) => ({ ...o, task: { ...o.task, dependsOn: [o.task.id === "storage" ? "expiry" : "storage"] } })), h.config.projectId, scope), /cycle|cyclic/i);
  assert.throws(() => parseOrders([{ ...orders[0], task: { ...orders[0]!.task, status: "approved" } }], h.config.projectId, scope), /pending/);
  assert.throws(() => parseOrders([{ ...orders[0], task: { ...orders[0]!.task, expectedArtifacts: ["../escape"] } }], h.config.projectId, scope), /path/i);
  assert.throws(() => parseOrders([{ ...orders[0], task: { ...orders[0]!.task, verificationProfile: { commandIds: ["run"], inputFiles: [] }, maxReworkAttempts: 1 } }], h.config.projectId, scope), /operator/);
});

test("invalid model responses leave the stored workflow unchanged", async (t) => {
  const h = await harness(t);
  await h.controller.start(request);
  const controller = new SupervisorController({ ...h.options, proposer: { ...h.options.proposer, questions: async () => ({ approve: true }) } });
  await assert.rejects(controller.questions(), /array/);
  assert.equal((await h.store.get(h.config.projectId))?.phase, "intake");
  await h.controller.questions(); await h.controller.answer({ "Q-1": "x", "Q-2": "y" });
  const bad = new SupervisorController({ ...h.options, proposer: { ...h.options.proposer, scope: async () => ({ ...scopeBody, excludedFeatures: scopeBody.requiredFeatures }) } });
  await assert.rejects(bad.proposeScope(), /distinct/);
  assert.equal((await h.store.get(h.config.projectId))?.phase, "ready_for_scope");
});

test("supervisor project lock prevents duplicate model calls and releases after failure", async (t) => {
  const h = await harness(t); await h.controller.start(request);
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>((resolvePromise) => { entered = resolvePromise; });
  const gate = new Promise<void>((resolvePromise) => { release = resolvePromise; });
  const proposer = { ...h.options.proposer, questions: async () => { entered(); await gate; throw new Error("TEST provider outage"); } };
  const running = new SupervisorController({ ...h.options, proposer }).questions();
  await started;
  await assert.rejects(h.controller.questions(), /locked/);
  release(); await assert.rejects(running, /provider outage/);
  await h.controller.questions();
  assert.equal((await h.store.get(h.config.projectId))?.phase, "awaiting_answers");
});

test("accepted work orders connect to real evidence, manual review and dependency release using TEST/STUB output", async (t) => {
  const h = await harness(t); await h.approvedPlan(); await h.controller.proposeTasks();
  const configured = await h.controller.configureVerification({ storage: { verificationProfile: { commandIds: ["check"], inputFiles: [] }, maxReworkAttempts: 1 } });
  await h.controller.initializeTasks(`ACCEPT TASKS r${configured.revision}`);
  const dev = h.controller.development();
  await assert.rejects(dev.assign("expiry", "TEST-worker", "TEST dependency gate"));
  await dev.assign("storage", "TEST/STUB-worker", "TEST isolated assignment, no runtime");
  await dev.submit("storage", { summary: "TEST/STUB claimed complete", artifacts: ["storage.txt"] }, "TEST report");
  const manualReview = { passed: true, summary: "TEST inspected stub", checks: [{ name: "Storage fixture matches", passed: true, details: "TEST/STUB exact fixture checked" }] };
  await assert.rejects(dev.review("storage", manualReview, "TEST no evidence"), /evidence/);
  const workspace = join(h.root, "product"); await mkdir(workspace);
  await writeFile(join(workspace, "storage.txt"), "TEST/STUB inventory");
  const state = await dev.state();
  const engine = new LocalVerificationEngine(workspace, { commands: { check: { executable: "node", args: ["-e", "require('node:assert/strict').equal(require('node:fs').readFileSync('storage.txt','utf8'),'TEST/STUB inventory')"], timeoutMs: 5000 } } }, state.source.contentHash);
  await dev.verify("storage", engine, "TEST real Node check on stub");
  assert.equal((await dev.get("storage"))!.status, "awaiting_review");
  await dev.review("storage", manualReview, "TEST explicit acceptance");
  assert.equal((await dev.get("expiry"))!.status, "ready");
  const progress = record(record(await h.controller.report()).progress);
  assert.equal(progress.completed, false); assert.equal(progress.evidencePassed, 1); assert.equal(progress.unverified, 1);
  assert.equal(record(progress.counts).approved, 1);
});

test("interruption after downstream task initialization can be retried without duplicate tasks", async (t) => {
  const h = await harness(t); await h.approvedPlan(); const proposed = await h.controller.proposeTasks();
  const original = h.developmentStore.save.bind(h.developmentStore);
  let fail = true;
  h.developmentStore.save = async (...args) => { const state = await original(...args); if (fail) { fail = false; throw new Error("TEST interrupted after save"); } return state; };
  await assert.rejects(h.controller.initializeTasks(`ACCEPT TASKS r${proposed.revision}`), /interrupted/);
  assert.equal((await h.store.get(h.config.projectId))?.phase, "tasks_proposed");
  await h.controller.initializeTasks(`ACCEPT TASKS r${proposed.revision}`);
  assert.equal((await h.controller.development().state()).revision, 1);
});

test("failure report distinguishes failed evidence, blocked task and dependent pending work", async (t) => {
  const h = await harness(t); await h.approvedPlan(); await h.controller.proposeTasks();
  await assert.rejects(h.controller.configureVerification({ unknown: {} }), /Unknown/);
  const configured = await h.controller.configureVerification({ storage: { verificationProfile: { commandIds: ["fail"], inputFiles: [] }, maxReworkAttempts: 0 } });
  await h.controller.initializeTasks(`ACCEPT TASKS r${configured.revision}`);
  const dev = h.controller.development();
  await dev.assign("storage", "TEST/STUB-worker", "TEST isolated attempt");
  await dev.submit("storage", { summary: "TEST/STUB false success claim", artifacts: ["storage.txt"] }, "TEST report");
  const workspace = join(h.root, "product"); await mkdir(workspace); await writeFile(join(workspace, "storage.txt"), "TEST/STUB wrong data");
  await dev.verify("storage", new LocalVerificationEngine(workspace, { commands: { fail: { executable: "node", args: ["-e", "process.exit(1)"], timeoutMs: 5000 } } }, (await dev.state()).source.contentHash), "TEST actual failing check");
  const report = record(await h.controller.report()); const progress = record(report.progress), counts = record(progress.counts);
  assert.equal(counts.blocked, 1); assert.equal(counts.pending, 1); assert.equal(counts.approved, 0);
  assert.equal(progress.evidenceFailed, 1); assert.equal(progress.unverified, 1); assert.equal(progress.completed, false);
  assert.equal((await dev.get("storage"))!.blockReason, "verification_limit");
});

test("report flags stale approved source and never calls a model", async (t) => {
  const h = await harness(t); await h.approvedPlan(); const proposed = await h.controller.proposeTasks();
  await h.controller.initializeTasks(`ACCEPT TASKS r${proposed.revision}`);
  const planning = (await h.memory.getPlanningLoopState(h.config.projectId))!;
  await h.memory.savePlanningLoopState({ projectId: h.config.projectId, scopeContractId: planning.scopeContractId, scopeVersion: planning.scopeVersion, iterationCount: planning.iterationCount, maxIterations: planning.maxIterations, status: "stopped", reason: "TEST source no longer current" });
  const report = record(await h.controller.report());
  assert.equal(record(report.progress).sourceCurrent, false); assert.equal(record(report.progress).completed, false);
  assert.match(String(report.nextAction), /STOP/);
});

test("persisted data validation rejects corrupted phases and stale sources", async (t) => {
  const h = await harness(t); const state = await h.ready();
  assert.throws(() => parseSupervisorState({ ...state, phase: "tasks_initialized" }, h.config.projectId), /Task proposal/);
  assert.throws(() => parseSupervisorState({ ...state, phase: "awaiting_answers" }, h.config.projectId), /answers/);
  assert.throws(() => parseSupervisorState({ ...state, projectId: "other" }, h.config.projectId), /identity/);
});

test("Gemini proposal adapter sends bounded JSON requests without granting approval authority", async () => {
  const calls: unknown[] = [];
  const responses = [{ questions: ["질문?"] }, scopeBody, { orders }];
  const client = { models: { generateContent: async (input: unknown) => { calls.push(input); return { text: JSON.stringify(responses.shift()) }; } } } as unknown as GoogleGenAI;
  const adapter = new GeminiSupervisorProposer(client, { model: { providerId: "vertex-ai", modelId: "gemini-3.8-flash" }, personaId: "planning-writer" });
  const context = { projectId: "test", originalRequest: "TEST request", clarifications: [] };
  assert.deepEqual(await adapter.questions(context), ["질문?"]);
  assert.deepEqual(await adapter.scope(context), scopeBody);
  const scope = { ...scopeBody, id: "scope", projectId: "test", version: 1, createdAt: "now" };
  assert.deepEqual(await adapter.tasks(context, scope, { id: "plan", projectId: "test", version: 1, scopeContractId: "scope", scopeVersion: 1, content: "TEST plan", status: "ready_for_review", createdAt: "now" }), orders);
  assert.equal(calls.length, 3);
  assert.match(JSON.stringify(calls), /Propose only/);
  const broken = new GeminiSupervisorProposer({ models: { generateContent: async () => { throw new Error("token=SECRET"); } } } as unknown as GoogleGenAI, { model: { providerId: "vertex-ai", modelId: "gemini-3.8-flash" }, personaId: "planning-writer" });
  await assert.rejects(broken.questions(context), (error: Error) => !error.message.includes("SECRET") && /preserved/.test(error.message));
});

test("proposal failures report safe actionable metadata and preserve state without retrying", async (t) => {
  const h = await harness(t);
  await h.controller.start(request);
  const cases = [
    { error: { status: 401, message: "Bearer SECRET" }, kind: "authentication", status: 401 },
    { error: { response: { status: 403, data: "SECRET" } }, kind: "permission", status: 403 },
    { error: { status: 404 }, kind: "model_not_found", status: 404 },
    { error: { status: 429 }, kind: "rate_limit", status: 429 },
    { error: { status: 400 }, kind: "invalid_request", status: 400 },
    { error: { status: 503 }, kind: "provider_unavailable", status: 503 },
    { error: { cause: { code: "EAI_AGAIN", message: "SECRET" } }, kind: "network", status: undefined },
    { error: { status: "SECRET", code: "SECRET" }, kind: "provider_error", status: undefined },
  ];
  let calls = 0;
  const records: SupervisorUsageRecord[] = [];
  const before = await h.store.get(h.config.projectId);
  for (const item of cases) {
    const client = { models: { generateContent: async () => { calls++; throw item.error; } } } as unknown as GoogleGenAI;
    const proposer = new GeminiSupervisorProposer(client, { model: { providerId: "vertex-ai", modelId: "gemini-3.8-flash" }, personaId: "planning-writer" }, async (usage) => { records.push(usage); await h.store.appendUsage(usage); });
    await assert.rejects(new SupervisorController({ ...h.options, proposer }).questions(), (error: Error) => error.message.includes(item.kind) && !/SECRET|Bearer/.test(error.message));
    assert.equal(records.at(-1)!.failureKind, item.kind);
    assert.equal(records.at(-1)!.httpStatus, item.status);
    assert.deepEqual(await h.store.get(h.config.projectId), before);
  }
  assert.equal(calls, cases.length);
  assert.doesNotMatch(await readFile(join(h.config.memory.directory, "projects", h.config.projectId, "supervisor", "usage.jsonl"), "utf8"), /SECRET|Bearer/);
  await assert.rejects(h.store.appendUsage({ ...records[0]!, failureKind: "SECRET" } as unknown as SupervisorUsageRecord), /failure metadata/);
  await assert.rejects(h.store.appendUsage({ ...records[0]!, httpStatus: 999 }), /failure metadata/);
  await assert.rejects(h.store.appendUsage({ ...records[0]!, outcome: "success" }), /failure metadata/);
});

test("CLI runs complete offline supervisor flow and reads live-config reports without ADC", async (t) => {
  const h = await harness(t);
  await writeFile(join(h.root, "config.json"), JSON.stringify(rawConfig));
  await writeFile(join(h.root, "fixture.json"), JSON.stringify({ label: "TEST/STUB", questions: ["단위?", "기준?"], scope: scopeBody, orders }));
  await writeFile(join(h.root, "request.md"), request);
  await writeFile(join(h.root, "answers.json"), JSON.stringify({ "Q-1": "lot", "Q-2": "today" }));
  const cli = resolve("dist/src/cli/supervisor.js");
  const run = (command: string, args: string[] = [], input = "") => execFileSync(process.execPath, [cli, command, "--config", "config.json", ...args], { cwd: h.root, input, encoding: "utf8" });
  run("start", ["--file", "request.md"]); run("questions", ["--fixture", "fixture.json"]); run("answer", ["--file", "answers.json"]);
  run("propose-scope", ["--fixture", "fixture.json"]);
  const state = (await h.store.get(h.config.projectId))!;
  run("approve-scope", ["--reason", "TEST explicit Scope"], `APPROVE ${state.scope!.id} v${state.scope!.version}\n`);
  run("plan"); run("approve-plan", ["--reason", "TEST explicit Plan"], `APPROVE ${h.config.projectId}-plan v2\n`);
  run("propose-tasks", ["--fixture", "fixture.json"]);
  const proposed = (await h.store.get(h.config.projectId))!;
  run("initialize-tasks", [], `ACCEPT TASKS r${proposed.revision}\n`);
  const report = JSON.parse(run("report")) as Record<string, unknown>;
  assert.equal(record(report.progress).unverified, 2);
  const live = { ...rawConfig, planning: { ...rawConfig.planning, writer: { ...rawConfig.planning.writer, providerId: "vertex-ai", modelId: "gemini-3.8-flash" }, reviewer: { ...rawConfig.planning.reviewer, providerId: "vertex-ai", modelId: "gemini-3.8-flash" } } };
  await writeFile(join(h.root, "config.json"), JSON.stringify(live));
  assert.equal(record(JSON.parse(run("report"))).workerRuntimeConnected, false);
  assert.equal(await readFile(join(h.config.memory.directory, "projects", h.config.projectId, "requirements.md"), "utf8"), request);
});

test("CLI confirmation EOF fails explicitly without creating usage or workflow state", async (t) => {
  const h = await harness(t);
  const live = { projectId: "confirmation-eof-test", planning: { writer: { providerId: "vertex-ai", modelId: "gemini-3.8-flash", personaId: "planning-writer" }, reviewer: { providerId: "vertex-ai", modelId: "gemini-3.8-flash", personaId: "planning-reviewer" }, maxIterations: 5, requireUserApproval: true }, memory: { type: "file", directory: ".adtf" } };
  await writeFile(join(h.root, "live.json"), JSON.stringify(live));
  assert.throws(() => execFileSync(process.execPath, [resolve("dist/src/cli/supervisor.js"), "questions", "--config", "live.json"], { cwd: h.root, input: "", encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }), (error: unknown) => {
    const result = error as { status: number; stderr: string };
    return result.status === 1 && /Confirmation input closed/.test(String(result.stderr));
  });
  assert.equal(await h.store.get(live.projectId), undefined);
  await assert.rejects(readFile(join(h.config.memory.directory, "projects", live.projectId, "supervisor", "usage.jsonl")), { code: "ENOENT" });
});

test("explicit review retry reuses the saved draft, preserves approval gates and cannot be replayed", async (t) => {
  const h = await harness(t); await h.approvedScope();
  let writes = 0;
  const writer = { write: async (...args: Parameters<typeof h.options.writer.write>) => { writes++; return h.options.writer.write(...args); } };
  const broken = new SupervisorController({ ...h.options, writer, reviewer: { review: async () => { throw new Error("TEST challenge INVALID_ARGUMENT"); } } });
  await assert.rejects(broken.plan(), /call Reviewer/);
  const before = await h.memory.getPlanningLoopState(h.config.projectId);
  assert.equal(before!.status, "reviewing"); assert.equal(before!.iterationCount, 0);
  const draft = await h.memory.getPlanDraft(h.config.projectId, `${h.config.projectId}-plan`, 1);
  const controller = new SupervisorController({ ...h.options, writer, reviewer: passingReviewer });
  await assert.rejects(controller.plan(), /already exists/);
  await controller.retryReview("TEST schema corrected; explicitly retry saved draft");
  const after = await h.memory.getPlanningLoopState(h.config.projectId);
  assert.equal(writes, 1);
  assert.deepEqual(await h.memory.getPlanDraft(h.config.projectId, `${h.config.projectId}-plan`, 1), draft);
  assert.equal(after!.status, "awaiting_approval"); assert.equal(after!.iterationCount, 1); assert.equal(after!.maxIterations, before!.maxIterations);
  assert.equal(after!.reviewRetry!.planVersion, 1);
  assert.equal((await h.memory.get((after as { approvalId: string }).approvalId))!.status, "pending");
  await assert.rejects(controller.retryReview("TEST do not replay"), /retry needs/);
  const { reviewRetry: _retry, ...reset } = after!;
  await assert.rejects(h.memory.savePlanningLoopState(reset), /receipt is immutable/);
  const errorDir = join(h.config.memory.directory, "projects", h.config.projectId, "planning", "errors");
  const errors = await Promise.all((await readdir(errorDir)).map((name) => readFile(join(errorDir, name), "utf8")));
  assert.ok(errors.some((e) => e.includes("TEST challenge INVALID_ARGUMENT")));
  await controller.approvePlan(`APPROVE ${h.config.projectId}-plan v1`, "TEST explicit final approval after recovered review");
  assert.equal((await h.memory.getPlanningLoopState(h.config.projectId))!.status, "user_approved");
  assert.deepEqual((await h.memory.getPlanningLoopState(h.config.projectId))!.reviewRetry, after!.reviewRetry);
});

test("failed retry reserves its one-shot receipt before calling Reviewer and keeps the original draft", async (t) => {
  const h = await harness(t); await h.approvedScope();
  let calls = 0;
  const reviewer: PlanningReviewer = { review: async () => { calls++; throw new Error("TEST transport failure"); } };
  const controller = new SupervisorController({ ...h.options, reviewer });
  await assert.rejects(controller.plan());
  await assert.rejects(controller.retryReview("TEST explicit retry"));
  assert.equal(calls, 2);
  assert.equal((await h.memory.getPlanningLoopState(h.config.projectId))!.iterationCount, 0);
  await assert.rejects(controller.retryReview("TEST no third call"));
  assert.equal(calls, 2);
  assert.equal(await h.memory.getPlanDraft(h.config.projectId, `${h.config.projectId}-plan`, 2), undefined);
});

test("retry revision continues normally within the old budget and rejects configuration resets", async (t) => {
  const h = await harness(t); await h.approvedScope();
  await assert.rejects(new SupervisorController({ ...h.options, reviewer: { review: async () => { throw new Error("TEST failed review"); } } }).plan());
  const config = { ...h.config, planning: { ...h.config.planning, maxIterations: 99 } };
  await assert.rejects(new SupervisorController({ ...h.options, config }).retryReview("TEST reset forbidden"));
  await assert.rejects(h.controller.retryReview("  "));
  await h.controller.retryReview("TEST normal revise v1 then pass v2");
  const state = await h.memory.getPlanningLoopState(h.config.projectId);
  assert.equal(state!.status, "awaiting_approval"); assert.equal(state!.iterationCount, 2);
  assert.equal(state!.currentPlanVersion, 2); assert.equal(state!.reviewRetry!.planVersion, 1);
  assert.equal(state!.maxIterations, 3);
});

test("concurrent retry is locked and the CLI can review a stored draft without rewriting it", async (t) => {
  const h = await harness(t); await h.approvedScope();
  await assert.rejects(new SupervisorController({ ...h.options, reviewer: { review: async () => { throw new Error("TEST fail"); } } }).plan());
  let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const started = new Promise<void>((r) => { entered = r; });
  const controller = new SupervisorController({ ...h.options, reviewer: { review: async (...args) => { entered(); await gate; return passingReviewer.review(...args); } } });
  const first = controller.retryReview("TEST serialized retry"); await started;
  try { await assert.rejects(controller.retryReview("TEST concurrent"), /locked/); }
  finally { release(); }
  await first;
  const report = record(await controller.report()); assert.equal(report.nextAction, "approve-plan");

  const cli = await harness(t); await cli.approvedScope();
  await assert.rejects(new SupervisorController({ ...cli.options, reviewer: { review: async () => { throw new Error("TEST fail"); } } }).plan());
  await writeFile(join(cli.root, "config.json"), JSON.stringify(rawConfig));
  const output = execFileSync(process.execPath, [resolve("dist/src/cli/supervisor.js"), "retry-review", "--config", "config.json", "--reason", "TEST CLI recovery"], { cwd: cli.root, encoding: "utf8" });
  assert.ok(output.includes('"action": "retry-review"'));
  assert.equal((await cli.memory.getPlanningLoopState(cli.config.projectId))!.reviewRetry!.planVersion, 1);
  assert.equal((await cli.memory.getPlanningLoopState(cli.config.projectId))!.status, "awaiting_approval");
});
