/**
 * ADTF 독립 QA — 2차 블라인드 평가 입력 누출 감사 테스트
 *
 * 주의:
 * - 이 테스트 파일은 Core 구현(`src/**`)이나 공식 테스트(`test/**`),
 *   기존 평가 원자료(`docs/acceptance/**`)를 수정하지 않고 독립 검증하기 위해 작성되었습니다.
 * - 모든 기대 결과 및 불변조건은 사람의 검수가 완료되기 전까지 **잠정안(Provisional)**입니다.
 * - 아직 구현되지 않은 블라인드 투영 기능을 검증 완료했다고 주장하지 않으며,
 *   (A) 현재 코드에서 재현되는 누출 경로(Leak-CE-01, Leak-CE-02, Leak-CE-07)와
 *   (B) 향후 Codex 구현 시 반드시 통과해야 하는 계약·반례 테스트(Leak-CE-03 ~ Leak-CE-06)를 구분합니다.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Node.js v24 strip-only 모드에서 dist/ 빌드나 node_modules 없이
// src/**/*.ts 및 examples/**/*.mjs를 메모리에서 직접 로드하기 위한 훅 등록
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL) {
      const parentPath = fileURLToPath(context.parentURL);
      // examples/*.mjs 가 ../../dist/src/.../*.js 를 import하는 경우 src/.../*.ts 로 매핑
      if (specifier.includes("/dist/src/") && specifier.endsWith(".js")) {
        const mappedSpecifier = specifier
          .replace("/dist/src/", "/src/")
          .replace(/\.js$/, ".ts");
        const candidateTs = resolve(dirname(parentPath), mappedSpecifier);
        if (existsSync(candidateTs)) {
          return nextResolve(pathToFileURL(candidateTs).href, context);
        }
      }
      // src/**/*.ts 내부의 상대 경로 .js import를 .ts 로 매핑
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        specifier.endsWith(".js")
      ) {
        const candidateTs = resolve(
          dirname(parentPath),
          specifier.slice(0, -3) + ".ts",
        );
        if (existsSync(candidateTs)) {
          return nextResolve(pathToFileURL(candidateTs).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url.endsWith(".ts") && result.source) {
      let code =
        typeof result.source === "string"
          ? result.source
          : Buffer.from(result.source).toString("utf8");
      // TypeScript parameter property (`constructor(readonly code: ..., message: string)`) 변환
      code = code.replace(
        /constructor\(\s*readonly\s+([A-Za-z0-9_]+)\s*:\s*([^,)]+),\s*([A-Za-z0-9_]+)\s*:\s*([^)]+)\)\s*\{\s*super\(([^)]*)\);/g,
        "readonly $1: $2;\n  constructor($1: $2, $3: $4) {\n    super($5);\n    this.$1 = $1;",
      );
      return { ...result, source: code };
    }
    return result;
  },
});

const { materializeAll } = await import(
  "../../examples/supervisor-triage-semantic/materialize.mjs"
);
const { prepare } = await import(
  "../../examples/supervisor-triage-semantic/offline-recorder.mjs"
);
const { buildShadowContext, validateShadowProposal } = await import(
  "../../src/supervisor/triage-shadow.ts"
);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST_PATH = join(
  REPO_ROOT,
  "docs/acceptance/triage-semantic-audit-20261110/manifest.json",
);
const SCORECARD_V2_PATH = join(
  REPO_ROOT,
  "docs/acceptance/triage-semantic-audit-20261110/scorecard-blank-v2.json",
);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashJson = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function writeJson(path, value) {
  const bytes = JSON.stringify(value, null, 2) + "\n";
  await writeFile(path, bytes, "utf8");
  return bytes;
}

async function prepareAllSyntheticCases(t) {
  const root = await mkdtemp(join(tmpdir(), "adtf-blind-leak-qa-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceDir = join(root, "source-v2");
  const workspaceDir = join(root, "workspace");
  await mkdir(sourceDir);
  await mkdir(workspaceDir);
  const { cases } = await materializeAll();
  const files = {};
  for (const entry of cases) {
    const folder = join(sourceDir, entry.gold.caseId);
    await mkdir(folder);
    for (const field of ["context", "gold"]) {
      const name = `${entry.gold.caseId}/${field}.json`;
      const bytes = await writeJson(join(folder, `${field}.json`), entry[field]);
      files[name] = sha256(bytes);
    }
  }
  await writeJson(join(sourceDir, "manifest.json"), {
    schemaVersion: 1,
    kind: "triage_semantic_synthetic_fixture_manifest",
    generatorVersion: 2,
    caseCount: cases.length,
    files,
  });
  for (const entry of cases) {
    await prepare({
      sourceDir,
      outputDir: join(workspaceDir, entry.gold.caseId),
      caseId: entry.gold.caseId,
    });
  }
  return { root, sourceDir, workspaceDir, cases };
}

function modelInputPathFor(workspaceDir, caseId) {
  return join(workspaceDir, caseId, "model-inputs", `${caseId}.json`);
}

// ============================================================================
// [A] 현재 코드에서 재현되는 누출 검증 (Leak-CE-01, Leak-CE-02, Leak-CE-07)
// ============================================================================

test("Leak-CE-01 [현재 재현]: 도메인 본문(요구사항·기획안·리뷰 코멘트)을 전혀 읽지 않고 식별자 문자열만으로 8개 케이스의 Gold 기대 분류(expectedCategories)를 100%(8/8) 추론할 수 있다", async (t) => {
  const { workspaceDir, cases } = await prepareAllSyntheticCases(t);

  // 도메인 원문 텍스트(description, references 값 등)를 전혀 읽지 않고
  // 오직 식별자 문자열(findings[].id, source.planId)만 보고 TriageCategory를 결정하는 오라클
  function identifierOnlyOracle(modelInput) {
    const idTokens = `${modelInput.context.source.planId} ${modelInput.context.findings.map((f) => f.id).join(" ")}`;
    if (idTokens.includes("invalid-input")) {
      return "WRITER_REWORK";
    }
    if (idTokens.includes("choice")) {
      return "USER_CLARIFICATION";
    }
    if (idTokens.includes("explicit-sms-request")) {
      return "SCOPE_CHANGE_REQUIRED";
    }
    if (
      idTokens.includes("reviewer-overreach") ||
      idTokens.includes("false-review") ||
      idTokens.includes("unrelated-citation")
    ) {
      return "REVIEWER_RECHECK";
    }
    if (idTokens.includes("repeated-loss") || idTokens.includes("limit")) {
      return "ESCALATE_OR_STOP";
    }
    throw new Error(`Unrecognized identifier token: ${idTokens}`);
  }

  let matchedCount = 0;
  for (const entry of cases) {
    const caseId = entry.gold.caseId;
    const modelInputPath = modelInputPathFor(workspaceDir, caseId);
    const modelInput = JSON.parse(await readFile(modelInputPath, "utf8"));

    // L-01 ~ L-07: 파일 경로, source.caseId, projectId, planId, scopeContractId, reviewId, findings[].id에 caseId가 그대로 노출됨
    assert.equal(modelInput.source.caseId, caseId);
    assert.equal(modelInput.context.source.projectId, `semantic-${caseId}`);
    assert.equal(modelInput.context.source.planId, `semantic-${caseId}-plan`);
    assert.equal(
      modelInput.context.source.scopeContractId,
      `semantic-${caseId}-scope`,
    );
    assert.match(
      modelInput.context.source.reviewId,
      new RegExp(`^review-${caseId}-v\\d+$`),
    );
    assert.equal(modelInput.context.findings[0].id, `review:issue-${caseId}`);
    assert.equal(
      Object.hasOwn(
        modelInput.context.references,
        `finding:review:issue-${caseId}`,
      ),
      true,
    );

    const predictedCategory = identifierOnlyOracle(modelInput);
    assert.equal(
      entry.gold.expectedCategories.includes(predictedCategory),
      true,
      `${caseId}: 식별자 오라클 예측(${predictedCategory})이 Gold expectedCategories(${entry.gold.expectedCategories.join(",")})에 포함됨`,
    );
    assert.equal(
      entry.gold.forbiddenCategories.includes(predictedCategory),
      false,
    );
    matchedCount += 1;
  }

  assert.equal(
    matchedCount,
    8,
    "도메인 본문을 전혀 읽지 않은 식별자 오라클이 8개 전 케이스의 정답 분류를 맞힘(누출 재현)",
  );
});

test("Leak-CE-02 [현재 재현]: PR #35에 명시된 표면 식별자(caseId, projectId, planId, reviewId, findings[].id, references 키)만 부분 중립화해도 scopeContractId, baseline 내부, 직렬화된 references 값에서 원본 시나리오 ID가 100% 누출된다", async (t) => {
  const { workspaceDir, cases } = await prepareAllSyntheticCases(t);

  // PR #35(docs/triage-semantic-evaluation-run-prep-20261110.md L35, L39)에 나열된 표면 필드만 치환하는 부분 블라인드 함수
  function naiveSurfaceBlind(modelInput, index) {
    const copy = structuredClone(modelInput);
    const neutralCase = `case-${String(index + 1).padStart(2, "0")}`;
    copy.source.caseId = neutralCase;
    copy.context.source.projectId = `proj-${neutralCase}`;
    copy.context.source.planId = `plan-${neutralCase}`;
    copy.context.source.reviewId = `rev-${neutralCase}`;
    copy.context.findings = copy.context.findings.map((f, fIdx) => ({
      ...f,
      id: `review:finding-${fIdx + 1}`,
    }));
    const newRefs = {};
    for (const [k, v] of Object.entries(copy.context.references)) {
      const neutralKey = k
        .replace(/^finding:review:issue-[^:]+$/, "finding:review:finding-1")
        .replace(
          /^previous-review:issue:issue-[^:]+$/,
          "previous-review:issue:finding-1",
        );
      newRefs[neutralKey] = v;
    }
    copy.context.references = newRefs;
    return copy;
  }

  let baselineLeakCount = 0;
  for (const [idx, entry] of cases.entries()) {
    const caseId = entry.gold.caseId;
    const modelInputPath = modelInputPathFor(workspaceDir, caseId);
    const modelInput = JSON.parse(await readFile(modelInputPath, "utf8"));
    const partiallyBlinded = naiveSurfaceBlind(modelInput, idx);

    // 1) L-05: 8개 전 케이스에서 context.source.scopeContractId에 원본 caseId("semantic-${caseId}-scope")가 그대로 남음
    assert.equal(
      partiallyBlinded.context.source.scopeContractId,
      `semantic-${caseId}-scope`,
    );

    // 2) L-10 & L-11: REVISE, REQUEST_SCOPE_CHANGE_APPROVAL, STOP_REPEATED_REVIEW_ISSUES (총 6개 케이스)에서는
    //    context.baseline 내부(feedback / issueIds / planId / reason) 및 references["policy:baseline"] JSON 문자열에도 원본 caseId가 남음
    const baselineType = partiallyBlinded.context.baseline.type;
    if (
      baselineType === "REVISE" ||
      baselineType === "REQUEST_SCOPE_CHANGE_APPROVAL" ||
      baselineType === "STOP_REPEATED_REVIEW_ISSUES"
    ) {
      const baselineText = JSON.stringify(partiallyBlinded.context.baseline);
      assert.equal(
        baselineText.includes(caseId),
        true,
        `${caseId}: context.baseline 내부에 원본 caseId가 잔류함`,
      );
      assert.equal(
        partiallyBlinded.context.references["policy:baseline"].includes(caseId),
        true,
        `${caseId}: context.references["policy:baseline"] JSON 문자열 내부에 원본 caseId가 잔류함`,
      );
      baselineLeakCount += 1;
    }

    // 3) L-09: previousReview가 존재하는 케이스(plant-repeated-loss)는 references["previous-review:source"] JSON 문자열에도 잔류함
    if (partiallyBlinded.context.references["previous-review:source"]) {
      assert.equal(
        partiallyBlinded.context.references["previous-review:source"].includes(
          caseId,
        ),
        true,
        `${caseId}: context.references["previous-review:source"] JSON 문자열 내부에 원본 caseId가 잔류함`,
      );
    }
  }
  assert.equal(baselineLeakCount, 6);
});

test("Leak-CE-07 [현재 재현]: modelInput의 SHA-256 다이제스트가 공개 저장소의 manifest.json 및 scorecard-blank-v2.json과 1:1 매칭되며, 일부 합성 원문(umbrella-limit 등)에 정책 판정 메타 서술어가 포함되어 있다", async (t) => {
  const { workspaceDir, cases } = await prepareAllSyntheticCases(t);

  const publicManifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const publicScorecard = JSON.parse(readFileSync(SCORECARD_V2_PATH, "utf8"));

  // 1) L-12: 해시 역추적 검증
  const contextFileShaToCaseId = new Map();
  for (const [fileKey, digest] of Object.entries(publicManifest.files)) {
    if (fileKey.endsWith("/context.json")) {
      const cid = fileKey.slice(0, -"/context.json".length);
      contextFileShaToCaseId.set(digest, cid);
    }
  }
  const contextShaToCaseId = new Map(
    publicScorecard.cases.map((c) => [c.contextSha256, c.caseId]),
  );

  for (const entry of cases) {
    const caseId = entry.gold.caseId;
    const modelInput = JSON.parse(
      await readFile(modelInputPathFor(workspaceDir, caseId), "utf8"),
    );

    // modelInput.source.contextFileSha256 만으로 공개 manifest.json에서 caseId 역추적 가능
    assert.equal(
      contextFileShaToCaseId.get(modelInput.source.contextFileSha256),
      caseId,
    );
    // modelInput.context.contextSha256 만으로 공개 scorecard-blank-v2.json에서 caseId 역추적 가능
    assert.equal(
      contextShaToCaseId.get(modelInput.context.contextSha256),
      caseId,
    );
  }

  // 2) L-13: 본문 내 평가자 메타 코멘터리 확인
  const umbrellaLimitInput = JSON.parse(
    await readFile(modelInputPathFor(workspaceDir, "umbrella-limit"), "utf8"),
  );
  assert.match(
    umbrellaLimitInput.context.findings[0].description,
    /수정 보완이 필요하지만 허용된 기획 반복 횟수를 모두 사용했다/,
  );
});

// ============================================================================
// [B] 향후 블라인드 투영 구현을 위한 불변조건·반례 계약 테스트 (Leak-CE-03 ~ Leak-CE-06)
// ============================================================================

function makeMultiFindingInput() {
  const date = "2026-11-10T00:00:00.000Z";
  const approvedScope = {
    id: "scope-raw-alpha",
    projectId: "proj-raw-alpha",
    version: 1,
    goal: "로컬 설정 관리 도구",
    requiredFeatures: [
      { id: "R1", statement: "설정을 파일에 저장하고 조회한다." },
      { id: "R2", statement: "저장 실패 시 기존 설정을 보존한다." },
    ],
    excludedFeatures: [],
    technicalConstraints: ["Node.js 내장 모듈만 사용한다."],
    createdAt: date,
  };
  const previousPlan = {
    id: "plan-raw-alpha",
    projectId: "proj-raw-alpha",
    version: 1,
    scopeContractId: "scope-raw-alpha",
    scopeVersion: 1,
    content: "설정을 먼저 덮어쓰고 검증한다.\n조회는 파일을 읽는다.",
    status: "ready_for_review",
    createdAt: date,
  };
  const currentPlan = {
    id: "plan-raw-alpha",
    projectId: "proj-raw-alpha",
    version: 2,
    scopeContractId: "scope-raw-alpha",
    scopeVersion: 1,
    content: "저장 시 기존 설정을 보존한다.\n구현은 기존 파일을 덮어쓴 뒤 검증한다.",
    status: "ready_for_review",
    createdAt: date,
  };
  const previousReview = {
    id: "review-raw-alpha-v1",
    projectId: "proj-raw-alpha",
    planId: "plan-raw-alpha",
    planVersion: 1,
    scopeContractId: "scope-raw-alpha",
    scopeVersion: 1,
    outcome: "revise",
    issues: [
      {
        id: "issue-resolved-first",
        kind: "omission",
        severity: "major",
        description: "조회 시 인코딩 명시가 빠졌다.",
        suggestedDirection: "UTF-8 인코딩을 명시한다.",
      },
      {
        id: "issue-plant-persisted",
        kind: "contradiction",
        severity: "critical",
        description: "덮어쓴 뒤 검증하면 실패 시 기존 설정이 손상된다.",
        suggestedDirection: "검증 후 원자적으로 교체한다.",
      },
    ],
    suggestions: [],
    scopeViolation: false,
    userJudgmentRequired: false,
    reviewedAt: date,
  };
  const review = {
    id: "review-raw-alpha-v2",
    projectId: "proj-raw-alpha",
    planId: "plan-raw-alpha",
    planVersion: 2,
    scopeContractId: "scope-raw-alpha",
    scopeVersion: 1,
    outcome: "revise",
    issues: [
      {
        id: "issue-plant-persisted",
        kind: "contradiction",
        severity: "critical",
        description: "여전히 기존 파일을 먼저 덮어쓴 뒤 검증한다.",
        suggestedDirection: "검증 후 원자적으로 교체한다.",
      },
      {
        id: "issue-umbrella-minor-question",
        kind: "omission",
        severity: "minor",
        description: "오류 메시지 문구 톤을 어떻게 할지 선택이 필요하다.",
        suggestedDirection: "사용자에게 선호 문구를 확인한다.",
      },
    ],
    suggestions: [],
    scopeViolation: false,
    userJudgmentRequired: true,
    reviewedAt: date,
  };
  return {
    approvedScope,
    previousPlan,
    currentPlan,
    previousReview,
    review,
    iterationCount: 2,
    maxIterations: 3,
  };
}

function recomputeContextSha256(ctx) {
  const { contextSha256: _ignored, ...body } = ctx;
  return hashJson(body);
}

test("Leak-CE-03 [향후 구현 계약]: 서로 다른 원본 ID가 동일 중립 ID로 충돌하거나, previousReview와 현재 review의 동일 이슈 ID를 위치 인덱스만으로 따로 번호 매기면 DUPLICATE_FINDING 또는 반복 이력 단절이 발생한다", () => {
  const input = makeMultiFindingInput();
  const rawContext = buildShadowContext(input);

  // 1) 두 개의 서로 다른 finding이 동일한 중립 ID("review:I1")로 충돌하는 잘못된 투영
  const collidedContext = structuredClone(rawContext);
  collidedContext.findings[0].id = "review:I1";
  collidedContext.findings[1].id = "review:I1";
  collidedContext.references["finding:review:I1"] =
    collidedContext.findings[0].description;
  collidedContext.contextSha256 = recomputeContextSha256(collidedContext);

  const proposalWithDuplicate = {
    schemaVersion: 1,
    contextSha256: collidedContext.contextSha256,
    author: { kind: "manual_fixture", version: "test" },
    findings: [
      {
        findingId: "review:I1",
        category: "WRITER_REWORK",
        rationale: "근거 1",
        proposedAction: "조치 1",
        evidenceRefs: ["finding:review:I1", "plan:L1"],
      },
      {
        findingId: "review:I1",
        category: "USER_CLARIFICATION",
        rationale: "근거 2",
        proposedAction: "조치 2",
        evidenceRefs: ["finding:review:I1", "plan:L2"],
      },
    ],
    summaryForUser: "충돌 테스트",
  };

  const validation = validateShadowProposal(
    collidedContext,
    proposalWithDuplicate,
  );
  assert.equal(validation.status, "rejected");
  assert.equal(
    validation.errors.includes("DUPLICATE_FINDING:review:I1"),
    true,
    "중립 ID 충돌 시 DUPLICATE_FINDING으로 거부됨",
  );

  // 2) previousReview.issues(2번째가 issue-plant-persisted)와
  //    현재 review.issues(1번째가 issue-plant-persisted)를 전역 매핑표 없이 배열 인덱스로만 번호 매기면
  //    previousReview에서는 I2가 되고 현재 review에서는 I1이 되어 반복 이슈 연결이 단절됨
  const positionalPrevIds = input.previousReview.issues.map(
    (_, i) => `I${i + 1}`,
  );
  const positionalCurrIds = input.review.issues.map((_, i) => `I${i + 1}`);
  assert.notEqual(
    positionalPrevIds[1],
    positionalCurrIds[0],
    "전역 매핑 사전 없이 위치 인덱스만으로 번호를 매기면 이전 리뷰의 동일 이슈(index 1)와 현재 리뷰 이슈(index 0)의 ID 연결이 깨짐",
  );
});

test("Leak-CE-04 [향후 구현 계약]: findings[].id만 중립화하고 references 키 또는 contextSha256 재계산을 누락하면 digest mismatch 및 INVALID_REFERENCE / MISSING_FINDING_REFERENCE로 검증이 깨진다", () => {
  const input = makeMultiFindingInput();
  const rawContext = buildShadowContext(input);

  // 반례 4-A: findings[].id를 중립화한 뒤 contextSha256를 재계산하지 않으면 validateShadowProposal이 즉시 예외를 던짐
  const unhashedBlindedContext = structuredClone(rawContext);
  unhashedBlindedContext.findings[0].id = "review:I1";
  unhashedBlindedContext.findings[1].id = "review:I2";

  assert.throws(
    () => validateShadowProposal(unhashedBlindedContext, {}),
    /Shadow context digest mismatch\./,
    "투영 후 contextSha256를 재계산하지 않으면 Shadow context digest mismatch 예외가 발생함",
  );

  // 반례 4-B: contextSha256는 재계산했지만 references 키("finding:review:issue-...")를 함께 중립화하지 않은 경우
  const brokenRefContext = structuredClone(unhashedBlindedContext);
  brokenRefContext.contextSha256 = recomputeContextSha256(brokenRefContext);

  const proposalOnBrokenRefContext = {
    schemaVersion: 1,
    contextSha256: brokenRefContext.contextSha256,
    author: { kind: "manual_fixture", version: "test" },
    findings: [
      {
        findingId: "review:I1",
        category: "WRITER_REWORK",
        rationale: "근거 1",
        proposedAction: "조치 1",
        evidenceRefs: ["finding:review:I1", "plan:L2"],
      },
      {
        findingId: "review:I2",
        category: "USER_CLARIFICATION",
        rationale: "근거 2",
        proposedAction: "조치 2",
        evidenceRefs: ["finding:review:I2", "plan:L1"],
      },
    ],
    summaryForUser: "참조 불일치 테스트",
  };

  const validation = validateShadowProposal(
    brokenRefContext,
    proposalOnBrokenRefContext,
  );
  assert.equal(validation.status, "rejected");
  assert.equal(
    validation.errors.includes("INVALID_REFERENCE:review:I1"),
    true,
    "references 키를 findings[].id와 동기화하지 않으면 INVALID_REFERENCE가 발생함",
  );
});

test("Leak-CE-05 [향후 구현 계약]: 모델이 findings 배열 순서를 바꿔 응답할 때 배열 위치(index) 기반으로 역매핑하면 technicalBlocker(I1)와 비블로커(I2)가 뒤바뀌어 정상 응답이 BLOCKER_DOWNGRADED로 오판된다", () => {
  const input = makeMultiFindingInput();
  const rawContext = buildShadowContext(input);

  // 원본 <-> 중립 ID 양방향 사전
  const reverseFindingMap = new Map([
    ["review:I1", "review:issue-plant-persisted"],
    ["review:I2", "review:issue-umbrella-minor-question"],
  ]);
  const reverseRefMap = new Map([
    ["finding:review:I1", "finding:review:issue-plant-persisted"],
    ["finding:review:I2", "finding:review:issue-umbrella-minor-question"],
    ["plan:L1", "plan:L1"],
    ["plan:L2", "plan:L2"],
  ]);

  // 모델이 I2(비블로커, USER_CLARIFICATION)를 먼저, I1(블로커, WRITER_REWORK)을 나중에 배열에 담아 응답한 정상 케이스
  const validOutOfOrderBlindedResponse = {
    schemaVersion: 1,
    contextSha256: "blinded-sha-placeholder",
    author: { kind: "manual_fixture", version: "test" },
    findings: [
      {
        findingId: "review:I2",
        category: "USER_CLARIFICATION",
        rationale: "문구 톤은 사용자 선호 확인 필요",
        proposedAction: "사용자에게 질문",
        evidenceRefs: ["finding:review:I2", "plan:L1"],
      },
      {
        findingId: "review:I1",
        category: "WRITER_REWORK",
        rationale: "덮어쓰기 순서 결함 수정 필요",
        proposedAction: "기획안 재작성",
        evidenceRefs: ["finding:review:I1", "plan:L2"],
      },
    ],
    summaryForUser: "순서가 바뀐 정상 모델 응답",
  };

  // 잘못된 역매핑: 배열 인덱스(idx) 순서대로 rawContext.findings[idx].id를 덮어쓰기
  const buggyPositionalUnblinded = {
    ...validOutOfOrderBlindedResponse,
    contextSha256: rawContext.contextSha256,
    findings: validOutOfOrderBlindedResponse.findings.map((item, idx) => ({
      ...item,
      findingId: rawContext.findings[idx].id,
      evidenceRefs: [`finding:${rawContext.findings[idx].id}`, "plan:L1"],
    })),
  };

  const buggyValidation = validateShadowProposal(
    rawContext,
    buggyPositionalUnblinded,
  );
  assert.equal(buggyValidation.status, "rejected");
  assert.equal(
    buggyValidation.errors.includes(
      "BLOCKER_DOWNGRADED:review:issue-plant-persisted",
    ),
    true,
    "위치 기반 역매핑은 I2(USER_CLARIFICATION)를 원본 0번(technicalBlocker=true)에 잘못 연결하여 BLOCKER_DOWNGRADED를 유발함",
  );

  // 올바른 역매핑: findingId 및 evidenceRefs를 사전(reverseMap) 조회로 복원
  const safeDictionaryUnblinded = {
    ...validOutOfOrderBlindedResponse,
    contextSha256: rawContext.contextSha256,
    findings: validOutOfOrderBlindedResponse.findings.map((item) => ({
      ...item,
      findingId: reverseFindingMap.get(item.findingId),
      evidenceRefs: item.evidenceRefs.map((ref) => reverseRefMap.get(ref)),
    })),
  };

  const safeValidation = validateShadowProposal(
    rawContext,
    safeDictionaryUnblinded,
  );
  assert.equal(
    safeValidation.status,
    "structurally_valid_for_manual_inspection",
    "사전 기반 역매핑은 모델 응답의 배열 순서와 무관하게 정확히 복원되어야 함",
  );
  assert.deepEqual(safeValidation.errors, []);
});

test("Leak-CE-06 [향후 구현 계약]: 역매핑기가 모델 응답의 contextSha256 === blindedContext.contextSha256를 먼저 검증하지 않고 originalContext.contextSha256로 덮어쓰면 다른 케이스 응답 재사용(Cross-Case Replay)이 통과된다", () => {
  const input = makeMultiFindingInput();
  const rawContextA = buildShadowContext({
    ...input,
    review: { ...input.review, issues: [input.review.issues[0]] },
  });

  // 케이스 A를 투영한 블라인드 컨텍스트
  const blindedContextA = structuredClone(rawContextA);
  blindedContextA.source = {
    projectId: "proj-01",
    planId: "plan-01",
    planVersion: 2,
    scopeContractId: "scope-01",
    scopeVersion: 1,
    reviewId: "rev-01",
    inputSha256: "0".repeat(64),
  };
  blindedContextA.findings[0].id = "review:I1";
  blindedContextA.references = {
    "plan:L1": rawContextA.references["plan:L1"],
    "plan:L2": rawContextA.references["plan:L2"],
    "finding:review:I1":
      rawContextA.references["finding:review:issue-plant-persisted"],
  };
  blindedContextA.contextSha256 = recomputeContextSha256(blindedContextA);

  // 다른 케이스 B(전혀 다른 blinded contextSha256)에서 생성된 모델 응답을 케이스 A에 잘못 제출한 상황
  const replayedResponseFromCaseB = {
    schemaVersion: 1,
    contextSha256: "f".repeat(64), // 케이스 B의 해시 (blindedContextA.contextSha256와 다름!)
    author: { kind: "manual_fixture", version: "test" },
    findings: [
      {
        findingId: "review:I1",
        category: "WRITER_REWORK",
        rationale: "케이스 B에 대한 응답을 케이스 A에 잘못 붙여넣음",
        proposedAction: "재작성",
        evidenceRefs: ["finding:review:I1", "plan:L2"],
      },
    ],
    summaryForUser: "케이스 B 응답",
  };

  // 취약한 역매핑기: rawResponse.contextSha256를 확인하지 않고 무조건 rawContextA.contextSha256를 덮어씀
  function insecureUnblind(rawResp, origCtx) {
    return {
      ...rawResp,
      contextSha256: origCtx.contextSha256,
      findings: rawResp.findings.map((f) => ({
        ...f,
        findingId: "review:issue-plant-persisted",
        evidenceRefs: ["finding:review:issue-plant-persisted", "plan:L2"],
      })),
    };
  }

  const forgedUnblinded = insecureUnblind(
    replayedResponseFromCaseB,
    rawContextA,
  );
  const postAuditOnForged = validateShadowProposal(
    rawContextA,
    forgedUnblinded,
  );
  assert.equal(
    postAuditOnForged.status,
    "structurally_valid_for_manual_inspection",
    "사전 해시 대조 없이 originalContext.contextSha256를 덮어쓰면 사후 검증(validateShadowProposal)이 다른 케이스 응답 오제출을 걸러내지 못함",
  );

  // 안전한 역매핑기: 반드시 역매핑 전에 rawResponse.contextSha256 === blindedContext.contextSha256 대조
  function secureUnblind(rawResp, blindCtx, origCtx) {
    if (rawResp.contextSha256 !== blindCtx.contextSha256) {
      throw new Error(
        `SOURCE_MISMATCH_BEFORE_UNBLIND: expected ${blindCtx.contextSha256}, got ${rawResp.contextSha256}`,
      );
    }
    return insecureUnblind(rawResp, origCtx);
  }

  assert.throws(
    () =>
      secureUnblind(replayedResponseFromCaseB, blindedContextA, rawContextA),
    /SOURCE_MISMATCH_BEFORE_UNBLIND/,
    "안전한 역매핑기는 다른 블라인드 컨텍스트에서 온 응답을 역매핑 전에 즉시 거부해야 함",
  );
});
