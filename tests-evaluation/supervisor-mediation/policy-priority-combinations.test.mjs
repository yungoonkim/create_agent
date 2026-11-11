import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// In-memory .js -> .ts resolver and parameter-property desugaring so src/**/*.ts
// can be imported directly under `node --test` without generating dist/ or mutating the workspace.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith(".") &&
      specifier.endsWith(".js") &&
      context.parentURL?.startsWith("file:")
    ) {
      const parentDir = dirname(fileURLToPath(context.parentURL));
      const tsCandidate = resolve(parentDir, specifier.slice(0, -3) + ".ts");
      if (existsSync(tsCandidate)) {
        return nextResolve(pathToFileURL(tsCandidate).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".ts")) {
      const raw = readFileSync(fileURLToPath(url), "utf8");
      const source = raw.replace(
        /constructor\(\s*readonly\s+([a-zA-Z0-9_]+)\s*:\s*([^,)]+),\s*([a-zA-Z0-9_]+\s*:\s*[^)]+)\)\s*\{\s*super\(([^)]*)\);/g,
        "readonly $1: $2; constructor($1: $2, $3) { super($4); this.$1 = $1;",
      );
      return nextLoad(url, { ...context, format: "module-typescript", source });
    }
    return nextLoad(url, context);
  },
});

const { REVIEW_CHECK_IDS, STORAGE_AUDIT_STATES } = await import(
  "../../src/planning/contracts.ts"
);
const { decideAfterReview, validatePlanReview } = await import(
  "../../src/planning/policy.ts"
);
const { buildShadowContext, validateShadowProposal } = await import(
  "../../src/supervisor/triage-shadow.ts"
);
const { buildUserReviewTable, renderUserReviewTable } = await import(
  "../../src/planning/user-review.ts"
);
const { validateRevisionSource } = await import(
  "../../src/planning/revision-audit.ts"
);

const CREATED_AT = "2026-11-10T00:00:00.000Z";
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function baseScope(overrides = {}) {
  return {
    id: "qa-scope-1",
    projectId: "qa-project",
    version: 1,
    goal: "TEST/STUB 로컬 우산 및 식물 기록 관리",
    requiredFeatures: [
      { id: "R1", statement: "기록을 로컬에 저장하고 잘못된 입력 시 기존 기록을 보존한다." },
    ],
    excludedFeatures: [
      { id: "EX-SMS", statement: "외부 SMS 알림 발송은 제외한다." },
    ],
    technicalConstraints: ["로컬 데이터 보존"],
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function basePlan(overrides = {}) {
  return {
    id: "qa-plan",
    projectId: "qa-project",
    version: 1,
    scopeContractId: "qa-scope-1",
    scopeVersion: 1,
    content: [
      "# 1. 저장소 및 예외 처리 설계",
      "삭제 취소 시 기존 기록을 그대로 유지한다.",
      "수정 화면에서 잘못된 날짜를 입력하면 기존 기록에 먼저 덮어쓴다.",
      "같은 이름의 항목을 새로 입력하면 저장한다.",
    ].join("\n"),
    status: "ready_for_review",
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function baseReview(overrides = {}) {
  return {
    id: "qa-review-1",
    projectId: "qa-project",
    planId: "qa-plan",
    planVersion: 1,
    scopeContractId: "qa-scope-1",
    scopeVersion: 1,
    outcome: "revise",
    issues: [],
    suggestions: [],
    scopeViolation: false,
    userJudgmentRequired: false,
    reviewedAt: CREATED_AT,
    ...overrides,
  };
}

function makeQuality(plan, reqStatus = "satisfied", checkOverrides = {}) {
  const line2 = plan.content.split("\n")[1];
  const ev = { evidenceLines: [2], evidence: [line2] };
  return {
    version: 1,
    requirements: [
      {
        requirementId: "R1",
        status: reqStatus,
        evidenceLines: reqStatus === "satisfied" ? [2] : [],
        evidence: reqStatus === "satisfied" ? [line2] : [],
        rationale: reqStatus === "satisfied" ? "규칙 확인" : "추가 확인 필요",
        behaviorEvidence: {
          normal: ev,
          failure: ev,
          acceptance: ev,
          failureNotApplicableReason: "",
        },
      },
    ],
    checks: REVIEW_CHECK_IDS.map((id) => ({
      id,
      status: checkOverrides[id]?.status ?? "satisfied",
      evidenceLines: (checkOverrides[id]?.status ?? "satisfied") === "satisfied" ? [2] : [],
      evidence: (checkOverrides[id]?.status ?? "satisfied") === "satisfied" ? [line2] : [],
      rationale: checkOverrides[id]?.rationale ?? "검토 완료",
    })),
  };
}

function makeStorageAudit(plan, caseOverrides = {}, validation = undefined) {
  const line2 = plan.content.split("\n")[1];
  const ev = { evidenceLines: [2], evidence: [line2] };
  return {
    format: "json",
    evidenceLines: [2],
    evidence: [line2],
    rationale: "TEST/STUB JSON 저장 감사",
    ...(validation ? { validation } : {}),
    cases: STORAGE_AUDIT_STATES.map((state) => ({
      state,
      action: state === "absent" ? "initialize" : state === "valid" ? "load" : "preserve_and_block",
      verdict: "consistent",
      ...ev,
      authorizationScopeIds: [],
      rationale: `${state} 처리 확인`,
      ...(caseOverrides[state] ?? {}),
    })),
  };
}

test("[Combo-01A & Combo-01B] 심각한 기술 결함(및 반복 결함)과 사용자 선택 질문의 동시 발생", () => {
  const scope = baseScope();
  const planV1 = basePlan({ version: 1 });
  const planV2 = basePlan({ version: 2 });
  const criticalIssue = {
    id: "loss",
    kind: "implementation_risk",
    severity: "critical",
    relatedRequirementId: "R1",
    scopeDisposition: "not_applicable",
    dispositionReason: "범위 내 기술 결함",
    description: "잘못된 날짜 입력 시 기존 기록을 덮어쓴다.",
    suggestedDirection: "검증 실패 시 기존 기록을 보존한다.",
  };

  // Combo-01A: 최초 발생 (비반복) 치명적 결함 + 사용자 질문
  const reviewV1WithQuestion = baseReview({
    id: "review-v1",
    planVersion: 1,
    outcome: "needs_user_input",
    userJudgmentRequired: true,
    issues: [criticalIssue],
    suggestions: ["동일 이름 우산을 별도 항목으로 허용할까요, 기존 항목을 갱신할까요?"],
  });
  const input01A = {
    approvedScope: scope,
    currentPlan: planV1,
    review: reviewV1WithQuestion,
    iterationCount: 1,
    maxIterations: 3,
  };
  const decision01A = decideAfterReview(input01A);
  assert.equal(decision01A.type, "REQUEST_USER_INPUT");

  // Shadow Context는 두 지적이 모두 존재함을 보존하고, 기술 결함의 USER_CLARIFICATION 격하를 거부함
  const shadow01A = buildShadowContext(input01A);
  assert.equal(shadow01A.baseline.type, "REQUEST_USER_INPUT");
  assert.equal(shadow01A.findings.length, 2);
  assert.deepEqual(
    shadow01A.findings.map((f) => ({ id: f.id, technicalBlocker: f.technicalBlocker })),
    [
      { id: "review:loss", technicalBlocker: true },
      { id: "suggestion:1", technicalBlocker: false },
    ],
  );
  const validMixedProposal = {
    schemaVersion: 1,
    contextSha256: shadow01A.contextSha256,
    author: { kind: "manual_fixture", version: "qa-test-v1" },
    findings: [
      {
        findingId: "review:loss",
        category: "WRITER_REWORK",
        rationale: "데이터 손실 결함은 범위 내 수정 대상이다.",
        proposedAction: "검증 실패 시 기존 값을 유지하도록 수정한다.",
        evidenceRefs: ["finding:review:loss", "plan:L3", "scope:requirement:R1"],
      },
      {
        findingId: "suggestion:1",
        category: "USER_CLARIFICATION",
        rationale: "중복 이름 처리 정책은 사용자 선택 사항이다.",
        proposedAction: "사용자에게 별도 보관과 갱신 중 선택을 요청한다.",
        evidenceRefs: ["finding:suggestion:1", "plan:L4", "scope:requirement:R1"],
      },
    ],
    summaryForUser: "기술 결함 수정과 중복 이름 처리 선택 질문을 분리합니다.",
  };
  assert.equal(
    validateShadowProposal(shadow01A, validMixedProposal).status,
    "structurally_valid_for_manual_inspection",
  );

  // Combo-01B: v1 -> v2에서 동일한 critical 결함(loss)이 반복되었으나, v2에 질문이 함께 들어간 경우
  // 질문이 없을 때는 STOP_REPEATED_REVIEW_ISSUES가 반환됨
  const reviewV1OnlyLoss = baseReview({
    id: "review-v1-loss",
    planVersion: 1,
    outcome: "revise",
    issues: [criticalIssue],
  });
  const reviewV2OnlyLoss = baseReview({
    id: "review-v2-loss",
    planVersion: 2,
    outcome: "revise",
    issues: [criticalIssue],
  });
  assert.equal(
    decideAfterReview({
      approvedScope: scope,
      currentPlan: planV2,
      review: reviewV2OnlyLoss,
      previousReview: reviewV1OnlyLoss,
      iterationCount: 2,
      maxIterations: 3,
    }).type,
    "STOP_REPEATED_REVIEW_ISSUES",
  );

  // 그러나 v2에 사용자 질문이 1건이라도 추가되면 P6(L189)가 P7(L196)보다 먼저 실행되어
  // STOP_REPEATED_REVIEW_ISSUES 대신 REQUEST_USER_INPUT으로 빠짐을 재현
  const reviewV2RepeatedPlusQuestion = {
    ...reviewV2OnlyLoss,
    outcome: "needs_user_input",
    userJudgmentRequired: true,
    suggestions: ["날짜 표시 형식을 선택해 주세요."],
  };
  const decision01B = decideAfterReview({
    approvedScope: scope,
    currentPlan: planV2,
    review: reviewV2RepeatedPlusQuestion,
    previousReview: reviewV1OnlyLoss,
    iterationCount: 2,
    maxIterations: 3,
  });
  assert.equal(decision01B.type, "REQUEST_USER_INPUT");
});

test("[Combo-02A & Combo-02B] Reviewer의 범위 밖 요구와 Scope 내 해결 가능한 결함의 동시 존재 및 scopeIssueIds 오염 재현", () => {
  const scope = baseScope();
  const plan = basePlan();

  // Combo-02B: change_scope(1건) + revise_plan(1건) + clarify(1건) + critical 결함(1건)이 동시에 존재할 때
  const review = baseReview({
    scopeViolation: true,
    issues: [
      {
        id: "scope-overreach-change",
        kind: "scope_violation",
        severity: "major",
        scopeDisposition: "change_scope",
        dispositionReason: "Reviewer가 SMS 추가를 요구함",
        description: "SMS 알림을 Scope에 추가해야 한다.",
        suggestedDirection: "Scope에 SMS 추가",
      },
      {
        id: "scope-in-scope-revise",
        kind: "scope_violation",
        severity: "major",
        scopeDisposition: "revise_plan",
        dispositionReason: "기존 Scope 유지, 초안의 불필요 문구만 제거",
        description: "초안에 승인되지 않은 외부 공유 문구가 포함되었다.",
        suggestedDirection: "초안에서 외부 공유 문구 제거(Scope 변경 아님)",
      },
      {
        id: "scope-clarify-item",
        kind: "scope_violation",
        severity: "minor",
        scopeDisposition: "clarify",
        dispositionReason: "사용자 확인 필요",
        description: "알림 문구 표현 방식이 모호하다.",
        suggestedDirection: "표현 방식 질문",
      },
      {
        id: "in-scope-critical-loss",
        kind: "implementation_risk",
        severity: "critical",
        scopeDisposition: "not_applicable",
        dispositionReason: "범위 내 기술 결함",
        description: "잘못된 날짜 입력 시 기존 기록을 덮어쓴다.",
        suggestedDirection: "검증 실패 시 기존 기록 유지",
      },
    ],
  });

  const decision = decideAfterReview({
    approvedScope: scope,
    currentPlan: plan,
    review,
    iterationCount: 1,
    maxIterations: 3,
  });

  // 현재 Policy 동작 재현:
  // 1) userRequest 없이도 REQUEST_SCOPE_CHANGE_APPROVAL이 최우선 반환됨
  assert.equal(decision.type, "REQUEST_SCOPE_CHANGE_APPROVAL");
  // 2) 결함 재현: decision.issueIds에 change_scope뿐만 아니라 revise_plan과 clarify 이슈 ID까지 모두 포함됨!
  assert.deepEqual(decision.issueIds, [
    "scope-overreach-change",
    "scope-in-scope-revise",
    "scope-clarify-item",
  ]);

  // 3) 반대로 Shadow 검증(validateShadowProposal)에서는 userRequest가 없으므로
  // scope-overreach-change를 SCOPE_CHANGE_REQUIRED로 분류하면 USER_REQUEST_REQUIRED로 거부됨
  const shadow = buildShadowContext({
    approvedScope: scope,
    currentPlan: plan,
    review,
    iterationCount: 1,
    maxIterations: 3,
  });
  const badProposal = {
    schemaVersion: 1,
    contextSha256: shadow.contextSha256,
    author: { kind: "manual_fixture", version: "qa-test-v1" },
    findings: shadow.findings.map((f) => ({
      findingId: f.id,
      category: f.id === "review:scope-overreach-change" ? "SCOPE_CHANGE_REQUIRED" : "WRITER_REWORK",
      rationale: "TEST/STUB",
      proposedAction: "TEST/STUB",
      evidenceRefs: [`finding:${f.id}`, "plan:L2", "scope:excluded:1"],
    })),
    summaryForUser: "TEST/STUB",
  };
  const validation = validateShadowProposal(shadow, badProposal);
  assert.equal(validation.status, "rejected");
  assert.ok(validation.errors.includes("USER_REQUEST_REQUIRED:review:scope-overreach-change"));
});

test("[Combo-03A & Combo-03B] 반복 결함과 반복 한도 도달 동시 발생 및 반복 감지 사각지대 재현", () => {
  const scope = baseScope();
  const planV1 = basePlan({ version: 1 });
  const planV2 = basePlan({ version: 2 });
  const issueV1 = {
    id: "loss",
    kind: "implementation_risk",
    severity: "critical",
    relatedRequirementId: "R1",
    description: "수정 내용을 먼저 덮어쓴 뒤 검증한다.",
    suggestedDirection: "검증 후 저장한다.",
  };

  // Combo-03A: 동일 ID 반복 + 반복 한도(2/2) 동시 도달 -> STOP_REPEATED_REVIEW_ISSUES 우선
  const decision03A = decideAfterReview({
    approvedScope: scope,
    currentPlan: planV2,
    review: baseReview({ id: "r2", planVersion: 2, issues: [issueV1] }),
    previousReview: baseReview({ id: "r1", planVersion: 1, issues: [issueV1] }),
    iterationCount: 2,
    maxIterations: 2,
  });
  assert.equal(decision03A.type, "STOP_REPEATED_REVIEW_ISSUES");

  // Combo-03B 변형 1: qualityFindings(missing)가 v1과 v2에서 동일하게 반복되었으나
  // findUnresolvedRepeatedIssues가 qualityFindings를 검사하지 않아 REVISE가 반환됨을 재현
  const qMissingV1 = makeQuality(planV1, "missing");
  const qMissingV2 = makeQuality(planV2, "missing");
  const decision03BQuality = decideAfterReview({
    approvedScope: scope,
    currentPlan: planV2,
    review: baseReview({ id: "r2-q", planVersion: 2, outcome: "pass", qualityAssessment: qMissingV2 }),
    previousReview: baseReview({ id: "r1-q", planVersion: 1, outcome: "pass", qualityAssessment: qMissingV1 }),
    iterationCount: 1,
    maxIterations: 3,
  });
  assert.equal(decision03BQuality.type, "REVISE");

  // Combo-03B 변형 2: storageValidation.rules에서 동일한 "createdAt" 규칙이 차단되었으나
  // 배열 인덱스가 v1(0번 -> issue-storage-validation-1)에서 v2(1번 -> issue-storage-validation-2)로 밀린 경우
  // findUnresolvedRepeatedIssues가 동일 인덱스만 비교하여 반복을 감지하지 못하고 REVISE를 반환함을 재현
  const line2 = planV1.content.split("\n")[1];
  const validRule = (rule) => ({
    rule,
    status: "supported",
    load: { evidenceLines: [2], evidence: [line2] },
    candidate: { evidenceLines: [2], evidence: [line2] },
    acceptance: { evidenceLines: [2], evidence: [line2] },
    rationale: "연결 완료",
  });
  const blockedRule = (rule) => ({
    rule,
    status: "supported",
    load: { evidenceLines: [2], evidence: [line2] },
    candidate: { evidenceLines: [2], evidence: [line2] },
    acceptance: { evidenceLines: [], evidence: [] },
    rationale: "확인 사례 누락",
  });

  const reviewV1Storage = baseReview({
    id: "r1-storage",
    planVersion: 1,
    outcome: "pass",
    storageAudit: makeStorageAudit(planV1, {}, {
      version: 2,
      rationale: "v1 검증",
      rules: [blockedRule("createdAt")],
      acceptanceGroups: [],
    }),
  });
  const reviewV2StorageShifted = baseReview({
    id: "r2-storage",
    planVersion: 2,
    outcome: "pass",
    storageAudit: makeStorageAudit(planV2, {}, {
      version: 2,
      rationale: "v2 검증",
      rules: [validRule("id"), blockedRule("createdAt")],
      acceptanceGroups: [],
    }),
  });

  const decision03BShifted = decideAfterReview({
    approvedScope: scope,
    currentPlan: planV2,
    review: reviewV2StorageShifted,
    previousReview: reviewV1Storage,
    iterationCount: 1,
    maxIterations: 3,
  });
  assert.equal(decision03BShifted.type, "REVISE");
});

test("[Combo-04A, Combo-04B, Combo-04C] Review 실패, 사용자 질문, Scope 변경 요청, 반복 한도의 복합 발생", () => {
  const scope = baseScope();
  const plan = basePlan();

  // Combo-04A: outcome === "failed" + Scope 변경 + 질문 -> FAILED가 우선하여 차단됨 (정상)
  const failedComboReview = baseReview({
    outcome: "failed",
    scopeViolation: true,
    userJudgmentRequired: true,
    suggestions: ["질문 1"],
    issues: [
      {
        id: "scope-change-1",
        kind: "scope_violation",
        severity: "major",
        scopeDisposition: "change_scope",
        dispositionReason: "변경 요청",
        description: "SMS 추가",
        suggestedDirection: "Scope 변경",
      },
    ],
  });
  assert.equal(
    decideAfterReview({
      approvedScope: scope,
      currentPlan: plan,
      review: failedComboReview,
      iterationCount: 1,
      maxIterations: 3,
    }).type,
    "FAILED",
  );

  // Combo-04B: currentPlan.scopeVersion(2) !== approvedScope.version(1) 이면서
  // review.outcome === "failed" (및 review.scopeVersion === 1) 인 경우
  // P2(L139)가 P3/P4(L151-L166)보다 먼저 실행되어 FAILED 대신 REQUEST_SCOPE_CHANGE_APPROVAL(issueIds: []) 반환
  const unapprovedScopePlan = basePlan({ scopeVersion: 2 });
  const decision04B = decideAfterReview({
    approvedScope: scope,
    currentPlan: unapprovedScopePlan,
    review: failedComboReview,
    iterationCount: 1,
    maxIterations: 3,
  });
  assert.equal(decision04B.type, "REQUEST_SCOPE_CHANGE_APPROVAL");
  assert.deepEqual(decision04B.issueIds, []);

  // Combo-04C: 반복 한도 도달(iterationCount === maxIterations === 2) 상태에서 질문 또는 Scope 변경 발생 시
  // STOP_LIMIT_REACHED(L213) 대신 REQUEST_USER_INPUT / REQUEST_SCOPE_CHANGE_APPROVAL 반환
  const questionAtLimit = decideAfterReview({
    approvedScope: scope,
    currentPlan: plan,
    review: baseReview({
      outcome: "needs_user_input",
      userJudgmentRequired: true,
      suggestions: ["한도 도달 시점의 질문"],
    }),
    iterationCount: 2,
    maxIterations: 2,
  });
  assert.equal(questionAtLimit.type, "REQUEST_USER_INPUT");
});

test("[Combo-05A & Combo-05B] Reviewer PASS 반환 시 로컬 품질/저장 감사 실패 차단 및 onlyHeadings 경계 재현", () => {
  const scope = baseScope();
  const plan = basePlan();

  // Combo-05A: Reviewer는 pass + issues: []를 반환했으나 storageAudit에 무근거 초기화가 있는 경우 -> REVISE로 정상 차단
  const passWithUnsafeStorage = baseReview({
    outcome: "pass",
    issues: [],
    qualityAssessment: makeQuality(plan, "satisfied"),
    storageAudit: makeStorageAudit(plan, {
      present_empty: { action: "initialize", authorizationScopeIds: [] },
    }),
  });
  assert.equal(
    decideAfterReview({
      approvedScope: scope,
      currentPlan: plan,
      review: passWithUnsafeStorage,
      iterationCount: 1,
      maxIterations: 3,
    }).type,
    "REVISE",
  );

  // Combo-05B: Plan 1행("# 1. 저장소 및 예외 처리 설계")이 제목 줄일 때,
  // revisionAudit가 없는 상태에서 behaviorEvidence와 storageAudit.cases가 모두 1행(제목 줄)만 인용해도
  // REQUEST_USER_APPROVAL이 반환됨을 재현
  const headingEv = { evidenceLines: [1], evidence: [plan.content.split("\n")[0]] };
  const passWithHeadingOnly = baseReview({
    outcome: "pass",
    issues: [],
    qualityAssessment: {
      version: 1,
      requirements: [
        {
          requirementId: "R1",
          status: "satisfied",
          ...headingEv,
          rationale: "제목만 인용",
          behaviorEvidence: {
            normal: headingEv,
            failure: headingEv,
            acceptance: headingEv,
            failureNotApplicableReason: "",
          },
        },
      ],
      checks: REVIEW_CHECK_IDS.map((id) => ({
        id,
        status: "satisfied",
        ...headingEv,
        rationale: "제목만 인용",
      })),
    },
    storageAudit: {
      format: "json",
      ...headingEv,
      rationale: "제목만 인용",
      cases: STORAGE_AUDIT_STATES.map((state) => ({
        state,
        action: state === "absent" ? "initialize" : state === "valid" ? "load" : "preserve_and_block",
        verdict: "consistent",
        ...headingEv,
        authorizationScopeIds: [],
        rationale: "제목만 인용",
      })),
    },
  });
  const decision05B = decideAfterReview({
    approvedScope: scope,
    currentPlan: plan,
    review: passWithHeadingOnly,
    iterationCount: 1,
    maxIterations: 3,
  });
  assert.equal(decision05B.type, "REQUEST_USER_APPROVAL");

  // 반면 동일한 qualityAssessment에 초기 revisionAudit가 추가되면 reviewAssuranceFindings가 작동하여 REVISE로 차단됨
  const decision05BWithRevisionAudit = decideAfterReview({
    approvedScope: scope,
    currentPlan: plan,
    review: {
      ...passWithHeadingOnly,
      qualityAssessment: {
        ...passWithHeadingOnly.qualityAssessment,
        checks: passWithHeadingOnly.qualityAssessment.checks.map((c) =>
          c.id === "revision_resolution"
            ? { ...c, status: "not_applicable", evidenceLines: [], evidence: [] }
            : c,
        ),
      },
      revisionAudit: {
        version: 1,
        mode: "initial",
        baseline: null,
        previousIssueIds: [],
        preservation: [],
        resolutions: [],
      },
    },
    iterationCount: 1,
    maxIterations: 3,
  });
  assert.equal(decision05BWithRevisionAudit.type, "REVISE");
});

test("[Combo-06A] 서로 다른 조치 필요 시 scopeDisposition: clarify와 일반 질문 간의 상호 질문 증발 결함 재현", () => {
  const scope = baseScope();
  const plan = basePlan();
  const review = baseReview({
    outcome: "needs_user_input",
    scopeViolation: true,
    userJudgmentRequired: true,
    issues: [
      {
        id: "clarify-umbrella-dup",
        kind: "scope_violation",
        severity: "major",
        scopeDisposition: "clarify",
        dispositionReason: "중복 이름 허용 여부는 사용자 결정 사항",
        description: "동일 이름 우산의 중복 허용 여부가 정해지지 않았다.",
        suggestedDirection: "사용자에게 확인",
      },
      {
        id: "critical-overwrite",
        kind: "implementation_risk",
        severity: "critical",
        scopeDisposition: "not_applicable",
        dispositionReason: "범위 내 결함",
        description: "수정 시 기존 기록 덮어쓰기 결함",
        suggestedDirection: "검증 실패 시 보존",
      },
    ],
    suggestions: ["일반 질문: 목록 기본 정렬 순서를 최신순으로 할까요?"],
    qualityAssessment: makeQuality(plan, "needs_user_input"),
    storageAudit: makeStorageAudit(plan, {
      present_empty: {
        action: "preserve_and_block",
        verdict: "needs_user_input",
        rationale: "빈 저장소 파일 발견 시 초기화 허용 여부 확인 필요",
      },
    }),
  });

  // 1) decideAfterReview()는 P5c(L181)에서 clarify 이슈만 반환하고,
  // qualityAssessment 질문, storageAudit 질문, review.suggestions 질문을 모두 증발시킴!
  const decision = decideAfterReview({
    approvedScope: scope,
    currentPlan: plan,
    review,
    iterationCount: 1,
    maxIterations: 3,
  });
  assert.equal(decision.type, "REQUEST_USER_INPUT");
  assert.deepEqual(decision.questions, [
    "동일 이름 우산의 중복 허용 여부가 정해지지 않았다. — 중복 이름 허용 여부는 사용자 결정 사항",
  ]);

  // 2) 반대로 buildUserReviewTable()은 qualityAssessment 질문, storageAudit 질문, review.suggestions는 포함하지만
  // 정작 decideAfterReview()가 유일하게 채택한 clarify-umbrella-dup 질문을 table.questions에서 누락함!
  const table = buildUserReviewTable({
    scope,
    plan,
    review,
    planning: {
      projectId: scope.projectId,
      scopeContractId: scope.id,
      scopeVersion: scope.version,
      iterationCount: 1,
      maxIterations: 3,
      status: "awaiting_user_input",
      currentPlanVersion: 1,
      reviewId: review.id,
      reason: decision.questions.join("\n"),
    },
  });
  assert.equal(
    table.questions.some((q) => q.includes("동일 이름 우산의 중복 허용 여부")),
    false,
  );
  assert.equal(
    table.questions.some((q) => q.includes("present_empty: 빈 저장소 파일")),
    true,
  );

  // 만약 clarify 이슈만 단독으로 존재하는 경우, 사용자 검토표(review.md)에는 "기록된 질문 없음"이 출력됨!
  const clarifyOnlyReview = baseReview({
    outcome: "revise",
    scopeViolation: true,
    userJudgmentRequired: false,
    issues: [review.issues[0]],
  });
  const clarifyOnlyDecision = decideAfterReview({
    approvedScope: scope,
    currentPlan: plan,
    review: clarifyOnlyReview,
    iterationCount: 1,
    maxIterations: 3,
  });
  assert.equal(clarifyOnlyDecision.type, "REQUEST_USER_INPUT");
  const clarifyOnlyTable = buildUserReviewTable({
    scope,
    plan,
    review: clarifyOnlyReview,
    planning: {
      projectId: scope.projectId,
      scopeContractId: scope.id,
      scopeVersion: scope.version,
      iterationCount: 1,
      maxIterations: 3,
      status: "awaiting_user_input",
      currentPlanVersion: 1,
      reviewId: clarifyOnlyReview.id,
      reason: clarifyOnlyDecision.questions.join("\n"),
    },
  });
  assert.deepEqual(clarifyOnlyTable.questions, []);
  assert.match(renderUserReviewTable(clarifyOnlyTable), /기록된 질문 없음/);
});

test("[Combo-07A & Combo-08] 잘못된 지적과 유효한 지적의 공존 및 레거시 scope_violation의 technicalBlocker 판정 모순 재현", () => {
  const scope = baseScope();
  const plan = basePlan();

  // Combo-07A: 오독 지적(false-alarm) + 유효한 결함(valid-loss) -> Shadow에서 REVIEWER_RECHECK + WRITER_REWORK 분리 가능
  const review07A = baseReview({
    issues: [
      {
        id: "false-alarm",
        kind: "unverifiable",
        severity: "major",
        description: "삭제 취소 시 기존 기록 유지 규칙이 없다.",
        suggestedDirection: "삭제 취소 규칙 추가",
      },
      {
        id: "valid-loss",
        kind: "implementation_risk",
        severity: "critical",
        description: "잘못된 날짜 입력 시 기존 기록을 덮어쓴다.",
        suggestedDirection: "검증 실패 시 기존 기록 보존",
      },
    ],
  });
  const shadow07A = buildShadowContext({
    approvedScope: scope,
    currentPlan: plan,
    review: review07A,
    iterationCount: 1,
    maxIterations: 3,
  });
  assert.equal(shadow07A.baseline.type, "REVISE");
  const proposal07A = {
    schemaVersion: 1,
    contextSha256: shadow07A.contextSha256,
    author: { kind: "manual_fixture", version: "qa-test-v1" },
    findings: [
      {
        findingId: "review:false-alarm",
        category: "REVIEWER_RECHECK",
        rationale: "기획 L2에 이미 삭제 취소 시 유지 규칙이 명시되어 있다.",
        proposedAction: "원문 L2를 대조하여 Reviewer 오독 여부를 재확인한다.",
        evidenceRefs: ["finding:review:false-alarm", "plan:L2", "scope:requirement:R1"],
      },
      {
        findingId: "review:valid-loss",
        category: "WRITER_REWORK",
        rationale: "기획 L3에서 검증 전 덮어쓰기 위험이 실제로 존재한다.",
        proposedAction: "검증 통과 후에만 저장하도록 Writer 재작성을 지시한다.",
        evidenceRefs: ["finding:review:valid-loss", "plan:L3", "scope:requirement:R1"],
      },
    ],
    summaryForUser: "오독 지적 1건은 재확인하고 실제 데이터 손실 결함 1건은 수정합니다.",
  };
  assert.equal(
    validateShadowProposal(shadow07A, proposal07A).status,
    "structurally_valid_for_manual_inspection",
  );

  // Combo-08 변형 1: 레거시 scope_violation (scopeDisposition: undefined, severity: "major") + 명시적 userRequest 존재
  // decideAfterReview()는 REQUEST_SCOPE_CHANGE_APPROVAL을 반환하지만,
  // buildShadowContext()는 technicalBlocker: true로 설정하여 validateShadowProposal()이 SCOPE_CHANGE_REQUIRED를 거부함!
  const legacyScopeReview = baseReview({
    scopeViolation: true,
    issues: [
      {
        id: "legacy-sms",
        kind: "scope_violation",
        severity: "major",
        description: "사용자가 요청한 SMS 기능이 현재 Scope에 없다.",
        suggestedDirection: "Scope 변경 승인 필요",
      },
    ],
  });
  const shadow08Legacy = buildShadowContext(
    {
      approvedScope: scope,
      currentPlan: plan,
      review: legacyScopeReview,
      iterationCount: 1,
      maxIterations: 3,
    },
    "물 줄 때가 되면 내 휴대전화로 SMS 알림도 받고 싶다.",
  );
  assert.equal(shadow08Legacy.baseline.type, "REQUEST_SCOPE_CHANGE_APPROVAL");
  assert.equal(shadow08Legacy.findings[0].technicalBlocker, true);

  const proposal08Legacy = {
    schemaVersion: 1,
    contextSha256: shadow08Legacy.contextSha256,
    author: { kind: "manual_fixture", version: "qa-test-v1" },
    findings: [
      {
        findingId: "review:legacy-sms",
        category: "SCOPE_CHANGE_REQUIRED",
        rationale: "명시적 사용자 요청이 존재하며 현재 Scope에서 제외된 기능이다.",
        proposedAction: "Scope 변경 승인 절차를 안내한다.",
        evidenceRefs: ["finding:review:legacy-sms", "plan:L2", "scope:excluded:1", "user:request"],
      },
    ],
    summaryForUser: "SMS 추가에 대한 Scope 변경 승인을 요청합니다.",
  };
  const res08Legacy = validateShadowProposal(shadow08Legacy, proposal08Legacy);
  assert.equal(res08Legacy.status, "rejected");
  assert.ok(res08Legacy.errors.includes("BLOCKER_DOWNGRADED:review:legacy-sms"));

  // Combo-08 변형 2: 반대로 severity: "minor", kind: "scope_violation", scopeDisposition: "revise_plan"인 경우
  // decideAfterReview()는 승인을 차단하고 REVISE를 강제하지만,
  // buildShadowContext()는 technicalBlocker: false로 설정하여 USER_CLARIFICATION 격하가 허용됨!
  const minorScopeReviseReview = baseReview({
    outcome: "pass",
    scopeViolation: true,
    issues: [
      {
        id: "minor-excluded-added",
        kind: "scope_violation",
        severity: "minor",
        scopeDisposition: "revise_plan",
        dispositionReason: "초안에서 제외 기능 문구 삭제 필요",
        description: "초안에 제외된 SMS 문구가 포함되었다.",
        suggestedDirection: "SMS 문구 삭제",
      },
    ],
  });
  const shadow08Minor = buildShadowContext({
    approvedScope: scope,
    currentPlan: plan,
    review: minorScopeReviseReview,
    iterationCount: 1,
    maxIterations: 3,
  });
  assert.equal(shadow08Minor.baseline.type, "REVISE");
  assert.equal(shadow08Minor.findings[0].technicalBlocker, false);
  const downgradedMinorProposal = {
    schemaVersion: 1,
    contextSha256: shadow08Minor.contextSha256,
    author: { kind: "manual_fixture", version: "qa-test-v1" },
    findings: [
      {
        findingId: "review:minor-excluded-added",
        category: "USER_CLARIFICATION",
        rationale: "사용자 취향 질문으로 격하 시도",
        proposedAction: "질문으로 전환",
        evidenceRefs: ["finding:review:minor-excluded-added", "plan:L2", "scope:excluded:1"],
      },
    ],
    summaryForUser: "TEST/STUB",
  };
  assert.equal(
    validateShadowProposal(shadow08Minor, downgradedMinorProposal).status,
    "structurally_valid_for_manual_inspection",
  );
});

test("[Combo-09 & Combo-10] 빈 질문 배열 선점, 비구조화 scopeViolation finding 누락, validateRevisionSource 미호출 재현", () => {
  const scope = baseScope();
  const planV1 = basePlan({ version: 1 });
  const planV2 = basePlan({ version: 2 });
  const criticalIssue = {
    id: "loss",
    kind: "implementation_risk",
    severity: "critical",
    relatedRequirementId: "R1",
    description: "기존 기록 덮어쓰기 결함",
    suggestedDirection: "기존 기록 보존",
  };

  // Combo-09 변형 1: userJudgmentRequired: true 이지만 questions: [], suggestions: [] 인 상태에서
  // 반복된 critical 결함이 있어도 빈 질문 배열(questions: [])을 가진 REQUEST_USER_INPUT이 반환됨
  const emptyQuestionReview = baseReview({
    id: "r2-empty-q",
    planVersion: 2,
    outcome: "revise",
    userJudgmentRequired: true,
    suggestions: [],
    issues: [criticalIssue],
  });
  const decision09A = decideAfterReview({
    approvedScope: scope,
    currentPlan: planV2,
    review: emptyQuestionReview,
    previousReview: baseReview({ id: "r1-loss", planVersion: 1, issues: [criticalIssue] }),
    iterationCount: 2,
    maxIterations: 3,
  });
  assert.deepEqual(decision09A, { type: "REQUEST_USER_INPUT", questions: [] });

  // Combo-09 변형 2: scopeViolation: true 이지만 issues: [] 일 때
  // decideAfterReview()는 REQUEST_USER_INPUT을 반환하나 buildShadowContext().findings는 빈 배열([])이 됨
  const unstructuredScopeShadow = buildShadowContext({
    approvedScope: scope,
    currentPlan: planV1,
    review: baseReview({ outcome: "pass", scopeViolation: true, issues: [] }),
    iterationCount: 1,
    maxIterations: 3,
  });
  assert.equal(unstructuredScopeShadow.baseline.type, "REQUEST_USER_INPUT");
  assert.equal(unstructuredScopeShadow.findings.length, 0);

  // Combo-10: previousPlan(v1)과 previousReview(criticalIssue 포함)가 전달되었음에도
  // review.revisionAudit가 previousIssueIds: []로 이전 지적을 누락시켰을 때:
  // validateRevisionSource()는 이를 잡아내지만, buildShadowContext()와 decideAfterReview()는 통과시킴!
  const line2 = planV2.content.split("\n")[1];
  const ev = { evidenceLines: [2], evidence: [line2] };
  const tamperedRevisionAudit = {
    version: 1,
    mode: "same_scope",
    baseline: {
      planId: planV1.id,
      planVersion: 1,
      scopeContractId: scope.id,
      scopeVersion: 1,
      content: planV1.content,
      contentSha256: sha256(planV1.content),
    },
    previousIssueIds: [], // previousReview의 "loss" 지적을 고의로 누락!
    preservation: [
      { sourceId: "requirement:R1", status: "preserved", before: ev, after: ev, rationale: "유지" },
      { sourceId: "constraint:1", status: "preserved", before: ev, after: ev, rationale: "유지" },
    ],
    resolutions: [],
  };
  const previousReviewWithLoss = baseReview({
    id: "r1-with-loss",
    planVersion: 1,
    issues: [criticalIssue],
  });
  const reviewV2WithTamperedAudit = baseReview({
    id: "r2-tampered",
    planVersion: 2,
    outcome: "pass",
    issues: [],
    qualityAssessment: makeQuality(planV2, "satisfied"),
    revisionAudit: tamperedRevisionAudit,
  });

  // validateRevisionSource를 직접 호출하면 이전 피드백 누락 오류로 거부됨
  assert.throws(
    () => validateRevisionSource(tamperedRevisionAudit, planV1, previousReviewWithLoss),
    /discarded or invented previous feedback/,
  );

  // 그러나 validatePlanReview, decideAfterReview, buildShadowContext는 validateRevisionSource를 호출하지 않아 통과함!
  assert.doesNotThrow(() => validatePlanReview(reviewV2WithTamperedAudit, planV2, scope));
  const decision10 = decideAfterReview({
    approvedScope: scope,
    currentPlan: planV2,
    review: reviewV2WithTamperedAudit,
    previousReview: previousReviewWithLoss,
    iterationCount: 2,
    maxIterations: 3,
  });
  assert.equal(decision10.type, "REQUEST_USER_APPROVAL");
  const shadow10 = buildShadowContext({
    approvedScope: scope,
    currentPlan: planV2,
    review: reviewV2WithTamperedAudit,
    previousReview: previousReviewWithLoss,
    previousPlan: planV1,
    iterationCount: 2,
    maxIterations: 3,
  });
  assert.equal(shadow10.baseline.type, "REQUEST_USER_APPROVAL");
});
