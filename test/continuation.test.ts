import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import test from "node:test";
import type { GoogleGenAI } from "@google/genai";
import { SupervisorController, type SupervisorOptions } from "../src/supervisor/controller.js";
import { FileSupervisorStore } from "../src/supervisor/memory-store.js";
import { FilePlanningMemoryStore } from "../src/planning/memory-store.js";
import { FileDevelopmentStore } from "../src/development/memory-store.js";
import { parsePlanningConfig } from "../src/planning/config.js";
import { FakePlanningWriter } from "../src/planning/fake-writer.js";
import type { PlanningReviewer, PlanReview } from "../src/planning/contracts.js";
import { record } from "../src/development/validation.js";
import { GeminiSupervisorProposer } from "../src/supervisor/google-genai.js";
import type { SupervisorUsageRecord } from "../src/supervisor/contracts.js";
import { parseSupervisorState } from "../src/supervisor/validation.js";

const rawConfig = { projectId: "continuation-test", planning: { writer: { providerId: "fake", modelId: "fake-writer", personaId: "planning-writer" }, reviewer: { providerId: "fake", modelId: "fake-reviewer", personaId: "planning-reviewer" }, maxIterations: 3, requireUserApproval: true, scenario: "improve-once" }, memory: { type: "file", directory: ".adtf" } };
const body = { goal: "TEST/STUB 재고 CLI", requiredFeatures: [{ id: "REQ-1", statement: "로트 저장" }], excludedFeatures: [{ id: "EX-1", statement: "로그인 제외" }], technicalConstraints: ["Local JSON"] };
const changed = { ...body, requiredFeatures: [...body.requiredFeatures, { id: "REQ-2", statement: "승인된 만료 날짜 경계" }] };
const task = { requirementIds: ["REQ-1"], task: { id: "storage", title: "TEST/STUB", description: "TEST isolated artifact", dependsOn: [], expectedArtifacts: ["result.txt"], acceptanceCriteria: ["Result matches"], verificationMethod: "Manual" } };

async function harness(t: { after(fn: () => Promise<void>): void }, first: "answers" | "scope" | "pass" = "answers", alwaysAsk = false) {
  const root = await mkdtemp(join(tmpdir(), "adtf-continuation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = parsePlanningConfig(rawConfig, root), memory = new FilePlanningMemoryStore(config.memory.directory);
  const store = new FileSupervisorStore(config.memory.directory), developmentStore = new FileDevelopmentStore(config.memory.directory);
  let calls = 0;
  const writerContexts: unknown[] = [];
  const fake = new FakePlanningWriter();
  const reviewer: PlanningReviewer = { review: async (context) => {
    const plan = context.currentPlan;
    const review: PlanReview = { id: `review-${plan.version}`, projectId: config.projectId, planId: plan.id, planVersion: plan.version, scopeContractId: plan.scopeContractId, scopeVersion: plan.scopeVersion, outcome: "pass", issues: [], suggestions: [], scopeViolation: false, userJudgmentRequired: false, reviewedAt: new Date().toISOString() };
    if (plan.version !== 1 && !alwaysAsk) return review;
    if (first === "answers") return { ...review, outcome: "needs_user_input", userJudgmentRequired: true, suggestions: ["오늘 만료도 표시할까요?", "수량 단위를 정해주세요."] };
    if (first === "scope") return { ...review, outcome: "revise", scopeViolation: true, issues: [{ id: "ISSUE-CHANGE", kind: "scope_violation", severity: "major", description: "날짜 범위를 확정해야 함", suggestedDirection: "새 Scope를 승인받거나 기존 범위로 수정" }] };
    return review;
  } };
  const options: SupervisorOptions = { config, memory, store, developmentStore,
    proposer: { questions: async () => [], scope: async (context) => context.scopeChange === undefined ? body : changed, tasks: async () => [task] },
    writer: { write: async (context, role) => { calls++; writerContexts.push(context); return fake.write(context, role); } }, reviewer };
  const controller = new SupervisorController(options);
  await controller.start("  TEST/STUB 재고 도구 요청\n"); await controller.questions(); const proposal = await controller.proposeScope();
  await controller.decideScope(true, `APPROVE ${proposal.scope!.id} v${proposal.scope!.version}`, "TEST explicit Scope approval"); await controller.plan();
  const proposeChange = async () => {
    await controller.continuation().requestScopeChange("TEST 만료 날짜 범위 변경");
    return controller.continuation().proposeScopeChange();
  };
  const decideChange = async (approved: boolean) => {
    const item = (await store.get(config.projectId))!.continuations!.at(-1)!;
    return controller.continuation().decideScopeChange(approved, `${approved ? "APPROVE" : "REJECT"} CHANGE ${item.id} ${item.proposedScope!.id} v${item.proposedScope!.version}`, "TEST explicit change and Scope decision");
  };
  return { root, config, memory, store, options, controller, writerContexts, calls: () => calls, proposeChange, decideChange };
}

test("additional answers resume in a fresh controller, preserve snapshots and require new final approval", async (t) => {
  const h = await harness(t);
  const old = await h.memory.getPlanDraft(h.config.projectId, `${h.config.projectId}-plan`, 1);
  const waiting = await h.controller.continuation().collectFeedback();
  assert.equal(waiting.clarifications.length, 2);
  await assert.rejects(h.controller.continuation().resumePlan(), /needs answers/);
  await h.controller.answer({ "Q-1": "오늘 포함" });
  await assert.rejects(h.controller.continuation().resumePlan(), /needs answers/);
  await h.controller.answer({ "Q-2": "로트별 개수" });
  await assert.rejects(h.controller.approvePlan(`APPROVE ${h.config.projectId}-plan v1`, "TEST premature"), /continuation/);
  const fresh = new SupervisorController(h.options);
  const completed = await fresh.continuation().resumePlan();
  assert.equal(completed.continuations!.at(-1)!.status, "completed");
  const state = (await h.memory.getPlanningLoopState(h.config.projectId))!;
  assert.equal(state.currentPlanVersion, 2); assert.equal(state.iterationCount, 2); assert.equal(state.status, "awaiting_approval");
  assert.equal(state.continuationId, completed.continuations!.at(-1)!.id);
  assert.deepEqual(await h.memory.getPlanDraft(h.config.projectId, `${h.config.projectId}-plan`, 1), old);
  const plan = await h.memory.getPlanDraft(h.config.projectId, `${h.config.projectId}-plan`, 2);
  assert.match(plan!.content, /今日|오늘 포함/);
  assert.equal(await h.memory.getRequirements(h.config.projectId), "  TEST/STUB 재고 도구 요청\n");
  await assert.rejects(fresh.proposeTasks(), /user-approved/);
  await fresh.approvePlan(`APPROVE ${h.config.projectId}-plan v2`, "TEST new explicit final approval");
  assert.equal((await h.memory.getPlanningLoopState(h.config.projectId))!.continuationId, state.continuationId);
  await fresh.proposeTasks();
  await assert.rejects(fresh.continuation().resumePlan(), /No pending/);
  assert.equal(h.calls(), 2);
});

test("Scope change approval preserves old Scope and Plan, then resumes explicitly in a higher version", async (t) => {
  const h = await harness(t, "scope");
  const oldScope = (await h.store.get(h.config.projectId))!.scope!;
  const proposal = await h.proposeChange(), item = proposal.continuations!.at(-1)!;
  assert.deepEqual(proposal.scope, oldScope);
  assert.equal((await h.memory.get(item.changeApprovalId!))!.status, "pending");
  await assert.rejects(h.controller.continuation().resumePlan(), /needs answers|Scope decision/);
  await assert.rejects(h.controller.continuation().decideScopeChange(true, "APPROVE wrong", "TEST"), /confirmation/);
  await h.decideChange(true);
  assert.equal(h.calls(), 1);
  assert.equal((await h.memory.get(item.scopeApprovalId!))!.status, "approved");
  assert.deepEqual(await h.memory.getScopeContract(h.config.projectId, oldScope.version), oldScope);
  await assert.rejects(h.controller.proposeTasks(), /continuation/);
  await h.controller.continuation().resumePlan();
  const planning = (await h.memory.getPlanningLoopState(h.config.projectId))!;
  assert.equal(planning.scopeContractId, item.proposedScope!.id); assert.equal(planning.currentPlanVersion, 2);
  assert.equal(planning.iterationCount, 2); assert.equal(planning.status, "awaiting_approval");
  assert.equal((await h.memory.getPlanDraft(h.config.projectId, `${h.config.projectId}-plan`, 1))!.scopeVersion, oldScope.version);
});

test("new Scope and Plan approvals feed only the new source into task initialization", async (t) => {
  const h = await harness(t, "pass");
  await h.controller.approvePlan(`APPROVE ${h.config.projectId}-plan v1`, "TEST original final approval");
  await h.proposeChange(); await h.decideChange(true); await h.controller.continuation().resumePlan();
  await h.controller.approvePlan(`APPROVE ${h.config.projectId}-plan v2`, "TEST changed final approval");
  const fresh = new SupervisorController({ ...h.options, proposer: { ...h.options.proposer, tasks: async (_context, scope) => scope.requiredFeatures.map((feature, index) => ({ requirementIds: [feature.id], task: { ...task.task, id: `task-${index}`, dependsOn: index === 0 ? [] : ["task-0"] } })) } });
  const proposed = await fresh.proposeTasks(); await fresh.initializeTasks(`ACCEPT TASKS r${proposed.revision}`);
  const state = await fresh.development().state();
  assert.equal(state.source.planVersion, 2); assert.equal(state.source.scopeVersion, proposed.scope!.version);
  assert.deepEqual(state.tasks.map((item) => item.status), ["ready", "pending"]);
  assert.equal(record(record(await fresh.report()).progress).sourceCurrent, true);
});

test("user may request a Scope change while the reviewed plan awaits additional input", async (t) => {
  const h = await harness(t); await h.proposeChange(); await h.decideChange(true); await h.controller.continuation().resumePlan();
  const state = (await h.memory.getPlanningLoopState(h.config.projectId))!;
  assert.equal(state.status, "awaiting_approval"); assert.equal(state.currentPlanVersion, 2);
});

test("rejecting Reviewer Scope change revises under the old approved Scope without adopting the proposal", async (t) => {
  const h = await harness(t, "scope"); const proposal = await h.proposeChange(), item = proposal.continuations!.at(-1)!;
  await h.decideChange(false);
  assert.deepEqual((await h.store.get(h.config.projectId))!.scope, item.baseScope);
  await h.controller.continuation().resumePlan();
  const state = (await h.memory.getPlanningLoopState(h.config.projectId))!;
  assert.equal(state.scopeVersion, item.baseScope.version); assert.equal(state.currentPlanVersion, 2);
  assert.equal((await h.memory.get(item.scopeApprovalId!))!.status, "rejected");
  assert.match(JSON.stringify(h.writerContexts.at(-1)), /rejected Scope change/);
});

test("user change rejection keeps the prior final approval available; approved later change needs a new Plan approval", async (t) => {
  const h = await harness(t, "pass");
  const original = (await h.memory.getPlanningLoopState(h.config.projectId))!;
  assert.equal(original.status, "awaiting_approval");
  await h.proposeChange(); await h.decideChange(false);
  await h.controller.approvePlan(`APPROVE ${h.config.projectId}-plan v1`, "TEST existing plan explicit approval");
  await h.proposeChange(); await h.decideChange(true); await h.controller.continuation().resumePlan();
  const state = (await h.memory.getPlanningLoopState(h.config.projectId))!;
  assert.equal(state.status, "awaiting_approval"); assert.equal(state.currentPlanVersion, 2);
  if (original.status === "awaiting_approval") assert.equal((await h.memory.get(original.approvalId))!.status, "approved");
  await assert.rejects(h.controller.proposeTasks(), /user-approved/);
  assert.equal((await h.store.get(h.config.projectId))!.continuations!.length, 2);
});

test("Scope decisions interrupted between approval writes finish on matching explicit retry", async (t) => {
  const h = await harness(t, "scope"); const proposal = await h.proposeChange(), item = proposal.continuations!.at(-1)!;
  const original = h.memory.recordDecision.bind(h.memory); let interrupted = false;
  h.memory.recordDecision = async (...args) => { const result = await original(...args); if (args[0] === item.changeApprovalId && !interrupted) { interrupted = true; throw new Error("TEST interrupted decision"); } return result; };
  await assert.rejects(h.decideChange(true), /interrupted/);
  assert.equal((await h.memory.get(item.changeApprovalId!))!.status, "approved"); assert.equal((await h.memory.get(item.scopeApprovalId!))!.status, "pending");
  await assert.rejects(h.decideChange(false), /conflicts/);
  await h.decideChange(true); await h.controller.continuation().resumePlan(); assert.equal(h.calls(), 2);
});

test("completed Planning receipt recovers after supervisor save failure without a second model call", async (t) => {
  const h = await harness(t); await h.controller.continuation().collectFeedback(); await h.controller.answer({ "Q-1": "오늘", "Q-2": "개" });
  const original = h.store.update.bind(h.store); let fail = true;
  h.store.update = (projectId, mutate) => original(projectId, async (state) => {
    const next = await mutate(state);
    if (next.events.at(-1)?.action === "finish-continuation" && fail) { fail = false; throw new Error("TEST save interrupted"); } return next;
  });
  await assert.rejects(h.controller.continuation().resumePlan(), /save interrupted/);
  assert.equal((await h.store.get(h.config.projectId))!.continuations!.at(-1)!.status, "started"); assert.equal(h.calls(), 2);
  await new SupervisorController(h.options).continuation().resumePlan(); assert.equal(h.calls(), 2);
  assert.equal((await h.store.get(h.config.projectId))!.continuations!.at(-1)!.status, "completed");
});

test("model failure after durable start cannot replay or reset Planning automatically", async (t) => {
  const h = await harness(t); await h.controller.continuation().collectFeedback(); await h.controller.answer({ "Q-1": "오늘", "Q-2": "개" });
  let failedCalls = 0;
  const broken = new SupervisorController({ ...h.options, writer: { write: async () => { failedCalls++; throw new Error("TEST provider outage"); } } });
  await assert.rejects(broken.continuation().resumePlan(), /provider outage/);
  assert.equal((await h.memory.getPlanningLoopState(h.config.projectId))!.status, "drafting");
  await assert.rejects(broken.continuation().resumePlan(), /stale|already started/);
  assert.equal(failedCalls, 1); assert.match(String(record(await broken.report()).nextAction), /STOP/);
});

test("continuations preserve the total review budget and reject configuration resets", async (t) => {
  const h = await harness(t, "answers", true);
  await h.controller.continuation().collectFeedback(); await h.controller.answer({ "Q-1": "today", "Q-2": "lot" });
  const reset = new SupervisorController({ ...h.options, config: { ...h.config, planning: { ...h.config.planning, maxIterations: 99 } } });
  await assert.rejects(reset.continuation().resumePlan(), /incompatible|budget/); assert.equal(h.calls(), 1);
  await h.controller.continuation().resumePlan();
  await h.controller.continuation().collectFeedback(); await h.controller.answer({ "Q-3": "today", "Q-4": "lot" }); await h.controller.continuation().resumePlan();
  assert.equal((await h.memory.getPlanningLoopState(h.config.projectId))!.iterationCount, 3);
  await assert.rejects(h.controller.continuation().collectFeedback(), /budget/); assert.equal(h.calls(), 3);
  assert.match(String(record(await h.controller.report()).nextAction), /STOP.*budget/);
});

test("stale continuation source is rejected before proposal, decision or new model execution", async (t) => {
  const h = await harness(t, "scope"); await h.proposeChange();
  const old = (await h.memory.getPlanningLoopState(h.config.projectId))!;
  await h.memory.savePlanningLoopState({ ...old, status: "stopped", reason: "TEST source changed" });
  await assert.rejects(h.decideChange(true), /stale/);
  await assert.rejects(h.controller.continuation().resumePlan(), /Scope decision/); assert.equal(h.calls(), 1);
});

test("tampered source snapshot cannot be used to authorize a continuation", async (t) => {
  const h = await harness(t, "scope"); await h.controller.continuation().requestScopeChange("TEST change");
  const file = join(h.config.memory.directory, "projects", h.config.projectId, "planning", "plans", `${h.config.projectId}-plan`, "v1.json");
  const plan = record(JSON.parse(await readFile(file, "utf8"))); await writeFile(file, JSON.stringify({ ...plan, content: "tampered" }));
  await assert.rejects(h.controller.continuation().proposeScopeChange(), /snapshots changed/); assert.equal(h.calls(), 1);
});

test("changes after task proposal are blocked and malformed continuation history is rejected", async (t) => {
  const h = await harness(t, "pass"); await h.controller.approvePlan(`APPROVE ${h.config.projectId}-plan v1`, "TEST final"); await h.controller.proposeTasks();
  await assert.rejects(h.controller.continuation().requestScopeChange("TEST late change"), /before task/);
  const other = await harness(t, "scope"); const proposal = await other.proposeChange(); const item = proposal.continuations!.at(-1)!;
  assert.throws(() => parseSupervisorState({ ...proposal, continuations: [{ ...item, baseHash: "invalid" }] }, other.config.projectId), /hash/);
  assert.throws(() => parseSupervisorState({ ...proposal, continuations: [{ ...item, baseScope: { ...item.baseScope, projectId: "other" } }] }, other.config.projectId), /project/);
  await assert.rejects(other.store.update(other.config.projectId, async (state) => ({ ...state!, revision: state!.revision + 1, continuations: [{ ...item, reason: "rewrite" }], events: [...state!.events, { action: "bad", at: "now", detail: "bad" }] })), /immutable/);
});

test("proposal usage logs include success, invalid JSON and provider failure without request or secret text", async (t) => {
  const h = await harness(t, "pass");
  const records: SupervisorUsageRecord[] = [];
  const role = { model: { providerId: "vertex-ai", modelId: "gemini-3.8-flash" }, personaId: "planning-writer" };
  const response = { text: JSON.stringify({ questions: ["TEST question"] }), usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8, thoughtsTokenCount: 2 } };
  let mode = "success";
  const client = { models: { generateContent: async () => { if (mode === "error") throw new Error("token=SECRET"); return mode === "bad" ? { ...response, text: "invalid JSON" } : response; } } } as unknown as GoogleGenAI;
  const adapter = new GeminiSupervisorProposer(client, role, async (usage) => { records.push(usage); await h.store.appendUsage(usage); });
  const context = { projectId: h.config.projectId, originalRequest: "PRIVATE request", clarifications: [] };
  await adapter.questions(context); mode = "bad"; await assert.rejects(adapter.scope(context), /preserved/); mode = "error"; await assert.rejects(adapter.questions(context), /preserved/);
  assert.deepEqual(records.map((item) => item.outcome), ["success", "failure", "failure"]); assert.equal(records[0]!.inputTokens, 12); assert.equal(records[1]!.outputTokens, 8);
  assert.equal(records[1]!.failureKind, "invalid_response"); assert.equal(records[2]!.failureKind, "provider_error");
  const file = await readFile(join(h.config.memory.directory, "projects", h.config.projectId, "supervisor", "usage.jsonl"), "utf8");
  assert.equal(file.trim().split("\n").length, 3); assert.doesNotMatch(file, /PRIVATE|SECRET|TEST question/);
  const broken = new GeminiSupervisorProposer(client, role, async () => { throw new Error("TEST disk full"); });
  await assert.rejects(broken.questions(context), /may have billed/);
});

test("CLI approves both change records and resumes with bounded versions", async (t) => {
  const h = await harness(t, "scope");
  await writeFile(join(h.root, "config.json"), JSON.stringify(rawConfig)); await writeFile(join(h.root, "fixture.json"), JSON.stringify({ label: "TEST/STUB", scope: changed }));
  const cli = resolve("dist/src/cli/supervisor.js");
  const run = (command: string, args: string[] = [], input = "") => execFileSync(process.execPath, [cli, command, "--config", "config.json", ...args], { cwd: h.root, encoding: "utf8", input });
  run("request-scope-change", ["--reason", "TEST reviewer change"]); run("propose-scope-change", ["--fixture", "fixture.json"]);
  const item = (await h.store.get(h.config.projectId))!.continuations!.at(-1)!;
  run("approve-scope-change", ["--reason", "TEST explicit combined decision"], `APPROVE CHANGE ${item.id} ${item.proposedScope!.id} v${item.proposedScope!.version}\n`);
  run("resume-plan");
  const state = (await h.memory.getPlanningLoopState(h.config.projectId))!;
  assert.equal(state.currentPlanVersion, 3); assert.equal(state.iterationCount, 3); assert.equal(state.scopeVersion, item.proposedScope!.version);
  assert.equal((await h.store.get(h.config.projectId))!.continuations!.at(-1)!.status, "completed");
  assert.match(run("report"), /workerRuntimeConnected/);
});

test("CLI collects Reviewer questions and answers before explicitly resuming the same plan", async (t) => {
  const h = await harness(t);
  await writeFile(join(h.root, "config.json"), JSON.stringify(rawConfig));
  await writeFile(join(h.root, "answers.json"), JSON.stringify({ "Q-1": "오늘 포함", "Q-2": "개" }));
  const cli = resolve("dist/src/cli/supervisor.js");
  const run = (command: string, args: string[] = []) => execFileSync(process.execPath, [cli, command, "--config", "config.json", ...args], { cwd: h.root, encoding: "utf8" });
  run("collect-feedback"); run("answer", ["--file", "answers.json"]); run("resume-plan");
  const state = (await h.memory.getPlanningLoopState(h.config.projectId))!;
  assert.equal(state.currentPlanVersion, 3); assert.equal(state.iterationCount, 3); assert.equal(state.status, "awaiting_approval");
  assert.match((await h.memory.getPlanDraft(h.config.projectId, `${h.config.projectId}-plan`, 3))!.content, /오늘 포함/);
});

test("concurrent explicit resume requests cannot duplicate a model call", async (t) => {
  const h = await harness(t); await h.controller.continuation().collectFeedback(); await h.controller.answer({ "Q-1": "오늘", "Q-2": "개" });
  let release!: () => void, enter!: () => void, calls = 0;
  const gate = new Promise<void>((resolvePromise) => { release = resolvePromise; });
  const entered = new Promise<void>((resolvePromise) => { enter = resolvePromise; });
  const blocking = new SupervisorController({ ...h.options, writer: { write: async (context, role) => { calls++; enter(); await gate; return h.options.writer.write(context, role); } } });
  const running = blocking.continuation().resumePlan();
  await entered;
  await assert.rejects(blocking.continuation().resumePlan(), /locked/);
  release(); await running; assert.equal(calls, 1);
});

test("completed continuation history and source snapshots cannot be rewritten", async (t) => {
  const h = await harness(t); await h.controller.continuation().collectFeedback(); await h.controller.answer({ "Q-1": "오늘", "Q-2": "개" }); await h.controller.continuation().resumePlan();
  await assert.rejects(h.store.update(h.config.projectId, async (state) => ({ ...state!, revision: state!.revision + 1, continuations: state!.continuations!.map((item) => ({ ...item, status: "ready" })), events: [...state!.events, { action: "bad", at: "now", detail: "bad" }] })), /immutable/);
  const current = (await h.store.get(h.config.projectId))!;
  assert.throws(() => parseSupervisorState({ ...current, continuations: current.continuations!.map((item) => ({ ...item, questionIds: ["Q-999"] })) }, h.config.projectId), /unknown question/);
  assert.equal(h.calls(), 2);
});
