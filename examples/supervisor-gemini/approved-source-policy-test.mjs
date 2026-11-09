// TEST/STUB policy acceptance on isolated copies of the approved live source.
// No model calls, product implementation, or Agent Runtime execution.
import assert from "node:assert/strict";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SupervisorController } from "../../dist/src/supervisor/controller.js";
import { FileSupervisorStore } from "../../dist/src/supervisor/memory-store.js";
import { FilePlanningMemoryStore } from "../../dist/src/planning/memory-store.js";
import { FileDevelopmentStore } from "../../dist/src/development/memory-store.js";
import { loadLivePlanningConfig } from "../../dist/src/planning/config.js";
import { LocalVerificationEngine } from "../../dist/src/verification/index.js";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const projectId = "supervisor-gemini-acceptance";
const sourceRoot = join(repository, ".adtf/projects", projectId);
const stateFile = join(sourceRoot, "supervisor/state.json");
const fingerprint = async () => createHash("sha256").update(await readFile(stateFile)).digest("hex");
await assert.rejects(access(`${stateFile}.lock`), { code: "ENOENT" });
const before = await fingerprint();
const original = JSON.parse(await readFile(stateFile, "utf8"));
assert.equal(original.phase, "tasks_proposed");
const temporaryRoots = [];
const unavailable = async () => { throw new Error("TEST/STUB: model execution is forbidden in this fixture"); };

async function setup(label, placeholders) {
  const root = await mkdtemp(join(tmpdir(), `adtf-approved-${label}-`));
  temporaryRoots.push(root);
  const memoryRoot = join(root, ".adtf");
  await cp(sourceRoot, join(memoryRoot, "projects", projectId), { recursive: true });
  await mkdir(join(memoryRoot, "approvals"), { recursive: true });
  for (const file of await readdir(join(repository, ".adtf/approvals"))) {
    if (!file.endsWith(".json")) continue;
    const source = join(repository, ".adtf/approvals", file);
    if (JSON.parse(await readFile(source, "utf8")).projectId === projectId) await cp(source, join(memoryRoot, "approvals", file));
  }
  const raw = JSON.parse(await readFile(join(repository, "examples/supervisor-gemini/config.json"), "utf8"));
  await writeFile(join(root, "config.json"), JSON.stringify(raw));
  const config = await loadLivePlanningConfig("config.json", root);
  const memory = new FilePlanningMemoryStore(memoryRoot);
  const store = new FileSupervisorStore(memoryRoot);
  const supervisor = new SupervisorController({ config, memory, store, developmentStore: new FileDevelopmentStore(memoryRoot),
    proposer: { questions: unavailable, scope: unavailable, tasks: unavailable }, writer: { write: unavailable }, reviewer: { review: unavailable } });
  const first = original.taskProposal.orders.find((order) => order.task.dependsOn.length === 0).task;
  const configured = await supervisor.configureVerification({ [first.id]: { verificationProfile: { commandIds: ["check"], inputFiles: [] }, maxReworkAttempts: 1 } });
  await supervisor.initializeTasks(`ACCEPT TASKS r${configured.revision}`);
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  if (placeholders) for (const artifact of first.expectedArtifacts) {
    const path = join(workspace, artifact);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "TEST/STUB evidence placeholder; not product implementation.\n");
  }
  const development = supervisor.development();
  const source = (await development.state()).source;
  assert.deepEqual(source, original.taskProposal.source);
  const engine = (executable) => new LocalVerificationEngine(workspace, { commands: { check: { executable, args: executable === process.execPath ? ["-e", "process.exit(0)"] : [], timeoutMs: 1000 } }, outputLimitBytes: 4096 }, source.contentHash);
  const submit = async () => {
    await development.assign(first.id, "TEST-STUB-reporter", "TEST/STUB manual claim; no real Agent execution");
    await development.submit(first.id, { summary: "TEST/STUB deliberately reports success; not verified", artifacts: first.expectedArtifacts }, "TEST/STUB claimed artifacts");
  };
  return { supervisor, development, first, engine, submit };
}

try {
  const missing = await setup("missing-artifacts", false);
  const dependent = original.taskProposal.orders.find((order) => order.task.dependsOn.includes(missing.first.id)).task;
  await assert.rejects(missing.development.assign(dependent.id, "TEST-STUB-reporter", "TEST/STUB premature dependent"));
  await missing.submit();
  await assert.rejects(missing.development.review(missing.first.id, { passed: true, summary: "TEST/STUB bare success", checks: [] }, "TEST/STUB insufficient review"));
  const firstFailure = await missing.development.verify(missing.first.id, missing.engine(process.execPath), "TEST/STUB missing artifact verification");
  const failed = firstFailure.tasks.find((task) => task.id === missing.first.id);
  assert.equal(failed.status, "rework");
  assert.equal(failed.evidence.outcome, "failed");
  assert.equal(failed.evidence.commands.length, 0);
  await missing.development.transition(missing.first.id, "ready", "TEST/STUB one authorized rework");
  await missing.submit();
  const secondFailure = await missing.development.verify(missing.first.id, missing.engine(process.execPath), "TEST/STUB repeated missing artifacts");
  const blocked = secondFailure.tasks.find((task) => task.id === missing.first.id);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockReason, "verification_limit");
  assert.equal(blocked.attemptCount, 2);
  assert.equal(blocked.reworkCount, 1);
  await assert.rejects(missing.development.transition(missing.first.id, "pending", "TEST/STUB prohibited budget reset"), /limit/);
  const missingReport = await missing.supervisor.report();
  assert.equal(missingReport.progress.completed, false);
  assert.equal(missingReport.workerRuntimeConnected, false);

  const environment = await setup("missing-tool", true);
  await environment.submit();
  const unavailableTool = await environment.development.verify(environment.first.id, environment.engine("adtf-nonexistent-test-check-executable"), "TEST/STUB missing executable");
  const task = unavailableTool.tasks.find((item) => item.id === environment.first.id);
  assert.equal(task.status, "blocked");
  assert.equal(task.blockReason, "environment");
  assert.equal(task.reworkCount, 0);
  assert.equal(task.evidence.outcome, "blocked");
  assert.equal(await fingerprint(), before);
  console.log(JSON.stringify({ label: "TEST/STUB", projectId, source: original.taskProposal.source, primaryStateUnchanged: true,
    noModelOrAgentRuntime: true, observations: { prematureDependencyRejected: true, bareSuccessRejected: true,
      firstMissingArtifact: { status: failed.status, evidence: failed.evidence.outcome, executedCommands: failed.evidence.commands.length },
      repeatedFailure: { status: blocked.status, reason: blocked.blockReason, attempts: blocked.attemptCount, reworks: blocked.reworkCount, resetRejected: true },
      missingTool: { status: task.status, reason: task.blockReason, reworks: task.reworkCount, evidence: task.evidence.outcome, commandReason: task.evidence.commands[0]?.reason },
      report: { completed: missingReport.progress.completed, sourceCurrent: missingReport.progress.sourceCurrent, counts: missingReport.progress.counts, workerRuntimeConnected: missingReport.workerRuntimeConnected } } }, null, 2));
} finally {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
}
