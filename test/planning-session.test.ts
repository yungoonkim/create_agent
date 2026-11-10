import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenerateContentResponse, type GenerateContentParameters } from "@google/genai";
import { FileSessionLedger } from "../src/planning/session-ledger.js";
import { initializePlanningSession, runPlanningSession, planningSessionStatus, exportPlanningSession, importPlanningRecovery, sessionFileHashes } from "../src/planning/session.js";
import { PlanningLoopController } from "../src/planning/controller.js";
import { loadLivePlanningConfig } from "../src/planning/config.js";
import { FilePlanningMemoryStore } from "../src/planning/memory-store.js";
import { WRITER_SYSTEM_INSTRUCTION, REVIEWER_SYSTEM_INSTRUCTION } from "../src/planning/prompts.js";
import { bindStorageAudit, parseStorageAudit, storageAuditFindings, validateStorageAudit } from "../src/planning/storage-audit.js";

function reply(text: string): GenerateContentResponse {
  return Object.assign(new GenerateContentResponse(), { candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }], usageMetadata: { totalTokenCount: 11 } });
}
async function temporary(t: { after(fn: () => Promise<unknown>): void }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "planning-session-")); t.after(() => rm(root, { recursive: true, force: true })); return root;
}
const request = (contents: string): GenerateContentParameters => ({ model: "test", contents, config: { httpOptions: { retryOptions: { attempts: 1 } } } });

test("session receipts survive reconstruction, reuse only exact requests and do not count cached tokens twice", async t => {
  const dir = await temporary(t); const ledger = new FileSessionLedger(dir); await ledger.initialize({ maxCalls: 3, priorCalls: 0 });
  let calls = 0; const transport = { generateContent: async () => { calls++; return reply("result"); } };
  assert.equal((await ledger.generate(request("scope-v1"), transport)).text, "result");
  const fresh = new FileSessionLedger(dir);
  const cached = await fresh.generate(request("scope-v1"), transport);
  assert.equal(cached.text, "result"); assert.equal(cached.usageMetadata, undefined);
  await fresh.generate(request("scope-v2"), transport);
  assert.equal(calls, 2); assert.equal((await fresh.status()).usedCalls, 2); assert.equal((await fresh.status()).knownTokens, 22);
  await assert.rejects(fresh.initialize({ maxCalls: 99, priorCalls: 0 }), { code: "EEXIST" });
});
test("failed or interrupted requests cannot replay and reservations consume the original budget", async t => {
  const dir = await temporary(t); const ledger = new FileSessionLedger(dir); await ledger.initialize({ maxCalls: 6, priorCalls: 4 });
  let calls = 0;
  const failed = { generateContent: async () => { calls++; throw new Error("provider failure"); } };
  await assert.rejects(ledger.generate(request("same"), failed));
  await assert.rejects(ledger.generate(request("same"), failed), /already failed/);
  assert.equal(calls, 1); assert.equal((await ledger.status()).usedCalls, 5);
  await writeFile(join(dir, "calls", "0002.started.json"), JSON.stringify({ fingerprint: "unknown" }));
  await assert.rejects(ledger.generate(request("different"), failed), /unknown outcome/);
  assert.equal(calls, 1); assert.equal((await ledger.status()).usedCalls, 6);
});
test("explicit budget increase preserves original cap, prior requests and append-only authorization receipts", async t => {
  const dir = await temporary(t); const ledger = new FileSessionLedger(dir); await ledger.initialize({ maxCalls: 6, priorCalls: 4 });
  const original = await readFile(join(dir, "budget.json"), "utf8");
  await ledger.increaseBudget(7, "TEST: user explicitly authorized one more total request");
  const status = await ledger.status(); assert.equal(status.originalMaxCalls, 6); assert.equal(status.maxCalls, 7);
  assert.equal(status.usedCalls, 4); assert.equal(status.remainingCalls, 3);
  assert.equal(await readFile(join(dir, "budget.json"), "utf8"), original);
  await assert.rejects(ledger.increaseBudget(6, "reset")); await assert.rejects(ledger.increaseBudget(9, ""));
  await writeFile(join(dir, "budget.json"), JSON.stringify({ maxCalls: 99, priorCalls: 0 }));
  await assert.rejects(ledger.status(), /modified/);
});
test("grouped acceptance keeps legacy verdicts intact and never substitutes for loaded/candidate rules", () => {
  const plan = { id: "p", projectId: "p", version: 1, scopeContractId: "s", scopeVersion: 1, status: "ready_for_review" as const,
    createdAt: "2026-11-10T00:00:00Z", content: "JSON field rules\nLoad validates fields\nCandidate validates fields\nInvalid payload is rejected and original data stays unchanged" };
  const raw = { format: "json", evidenceLines: [1], rationale: "TEST/STUB", cases: ["absent", "present_empty", "invalid", "valid", "read_error"].map(state => ({ state,
    action: state === "absent" ? "initialize" : state === "valid" ? "load" : "preserve_and_block", verdict: "consistent", evidenceLines: [4], authorizationScopeIds: [], rationale: "TEST/STUB" })),
    validation: { rationale: "TEST/STUB", rules: ["name", "state"].map(rule => ({ rule, status: "supported", load: { evidenceLines: [2] }, candidate: { evidenceLines: [3] }, acceptance: { evidenceLines: [] }, rationale: "TEST/STUB grouped rejection" })) } };
  const legacy = parseStorageAudit(bindStorageAudit(raw, plan));
  assert.equal(storageAuditFindings(legacy).issues.length, 2);
  const groupedRaw = { ...raw, validation: { ...raw.validation, version: 2, acceptanceGroups: [{ ruleIndexes: [1, 2], acceptance: { evidenceLines: [4] }, rationale: "TEST/STUB shared rejection scenario" }] } };
  const grouped = parseStorageAudit(bindStorageAudit(groupedRaw, plan));
  assert.equal(storageAuditFindings(grouped).issues.length, 0);
  const missing = structuredClone(groupedRaw); missing.validation.rules[0]!.load.evidenceLines = [];
  assert.equal(storageAuditFindings(parseStorageAudit(bindStorageAudit(missing, plan))).issues.length, 1);
  const invalid = structuredClone(groupedRaw); invalid.validation.acceptanceGroups[0]!.ruleIndexes = [3];
  assert.throws(() => parseStorageAudit(bindStorageAudit(invalid, plan)), /rule indexes/);
  const forged = structuredClone(grouped); (forged.validation!.acceptanceGroups![0]!.acceptance.evidence as string[])[0] = "invented evidence";
  assert.throws(() => validateStorageAudit(forged, plan, { id: "s", projectId: "p", version: 1, goal: "test", requiredFeatures: [], excludedFeatures: [], technicalConstraints: [], createdAt: plan.createdAt }));
  assert.equal(storageAuditFindings(legacy).issues.length, 2);
});

async function fixture(t: { after(fn: () => Promise<unknown>): void }, maxCalls: number) {
  const dir = await temporary(t);
  const source = JSON.parse(await readFile("examples/parking-planning/recovery-input.json", "utf8"));
  const config = await loadLivePlanningConfig("examples/parking-planning/config.json", process.cwd());
  const session = join(dir, "session");
  await initializePlanningSession(session, config, source.context.approvedScope, source.context.originalRequirements, maxCalls, "TEST: real approval boundary supplied by test caller.");
  let calls = 0;
  const transport = { generateContent: async (req: GenerateContentParameters) => {
    calls++;
    if (req.config?.systemInstruction === WRITER_SYSTEM_INSTRUCTION) return reply(source.context.currentPlan.content);
    if (req.config?.systemInstruction === REVIEWER_SYSTEM_INSTRUCTION) {
      const raw = JSON.parse(source.assessmentResponse.text);
      const marker = "DATA:\n\n"; const prompt = req.contents as string;
      const context = JSON.parse(prompt.slice(prompt.lastIndexOf(marker) + marker.length));
      const first = context.currentPlan.version === 1;
      raw.outcome = first ? "revise" : "pass";
      raw.issues = first ? [{ id: "missing-test-rule", kind: "omission", severity: "major", description: "TEST/STUB add the missing rule", suggestedDirection: "TEST/STUB correction" }] : [];
      if (!first) {
        raw.qualityAssessment.checks = raw.qualityAssessment.checks.map((c: { id: string }) => c.id === "revision_resolution" ? { ...c, status: "satisfied", evidenceLines: [11], rationale: "TEST/STUB correction" } : c);
        raw.revisionAudit = { preservation: Object.keys(context.preservationSources).map(sourceId => ({ sourceId, status: "preserved", before: { evidenceLines: [11] }, after: { evidenceLines: [11] }, rationale: "TEST/STUB" })),
          resolutions: Object.keys(context.previousIssueSources).map(issueId => ({ issueId, status: "resolved", current: { evidenceLines: [11] }, rationale: "TEST/STUB" })) };
      }
      return reply(JSON.stringify(raw));
    }
    // Explicit TEST/STUB only: tests orchestration, never certifies semantic quality.
    return reply(JSON.stringify({ issues: [], questions: [], storageAudit: { format: "none", evidenceLines: [], rationale: "TEST/STUB orchestration only", cases: [], validation: { rationale: "TEST/STUB", rules: [] } } }));
  } };
  return { dir, session, source, config, transport, calls: () => calls };
}
test("one session command revises automatically, retains snapshots and stops for final user approval", async t => {
  const f = await fixture(t, 6); await runPlanningSession(f.session, f.transport);
  const memory = new FilePlanningMemoryStore(join(f.session, "memory"));
  const state = await memory.getPlanningLoopState(f.config.projectId);
  assert.equal(state?.status, "awaiting_approval"); assert.equal(state.currentPlanVersion, 2); assert.equal(f.calls(), 5);
  if (state.status === "awaiting_approval") assert.equal((await memory.get(state.approvalId))?.status, "pending");
  assert.ok(await memory.getPlanDraft(f.config.projectId, `${f.config.projectId}-plan`, 1));
  await runPlanningSession(f.session, f.transport); assert.equal(f.calls(), 5);
  const output = await exportPlanningSession(f.session);
  assert.match(await readFile(join(output, "export-status.json"), "utf8"), /awaiting_approval/);
  assert.notEqual(output, f.session);
});
test("insufficient budget stops before a new revision and repeated run does not reset counters or call models", async t => {
  const f = await fixture(t, 4);
  await assert.rejects(runPlanningSession(f.session, f.transport), /REQUEST_BUDGET/);
  const memory = new FilePlanningMemoryStore(join(f.session, "memory"));
  assert.equal((await memory.getPlanningLoopState(f.config.projectId))?.status, "revising");
  assert.equal(f.calls(), 2);
  await assert.rejects(runPlanningSession(f.session, f.transport), /REQUEST_BUDGET/); assert.equal(f.calls(), 2);
  await writeFile(join(f.session, "session.lock"), "another run");
  await assert.rejects(runPlanningSession(f.session, f.transport), { code: "EEXIST" });
  assert.match(JSON.stringify(await planningSessionStatus(f.session)), /"usedCalls":2/);
});
test("verified recovery import preserves 4/6 budget, real Scope approval, original review and source files", async t => {
  const f = await fixture(t, 4); await assert.rejects(runPlanningSession(f.session, f.transport), /REQUEST_BUDGET/);
  const source = join(f.dir, "receipt"); await mkdir(source);
  await cp(join(f.session, "memory"), join(source, "memory"), { recursive: true });
  const originalMemory = new FilePlanningMemoryStore(join(f.session, "memory"));
  const importedInput = { ...f.source, context: { ...f.source.context, currentPlan: await originalMemory.getPlanDraft(f.config.projectId, `${f.config.projectId}-plan`, 1) } };
  await writeFile(join(source, "input.json"), JSON.stringify(importedInput));
  await writeFile(join(source, "summary.json"), JSON.stringify({ outcome: "review_recorded", failure: null, decision: "REVISE", challengeCompleted: true,
    writerCalled: false, newSdkAttempts: 1, priorSdkAttempts: 3, cumulativeSdkAttempts: 4, originalCap: 6 }));
  await writeFile(join(source, "artifact-manifest.json"), JSON.stringify({ sha256: await sessionFileHashes(source) }));
  const before = await sessionFileHashes(source); const target = join(f.dir, "imported");
  await importPlanningRecovery(target, source, f.config);
  let paid = 0;
  await assert.rejects(runPlanningSession(target, { generateContent: async () => { paid++; return reply("unexpected"); } }), /REQUEST_BUDGET/);
  assert.equal(paid, 0); const status = await new FileSessionLedger(join(target, "ledger")).status();
  assert.equal(status.usedCalls, 4); assert.equal(status.remainingCalls, 2);
  assert.deepEqual(await sessionFileHashes(source), before);
  const m = new FilePlanningMemoryStore(join(target, "memory"));
  const saved = await m.getPlanningLoopState(f.config.projectId);
  assert.equal(saved?.status, "revising");
  assert.ok(await m.getPlanReview(f.config.projectId, `${f.config.projectId}-plan`, 1));
  await writeFile(join(source, "input.json"), "{}");
  await assert.rejects(importPlanningRecovery(join(f.dir, "tampered"), source, f.config), /manifest mismatch/);
});
test("explicit saved-revision continuation checks its exact state and approval before writing", async t => {
  const f = await fixture(t, 4); await assert.rejects(runPlanningSession(f.session, f.transport), /REQUEST_BUDGET/);
  const memory = new FilePlanningMemoryStore(join(f.session, "memory"));
  const state = (await memory.getPlanningLoopState(f.config.projectId))!;
  let writes = 0;
  const controller = new PlanningLoopController({ config: f.config, memory, writer: { write: async c => {
    writes++; return { ...c.currentDraft!, version: c.currentDraft!.version + 1, content: c.currentDraft!.content + "\nTEST/STUB corrected" };
  } }, reviewer: { review: async c => ({ id: "review-2", projectId: c.projectId, planId: c.currentPlan.id, planVersion: 2,
    scopeContractId: c.approvedScope.id, scopeVersion: c.approvedScope.version, outcome: "pass", issues: [], suggestions: [], scopeViolation: false,
    userJudgmentRequired: false, reviewedAt: "2026-11-10T00:00:00Z" }) } });
  const input = { requirements: f.source.context.originalRequirements, scopeContract: f.source.context.approvedScope };
  await assert.rejects(controller.resume(input, { kind: "review_revision", id: "resume-test", planId: `${f.config.projectId}-plan`, expectedState: { ...state, iterationCount: 0 } }));
  assert.equal(writes, 0);
  const result = await controller.resume(input, { kind: "review_revision", id: "resume-test", planId: `${f.config.projectId}-plan`, expectedState: state });
  assert.equal(writes, 1); assert.equal(result.state.status, "awaiting_approval");
  assert.equal(result.state.iterationCount, 2);
});
