import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GoogleGenAI } from "@google/genai";
import { REVIEW_CHECK_IDS, type PlanDraft, type PlanReview, type PlanningReviewerContext, type RevisionAudit, type ScopeContract } from "../src/planning/contracts.js";
import { GeminiPlanningReviewer } from "../src/planning/google-genai.js";
import { PlanningLoopController } from "../src/planning/controller.js";
import { FilePlanningMemoryStore } from "../src/planning/memory-store.js";
import { parsePlanningConfig } from "../src/planning/config.js";
import { bindReviewEvidence } from "../src/planning/review-quality.js";
import { bindStorageAudit, parseStorageAudit } from "../src/planning/storage-audit.js";
import { bindRevisionAudit, preservationSources, revisionIssueSources, validateRevisionSource } from "../src/planning/revision-audit.js";
import { decideAfterReview, validatePlanReview } from "../src/planning/policy.js";
import { buildUserReviewTable, renderUserReviewTable } from "../src/planning/user-review.js";
import { REVIEW_CHALLENGE_SYSTEM_INSTRUCTION } from "../src/planning/prompts.js";

// New household-lending scenario. TEST/STUB responses only, never a replay of recorded Gemini trials.
const scope: ScopeContract = { id: "lending-scope", projectId: "lending-review-test", version: 1, goal: "빌려준 물건 기록 기획",
  requiredFeatures: [{ id: "LEND-1", statement: "물건 이름과 빌린 사람은 필수이며 같은 내용도 별도 등록한다." },
    { id: "LEND-2", statement: "한 건의 반납 완료/취소 및 확인 후 삭제, 취소 시 무변경을 지원한다." }],
  excludedFeatures: [{ id: "EX-1", statement: "외부 공유·알림·제품 구현·팀원 실행 제외" }],
  technicalConstraints: ["루트/필드·비공백 이름·반납 불리언을 로드와 후보 모두 검증한다.", "손상/읽기 예외 보존·무쓰기 차단, 커밋 전 실패는 입력/목록 보존."], createdAt: "2026-11-09T00:00:00Z" };
const content = ["# 빌려준 물건 기록", "물건 이름/빌린 사람을 적어 고유 ID로 등록하고 같은 내용도 독립 기록으로 둔다.",
  "공백 이름이나 사람이면 안내하고 입력·목록·저장값을 유지한다.", "확인: 우산/민수를 두 번 등록하면 두 건이며 빈 이름은 추가되지 않는다.",
  "선택 ID 한 건의 반납 불리언을 바꾸고 취소할 수 있으며 삭제는 확인 후 한 건이다.", "삭제 취소나 쓰기 실패는 입력·목록·저장값을 유지한다.",
  "확인: 첫 우산만 반납 처리하고 둘째 삭제를 취소하면 둘째는 남는다.",
  "공통 검증표: schemaVersion=1, items 배열, 고유 문자열 ID, 비공백 name/borrower, returned 불리언이다.",
  "불러온 JSON은 공통 검증표의 모든 필드·값 검증에 통과한 경우만 목록으로 로드한다.",
  "전체 변경 후보에도 공통 검증표의 같은 필드·값 검증을 적용한 뒤 직렬화·setItem 성공·화면 확정한다.",
  "확인: 저장된 returned='완료' 또는 공백 name은 원본 보존·변경 차단이며 같은 잘못된 후보도 쓰기 전에 거부한다.",
  "getItem null만 빈 메모리로 시작한다. 기존 빈/손상/값 오류는 원본을 보존하고 무쓰기·변경 차단한다.",
  "getItem 자체 SecurityError 예외는 무쓰기·오류 안내·변경 차단이다.", "로그인·외부 공유·알림은 제외하며 실제 구현/승인을 주장하지 않는다."].join("\n");
const plan = (v = 1): PlanDraft => ({ id: "lending-review-test-plan", projectId: scope.projectId, version: v,
  scopeContractId: scope.id, scopeVersion: scope.version, content, status: "ready_for_review", createdAt: scope.createdAt });
const role = { model: { providerId: "vertex-ai", modelId: "gemini-3.8-flash" }, personaId: "test" };
const at = (...evidenceLines: number[]) => ({ evidenceLines });
function context(currentPlan = plan(), previousPlan?: PlanDraft, previous?: PlanReview): PlanningReviewerContext {
  return { projectId: scope.projectId, originalRequirements: scope.goal, approvedScope: scope, currentPlan, settledDecisions: [],
    ...(previousPlan ? { previousPlan } : {}), ...(previous ? { previousReviews: [previous] } : {}) };
}
function assessment() {
  return { outcome: "pass", issues: [] as unknown[], suggestions: [], scopeViolation: false, userJudgmentRequired: false,
    qualityAssessment: { version: 1, requirements: scope.requiredFeatures.map((r, i) => ({ requirementId: r.id, status: "satisfied", evidenceLines: [2 + i * 3], rationale: "TEST/STUB explicit source",
      behaviorEvidence: { normal: at(2 + i * 3), failure: at(3 + i * 3), acceptance: at(4 + i * 3), failureNotApplicableReason: "" } })),
      checks: REVIEW_CHECK_IDS.map(id => ({ id, status: "satisfied", evidenceLines: [8], rationale: "TEST/STUB check" })) } };
}
function comparison(c: PlanningReviewerContext) {
  return { preservation: Object.keys(preservationSources(scope)).map(sourceId => ({ sourceId, status: "preserved", before: at(8, 9), after: at(8, 9), rationale: "TEST/STUB compare actual specifications" })),
    resolutions: Object.keys(revisionIssueSources(c.previousReviews?.[0])).map(issueId => ({ issueId, status: "resolved", current: at(9, 11), rationale: "TEST/STUB correction has an actual rule and example" })) };
}
function storage() {
  return { format: "json", evidenceLines: [8], rationale: "TEST/STUB JSON design",
    validation: { rationale: "Common loaded and candidate rules", rules: [{ rule: "필드·이름·반납 값", status: "supported", load: at(8, 9), candidate: at(8, 10), acceptance: at(11), rationale: "TEST/STUB source roles" }] },
    cases: ["absent", "present_empty", "invalid", "valid", "read_error"].map(state => ({ state, action: state === "absent" ? "initialize" : state === "valid" ? "load" : "preserve_and_block",
      verdict: "consistent", trigger: at(state === "read_error" ? 13 : state === "valid" ? 9 : 12), evidenceLines: [state === "read_error" ? 13 : state === "valid" ? 9 : 12],
      authorizationScopeIds: [], rationale: "TEST/STUB condition/action" })) };
}
function review(c = context(), rawComparison = comparison(c)): PlanReview {
  const a = assessment();
  if (!c.previousPlan) a.qualityAssessment.checks = a.qualityAssessment.checks.map(r => r.id !== "revision_resolution" ? r : { ...r, status: "not_applicable", evidenceLines: [] });
  return validatePlanReview({ ...a, id: `review-${c.currentPlan.version}`, projectId: c.projectId, planId: c.currentPlan.id,
    planVersion: c.currentPlan.version, scopeContractId: scope.id, scopeVersion: scope.version, reviewedAt: scope.createdAt,
    qualityAssessment: bindReviewEvidence(a.qualityAssessment, c.currentPlan), revisionAudit: bindRevisionAudit(rawComparison, c),
  }, c.currentPlan, scope);
}
const decide = (r: PlanReview, p = plan(2), count = 1) => decideAfterReview({ review: r, currentPlan: p, approvedScope: scope, iterationCount: count, maxIterations: 2 });
async function memory(t: { after: (fn: () => Promise<unknown>) => void }) {
  const root = await mkdtemp(join(tmpdir(), "adtf-lending-evidence-")); t.after(() => rm(root, { recursive: true, force: true }));
  return new FilePlanningMemoryStore(root);
}

test("revision context rejects absent, foreign and nonpreceding snapshots before any model call", async t => {
  const m = await memory(t); let calls = 0;
  const client = { models: { generateContent: async () => { calls++; throw new Error("Must not be called"); } } } as unknown as GoogleGenAI;
  for (const c of [context(plan(2)), context(plan(2), { ...plan(), projectId: "other" }), context(plan(3), plan())]) {
    await assert.rejects(new GeminiPlanningReviewer(client, m).review(c, role), /previous Plan|baseline/);
  }
  assert.equal(calls, 0);
});

test("revision matrix binds both actual versions and requires every requirement, constraint and prior issue exactly once", () => {
  const earlier = { ...review(), issues: [{ id: "old-rule", kind: "omission" as const, severity: "major" as const, description: "Missing loaded validation", suggestedDirection: "Restore it" }] };
  const c = context(plan(2), plan(), earlier), r = review(c);
  assert.equal(r.revisionAudit?.preservation.length, 4); assert.equal(r.revisionAudit?.resolutions[0]?.issueId, "old-rule");
  for (const mutate of [
    (a: RevisionAudit) => ({ ...a, preservation: a.preservation.slice(1) }),
    (a: RevisionAudit) => ({ ...a, preservation: a.preservation.map(() => a.preservation[0]!) }),
    (a: RevisionAudit) => ({ ...a, resolutions: [] }),
    (a: RevisionAudit) => ({ ...a, resolutions: [{ ...a.resolutions[0]!, issueId: "invented" }] }),
    (a: RevisionAudit) => ({ ...a, preservation: [{ ...a.preservation[0]!, before: { evidenceLines: [8], evidence: ["fabricated"] } }, ...a.preservation.slice(1)] }),
  ]) assert.throws(() => validatePlanReview({ ...r, revisionAudit: mutate(r.revisionAudit!) }, plan(2), scope));
});

test("a pass cannot hide lost rules or unresolved issues; revision limit and user-table uncertainty remain enforced", () => {
  const earlier = { ...review(), issues: [{ id: "old-rule", kind: "omission" as const, severity: "major" as const, description: "Load rules missing", suggestedDirection: "Specify both stages" }] };
  const c = context(plan(2), plan(), earlier), raw = comparison(c);
  const r = review(c, { ...raw, preservation: raw.preservation.map((x, i) => i ? x : { ...x, status: "unclear", after: at() }),
    resolutions: raw.resolutions.map(x => ({ ...x, status: "unresolved", current: at() })) });
  assert.equal(r.outcome, "pass"); assert.equal(decide(r).type, "REVISE"); assert.equal(decide(r, plan(2), 2).type, "STOP_LIMIT_REACHED");
  assert.ok(Object.keys(revisionIssueSources(r)).includes("preservation:requirement:LEND-1"));
  assert.ok(Object.keys(revisionIssueSources(r)).includes("old-rule"));
  const table = buildUserReviewTable({ scope, plan: plan(2), review: r, planning: { projectId: scope.projectId, scopeContractId: scope.id, scopeVersion: 1,
    status: "awaiting_approval", currentPlanVersion: 2, iterationCount: 2, maxIterations: 3, reviewId: r.id, approvalId: "pending" } });
  assert.ok(table.rows.every(x => x.status === "needs_check"));
  assert.match(renderUserReviewTable(table), /이전 지적|이전 기획 원문/);
});

test("stored review cannot replace baseline history or silently omit real previous feedback", async t => {
  const m = await memory(t);
  await m.importDemoFixture(scope, { approval: { id: "fixture", projectId: scope.projectId, subject: `Scope Contract ${scope.id} v1`, status: "approved", rationale: "DEMO FIXTURE: isolated" },
    scopeApproval: { projectId: scope.projectId, scopeContractId: scope.id, approvalId: "fixture" } });
  await m.createPlanDraft(plan());
  const earlier = { ...review(), issues: [{ id: "real-issue", kind: "omission" as const, severity: "major" as const, description: "Loaded values", suggestedDirection: "Use common rules" }] };
  await m.createPlanReview(earlier); await m.createPlanDraft(plan(2));
  const dishonest = review(context(plan(2), plan())); // internally consistent embedded history, wrong stored history
  await assert.rejects(m.createPlanReview(dishonest), /discarded or invented/);
  const correct = review(context(plan(2), plan(), earlier));
  validateRevisionSource(correct.revisionAudit!, plan(), earlier);
  assert.throws(() => validateRevisionSource(correct.revisionAudit!, { ...plan(), content: content + "\nchanged" }, earlier), /stored preceding/);
  await m.createPlanReview(correct);
  assert.deepEqual(await m.getPlanReview(scope.projectId, plan().id, 2), correct);
  const file = join(m.rootDirectory, "projects", scope.projectId, "planning", "reviews", plan().id, "v2.json");
  const saved = await readFile(file, "utf8");
  await writeFile(file, JSON.stringify(dishonest));
  await assert.rejects(m.getPlanReview(scope.projectId, plan().id, 2), /discarded or invented/);
  await writeFile(file, saved);
});

test("first-review normalization never discards a blocking finding misfiled under revision resolution", async t => {
  const m = await memory(t), raw = assessment(); let calls = 0;
  raw.qualityAssessment.checks = raw.qualityAssessment.checks.map(r => r.id === "revision_resolution" ? { ...r, status: "needs_user_input", rationale: "A product decision is missing" } : r);
  const client = { models: { generateContent: async () => { calls++; return { text: JSON.stringify(raw) }; } } } as unknown as GoogleGenAI;
  await assert.rejects(new GeminiPlanningReviewer(client, m).review(context(), role), /blocking finding/);
  assert.equal(calls, 1);
});

test("new JSON responses must include validation proof; non-JSON reviews and immutable legacy data remain readable", async t => {
  const m = await memory(t); let calls = 0;
  const { validation: _v, ...old } = storage();
  const client = { models: { generateContent: async () => ({ text: JSON.stringify(++calls === 1 ? assessment() : { issues: [], questions: [], storageAudit: old }) }) } } as unknown as GoogleGenAI;
  await assert.rejects(new GeminiPlanningReviewer(client, m).review(context(), role), /mandatory common/);
  const { revisionAudit: _a, ...legacy } = review();
  assert.doesNotThrow(() => validatePlanReview({ ...legacy, storageAudit: bindStorageAudit(old, plan()) }, plan(), scope));
  const none = { format: "none", evidenceLines: [], evidence: [], rationale: "Memory only", cases: [], validation: { rationale: "No storage", rules: [] } };
  assert.equal(decide({ ...review(), storageAudit: parseStorageAudit(none) }, plan()).type, "REQUEST_USER_APPROVAL");
  assert.throws(() => parseStorageAudit({ ...none, validation: storage().validation }));
});

test("common loaded/candidate/example proof gaps and a generic valid trigger block approval even with supported labels", () => {
  const c = context(), r = review(c), good = storage();
  const audit = parseStorageAudit(bindStorageAudit(good, plan()));
  assert.equal(decide({ ...r, storageAudit: audit }, plan()).type, "REQUEST_USER_APPROVAL");
  for (const key of ["load", "candidate", "acceptance"] as const) {
    const bad = { ...good, validation: { ...good.validation, rules: good.validation.rules.map(x => ({ ...x, [key]: at() })) } };
    assert.equal(decide({ ...r, storageAudit: parseStorageAudit(bindStorageAudit(bad, plan())) }, plan()).type, "REVISE");
  }
  const badTrigger = { ...good, cases: good.cases.map(x => x.state === "valid" ? { ...x, trigger: at(5) } : x) };
  assert.equal(decide({ ...r, storageAudit: parseStorageAudit(bindStorageAudit(badTrigger, plan())) }, plan()).type, "REVISE");
  const noRules = { ...good, validation: { ...good.validation, rules: [] } };
  assert.equal(decide({ ...r, storageAudit: parseStorageAudit(bindStorageAudit(noRules, plan())) }, plan()).type, "REVISE");
  const wrong = { ...audit, validation: { ...audit.validation!, rules: audit.validation!.rules.map(x => ({ ...x, load: { evidenceLines: [1], evidence: ["invented"] } })) } };
  assert.throws(() => validatePlanReview({ ...r, storageAudit: wrong }, plan(), scope));
});

test("headings alone cannot support new behavior roles, while explicit shared load/candidate evidence is allowed", () => {
  const r = review(); const q = r.qualityAssessment!;
  const changed = { ...r, qualityAssessment: { ...q, requirements: q.requirements.map((x, i) => i ? x : { ...x,
    behaviorEvidence: { ...x.behaviorEvidence!, acceptance: { evidenceLines: [1], evidence: [content.split('\n')[0]!] } } }) } };
  assert.equal(decide(changed, plan()).type, "REVISE");
  assert.ok(Object.keys(revisionIssueSources(changed)).includes("quality:requirement:LEND-1"));
  const questions = revisionIssueSources({ ...r, userJudgmentRequired: true, suggestions: ["동일 물건을 별도 기록할까요?"] });
  assert.equal(questions["question:1"], "동일 물건을 별도 기록할까요?");
  const shared = storage(); shared.validation.rules[0]!.candidate = at(8, 9);
  assert.equal(decide({ ...r, storageAudit: parseStorageAudit(bindStorageAudit(shared, plan())) }, plan()).type, "REQUEST_USER_APPROVAL");
});

test("first-review applicability is derived from history; later feedback and changed Scope are not falsely certified", async t => {
  const m = await memory(t); let calls = 0;
  const client = { models: { generateContent: async () => ({ text: JSON.stringify(++calls === 1 ? assessment() : { issues: [], questions: [], storageAudit: storage() }) }) } } as unknown as GoogleGenAI;
  const first = await new GeminiPlanningReviewer(client, m).review(context(), role);
  assert.equal(calls, 2); assert.equal(first.revisionAudit?.mode, "initial");
  assert.equal(first.qualityAssessment?.checks.find(x => x.id === "revision_resolution")?.status, "not_applicable");
  assert.match(renderUserReviewTable(buildUserReviewTable({ scope, plan: plan(), review: first })), /첫 기획 검토/);
  const changedPlan = { ...plan(2), scopeVersion: 2 };
  const a = bindRevisionAudit(undefined, { ...context(changedPlan, plan()), approvedScope: { ...scope, version: 2 } });
  assert.equal(a.mode, "scope_changed"); assert.deepEqual(a.preservation, []);
  const previous = { ...review(), issues: [{ id: "pending", kind: "omission" as const, severity: "major" as const, description: "Missing rule", suggestedDirection: "Add rule" }] };
  const r = review(context(plan(2), plan(), previous));
  assert.throws(() => validatePlanReview({ ...r, qualityAssessment: { ...r.qualityAssessment!, checks: r.qualityAssessment!.checks.map(x => x.id === "revision_resolution" ? { ...x, status: "not_applicable" } : x) } }, plan(2), scope));
});

test("Controller passes real previous snapshots and retains a detected regression until a later corrected version", async t => {
  const m = await memory(t);
  const approval = { id: "fixture", projectId: scope.projectId, subject: `Scope Contract ${scope.id} v1`, status: "approved" as const, rationale: "DEMO FIXTURE: isolated" };
  await m.importDemoFixture(scope, { approval, scopeApproval: { projectId: scope.projectId, scopeContractId: scope.id, approvalId: approval.id } });
  const requests: { contents: string; config: { systemInstruction: string } }[] = [];
  const client = { models: { generateContent: async (req: typeof requests[number]) => {
    requests.push(req);
    if (req.config.systemInstruction.startsWith(REVIEW_CHALLENGE_SYSTEM_INSTRUCTION)) return { text: JSON.stringify({ issues: [], questions: [], storageAudit: storage() }) };
    const marker = 'DATA:\n\n'; const data = JSON.parse(req.contents.slice(req.contents.lastIndexOf(marker) + marker.length));
    const raw = assessment(); const v = data.currentPlan.version;
    if (v === 1) { raw.outcome = "revise"; raw.issues = [{ kind: "omission", severity: "major", description: "TEST/STUB initial defect", suggestedDirection: "Restore common validation", scopeDisposition: "not_applicable", dispositionReason: "Within approved Scope" }]; }
    const revisionAudit = v === 1 ? undefined : { preservation: Object.keys(data.preservationSources).map(sourceId => ({ sourceId,
      status: v === 2 && sourceId === "constraint:1" ? "unclear" : "preserved", before: at(8), after: v === 2 && sourceId === "constraint:1" ? at() : at(8), rationale: "TEST/STUB explicit regression check" })),
      resolutions: Object.keys(data.previousIssueSources).map(issueId => ({ issueId, status: "resolved", current: at(8, 11), rationale: "TEST/STUB rule/example" })) };
    if (v > 1) assert.equal(data.previousPlan.version, v - 1);
    return { text: JSON.stringify({ ...raw, revisionAudit }) };
  } } } as unknown as GoogleGenAI;
  const reviewer = new GeminiPlanningReviewer(client, m); let writes = 0;
  const config = parsePlanningConfig({ projectId: scope.projectId, planning: { maxIterations: 3, requireUserApproval: true, writer: { providerId: "fake", modelId: "fake" }, reviewer: { providerId: "fake", modelId: "fake" } }, memory: { type: "file", directory: m.rootDirectory } }, m.rootDirectory);
  const result = await new PlanningLoopController({ config, memory: m, reviewer: { review: c => reviewer.review(c, role) },
    writer: { write: async c => {
      writes++; if (writes === 3) assert.match(JSON.stringify(c.reviewFeedback), /constraint:1/);
      return writes === 2 ? { ...plan(2), content: content.replace("불러온 JSON은 공통 검증표의 모든 필드·값 검증에 통과한 경우만 목록으로 로드한다.", "불러오면 목록으로 표시한다.") } : plan(writes);
    } },
  }).run({ requirements: scope.goal, scopeContract: scope });
  assert.equal(requests.length, 4); assert.equal(writes, 3); assert.equal(result.state.status, "awaiting_approval");
  assert.equal(result.approval?.status, "pending"); assert.deepEqual(await m.getScopeContract(scope.projectId, 1), scope);
  assert.deepEqual(await m.getPlanDraft(scope.projectId, plan().id, 1), plan());
  assert.equal((await m.getPlanReview(scope.projectId, plan().id, 2))?.outcome, "pass");
  assert.match((await m.getPlanDraft(scope.projectId, plan().id, 2))!.content, /불러오면 목록으로 표시한다/);
  assert.ok(Object.keys(revisionIssueSources((await m.getPlanReview(scope.projectId, plan().id, 2))!)).includes("preservation:constraint:1"));
});
