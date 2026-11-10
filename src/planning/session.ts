import { randomUUID, createHash } from "node:crypto";
import { cp, mkdir, open, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve, isAbsolute, dirname, basename } from "node:path";
import type { GoogleGenAI } from "@google/genai";
import { parseScopeContract, type LivePlanningConfig } from "./config.js";
import type { ScopeContract, PlanningLoopState } from "./contracts.js";
import { FilePlanningMemoryStore } from "./memory-store.js";
import { PlanningLoopController } from "./controller.js";
import { GeminiPlanningReviewer, GeminiPlanningWriter } from "./google-genai.js";
import { FileSessionLedger, requestFingerprint, type SessionTransport } from "./session-ledger.js";
import { decideAfterReview } from "./policy.js";
import { buildUserReviewTable } from "./user-review.js";
import { exportUserReviewBundle } from "./review-export.js";

interface SessionSnapshot {
  readonly version: 1;
  readonly config: LivePlanningConfig;
  readonly scope: ScopeContract;
  readonly requirements: string;
  readonly importSource?: string;
}
export interface PlanningSessionStatus {
  readonly projectId: string;
  readonly planning: PlanningLoopState | null;
  readonly budget: Awaited<ReturnType<FileSessionLedger["status"]>>;
  readonly nextAction: "run" | "request_budget_decision" | "inspect_interrupted_request" | "user_decision" | "review_correction";
  readonly additionalCallsForCompleteIteration: number;
  readonly finalApprovalAutomatic: false;
}
const sha = (b: string | Buffer): string => createHash("sha256").update(b).digest("hex");
async function save(file: string, value: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}
export async function sessionFileHashes(root: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  async function walk(dir: string, prefix = ""): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(join(dir, e.name), name);
      else if (e.isFile()) hashes[name] = sha(await readFile(join(dir, e.name)));
      else throw new Error("Session imports/exports cannot contain linked or special files.");
    }
  }
  await walk(root); return hashes;
}
async function createSnapshot(directory: string, snapshot: SessionSnapshot, maxCalls: number, priorCalls: number): Promise<void> {
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory, { recursive: false });
  const bytes = JSON.stringify(snapshot, null, 2) + "\n";
  await writeFile(join(directory, "session.json"), bytes, { flag: "wx" });
  await writeFile(join(directory, "session.sha256"), sha(bytes), { flag: "wx" });
  await new FileSessionLedger(join(directory, "ledger")).initialize({ maxCalls, priorCalls });
  await mkdir(join(directory, "runs"));
}
async function snapshot(directory: string): Promise<SessionSnapshot> {
  const bytes = await readFile(join(directory, "session.json"));
  if (sha(bytes) !== await readFile(join(directory, "session.sha256"), "utf8")) throw new Error("Session source changed; create an approved Scope change instead.");
  const data = JSON.parse(bytes.toString()) as SessionSnapshot;
  if (data.version !== 1) throw new Error("Unsupported session version.");
  parseScopeContract(data.scope, data.config.projectId);
  return data;
}
export async function initializePlanningSession(directory: string, config: LivePlanningConfig, scope: ScopeContract,
  requirements: string, maxCalls: number, approvalRationale: string): Promise<void> {
  parseScopeContract(scope, config.projectId);
  if (!requirements.trim() || !approvalRationale.trim() || !Number.isSafeInteger(maxCalls) || maxCalls < 3) throw new Error("A real Scope approval, requirements and at least three calls are required.");
  await createSnapshot(directory, { version: 1, config: { ...config, memory: { type: "file", directory: "memory" } }, scope, requirements }, maxCalls, 0);
  const memory = new FilePlanningMemoryStore(join(directory, "memory"));
  await memory.createScopeContract(scope);
  const pending = await memory.request(scope.projectId, `Scope Contract ${scope.id} v${scope.version}`);
  await memory.recordDecision(pending.id, "approved", approvalRationale);
  await memory.createScopeApprovalRecord({ projectId: scope.projectId, scopeContractId: scope.id, approvalId: pending.id });
}

/** Imports the recorded one-shot recovery format. Source files and review verdicts remain immutable. */
export async function importPlanningRecovery(directory: string, source: string, config: LivePlanningConfig): Promise<void> {
  const files = await sessionFileHashes(source);
  const manifest = JSON.parse(await readFile(join(source, "artifact-manifest.json"), "utf8")) as { sha256: Record<string, string> };
  delete files["artifact-manifest.json"];
  if (requestFingerprint(files) !== requestFingerprint(manifest.sha256)) throw new Error("Recovery artifact manifest mismatch.");
  for (const name of Object.keys(files)) if (isAbsolute(name) || name.split(/[\\/]/).includes("..")) throw new Error("Unsafe recovery path.");
  const input = JSON.parse(await readFile(join(source, "input.json"), "utf8"));
  const summary = JSON.parse(await readFile(join(source, "summary.json"), "utf8"));
  if (summary.outcome !== "review_recorded" || summary.failure !== null || !summary.challengeCompleted || summary.writerCalled !== false ||
    summary.newSdkAttempts !== 1 || summary.cumulativeSdkAttempts !== summary.priorSdkAttempts + 1 ||
    summary.priorSdkAttempts !== input.priorSdkInvocations || summary.originalCap !== input.maxSdkInvocations ||
    summary.cumulativeSdkAttempts > summary.originalCap) throw new Error("Recovery receipt or budget is incompatible.");
  const scope = parseScopeContract(input.context.approvedScope, config.projectId);
  if (config.planning.reviewer.model.modelId !== input.assessmentRequest.model || config.planning.writer.model.modelId !== input.assessmentRequest.model) throw new Error("Recovery model settings differ from the recorded trial.");
  const original = new FilePlanningMemoryStore(join(source, "memory"));
  const state = await original.getPlanningLoopState(config.projectId);
  if (!state?.currentPlanVersion || state.maxIterations !== config.planning.maxIterations) throw new Error("Recovery Planning budget mismatch.");
  const plan = await original.getPlanDraft(config.projectId, `${config.projectId}-plan`, state.currentPlanVersion);
  const review = plan === undefined ? undefined : await original.getPlanReview(config.projectId, plan.id, plan.version);
  const link = await original.getScopeApprovalRecord(config.projectId, scope.id);
  const approval = link === undefined ? undefined : await original.get(link.approvalId);
  if (!plan || !review || approval?.status !== "approved" || approval.rationale?.startsWith("DEMO FIXTURE:") ||
    approval.subject !== `Scope Contract ${scope.id} v${scope.version}` || approval.projectId !== config.projectId ||
    requestFingerprint(plan) !== requestFingerprint(input.context.currentPlan) ||
    requestFingerprint(await original.getScopeContract(config.projectId, scope.version)) !== requestFingerprint(scope)) throw new Error("Recovery snapshots or real Scope approval mismatch.");
  const decision = decideAfterReview({ review, currentPlan: plan, approvedScope: scope, iterationCount: state.iterationCount, maxIterations: state.maxIterations });
  if (decision.type !== summary.decision || !["REVISE", "REQUEST_USER_APPROVAL"].includes(decision.type)) throw new Error("Recovery requires a supported version-bound decision.");
  if (typeof input.context.originalRequirements !== "string" || !input.context.originalRequirements.trim()) throw new Error("Recovery requirements missing.");
  await createSnapshot(directory, { version: 1, config: { ...config, memory: { type: "file", directory: "memory" } }, scope,
    requirements: input.context.originalRequirements, importSource: requestFingerprint(files) }, summary.originalCap, summary.cumulativeSdkAttempts);
  await cp(join(source, "memory"), join(directory, "memory"), { recursive: true, force: false, errorOnExist: true });
  const memory = new FilePlanningMemoryStore(join(directory, "memory"));
  if (await memory.getRequirements(config.projectId) === undefined) await memory.createRequirements(config.projectId, input.context.originalRequirements);
  if (decision.type === "REVISE") await memory.savePlanningLoopState({ ...state, status: "revising", currentPlanVersion: plan.version, previousReviewId: review.id });
  await save(join(directory, "import-receipt.json"), { summary, sourceHashes: files });
}
export async function planningSessionStatus(directory: string): Promise<PlanningSessionStatus> {
  const data = await snapshot(directory);
  const memory = new FilePlanningMemoryStore(join(directory, "memory"));
  const planning = await memory.getPlanningLoopState(data.config.projectId) ?? null;
  const budget = await new FileSessionLedger(join(directory, "ledger")).status();
  const reason = planning !== null && "reason" in planning ? planning.reason : "";
  const repeatedReviewStop = reason.startsWith("REVIEW_REPEAT:") ||
    planning?.status === "awaiting_user_input" && reason.startsWith("The same issue remains at the same or higher severity:");
  const nextAction = budget.unknownOutcomes ? "inspect_interrupted_request" : repeatedReviewStop ? "review_correction" :
    planning !== null && !["revising", "reviewing"].includes(planning.status) ? "user_decision" :
    (planning === null || planning.status === "revising") && budget.remainingCalls < 3 ? "request_budget_decision" : "run";
  return { projectId: data.config.projectId, planning, budget, nextAction,
    additionalCallsForCompleteIteration: Math.max(0, 3 - budget.remainingCalls), finalApprovalAutomatic: false };
}
export async function increasePlanningSessionBudget(directory: string, maxCalls: number, reason: string): Promise<void> {
  const lock = await open(join(directory, "session.lock"), "wx");
  try { await snapshot(directory); await new FileSessionLedger(join(directory, "ledger")).increaseBudget(maxCalls, reason); }
  finally { await lock.close(); await unlink(join(directory, "session.lock")); }
}

/** A user-invoked run serializes the project; only saved revisions/review failures can continue. */
export async function runPlanningSession(directory: string, transport: SessionTransport, onLog?: (message: string) => void): Promise<PlanningSessionStatus> {
  const lock = await open(join(directory, "session.lock"), "wx");
  try {
    const data = await snapshot(directory);
    const config = { ...data.config, memory: { type: "file" as const, directory: join(directory, "memory") } };
    const memory = new FilePlanningMemoryStore(config.memory.directory);
    const ledger = new FileSessionLedger(join(directory, "ledger"));
    const state = await memory.getPlanningLoopState(config.projectId);
    if (state !== undefined && !["revising", "reviewing"].includes(state.status)) return planningSessionStatus(directory);
    if (state === undefined || state.status === "revising") await ledger.assertAvailable(3);
    const client = { models: { generateContent: (request: Parameters<SessionTransport["generateContent"]>[0]) => ledger.generate(request, {
      generateContent: async value => {
        const progress = await ledger.status();
        onLog?.(`[Model] SDK request ${progress.usedCalls}/${progress.maxCalls} started; model=${value.model}`);
        return transport.generateContent(value);
      },
    }) } } as unknown as GoogleGenAI;
    const controller = new PlanningLoopController({ config, memory, writer: new GeminiPlanningWriter(client, memory), reviewer: new GeminiPlanningReviewer(client, memory),
      ...(onLog ? { onLog } : {}) });
    const input = { requirements: data.requirements, scopeContract: data.scope };
    if (state === undefined) await controller.run(input);
    else if (state.status === "revising") await controller.resume(input, { kind: "review_revision", id: `session-revision-${state.currentPlanVersion}`,
      planId: `${config.projectId}-plan`, expectedState: state });
    else if (state.status === "reviewing") await controller.retryReview(input, `${config.projectId}-plan`, state, "User invoked the durable session run command; exact completed requests are replayed from receipts.");
    return await planningSessionStatus(directory);
  } finally { await lock.close(); await unlink(join(directory, "session.lock")); }
}
export async function exportPlanningSession(directory: string): Promise<string> {
  const lock = await open(join(directory, "session.lock"), "wx");
  try {
    const data = await snapshot(directory);
    const memory = new FilePlanningMemoryStore(join(directory, "memory"));
    const state = await memory.getPlanningLoopState(data.config.projectId);
    const status = await planningSessionStatus(directory);
    await save(join(directory, "runs", `${randomUUID()}.json`), status);
    const output = join(dirname(resolve(directory)), `${basename(directory)}-export-${randomUUID().slice(0, 8)}`);
    await mkdir(output);
    await cp(directory, join(output, "session"), { recursive: true, force: false, errorOnExist: true,
      filter: source => resolve(source) !== resolve(directory, "session.lock") });
    await save(join(output, "export-status.json"), status);
    if (state?.currentPlanVersion) {
      const plan = await memory.getPlanDraft(data.config.projectId, `${data.config.projectId}-plan`, state.currentPlanVersion);
      if (plan) {
        const review = await memory.getPlanReview(data.config.projectId, plan.id, plan.version);
        const link = await memory.getScopeApprovalRecord(data.config.projectId, data.scope.id);
        const approval = link === undefined ? undefined : await memory.get(link.approvalId);
        const pending = state.status === "awaiting_approval" ? await memory.get(state.approvalId) : undefined;
        await exportUserReviewBundle(join(output, "review"), plan, buildUserReviewTable({ scope: data.scope, plan, planning: state,
          ...(review ? { review } : {}), ...(approval ? { scopeApproval: approval } : {}), ...(pending ? { planApproval: pending } : {}) }));
      }
    }
    return output;
  } finally { await lock.close(); await unlink(join(directory, "session.lock")); }
}
