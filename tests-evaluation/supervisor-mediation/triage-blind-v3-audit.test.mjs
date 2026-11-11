/**
 * ADTF 독립 QA — 3차 PR #42 블라인드 평가 v3 정밀 독립 감사 테스트
 *
 * 검증 대상:
 * - PR #42 수정 커밋: 53f8823adb75e4c9fe780d236775829b752951e4 (feature/triage-blind-v3)
 *   (수정 전 구현 커밋: 574e6dca71c680d2256e834da35d418a271eca86)
 * - 대상 파일:
 *   - examples/supervisor-triage-semantic/materialize-v3.mjs
 *   - examples/supervisor-triage-semantic/blind-recorder.mjs
 *   - docs/proposals/triage-blind-v3-stage1-20261111.md
 *
 * 실행 전제조건 및 검증 대상 커밋 지정 방법:
 * - 본 테스트는 PR #42 구현 코드를 QA 브랜치에 복제하거나 병합하지 않고 독립 검증하기 위해 작성되었습니다.
 * - PR #42가 체크아웃된 별도 worktree가 있을 경우 PR42_ROOT 환경변수 또는 C:/dev/create_agent-pr42-audit 경로를 자동 참조합니다.
 *   (예: $env:PR42_ROOT="<worktree-path>"; node --test tests-evaluation/supervisor-mediation/triage-blind-v3-audit.test.mjs)
 * - PR #42가 main에 병합된 이후에는 현재 저장소 루트를 자동으로 참조합니다.
 *
 * 원칙:
 * - Core 소스(`src/**`) 및 공식 테스트(`test/**`)를 수정하지 않음.
 * - PR #42의 코드를 QA 브랜치에 병합하거나 복사하지 않고 격리 검증.
 * - 오프라인 순수 함수 및 파일 해시 검증만 수행 (API 0회, ADC 0회).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile, readdir, lstat } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const PR42_CANDIDATE = process.env.PR42_ROOT || (existsSync(resolve("C:/dev/create_agent-pr42-audit")) ? resolve("C:/dev/create_agent-pr42-audit") : resolve("."));
const PR42_ROOT = existsSync(join(PR42_CANDIDATE, "examples/supervisor-triage-semantic/materialize-v3.mjs"))
  ? PR42_CANDIDATE
  : resolve("C:/dev/create_agent-pr42-audit");

// Node.js v24 strip-only 모드 인메모리 로더 훅 등록
// PR #42 worktree 내의 materialize-v3.mjs, blind-recorder.mjs가
// dist/src/supervisor/triage-shadow.js 를 import할 때
// PR #42 worktree의 src/supervisor/triage-shadow.ts 로 직접 매핑하여 인메모리 실행.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL) {
      const parentPath = fileURLToPath(context.parentURL);

      // ../../dist/src/... -> src/...ts 매핑
      if (specifier.includes("/dist/src/") && specifier.endsWith(".js")) {
        const mapped = specifier.replace("/dist/src/", "/src/").replace(/\.js$/, ".ts");
        const candidate = resolve(dirname(parentPath), mapped);
        if (existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }

      // 상대 경로 .js -> .ts 매핑
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && specifier.endsWith(".js")) {
        const candidate = resolve(dirname(parentPath), specifier.slice(0, -3) + ".ts");
        if (existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url.endsWith(".ts") && result.source) {
      let code = typeof result.source === "string" ? result.source : Buffer.from(result.source).toString("utf8");
      // 파라미터 프로퍼티 디슈거링
      code = code.replace(
        /constructor\(\s*readonly\s+([a-zA-Z0-9_]+)\s*:\s*([^,)]+),\s*([a-zA-Z0-9_]+\s*:\s*[^)]+)\)\s*\{\s*super\(([^)]*)\);/g,
        "readonly $1: $2; constructor($1: $2, $3) { super($4); this.$1 = $1;"
      );
      return nextLoad(url, { ...context, format: "module-typescript", source: code });
    }
    return nextLoad(url, context);
  },
});

const sha = (b) => createHash("sha256").update(b).digest("hex");

// PR #42 worktree 모듈 동적 로드
const { materializeV3, writeV3, POLICY_COMMIT } = await import(
  pathToFileURL(join(PR42_ROOT, "examples/supervisor-triage-semantic/materialize-v3.mjs")).href
);
const { prepareBlind, recordBlind, referenceMap } = await import(
  pathToFileURL(join(PR42_ROOT, "examples/supervisor-triage-semantic/blind-recorder.mjs")).href
);

test("PR42-A1 [v3 입력 및 Policy Baseline 전수 검증]: 8개 사례의 Baseline, Findings, References 정합성 확인", async () => {
  const result = await materializeV3();
  assert.equal(result.cases.length, 8);

  const baselineTypes = result.cases.map((c) => c.context.baseline.type);
  assert.deepEqual(baselineTypes, [
    "REVISE",
    "REQUEST_USER_INPUT",
    "REVISE",
    "REQUEST_SCOPE_CHANGE_APPROVAL",
    "REVISE",
    "STOP_REPEATED_REVIEW_ISSUES",
    "STOP_LIMIT_REACHED",
    "REVISE",
  ]);

  // Case 1: umbrella-choice (질문 1개, findings 2개, REQUEST_USER_INPUT)
  const choice = result.cases[1];
  assert.equal(choice.gold.caseId, "umbrella-choice");
  assert.equal(choice.context.baseline.type, "REQUEST_USER_INPUT");
  assert.equal(choice.context.findings.length, 2);
  assert.deepEqual(choice.context.baseline.questions, [choice.input.review.suggestions[0]]);
  assert.match(choice.input.review.suggestions[0], /같은 이름의 우산/);
  // finding 1: review issue (omission)
  assert.equal(choice.context.findings[0].id, "review:issue-umbrella-choice");
  assert.equal(choice.context.findings[0].origin, "review");
  // finding 2: suggestion question
  assert.equal(choice.context.findings[1].id, "suggestion:1");
  assert.equal(choice.context.findings[1].origin, "suggestion");

  // Case 5: plant-repeated-loss (이전 Review 대조 통한 반복 결함 판정, 정답 단서 문구 제거 확인)
  const repeated = result.cases[5];
  assert.equal(repeated.gold.caseId, "plant-repeated-loss");
  assert.equal(repeated.context.baseline.type, "STOP_REPEATED_REVIEW_ISSUES");
  assert.equal(repeated.input.previousReview.issues[0].id, repeated.input.review.issues[0].id);
  assert.doesNotMatch(repeated.input.review.issues[0].description, /직전|반복/);
  assert.match(repeated.context.references["previous-plan:L1"], /수정/);

  // Case 6: umbrella-limit (iteration:state 기반 한도 초과 판정, 정답 단서 문구 제거 확인)
  const limit = result.cases[6];
  assert.equal(limit.gold.caseId, "umbrella-limit");
  assert.equal(limit.context.baseline.type, "STOP_LIMIT_REACHED");
  assert.doesNotMatch(limit.input.review.issues[0].description, /허용된 기획 반복 횟수|모두 사용/);
  console.log("umbrella-limit iteration:state:", limit.context.references["iteration:state"]);
  const iterState = JSON.parse(limit.context.references["iteration:state"]);
  assert.equal(iterState.iterationCount, iterState.maxIterations);
  assert.equal(iterState.iterationCount, 1);
  assert.equal(iterState.maxIterations, 1);

  // Case 7: plant-unrelated-citation (L1 무관 인용, L2 직접 근거 분리 확인)
  const citation = result.cases[7];
  assert.equal(citation.gold.caseId, "plant-unrelated-citation");
  assert.equal(citation.context.baseline.type, "REVISE");
  assert.match(citation.context.references["plan:L1"], /식물 이름을 제목으로 표시/);
  assert.match(citation.context.references["plan:L2"], /삭제 시 선택한 기록만 제거/);
  // Gold에 L1과 L2가 모두 exampleEvidenceRefs로 포함되어 있는지 확인
  const goldRefs = citation.gold.provisionalFindings[0].exampleEvidenceRefs;
  assert.ok(goldRefs.includes("plan:L1"), "L1 무관 인용이 골드에 포함되어야 함");
  assert.ok(goldRefs.includes("plan:L2"), "L2 직접 근거가 골드에 포함되어야 함");
});

test("PR42-B1 [정보 누출 감사 (L-01~L-13)]: 8개 전 사례의 modelInput에서 식별자, 해시, 정답 단서 누출 전수 검사", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "adtf-blind-v3-audit-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const source = join(root, "v3-source");
  await writeV3(source);

  const cases = (await materializeV3()).cases;

  for (const c of cases) {
    const caseId = c.gold.caseId;
    const pub = join(root, `pub-${caseId}`);
    const priv = join(root, `priv-${caseId}`);

    await prepareBlind({ sourceDir: source, publicDir: pub, privateDir: priv, caseId });

    const inputPath = join(pub, "model-inputs/input.json");
    assert.ok(existsSync(inputPath), `L-01: 고정 input.json 존재 확인 (${caseId})`);
    assert.ok(!existsSync(join(pub, `model-inputs/${caseId}.json`)), `L-01: 슬러그 파일명 부재 확인 (${caseId})`);

    const rawInput = await readFile(inputPath, "utf8");
    const parsed = JSON.parse(rawInput);

    // L-02: source.caseId 부재 확인
    assert.equal(parsed.source, undefined, `L-02: modelInput.source 부재 확인 (${caseId})`);

    // L-01 & L-02: caseId 문자열 노출 검사
    assert.ok(!rawInput.includes(caseId), `caseId 문자열 노출 차단 (${caseId})`);

    // L-03: 원본 projectId 노출 검사
    assert.ok(!rawInput.includes(`semantic-${caseId}`), `L-03: 원본 projectId 노출 차단 (${caseId})`);

    // L-04: 원본 planId 노출 검사
    assert.ok(!rawInput.includes(`semantic-${caseId}-plan`), `L-04: 원본 planId 노출 차단 (${caseId})`);

    // L-05: 원본 scopeContractId 노출 검사
    assert.ok(!rawInput.includes(`semantic-${caseId}-scope`), `L-05: 원본 scopeContractId 노출 차단 (${caseId})`);

    // L-06: 원본 reviewId 노출 검사
    assert.ok(!rawInput.includes(`review-${caseId}`), `L-06: 원본 reviewId 노출 차단 (${caseId})`);

    // L-07: 원본 issueId 노출 검사
    assert.ok(!rawInput.includes(`issue-${caseId}`), `L-07: 원본 issueId 노출 차단 (${caseId})`);

    // L-10: baseline 내부의 원본 식별자 검사
    const baselineStr = JSON.stringify(parsed.context.baseline);
    assert.ok(!baselineStr.includes(caseId), `L-10: baseline 내부 caseId 차단 (${caseId})`);

    // L-11: 직렬화된 references['policy:baseline'] 내부 검사
    const refBaseline = parsed.context.references["policy:baseline"];
    assert.ok(refBaseline, `policy:baseline 존재 (${caseId})`);
    assert.ok(!refBaseline.includes(caseId), `L-11: policy:baseline 내부 caseId 차단 (${caseId})`);

    // L-09: 직렬화된 references['previous-review:source'] 내부 검사
    if (parsed.context.references["previous-review:source"]) {
      assert.ok(
        !parsed.context.references["previous-review:source"].includes(caseId),
        `L-09: previous-review:source 내부 caseId 차단 (${caseId})`
      );
    }

    // L-12: 원본 SHA-256 다이제스트 노출 검사
    assert.ok(!rawInput.includes(c.context.contextSha256), `L-12: 원본 contextSha256 노출 차단 (${caseId})`);

    // Gold 및 평가 정답 힌트 노출 검사
    assert.ok(!rawInput.includes("expectedCategories"), `Gold expectedCategories 노출 차단 (${caseId})`);
    assert.ok(!rawInput.includes("provisionalFindings"), `Gold provisionalFindings 노출 차단 (${caseId})`);
  }
});

test("PR42-C1 [ID 매핑 및 역매핑 무결성]: 역순 응답, 동일 이슈 일관성, 위조·혼합·중복 거부 검증", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "adtf-blind-v3-mapping-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const source = join(root, "source");
  await writeV3(source);

  // umbrella-choice: finding이 2개인 케이스
  const pub = join(root, "pub-choice");
  const priv = join(root, "priv-choice");
  await prepareBlind({ sourceDir: source, publicDir: pub, privateDir: priv, caseId: "umbrella-choice" });

  const modelInput = JSON.parse(await readFile(join(pub, "model-inputs/input.json"), "utf8"));
  assert.equal(modelInput.context.findings.length, 2);

  // 1. 역순 응답 및 정상 복원
  const reversedFindings = [...modelInput.context.findings].reverse().map((f) => ({
    findingId: f.id,
    category: "REVIEWER_RECHECK",
    rationale: "독립 감사 역순 테스트",
    proposedAction: "검토",
    evidenceRefs: [`finding:${f.id}`, "plan:L1"],
  }));
  const validResponse = {
    schemaVersion: 1,
    contextSha256: modelInput.context.contextSha256,
    author: { kind: "offline_recorded_response", version: "qa-test" },
    findings: reversedFindings,
    summaryForUser: "정상 역순 응답",
  };
  const respPath = join(root, "valid-response.json");
  await writeFile(respPath, JSON.stringify(validResponse));

  const recorded = await recordBlind({ publicDir: pub, privateDir: priv, responseFile: respPath });
  assert.equal(recorded.status, "recorded");

  const restored = JSON.parse(await readFile(join(recorded.recordDir, "proposal.restored.json"), "utf8"));
  // 역순으로 findings가 전달되었으므로 restored의 findings도 역순으로 복원되어야 함
  assert.equal(restored.findings[0].findingId, "suggestion:1");
  assert.equal(restored.findings[1].findingId, "review:issue-umbrella-choice");

  // 2. 위조된 findingId 거부 검증
  const forgedFindingResponse = {
    ...validResponse,
    findings: [
      { ...reversedFindings[0], findingId: "finding-forged-999" },
      reversedFindings[1],
    ],
  };
  const forgedPath = join(root, "forged-response.json");
  await writeFile(forgedPath, JSON.stringify(forgedFindingResponse));
  await assert.rejects(
    recordBlind({ publicDir: pub, privateDir: priv, responseFile: forgedPath }),
    /UNKNOWN_FINDING/
  );

  // 3. 위조된 evidenceRefs 거부 검증
  const forgedRefResponse = {
    ...validResponse,
    findings: [
      { ...reversedFindings[0], evidenceRefs: [`finding:${reversedFindings[0].findingId}`, "plan:L999"] },
      reversedFindings[1],
    ],
  };
  const forgedRefPath = join(root, "forged-ref-response.json");
  await writeFile(forgedRefPath, JSON.stringify(forgedRefResponse));
  await assert.rejects(
    recordBlind({ publicDir: pub, privateDir: priv, responseFile: forgedRefPath }),
    /INVALID_REFERENCE/
  );

  // 4. 누락된 finding 거부 검증 (2개 중 1개만 제출)
  const omittedFindingResponse = {
    ...validResponse,
    findings: [reversedFindings[0]],
  };
  const omittedPath = join(root, "omitted-response.json");
  await writeFile(omittedPath, JSON.stringify(omittedFindingResponse));
  await assert.rejects(
    recordBlind({ publicDir: pub, privateDir: priv, responseFile: omittedPath }),
    /OMITTED_FINDING/
  );

  // 5. 중복 finding 거부 검증
  const duplicateFindingResponse = {
    ...validResponse,
    findings: [reversedFindings[0], reversedFindings[0]],
  };
  const dupPath = join(root, "dup-response.json");
  await writeFile(dupPath, JSON.stringify(duplicateFindingResponse));
  await assert.rejects(
    recordBlind({ publicDir: pub, privateDir: priv, responseFile: dupPath }),
    /DUPLICATE_FINDING/
  );

  // 6. 케이스 간 응답 재사용(Cross-case replay) 차단 검증
  const pubLimit = join(root, "pub-limit");
  const privLimit = join(root, "priv-limit");
  await prepareBlind({ sourceDir: source, publicDir: pubLimit, privateDir: privLimit, caseId: "umbrella-limit" });

  // choice의 응답을 그대로 limit에 넣었을 때 거부되는지 확인
  await assert.rejects(
    recordBlind({ publicDir: pubLimit, privateDir: privLimit, responseFile: respPath }),
    /Blinded source mismatch/
  );
});

test("PR42-D1 [SHA-256 체인 및 디렉터리 보안]: 해시 무결성, 경로 격리 및 원자적 롤백 검증", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "adtf-blind-v3-security-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const source = join(root, "source");
  await writeV3(source);

  // 1. Policy 커밋 정확성 확인
  assert.equal(POLICY_COMMIT, "19aeed3f8e7966df88fbc5c8e9af2dfbce63ede0");
  const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
  assert.equal(manifest.policyCommit, POLICY_COMMIT);

  // 2. 저장소 내부 출력 방지 가드 검증
  const insideRepoPublic = join(PR42_ROOT, "public-inside");
  const validPrivate = join(root, "priv");
  await assert.rejects(
    prepareBlind({ sourceDir: source, publicDir: insideRepoPublic, privateDir: validPrivate, caseId: "umbrella-choice" }),
    /Output must be outside source and repository/
  );

  // 3. 공개/비공개 폴더 중첩 방지 가드 검증
  const pubRoot = join(root, "overlap-pub");
  const nestedPriv = join(pubRoot, "nested-priv");
  await assert.rejects(
    prepareBlind({ sourceDir: source, publicDir: pubRoot, privateDir: nestedPriv, caseId: "umbrella-choice" }),
    /Output roots overlap/
  );

  // 4. SHA-256 해시 체인 및 불변성 검증
  const validPub = join(root, "pub-valid");
  const validPriv = join(root, "priv-valid");
  await prepareBlind({ sourceDir: source, publicDir: validPub, privateDir: validPriv, caseId: "umbrella-choice" });

  const privManifest = JSON.parse(await readFile(join(validPriv, "manifest.json"), "utf8"));
  assert.equal(privManifest.status, "prepared");
  assert.ok(privManifest.mappingSha256);
  assert.ok(privManifest.blindedContextSha256);
  assert.ok(privManifest.modelInputSha256);
  assert.ok(privManifest.privateReferenceSha256);

  // private-reference.json 변조 시 거부 검증
  const privRefPath = join(validPriv, "private-reference.json");
  const privRef = JSON.parse(await readFile(privRefPath, "utf8"));
  privRef.caseId = "tampered";
  await writeFile(privRefPath, JSON.stringify(privRef));

  const dummyResponse = join(root, "dummy.json");
  await writeFile(dummyResponse, JSON.stringify({}));
  await assert.rejects(
    recordBlind({ publicDir: validPub, privateDir: validPriv, responseFile: dummyResponse })
  );
});

test("PR42-E1 [기존 v1/v2 원자료 및 Archive 불변성]: 기존 자산 해시 보존 검증", async () => {
  const manifestPath = "docs/acceptance/triage-semantic-audit-20261110/manifest.json";
  const archivePath = "docs/acceptance/triage-semantic-audit-20261110/synthetic-snapshots-v2.tar.gz";

  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);

  const archiveBytes = await readFile(archivePath);
  const archiveDigest = sha(archiveBytes);

  assert.equal(archiveDigest, manifest.archiveSha256, "v2 archive 바이트 해시 불변 확인");
});

test("PR42-F1 [수정 커밋 53f8823 재검증]: referenceMap() 다중 이슈·Requirement 역순 매핑 및 무결성 정밀 검증", async () => {
  // 1. 다중 이전 이슈 (3개) 및 다중 Requirement (3개), 다중 Exclusion (2개) 시나리오 구성
  const original = {
    findings: [
      { id: "review:issue-1", origin: "review" },
      { id: "review:issue-2", origin: "review" },
      { id: "review:issue-3", origin: "review" },
      { id: "suggestion:1", origin: "suggestion" },
    ],
    references: {
      "finding:review:issue-1": "Issue 1 desc",
      "finding:review:issue-2": "Issue 2 desc",
      "finding:review:issue-3": "Issue 3 desc",
      "finding:suggestion:1": "Suggestion 1 desc",
      "previous-review:issue:issue-1": "Prev 1",
      "previous-review:issue:issue-2": "Prev 2",
      "previous-review:issue:issue-3": "Prev 3",
      "scope:requirement:REQ-A": "Requirement A statement",
      "scope:requirement:REQ-B": "Requirement B statement",
      "scope:requirement:REQ-C": "Requirement C statement",
      "scope:excluded:1": "Exclusion 1 statement",
      "scope:excluded:2": "Exclusion 2 statement",
      "plan:L1": "Plan line 1",
      "user:request": "User request text",
      "iteration:state": JSON.stringify({ iterationCount: 1, maxIterations: 2 }),
    },
  };

  // blind는 의도적으로 순서를 뒤바꿔서 배치: [issue-3, issue-1, issue-2] 및 [REQ-C, REQ-A, REQ-B]
  const blind = {
    findings: [
      { id: "review:blind-issue-3", origin: "review" },
      { id: "suggestion:1", origin: "suggestion" },
      { id: "review:blind-issue-1", origin: "review" },
      { id: "review:blind-issue-2", origin: "review" },
    ],
    references: {
      "finding:review:blind-issue-3": "Issue 3 desc",
      "finding:suggestion:1": "Suggestion 1 desc",
      "finding:review:blind-issue-1": "Issue 1 desc",
      "finding:review:blind-issue-2": "Issue 2 desc",
      "previous-review:issue:blind-issue-2": "Prev 2",
      "previous-review:issue:blind-issue-3": "Prev 3",
      "previous-review:issue:blind-issue-1": "Prev 1",
      "scope:requirement:blind-req-c": "Requirement C statement",
      "scope:requirement:blind-req-a": "Requirement A statement",
      "scope:requirement:blind-req-b": "Requirement B statement",
      "scope:excluded:1": "Exclusion 1 statement",
      "scope:excluded:2": "Exclusion 2 statement",
      "plan:L1": "Plan line 1",
      "user:request": "User request text",
      "iteration:state": JSON.stringify({ iterationCount: 1, maxIterations: 2 }),
    },
  };

  const idForward = {
    "issue:issue-1": "blind-issue-1",
    "issue:issue-2": "blind-issue-2",
    "issue:issue-3": "blind-issue-3",
    "requirement:REQ-A": "blind-req-a",
    "requirement:REQ-B": "blind-req-b",
    "requirement:REQ-C": "blind-req-c",
  };

  // 1. 순서가 뒤바뀌어 있어도 ID 사전 매핑으로 100% 정상 연결되는지 검증
  const map = referenceMap(original, blind, idForward);

  // previous-review 매핑 검증
  assert.equal(map.forward["previous-review:issue:issue-1"], "previous-review:issue:blind-issue-1");
  assert.equal(map.forward["previous-review:issue:issue-2"], "previous-review:issue:blind-issue-2");
  assert.equal(map.forward["previous-review:issue:issue-3"], "previous-review:issue:blind-issue-3");
  assert.equal(map.reverse["previous-review:issue:blind-issue-1"], "previous-review:issue:issue-1");
  assert.equal(map.reverse["previous-review:issue:blind-issue-2"], "previous-review:issue:issue-2");
  assert.equal(map.reverse["previous-review:issue:blind-issue-3"], "previous-review:issue:issue-3");

  // scope:requirement 매핑 검증
  assert.equal(map.forward["scope:requirement:REQ-A"], "scope:requirement:blind-req-a");
  assert.equal(map.forward["scope:requirement:REQ-B"], "scope:requirement:blind-req-b");
  assert.equal(map.forward["scope:requirement:REQ-C"], "scope:requirement:blind-req-c");
  assert.equal(map.reverse["scope:requirement:blind-req-a"], "scope:requirement:REQ-A");

  // scope:excluded 순번 매핑 검증
  assert.equal(map.forward["scope:excluded:1"], "scope:excluded:1");
  assert.equal(map.forward["scope:excluded:2"], "scope:excluded:2");

  // findings 매핑 검증
  assert.equal(map.forward["finding:review:issue-1"], "finding:review:blind-issue-1");
  assert.equal(map.forward["finding:suggestion:1"], "finding:suggestion:1");

  // 2. 미매핑(누락) 이슈 ID 존재 시 즉시 거부 검증
  const missingIssueForward = { ...idForward };
  delete missingIssueForward["issue:issue-2"];
  assert.throws(
    () => referenceMap(original, blind, missingIssueForward),
    /Unmapped review issue: issue-2/
  );

  // 3. 미매핑 Requirement ID 존재 시 즉시 거부 검증
  const missingReqForward = { ...idForward };
  delete missingReqForward["requirement:REQ-B"];
  assert.throws(
    () => referenceMap(original, blind, missingReqForward),
    /Unmapped requirement ID: REQ-B/
  );

  // 4. Requirement 내용(statement) 불일치 시 즉시 거부 검증
  const mismatchedBlind = structuredClone(blind);
  mismatchedBlind.references["scope:requirement:blind-req-a"] = "Altered statement";
  assert.throws(
    () => referenceMap(original, mismatchedBlind, idForward),
    /Requirement evidence was linked to a different reference/
  );

  // 5. Exclusion 내용 불일치 시 즉시 거부 검증
  const mismatchedExclusion = structuredClone(blind);
  mismatchedExclusion.references["scope:excluded:1"] = "Altered exclusion";
  assert.throws(
    () => referenceMap(original, mismatchedExclusion, idForward),
    /Exclusion evidence was linked to a different reference/
  );

  // 6. 중립 findings에 예상치 못한 ID가 포함된 경우 거부 검증
  const unexpectedBlindFindings = structuredClone(blind);
  unexpectedBlindFindings.findings.push({ id: "review:unexpected", origin: "review" });
  assert.throws(
    () => referenceMap(original, unexpectedBlindFindings, idForward),
    /ERR_ASSERTION/
  );
});
