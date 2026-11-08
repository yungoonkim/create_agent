import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { PlanDraft, PlanReview, ScopeContract } from "../src/planning/contracts.js";
import { FilePlanningMemoryStore } from "../src/planning/memory-store.js";
import { approvePlan, FileDevelopmentStore, ManualDevelopmentController } from "../src/development/index.js";
import { parseDevelopmentState, parseTask } from "../src/development/validation.js";
import { LocalVerificationEngine } from "../src/verification/index.js";
import { parseVerificationEvidence, parseVerificationPolicy } from "../src/verification/validation.js";
import type { EvidenceVerificationEngine, VerificationEvidence } from "../src/verification/contracts.js";

const definition = {
  id: "task", title: "Produce a verified artifact", description: "TEST/STUB worker task",
  dependsOn: [], expectedArtifacts: ["artifact.txt"], acceptanceCriteria: ["Artifact content is correct"], verificationMethod: "Command check followed by manual acceptance",
  verificationProfile: { commandIds: ["check"], inputFiles: ["check.cjs"] }, maxReworkAttempts: 2,
};
const reported = { summary: "TEST/STUB worker reports success", artifacts: ["artifact.txt"] };
const review = { passed: true, summary: "Manual acceptance confirmed", checks: [{ name: "Artifact content is correct", passed: true, details: "Inspected the artifact and collected check result." }] };
const checkScript = 'const assert=require("node:assert/strict"); assert.equal(require("node:fs").readFileSync("artifact.txt","utf8"),"correct"); console.log("checked");';

async function harness(t: { after(fn: () => Promise<void>): void }, maxReworkAttempts = 2) {
  const root = await mkdtemp(join(tmpdir(), "adtf-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  await writeFile(join(workspace, "artifact.txt"), "correct");
  await writeFile(join(workspace, "check.cjs"), checkScript);
  const planning = new FilePlanningMemoryStore(join(root, "memory"));
  const scope: ScopeContract = { id: "scope", projectId: "evidence-project", version: 1, goal: "TEST verify a deliverable", requiredFeatures: [{ id: "REQ-1", statement: "Produce a verified artifact" }], excludedFeatures: [], technicalConstraints: [], createdAt: new Date().toISOString() };
  await planning.createScopeContract(scope);
  const approvedScope = await planning.request(scope.projectId, "Scope Contract scope v1");
  await planning.recordDecision(approvedScope.id, "approved", "TEST isolated Scope decision");
  await planning.createScopeApprovalRecord({ projectId: scope.projectId, scopeContractId: scope.id, approvalId: approvedScope.id });
  const plan: PlanDraft = { id: "plan", projectId: scope.projectId, version: 1, scopeContractId: scope.id, scopeVersion: 1, content: "TEST approved plan", status: "ready_for_review", createdAt: new Date().toISOString() };
  await planning.createPlanDraft(plan);
  const planReview: PlanReview = { id: "review", projectId: scope.projectId, planId: plan.id, planVersion: 1, scopeContractId: scope.id, scopeVersion: 1, outcome: "pass", issues: [], suggestions: [], scopeViolation: false, userJudgmentRequired: false, reviewedAt: new Date().toISOString() };
  await planning.createPlanReview(planReview);
  const approval = await planning.request(scope.projectId, "Approve plan plan v1");
  await planning.savePlanningLoopState({ projectId: scope.projectId, scopeContractId: scope.id, scopeVersion: 1, iterationCount: 1, maxIterations: 3, currentPlanVersion: 1, status: "awaiting_approval", reviewId: planReview.id, approvalId: approval.id });
  await approvePlan(planning, scope.projectId, plan.id, "TEST isolated final decision");
  const store = new FileDevelopmentStore(planning.rootDirectory);
  const controller = new ManualDevelopmentController(scope.projectId, planning, store);
  const state = await controller.initialize(plan.id, [
    { ...definition, maxReworkAttempts },
    { id: "dependent", title: "Follow-up", description: "Wait for verification and manual approval", dependsOn: ["task"], expectedArtifacts: ["next.txt"], acceptanceCriteria: ["Follow-up complete"], verificationMethod: "Manual" },
  ]);
  const policy = { commands: { check: { executable: "node", args: ["check.cjs"], timeoutMs: 5000 } }, outputLimitBytes: 4096 };
  const engine = (rawPolicy: unknown = policy) => new LocalVerificationEngine(workspace, rawPolicy, state.source.contentHash);
  const start = async () => { await controller.assign("task", "TEST-worker", "TEST manual attempt"); await controller.submit("task", reported, "TEST reported output"); };
  return { root, workspace, planning, store, controller, state, policy, engine, start };
}

function evidence(state: Awaited<ReturnType<ManualDevelopmentController["state"]>>): VerificationEvidence {
  const value = state.tasks.find((task) => task.id === "task")?.evidence;
  assert.ok(value);
  return value;
}

test("real command evidence binds source, attempt, input fingerprints and logs; passing checks await acceptance", async (t) => {
  const h = await harness(t);
  await h.start();
  await assert.rejects(h.controller.review("task", review, "Attempt to skip collection"), /evidence/);
  const state = await h.controller.verify("task", h.engine(), "Collect actual verification");
  const report = evidence(state);
  assert.equal(report.outcome, "passed");
  assert.equal(report.commands[0]?.exitCode, 0);
  assert.equal(report.commands[0]?.stdout.trim(), "checked");
  assert.equal(report.commands[0]?.executable, process.execPath);
  assert.deepEqual(report.artifacts.map((file) => file.path), ["artifact.txt", "check.cjs"]);
  assert.equal(report.attempt, 1);
  assert.equal(report.sourceHash, state.source.contentHash);
  assert.equal(state.tasks[0]?.status, "awaiting_review");
  assert.equal(state.tasks[1]?.status, "pending");
  const approved = await h.controller.review("task", review, "Manual acceptance");
  assert.equal(approved.tasks[0]?.status, "approved");
  assert.equal(approved.tasks[1]?.status, "ready");
  assert.deepEqual(await new FileDevelopmentStore(h.planning.rootDirectory).get(state.projectId), approved);
});

test("a successful worker claim with a missing artifact fails before running commands", async (t) => {
  const h = await harness(t);
  await h.start();
  await rm(join(h.workspace, "artifact.txt"));
  const state = await h.controller.verify("task", h.engine(), "Check claimed output");
  assert.equal(evidence(state).outcome, "failed");
  assert.equal(evidence(state).commands.length, 0);
  assert.equal(state.tasks[0]?.status, "rework");
  assert.equal(state.tasks[0]?.reworkCount, 0);
  assert.equal(state.tasks[1]?.status, "pending");
});

test("nonzero exit requests rework, preserves failed evidence and counts fresh attempts separately", async (t) => {
  const h = await harness(t);
  await writeFile(join(h.workspace, "artifact.txt"), "wrong");
  await h.start();
  const failed = await h.controller.verify("task", h.engine(), "Run checks");
  assert.equal(evidence(failed).commands[0]?.exitCode, 1);
  assert.match(evidence(failed).commands[0]?.stderr ?? "", /AssertionError/);
  await h.controller.transition("task", "ready", "Allow one rework");
  let task = await h.controller.get("task");
  assert.equal(task?.reworkCount, 1);
  assert.equal(task?.attemptCount, 1);
  assert.equal(task?.evidence, undefined);
  assert.equal(task?.review, undefined);
  await writeFile(join(h.workspace, "artifact.txt"), "correct");
  await h.start();
  const passed = await h.controller.verify("task", h.engine(), "Run corrected attempt");
  task = passed.tasks[0];
  assert.equal(task?.attemptCount, 2);
  assert.equal(task?.reworkCount, 1);
  assert.equal(evidence(passed).attempt, 2);
  assert.ok(passed.events.some((event) => event.after?.evidence?.outcome === "failed"));
});

test("zero rework budget blocks on first failure and state reset cannot bypass the limit", async (t) => {
  const h = await harness(t, 0);
  await h.start();
  await writeFile(join(h.workspace, "artifact.txt"), "wrong");
  const blocked = await h.controller.verify("task", h.engine(), "First failed check");
  assert.equal(blocked.tasks[0]?.status, "blocked");
  assert.equal(blocked.tasks[0]?.blockReason, "verification_limit");
  await assert.rejects(h.controller.transition("task", "pending", "Bypass limit"), /limit/);
  await h.controller.transition("task", "cancelled", "User stops task");
  assert.equal((await h.controller.get("task"))?.status, "cancelled");
});

test("manual blocking does not bypass the consumed rework budget", async (t) => {
  const h = await harness(t, 1);
  await h.start();
  await h.controller.review("task", { ...review, passed: false }, "Manual quality finding");
  await h.controller.transition("task", "blocked", "Pause before rework");
  await h.controller.transition("task", "pending", "Resume and consume rework");
  await h.controller.transition("task", "ready", "Dependencies ready");
  await h.start();
  assert.equal((await h.controller.get("task"))?.reworkCount, 1);
  const blocked = await h.controller.review("task", { ...review, passed: false }, "Second quality failure");
  assert.equal(blocked.tasks[0]?.blockReason, "verification_limit");
});

test("missing executable is an environment block and does not consume a rework allowance", async (t) => {
  const h = await harness(t, 0);
  await h.start();
  const badPolicy = { ...h.policy, commands: { check: { executable: "adtf-nonexistent-check-executable", args: [], timeoutMs: 1000 } } };
  const blocked = await h.controller.verify("task", h.engine(badPolicy), "Missing tool");
  assert.equal(evidence(blocked).outcome, "blocked");
  assert.match(evidence(blocked).commands[0]?.reason ?? "", /^COMMAND_START_FAILED:/);
  assert.equal(blocked.tasks[0]?.blockReason, "environment");
  await h.controller.transition("task", "pending", "Tool configuration fixed");
  await h.controller.transition("task", "ready", "Ready again");
  await h.start();
  const passed = await h.controller.verify("task", h.engine(), "Retry environment");
  assert.equal(evidence(passed).outcome, "passed");
  assert.equal(passed.tasks[0]?.reworkCount, 0);
  assert.equal(passed.tasks[0]?.attemptCount, 2);
});

test("timeouts terminate the command and block verification", async (t) => {
  const h = await harness(t);
  await writeFile(join(h.workspace, "check.cjs"), 'console.log(process.pid); setInterval(()=>{},1000);');
  await h.start();
  const policy = { ...h.policy, commands: { check: { executable: "node", args: ["check.cjs"], timeoutMs: 500 } } };
  const state = await h.controller.verify("task", h.engine(policy), "Bound command duration");
  const command = evidence(state).commands[0]!;
  assert.equal(command.reason, "COMMAND_TIMEOUT");
  assert.equal(state.tasks[0]?.blockReason, "environment");
  if (process.platform !== "win32") assert.throws(() => process.kill(Number(command.stdout.trim()), 0));
});

test("excessive command output is bounded and blocks acceptance", async (t) => {
  const h = await harness(t);
  await writeFile(join(h.workspace, "check.cjs"), 'console.log("x".repeat(10000));');
  await h.start();
  const state = await h.controller.verify("task", h.engine({ ...h.policy, outputLimitBytes: 256 }), "Bound command output");
  const command = evidence(state).commands[0]!;
  assert.equal(command.reason, "COMMAND_OUTPUT_LIMIT");
  assert.ok(Buffer.byteLength(command.stdout) + Buffer.byteLength(command.stderr) <= 256);
  assert.equal(evidence(state).outcome, "blocked");
});

test("signal termination is not treated as a successful command", { skip: process.platform === "win32" }, async (t) => {
  const h = await harness(t);
  await writeFile(join(h.workspace, "check.cjs"), 'process.kill(process.pid,"SIGTERM");');
  await h.start();
  const state = await h.controller.verify("task", h.engine(), "Check signal");
  assert.equal(evidence(state).outcome, "failed");
  assert.equal(evidence(state).commands[0]?.signal, "SIGTERM");
});

test("profile input rejects traversal, absolute paths, forged counters and invalid budgets", () => {
  for (const path of ["../outside", "/absolute", "C:\\outside.txt", "a/../../outside", "a\\..\\outside"]) {
    assert.throws(() => parseTask({ ...definition, expectedArtifacts: [path] }, "project", true));
  }
  for (const patch of [{ maxReworkAttempts: -1 }, { maxReworkAttempts: 1.2 }, { attemptCount: 9 }, { reworkCount: 1 }, { evidence: {} }, { maxReworkAttempts: undefined }]) {
    assert.throws(() => parseTask({ ...definition, ...patch }, "project", true));
  }
  assert.throws(() => parseVerificationPolicy({ commands: { check: { executable: "npm.cmd", args: [], timeoutMs: 500 } } }));
  assert.throws(() => parseVerificationPolicy({ commands: { check: { executable: "node", args: [], timeoutMs: 0 } } }));
});

test("symlinked artifacts escaping the selected workspace are blocked", { skip: process.platform === "win32" }, async (t) => {
  const h = await harness(t);
  await writeFile(join(h.root, "outside.txt"), "outside");
  await rm(join(h.workspace, "artifact.txt"));
  await symlink(join(h.root, "outside.txt"), join(h.workspace, "artifact.txt"));
  await h.start();
  const state = await h.controller.verify("task", h.engine(), "Inspect symlink");
  assert.equal(evidence(state).outcome, "blocked");
  assert.match(evidence(state).checks[0]?.details ?? "", /outside/);
});

test("unlisted command IDs are blocked before executing anything", async (t) => {
  const h = await harness(t);
  await h.start();
  const state = await h.controller.verify("task", h.engine({ commands: {}, outputLimitBytes: 4096 }), "Unknown trusted command");
  assert.equal(evidence(state).commands.length, 0);
  assert.match(evidence(state).checks[0]?.details ?? "", /NOT_ALLOWED/);
});

test("arguments are literal, credential environment variables are omitted, common tokens are redacted", async (t) => {
  const h = await harness(t);
  const literal = '$(echo injected); echo also-injected';
  await writeFile(join(h.workspace, "check.cjs"), 'console.log(process.argv[2]); console.log(process.env.ADTF_TEST_SECRET ?? "no-secret"); console.log("Bearer TEST_TOKEN refresh_token=TEST_REFRESH");');
  const previous = process.env.ADTF_TEST_SECRET;
  process.env.ADTF_TEST_SECRET = "TEST_SENTINEL_NEVER_PASS_TO_CHILD";
  try {
    await h.start();
    const policy = { ...h.policy, commands: { check: { executable: "node", args: ["check.cjs", literal], timeoutMs: 5000 } } };
    const state = await h.controller.verify("task", h.engine(policy), "Literal arguments");
    const output = evidence(state).commands[0]?.stdout ?? "";
    assert.ok(output.includes(literal));
    assert.ok(output.includes("no-secret"));
    assert.ok(!output.includes("TEST_SENTINEL"));
    assert.ok(!output.includes("TEST_TOKEN"));
    assert.ok(!output.includes("TEST_REFRESH"));
  } finally {
    if (previous === undefined) delete process.env.ADTF_TEST_SECRET;
    else process.env.ADTF_TEST_SECRET = previous;
  }
});

test("changing either a deliverable or declared test input invalidates collected evidence before review", async (t) => {
  for (const path of ["artifact.txt", "check.cjs"]) {
    const h = await harness(t);
    await h.start();
    await h.controller.verify("task", h.engine(), "Collect passing proof");
    const before = await h.controller.state();
    await writeFile(join(h.workspace, path), "changed");
    await assert.rejects(h.controller.review("task", review, "Use stale proof"), /stale/);
    assert.deepEqual(await h.controller.state(), before);
  }
});

test("commands changing declared inputs during verification are blocked even with exit zero", async (t) => {
  const h = await harness(t);
  await writeFile(join(h.workspace, "check.cjs"), 'require("node:fs").writeFileSync("artifact.txt","changed");');
  await h.start();
  const state = await h.controller.verify("task", h.engine(), "Check mutating command");
  assert.equal(evidence(state).commands[0]?.exitCode, 0);
  assert.equal(evidence(state).outcome, "blocked");
  assert.ok(evidence(state).checks.some((check) => check.details === "VERIFICATION_INPUT_CHANGED"));
});

test("replayed or incomplete evidence cannot be attached to a different attempt or source", async (t) => {
  const h = await harness(t);
  await h.start();
  const valid = evidence(await h.controller.verify("task", h.engine(), "First proof"));
  const before = await h.controller.state();
  for (const patch of [{ attempt: 2 }, { sourceHash: "0".repeat(64) }, { taskId: "other" }, { resultHash: "0".repeat(64) }, { artifacts: [] }, { commands: [] }]) {
    const fake: EvidenceVerificationEngine = { verify: async () => ({ ...valid, ...patch }) };
    await assert.rejects(h.controller.verify("task", fake, "TEST injected invalid proof"));
    assert.deepEqual(await h.controller.state(), before);
  }
  assert.throws(() => parseVerificationEvidence({ ...valid, passed: false }));
  assert.throws(() => parseDevelopmentState({ ...before, tasks: [{ ...before.tasks[0], evidence: undefined, status: "approved", review }] }, before.projectId));
});

test("verification holds the project lock so duplicate runs and state edits cannot race", async (t) => {
  const h = await harness(t);
  await h.start();
  let announce!: () => void;
  let release!: () => void;
  const began = new Promise<void>((resolveBegan) => { announce = resolveBegan; });
  const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
  let calls = 0;
  const engine: EvidenceVerificationEngine = { verify: async (task, result) => { calls += 1; announce(); await gate; return h.engine().verify(task, result); } };
  const pending = h.controller.verify("task", engine, "Long check");
  await began;
  try {
    await assert.rejects(h.controller.verify("task", engine, "Duplicate"), /locked/);
    await assert.rejects(h.controller.transition("task", "blocked", "Concurrent edit"), /locked/);
  } finally { release(); }
  assert.equal(evidence(await pending).outcome, "passed");
  assert.equal(calls, 1);
});

test("an approved source changed during collection prevents committing the results", async (t) => {
  const h = await harness(t);
  await h.start();
  const before = await h.controller.state();
  const engine: EvidenceVerificationEngine = { verify: async (task, result) => {
    const report = await h.engine().verify(task, result);
    const file = join(h.planning.rootDirectory, "projects", before.projectId, "planning", "plans", "plan", "v1.json");
    const plan = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...plan, content: "Changed during verification" }));
    return report;
  } };
  await assert.rejects(h.controller.verify("task", engine, "Source race"), /snapshot changed/);
  assert.deepEqual(await h.controller.state(), before);
});

test("CLI collects actual evidence and manual acceptance from an isolated project", async (t) => {
  const h = await harness(t);
  await h.start();
  const config = { projectId: h.state.projectId, planning: { writer: { providerId: "fake", modelId: "fake" }, reviewer: { providerId: "fake", modelId: "fake" }, maxIterations: 3, requireUserApproval: true }, memory: { type: "file", directory: "memory" } };
  await writeFile(join(h.root, "config.json"), JSON.stringify(config));
  await writeFile(join(h.root, "verification-policy.json"), JSON.stringify(h.policy));
  await writeFile(join(h.root, "review.json"), JSON.stringify(review));
  const path = resolve("dist/src/cli/development.js");
  const run = (command: string, args: string[]) => {
    const response = spawnSync(process.execPath, [path, command, "--config", "config.json", ...args], { cwd: h.root, encoding: "utf8", timeout: 10000 });
    assert.equal(response.status, 0, response.stderr);
    return JSON.parse(response.stdout);
  };
  const checked = run("verify", ["--task", "task", "--workspace", "workspace", "--verification-config", "verification-policy.json", "--reason", "TEST actual verification"]);
  assert.equal(checked.tasks[0].evidence.outcome, "passed");
  const approved = run("review", ["--task", "task", "--file", "review.json", "--reason", "TEST manual acceptance"]);
  assert.equal(approved.tasks[0].status, "approved");
});

test("unavailable workspaces and oversized files produce explicit environment blocks", async (t) => {
  const h = await harness(t);
  await h.start();
  const missing = new LocalVerificationEngine(join(h.root, "absent"), h.policy, h.state.source.contentHash);
  let state = await h.controller.verify("task", missing, "Workspace unavailable");
  assert.equal(evidence(state).checks[0]?.details, "WORKSPACE_UNAVAILABLE");
  await h.controller.transition("task", "pending", "Correct workspace");
  await h.controller.transition("task", "ready", "Ready");
  await writeFile(join(h.workspace, "artifact.txt"), Buffer.alloc(8 * 1024 * 1024 + 1));
  await h.start();
  state = await h.controller.verify("task", h.engine(), "Bound artifact read size");
  assert.equal(evidence(state).outcome, "blocked");
  assert.equal(evidence(state).commands.length, 0);
  assert.equal(state.tasks[0]?.reworkCount, 0);
});

test("verify CLI returns distinct exit codes for failed checks and blocked environments", async (t) => {
  for (const mode of ["failed", "blocked"]) {
    const h = await harness(t);
    await h.start();
    await writeFile(join(h.root, "config.json"), JSON.stringify({ projectId: h.state.projectId, planning: { writer: { providerId: "fake", modelId: "fake" }, reviewer: { providerId: "fake", modelId: "fake" }, maxIterations: 3, requireUserApproval: true }, memory: { type: "file", directory: "memory" } }));
    if (mode === "failed") await writeFile(join(h.workspace, "artifact.txt"), "wrong");
    await writeFile(join(h.root, "policy.json"), JSON.stringify(mode === "blocked" ? { commands: {}, outputLimitBytes: 4096 } : h.policy));
    const run = spawnSync(process.execPath, [resolve("dist/src/cli/development.js"), "verify", "--config", "config.json", "--task", "task", "--workspace", "workspace", "--verification-config", "policy.json", "--reason", "TEST CLI classification"], { cwd: h.root, encoding: "utf8", timeout: 10000 });
    assert.equal(run.status, mode === "failed" ? 1 : 2, run.stderr);
    assert.equal(JSON.parse(run.stdout).tasks[0].evidence.outcome, mode);
  }
});
