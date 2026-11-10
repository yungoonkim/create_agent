# ADTF 독립 QA 보고서 — 1차 Policy 분기 우선순위 조합 감사

- **문서 상태:** 독립 QA 1차 정적 분석 및 오프라인 재현 검증 보고서 (`provisional_qa_audit_pending_human_review`)
- **대상 브랜치:** `qa/gemini-independent-qa`
- **기준 커밋 SHA:** `2426ebc70e7406de1da359d332a284052c5b453e`
- **검토 대상 핵심 함수:**
  - `decideAfterReview()` (`src/planning/policy.ts` L100-L227)
  - `findUnresolvedRepeatedIssues()` (`src/planning/policy.ts` L236-L256)
  - `validatePlanReview()` / `parsePlanReview()` (`src/planning/policy.ts` L275-L369)
  - `buildShadowContext()` / `validateShadowProposal()` (`src/supervisor/triage-shadow.ts` L57-L139)
  - 연관 하위/상위 경로: `qualityFindings()` (`src/planning/review-quality.ts` L120-L132), `storageAuditFindings()` (`src/planning/storage-audit.ts` L134-L165), `reviewAssuranceFindings()` / `validateRevisionSource()` (`src/planning/revision-audit.ts` L129-L150), `buildUserReviewTable()` (`src/planning/user-review.ts` L66-L145), `PlanningLoopController.applyDecision()` (`src/planning/controller.ts` L277-L371)
- **주의사항:** 본 문서의 ‘권장되는 잠정 기대 결과’는 독립 QA가 기존 ADTF 아키텍처와 권한 경계(`AGENTS.md`, `docs/triage-semantic-evaluation-protocol-20261110.md`)를 기준으로 작성한 **잠정안(Provisional)**이며, 사람의 최종 검수가 완료되기 전까지 확정 정답으로 취급하지 않는다.

---

## 1. 기존 Policy 구조 요약

### 1.1 `decideAfterReview()`의 단일 상태 결정 구조 (`src/planning/policy.ts`)

`decideAfterReview(input: PlanningDecisionInput): PlanningDecision`은 단일 Review 결과를 입력받아 Planning Loop의 다음 전이 상태를 **단 하나의 `PlanningDecision` 유니온 값**으로 결정하는 순수 함수다. 내부 분기는 아래의 **고정 폭포수(Waterfall) 우선순위(P1 → P10)**를 따르며, 앞 단계 조건이 참이면 뒤 단계 조건을 평가하지 않고 즉시 반환(Short-circuit)한다.

| 우선순위 | 분기 단계 | 코드 위치 (`src/planning/policy.ts`) | 조건 요약 | 반환 `PlanningDecision.type` |
| :---: | --- | --- | --- | --- |
| **P1** | 기본 식별자·버전·반복 수 무결성 | L102-L138 | `projectId`, `planId`, `planVersion`, `iterationCount`, `maxIterations`, `previousReview` 버전 불일치 또는 범위 오류 | `FAILED` |
| **P2** | Plan의 승인 Scope 불일치 | L139-L150 | `currentPlan.scopeContractId !== approvedScope.id \|\| currentPlan.scopeVersion !== approvedScope.version` | `REQUEST_SCOPE_CHANGE_APPROVAL` (`issueIds: []`) |
| **P3** | Review의 Scope 불일치 및 로컬 감사 구조 검증 | L151-L165 | `review`의 Scope 불일치, 또는 `qualityAssessment`·`storageAudit`·`revisionAudit`의 구조/근거 검증 예외 | `FAILED` |
| **P4** | Reviewer의 명시적 실패 보고 | L166 | `review.outcome === "failed"` | `FAILED` |
| **P5a** | 비구조화 Scope 위반 플래그 | L169-L175 | `review.scopeViolation === true`이면서 `kind === "scope_violation"`인 이슈가 0개 (`scopeIssueIds.length === 0`) | `REQUEST_USER_INPUT` |
| **P5b** | Scope 변경 필요 이슈 존재 | L177-L180 | `scopeIssues` 중 하나라도 `scopeDisposition === undefined \|\| scopeDisposition === "change_scope"` | `REQUEST_SCOPE_CHANGE_APPROVAL` (`issueIds: scopeIssueIds`) |
| **P5c** | Scope 명확화 질문 이슈 존재 | L181-L184 | `scopeIssues` 중 하나라도 `scopeDisposition === "clarify"` | `REQUEST_USER_INPUT` (`clarify` 이슈만 포함) |
| **P6** | 사용자 판단·질문 필요 | L186-L191 | `review.outcome === "needs_user_input" \|\| review.userJudgmentRequired \|\| questions.length > 0` (`quality`·`storage` 질문) | `REQUEST_USER_INPUT` (`[...questions, ...review.suggestions]`) |
| **P7** | 동일 차단 지적의 반복 | L193-L203 | `findUnresolvedRepeatedIssues(review, input.previousReview).length > 0` (`review.issues` 및 `storageFindings.issues` 내 `major`/`critical`) | `STOP_REPEATED_REVIEW_ISSUES` |
| **P8** | 수정 불필요 (최종 승인 대기) | L205-L208 | `!(review.outcome === "revise" \|\| blockingIssues.length > 0 \|\| findings.length > 0 \|\| scopeIssues.length > 0)` | `REQUEST_USER_APPROVAL` |
| **P9** | 피드백 없는 수정 요청 / 반복 한도 도달 | L209-L215 | 피드백 전체 비어 있으면 `FAILED` (L210); `iterationCount >= maxIterations`이면 한도 정지 (L214) | `FAILED` 또는 `STOP_LIMIT_REACHED` |
| **P10** | 범위 내 재작성 | L217-L226 | 위 조건에 걸리지 않은 수정 필요 상태 | `REVISE` |

### 1.2 `buildShadowContext()` 및 `validateShadowProposal()`의 병렬 보존 구조 (`src/supervisor/triage-shadow.ts`)

- `buildShadowContext(input, userRequest)` (L57-L106)는 `parseScopeContract`와 `validatePlanReview`를 먼저 통과시킨 뒤, `baseline = decideAfterReview(input)`으로 기존 Policy 결정을 고정한다.
- 단일 결정을 내리는 `decideAfterReview()`와 달리, `buildShadowContext()`는 원시 `review.issues`뿐 아니라 `storageAuditFindings`, `qualityFindings`, `reviewAssuranceFindings`, `review.suggestions`를 모두 개별 `ShadowFinding` 배열(`context.findings`)과 `context.references`로 평탄화하여 보존한다.
- `validateShadowProposal(context, raw)` (L113-L139)는 제안이 모든 `context.findings`를 1:1로 누락 없이 분류했는지 검사하며, 다음 두 가지 핵심 권한 경계를 강제한다.
  1. `finding.technicalBlocker === true`인 항목을 `USER_CLARIFICATION` 또는 `SCOPE_CHANGE_REQUIRED`로 분류하면 `BLOCKER_DOWNGRADED:<id>` 오류로 거부한다 (L133).
  2. `category === "SCOPE_CHANGE_REQUIRED"`로 분류하려면 `userRequest`가 존재하고 `evidenceRefs`에 `"user:request"`를 인용해야 하며, 그렇지 않으면 `USER_REQUEST_REQUIRED:<id>`로 거부한다 (L134).

---

## 2. 복합 조건 조합표

하나의 Review에 여러 조건이 동시에 발생할 때 현재 구현(`decideAfterReview`, `buildShadowContext`, `PlanningLoopController`, `buildUserReviewTable`)의 실제 분기와 QA 판정을 요약한 표다.

| 사례 ID | 필수 검증 상황 / 복합 조건 | 현재 `decideAfterReview()` 결과 | 현재 `buildShadowContext()` 동작 | QA 판정 | 심각도 | 핵심 문제 요약 |
| --- | --- | --- | --- | :---: | :---: | --- |
| ** Combo-01A** | **[필수 1]** 심각한 기술 결함(`critical`) + 일반 사용자 질문(`needs_user_input`) (비반복, 한도 미달) | `REQUEST_USER_INPUT` (P6가 P10보다 우선) | `baseline`: `REQUEST_USER_INPUT`, 두 지적 모두 `findings`에 보존 (`technicalBlocker`: `true`/`false`) | 조건부 정상 (주의) | **Low** | Controller 재개 시 이전 Review 전체가 Writer에 전달되므로 결함이 소실되지는 않으나, `decision` 반환값 자체에는 기술 결함 경고가 없고 `review.suggestions` 전체가 강제 질문으로 합쳐짐 |
| **Combo-01B** | **[필수 1·3·4]** **반복된** 심각한 기술 결함(`critical`) + 사용자 질문(`needs_user_input` 또는 `clarify`) | `REQUEST_USER_INPUT` (P5c/P6가 P7보다 우선) | `baseline`: `REQUEST_USER_INPUT`, 반복 결함도 `findings`에 포함되나 `baseline`은 중단 아님 | **결함 의심** | **High** | P5c/P6(질문)가 P7(`STOP_REPEATED_REVIEW_ISSUES`)보다 앞에 위치하여, **반복된 치명적 결함 차단 정책이 우회**되고 사용자 답변 후 유료 Writer/Reviewer 재호출이 허용됨 |
| **Combo-02A** | **[필수 2]** Reviewer의 범위 밖 요구(`scope_violation` + `revise_plan`) + 기존 Scope 내 해결 가능한 결함(`critical`) | `REVISE` (두 지적 모두 Writer 피드백에 합산) | `baseline`: `REVISE`, 두 지적 모두 `technicalBlocker: true`로 포함, Shadow에서 `REVIEWER_RECHECK` + `WRITER_REWORK` 분리 가능 | 조건부 정상 (한계 확인) | **Medium** | 결정론적 Policy만으로는 Reviewer의 범위 밖 요구 문구도 `REVISE.feedback` 및 차기 `revisionAudit.previousIssueIds`에 강제 포함됨. Shadow 중재의 존재 이유가 확인되는 대표 사례 |
| **Combo-02B** | **[필수 2·6]** 사용자 요청 없는 Reviewer의 범위 밖 요구(`scope_violation` + `change_scope`) + Scope 내 결함(`critical` 또는 `revise_plan`) | `REQUEST_SCOPE_CHANGE_APPROVAL` (`issueIds`에 모든 `scope_violation` 포함) | `baseline`: `REQUEST_SCOPE_CHANGE_APPROVAL`, 반면 `validateShadowProposal`은 `user:request` 부재로 `SCOPE_CHANGE_REQUIRED` 거부 | **중대 결함** | **High** | ① 사용자 요청 없이도 Reviewer의 `change_scope`가 Loop 전체를 Scope 변경 승인 대기로 전환하며, ② **`scopeIssueIds` 필터 누락(L168, L178)**으로 같은 Review의 `revise_plan`·`clarify` 이슈까지 `ScopeChangeRequest.proposedChanges`에 오염됨 |
| **Combo-03A** | **[필수 3]** 동일 `review.issues` / `storage` 차단 지적 반복 + 반복 한도 도달 (`iterationCount === maxIterations`) | `STOP_REPEATED_REVIEW_ISSUES` (P7이 P9보다 우선) | `baseline`: `STOP_REPEATED_REVIEW_ISSUES`, `iteration:state` 참조 보존 | **정상** | **None** | 주차 v2 실제 사례와 동일. 두 상태 모두 자동 실행을 즉시 종료(`stopped` vs `limit_reached`)하며, 반복된 구체적 지적 ID와 이유를 보존하는 것이 진단에 유리함 |
| **Combo-03B** | **[필수 3·5]** 로컬 `qualityFindings`(`missing`) 또는 `revisionAudit.resolutions`(`unresolved`) 반복, 또는 Gemini 설명 문구 미세 변경으로 인한 `issue.id` 해시 변경 | `REVISE` (한도 미달 시) 또는 `STOP_LIMIT_REACHED` (한도 도달 시) — **`STOP_REPEATED_REVIEW_ISSUES` 미작동** | `baseline`: `REVISE` / `STOP_LIMIT_REACHED` | **결함 의심** | **High** | `findUnresolvedRepeatedIssues`(L236-L256)가 ① `qualityFindings`/`reviewAssuranceFindings` 반복을 검사하지 않고, ② Gemini 어댑터(`google-genai.ts` L394)는 `description` 문자열 해시로 `issue.id`를 생성해 문구가 조금만 바뀌어도 반복 감지를 우회함 |
| **Combo-04A** | **[필수 4]** `review.outcome === "failed"` + 사용자 질문 + Scope 변경 요청 | `FAILED` (P4가 P5~P10보다 우선) | `baseline`: `FAILED`, `findings`는 수집됨 | **정상** | **None** | 실패한 Review에서 질문이나 Scope 변경 요청이 실행 경로로 누출되지 않고 안전하게 Fail-closed 처리됨 |
| **Combo-04B** | **[필수 4]** `currentPlan`의 Scope 버전 불일치(P2) + 실패/손상된 Review(P3/P4) + 일반 결함 이슈 | `REQUEST_SCOPE_CHANGE_APPROVAL` (`issueIds: []`) | `validatePlanReview`에서 `REVIEW_SCOPE_MISMATCH` 예외 발생 (차단) | **결함** | **Medium** | `decideAfterReview()`에서 P2(L139)가 P3/P4(L151-L166)보다 먼저 실행되어 실패/무효 Review에서도 Scope 변경 승인을 요청하며, `issueIds: []`일 때 `controller.ts` L318이 **모든 일반 결함 이슈를 `ScopeChangeRequest.proposedChanges`에 복제**함 |
| **Combo-04C** | **[필수 4]** 반복 한도 소진(`iterationCount === maxIterations`) 상태에서 Scope 변경 요청(P5b) 또는 사용자 질문(P5c/P6) 발생 | `REQUEST_SCOPE_CHANGE_APPROVAL` 또는 `REQUEST_USER_INPUT` (P5/P6가 P9보다 우선) | `baseline`: `REQUEST_SCOPE_CHANGE_APPROVAL` / `REQUEST_USER_INPUT` | **결함 의심** | **Medium** | 이미 반복 예산이 소진(`iterationCount >= maxIterations`)되었음에도 `STOP_LIMIT_REACHED` 대신 대기 상태 및 `ApprovalRecord`를 생성함(이후 `continuation.ts` L148에서 재개 거부됨) |
| **Combo-05A** | **[필수 5]** Reviewer가 `outcome: "pass"`, `issues: []`를 반환했으나 로컬 `qualityAssessment`·`storageAudit`·`revisionAudit`에서 `missing`/`unsafe`/`blocked` 발생 | `REVISE` (반복 시 `storage`는 `STOP_REPEATED_REVIEW_ISSUES`, 한도 도달 시 `STOP_LIMIT_REACHED`) | `baseline`: `REVISE` / `STOP_*`, 로컬 지적들이 `quality:*`, `storage:*`, `assurance:*` ID로 `findings`에 빠짐없이 포함됨 | **정상** | **None** | 모델의 거짓 `pass`가 최종 승인 대기(`REQUEST_USER_APPROVAL`)로 직행하지 않도록 로컬 정책과 Shadow 모두가 일관되게 차단함 |
| **Combo-05B** | **[필수 5]** Reviewer `outcome: "pass"` + `storageAudit.cases`(`invalid`/`present_empty`)에 마크다운 제목(`# ...`)만 인용하거나, `revisionAudit` 없는 상태에서 `behaviorEvidence`에 제목만 인용 | `REQUEST_USER_APPROVAL` (`onlyHeadings` 검사 미적용 구간) | `baseline`: `REQUEST_USER_APPROVAL`, `findings: []` | **결함 의심** | **Medium** | `onlyHeadings()` 검사가 `storageValidation.rules` 및 `revisionAudit` 존재 시의 `behaviorEvidence`에만 적용되고, `storageAudit.cases`의 `evidence`/`trigger` 및 `qualityAssessment.checks`에는 적용되지 않음 |
| **Combo-06A** | **[필수 6]** 서로 다른 결함에 서로 다른 조치 필요: `scope_violation`(`clarify`) + `storage`/`quality` 질문(`needs_user_input`) + 기술 결함(`major`) 동시 존재 | `REQUEST_USER_INPUT` (`questions`에 **`clarify` 이슈만 포함**되고 나머지 질문 및 결함 누락) | `findings`에는 모두 포함되나 `baseline.questions`에는 `clarify`만 남음 | **중대 결함** | **High** | ① `policy.ts` L181(`clarify`) 조기 반환이 L188(`quality`/`storage`/`suggestions` 질문)을 **전부 증발**시키며, ② 반대로 `user-review.ts` L95는 `clarify` 이슈를 `table.questions`에서 **전부 누락**함 |
| **Combo-07A** | **[필수 7]** Reviewer의 일부 지적은 오독/거짓 양성(`major`)이고 다른 지적은 유효한 결함(`critical`)인 경우 | `REVISE` (또는 오독 지적이 `change_scope`/`clarify`면 해당 분기로 선점) | 두 지적 모두 `findings`에 포함되며, `validateShadowProposal`에서 `REVIEWER_RECHECK` + `WRITER_REWORK` 조합 허용 | 조건부 정상 (Shadow 필수) | **Medium** | 순수 구조 정책인 `decideAfterReview()`는 원문 의미 대조를 하지 않으므로 오독 지적도 `REVISE` 피드백에 포함한다. 단, **과거 형식(`scopeDisposition: undefined`)의 `scope_violation`**이 포함되면 `buildShadowContext`가 `technicalBlocker: true`로 설정해 Shadow에서도 `SCOPE_CHANGE_REQUIRED`/`USER_CLARIFICATION` 분류가 차단됨(Combo-08 참조) |
| **Combo-08** | **[추가 발견]** 레거시 `scope_violation`(`scopeDisposition: undefined`, `severity: "major"`)과 `buildShadowContext`의 `technicalBlocker` 판정 모순 | `REQUEST_SCOPE_CHANGE_APPROVAL` (L177) | `baseline`: `REQUEST_SCOPE_CHANGE_APPROVAL`, 그러나 `finding.technicalBlocker = true` (L95) | **결함** | **Medium** | `policy.ts` L177은 `scopeDisposition === undefined`를 Scope 변경 승인 경로로 보내지만, `triage-shadow.ts` L95는 `technicalBlocker: true`로 설정하여 `validateShadowProposal`이 `SCOPE_CHANGE_REQUIRED` 제안을 `BLOCKER_DOWNGRADED`로 거부함 (역으로 `minor` + `revise_plan`은 `technicalBlocker: false`로 풀림) |
| **Combo-09** | **[추가 발견]** 구조화된 항목 없는 플래그 단독 켜짐: ① `scopeViolation: true` + `scopeIssues: []` 또는 ② `userJudgmentRequired: true` + `questions: []` + `suggestions: []` (동시에 `critical` 결함/반복 결함 존재) | `REQUEST_USER_INPUT` (①은 고정 문구 1개, ②는 **빈 배열 `questions: []`** 반환하며 뒤의 `STOP_REPEATED_REVIEW_ISSUES`·`REVISE` 선점) | ① `scopeViolation: true` 단독 시 `findings`에 **해당 항목이 생성되지 않음**; ② 빈 질문으로 `REQUEST_USER_INPUT` 고정 | **결함** | **Medium** | `REVISE`는 L209에서 빈 피드백을 `FAILED`로 차단하지만, `REQUEST_USER_INPUT`은 L189에서 빈 질문 배열(`questions: []`)을 검증 없이 통과시키며 뒤쪽의 치명적/반복 결함 분기를 가로챔 |
| **Combo-10** | **[추가 발견]** `buildShadowContext`·`decideAfterReview`·`buildUserReviewTable`에서 `previousPlan` / `previousReview` 전달 시 `validateRevisionSource()` 미호출 | `revisionAudit` 내부 복사본만 일치하면 통과 (`REQUEST_USER_APPROVAL` 등 가능) | `input.previousPlan`·`input.previousReview`와 다른 `revisionAudit.baseline`·`previousIssueIds`를 넣어도 `buildShadowContext` 통과 | **결함** | **Medium** | `controller.ts` L217에서만 `validateRevisionSource()`를 호출하고, `policy.ts` L163·`triage-shadow.ts` L60/L69·`user-review.ts` L75에서는 호출하지 않아 이전 지적 ID 누락·위조 감사 기록을 걸러내지 못함 |

---

## 3. 재현 가능한 신규 반례 (상세 평가)

각 사례는 섹션 5의 평가 기준에 따라 **현재 Policy의 실제 동작**과 **QA가 권장하는 잠정 기대 결과(`provisional`)**를 구분하여 기술한다. 모든 사례는 `tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`에서 외부 API 호출 없이 즉시 재현된다.

---

### 사례 1: `Combo-01A` & `Combo-01B` — 심각한 기술 결함(및 반복 결함)과 사용자 선택 질문의 동시 발생 (필수 상황 1·3·4)

- **사례 ID:** `Combo-01A` (최초 발생), `Combo-01B` (직전 버전부터 반복된 치명적 결함 + 신규 사용자 질문)
- **입력 조건 및 재현 방법:**
  - `approvedScope`: 로컬 물주기 기록 보존(`R1`), 데이터 손실 금지 제약.
  - `currentPlan`: v2 기획안(잘못된 날짜 입력 시 기존 기록 덮어쓰기 결함 잔존 + 우산/식물 별칭 표시 형식 미정).
  - `previousReview` (`Combo-01B`): v1 Review에서 `id: "loss"`, `kind: "implementation_risk"`, `severity: "critical"`, `relatedRequirementId: "R1"` 지적 존재.
  - `review`: v2 Review에서 동일한 `id: "loss"` (`severity: "critical"`) 지적이 그대로 존재하고, 동시에 `outcome: "needs_user_input"`, `userJudgmentRequired: true`, `suggestions: ["날짜 표시 형식을 YYYY-MM-DD와 MM/DD 중 무엇으로 할까요?"]` (또는 `qualityAssessment`의 `needs_user_input` 항목 1개 + 일반 제안 `"참고: 추후 정렬 최적화를 고려하세요."`)가 포함됨.
- **관련 Scope·Plan·Review 정보:**
  - `review.issues`: `[{ id: "loss", kind: "implementation_risk", severity: "critical", relatedRequirementId: "R1", ... }]`
  - `review.userJudgmentRequired`: `true`, `review.outcome`: `"needs_user_input"`
- **현재 Policy의 실제 분기:**
  - `src/planning/policy.ts` L189-L191(P6)이 L193-L203(P7 `STOP_REPEATED_REVIEW_ISSUES`) 및 L217(P10 `REVISE`)보다 **앞에서 평가**된다.
  - 결과: `Combo-01A`와 `Combo-01B` 모두 `{ type: "REQUEST_USER_INPUT", questions: [...] }`를 반환한다.
  - 또한 `questions.length > 0`으로 L189에 진입할 때 `review.suggestions`에 있던 비질문성 일반 제안까지 `questions` 배열에 무조건 병합된다(L190).
- **권장되는 잠정 기대 결과 (`provisional`):**
  - `Combo-01A` (비반복 결함 + 질문):
    - 단일 상태를 반환해야 하는 `decideAfterReview()`에서는 `REQUEST_USER_INPUT`으로 분기하더라도(사용자 답변을 받아 다음 Writer 호출에서 결함 수정과 답변 반영을 한 번에 처리해 호출 예산을 아끼는 설계 의도는 타당함), ① 질문이 아닌 일반 `suggestions`가 강제 질문 목록(`questions`)에 섞이지 않아야 하고, ② Shadow 중재(`ShadowProposal`)에서는 기술 결함을 `WRITER_REWORK`, 질문을 `USER_CLARIFICATION`으로 각각 분리 표시해야 한다.
  - `Combo-01B` (반복된 치명적 결함 + 질문):
    - 이미 직전 버전(v1 → v2)에서 동일한 `critical` 결함(`loss`)이 해결되지 않고 반복되었으므로, 사용자에게 사소한 취향 질문을 던져 세션을 계속 진행시키기보다 **`STOP_REPEATED_REVIEW_ISSUES`가 우선**하거나 최소한 반복 차단 상태가 함께 기록되어야 한다.
- **현재 동작과 기대 결과의 차이:**
  - `Combo-01B`에서 `REQUEST_USER_INPUT`이 `STOP_REPEATED_REVIEW_ISSUES`를 가로채어, 반복 차단되어야 할 기획 루프가 `awaiting_user_input` 상태가 되고 `collect-feedback` → `answer` → `resume-plan`을 통해 유료 모델을 다시 호출할 수 있게 된다.
  - 또한 `policy.ts` L190(`questions: [...questions, ...review.suggestions]`)과 `user-review.ts` L95-L96(`review.outcome === "needs_user_input" || review.userJudgmentRequired`일 때만 `review.suggestions` 포함) 사이에 질문 수집 조건 불일치가 존재한다.
- **코드 위치 및 판단 근거:**
  - `src/planning/policy.ts` L186-L203 (`REQUEST_USER_INPUT` 분기가 `findUnresolvedRepeatedIssues`보다 선행)
  - `src/planning/user-review.ts` L95-L96 vs `src/planning/policy.ts` L189-L190
  - 참고: `test/review-consistency.test.ts` L39-L40에 반복 저장 지적 상태에서 `outcome: "needs_user_input"`이면 `REQUEST_USER_INPUT`이 반환됨을 확인하는 기존 테스트가 존재한다. 즉, 현재 동작은 과거 테스트에서 의도된 바 있으나, ‘반복된 치명적 결함이 질문 하나 때문에 차단을 우회하는 부작용’은 검토되지 않았다.
- **심각도:** `Combo-01A` **Low**, `Combo-01B` **High**
- **사용자 승인·Scope 위반 가능성:** 최종 승인으로 직행하지는 않으나, 반복 차단(`STOP_REPEATED_REVIEW_ISSUES`) 안전장치가 무력화될 수 있음.
- **추가 테스트 필요 여부:** 필요 (`tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`에 포함)
- **불확실하거나 확인하지 못한 사항:** `Combo-01B`에서 Codex의 원래 설계 의도가 ‘반복 결함이 있어도 사용자 질문이 있으면 무조건 질문을 먼저 처리’하려는 것인지, 아니면 ‘실제 결함 없이 질문만 있을 때 반복 중단과 구분’하려다 우선순위가 역전된 것인지 Codex 측 확인이 필요하다.

---

### 사례 2: `Combo-02A` & `Combo-02B` — Reviewer의 범위 밖 요구와 Scope 내 해결 가능한 결함의 동시 존재 (필수 상황 2·6)

- **사례 ID:** `Combo-02A` (`scopeDisposition: "revise_plan"`), `Combo-02B` (`scopeDisposition: "change_scope"` + `revise_plan` + `implementation_risk`, 사용자 요청 없음)
- **입력 조건 및 재현 방법:**
  - `approvedScope`: 로컬 브라우저 기록만 허용(`R1`), 외부 SMS 발송 제외(`EX-SMS`).
  - `userRequest`: `undefined` (사용자는 SMS를 요청한 적이 없음).
  - `review.issues`:
    - `Combo-02A`:
      1. `id: "overreach-sms"`, `kind: "scope_violation"`, `severity: "major"`, `scopeDisposition: "revise_plan"`, `description: "완성하려면 SMS 알림을 추가해야 한다."`
      2. `id: "in-scope-loss"`, `kind: "implementation_risk"`, `severity: "critical"`, `scopeDisposition: "not_applicable"`, `description: "잘못된 입력이 기존 기록을 덮어쓴다."`
    - `Combo-02B`:
      1. `id: "overreach-sms-change"`, `kind: "scope_violation"`, `severity: "major"`, `scopeDisposition: "change_scope"`, `description: "SMS 알림 기능을 Scope에 추가해야 한다."`, `suggestedDirection: "Scope에 SMS 추가"`
      2. `id: "in-scope-cleanup"`, `kind: "scope_violation"`, `severity: "major"`, `scopeDisposition: "revise_plan"`, `description: "초안에 제외된 클라우드 동기화 문구가 포함되었다."`, `suggestedDirection: "초안에서 클라우드 문구 삭제"`
      3. `id: "in-scope-loss"`, `kind: "implementation_risk"`, `severity: "critical"`, `scopeDisposition: "not_applicable"`, `description: "잘못된 입력이 기존 기록을 덮어쓴다."`, `suggestedDirection: "기존 값 보존"`
- **현재 Policy의 실제 분기:**
  - `Combo-02A`: `decideAfterReview()`가 `REVISE`를 반환하며 `feedback` 문자열에 `overreach-sms`와 `in-scope-loss`를 모두 줄바꿈으로 합쳐 반환한다(L218-L226).
  - `Combo-02B`: `decideAfterReview()`가 P5b(L177-L180)에서 즉시 `{ type: "REQUEST_SCOPE_CHANGE_APPROVAL", planId, version, issueIds: ["overreach-sms-change", "in-scope-cleanup"], reason: "..." }`를 반환한다.
- **권장되는 잠정 기대 결과 (`provisional`):**
  - `Combo-02A`: Shadow 중재에서 `overreach-sms`는 `REVIEWER_RECHECK`, `in-scope-loss`는 `WRITER_REWORK`로 분리되어야 한다(현재 `validateShadowProposal`에서 정상 지원됨).
  - `Combo-02B`:
    1. 사용자의 명시적 Scope 변경 요청이 없는데 Reviewer가 단독으로 `change_scope`를 주장한 경우, 기존 Scope 내의 치명적 결함(`in-scope-loss`, `in-scope-cleanup`) 수정을 가로채어 `ScopeChangeRequest`를 생성해서는 안 되며(Shadow에서는 `USER_REQUEST_REQUIRED`로 차단됨),
    2. 설령 정당한 `change_scope` 이슈가 있어 `REQUEST_SCOPE_CHANGE_APPROVAL`을 반환하더라도, **`decision.issueIds`에는 `scopeDisposition === "change_scope"`(또는 `undefined`)인 이슈 ID만 포함**되어야지, `scopeDisposition === "revise_plan"`이나 `"clarify"`인 이슈 ID까지 포함되어서는 안 된다.
- **현재 동작과 기대 결과의 차이:**
  1. **권한 경계 비대칭:** `validateShadowProposal()`(L134)은 `user:request` 참조 없이는 `SCOPE_CHANGE_REQUIRED`를 거부하지만, 정작 Core 실행 경로인 `decideAfterReview()`(L177)는 `userRequest` 유무를 확인하지 않고 Reviewer의 `scopeDisposition: "change_scope"`만 보고 즉시 `REQUEST_SCOPE_CHANGE_APPROVAL`을 반환한다.
  2. **`ScopeChangeRequest.proposedChanges` 오염 결함 (확정적 코드 결함):**
     `src/planning/policy.ts` L167-L168에서 `const scopeIssues = review.issues.filter(issue => issue.kind === "scope_violation"); const scopeIssueIds = scopeIssues.map(issue => issue.id);`로 정의한 뒤, L178에서 필터링 없이 `issueIds: scopeIssueIds`를 그대로 반환한다.
     그 결과 `src/planning/controller.ts` L317-L319:
     ```ts
     proposedChanges: review.issues
       .filter((issue) => decision.issueIds.length === 0 || decision.issueIds.includes(issue.id))
       .map((issue) => `${issue.description} Suggested: ${issue.suggestedDirection}`),
     ```
     에서 **‘기존 Scope를 유지하고 초안을 고치라(`revise_plan`)’는 지적과 ‘질문(`clarify`)’ 지적이 `ScopeChangeRequest.proposedChanges`(Scope 변경 제안 목록)에 그대로 들어간다.**
- **코드 위치 및 판단 근거:**
  - `src/planning/policy.ts` L167-L180 (`scopeIssueIds` 미필터링)
  - `src/planning/controller.ts` L317-L319 (`ScopeChangeRequest.proposedChanges` 생성 로직)
  - `src/supervisor/triage-shadow.ts` L134 (`USER_REQUEST_REQUIRED` 검사)
- **심각도:** **High**
- **사용자 승인·Scope 위반 가능성:** **높음.** 범위 내 교정(`revise_plan`) 대상이 Scope 변경 요청서(`proposedChanges`)에 섞여 들어가 사용자와 `propose-scope-change` 모델을 오도할 위험이 있다.
- **추가 테스트 필요 여부:** 필요 (`tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`에서 재현 완료)
- **불확실하거나 확인하지 못한 사항:** 없음(코드 및 정적/동적 실행으로 확정 확인).

---

### 사례 3: `Combo-03A` & `Combo-03B` — 반복된 결함과 반복 한도 도달의 동시 발생 및 반복 감지 누락 경계 (필수 상황 3)

- **사례 ID:** `Combo-03A` (`review.issues` / `storage` 동일 ID 반복 + 한도 도달), `Combo-03B` (`qualityFindings` / `revisionAudit.resolutions` 반복 또는 Gemini 이슈 문구 미세 변경)
- **입력 조건 및 재현 방법:**
  - `Combo-03A`: `iterationCount: 2, maxIterations: 2`, v1과 v2 모두 `id: "loss"`, `severity: "critical"` (또는 `issue-storage-validation-1`, 동일 규칙명) 존재.
  - `Combo-03B`:
    - 변형 1 (품질/보존 감사 반복): `review.outcome: "pass"`, `review.issues: []`이나 v1과 v2 모두 `qualityAssessment.requirements[0]`의 `status: "missing"`(또는 `behaviorEvidence.failure` 누락)이 반복됨 (`iterationCount: 1, maxIterations: 3`).
    - 변형 2 (Gemini `normalizeIssues` 해시 변화 + `revisionAudit.resolutions` 미해결): v1에서 `description: "잘못된 날짜 입력 시 기존 데이터를 덮어씀"`(`id: "issue-aaaa..."`)이 지적되었고, v2에서 Reviewer가 `revisionAudit.resolutions`에 해당 ID를 `status: "unresolved"`로 명시하면서 `review.issues`에는 `description: "잘못된 날짜 입력 시 기존 데이터를 덮어쓰는 문제 지속"`(`id: "issue-bbbb..."`)으로 문구를 조금 바꿔 보고함.
    - 변형 3 (`storageValidation.rules` 배열 순서 이동): v1에서 `rules[0]`이 `"createdAt"`(`issue-storage-validation-1`)이었는데, v2에서 앞에 `"id"` 규칙이 추가되어 `rules[1]`이 `"createdAt"`(`issue-storage-validation-2`)이 되면서 둘 다 `blocked: true`인 경우.
- **현재 Policy의 실제 분기:**
  - `Combo-03A`: P7(L197)이 P9(L213)보다 먼저 실행되어 `STOP_REPEATED_REVIEW_ISSUES`를 반환한다.
  - `Combo-03B`: 변형 1·2·3 모두 `findUnresolvedRepeatedIssues()`(L236-L256)가 빈 배열 `[]`을 반환하여 **`STOP_REPEATED_REVIEW_ISSUES`가 작동하지 않고 `REVISE`를 반환**한다(만약 `iterationCount === maxIterations`이면 `STOP_LIMIT_REACHED`로 귀결).
- **권장되는 잠정 기대 결과 (`provisional`):**
  - `Combo-03A`: 현재 동작(`STOP_REPEATED_REVIEW_ISSUES`)이 적절하다.
  - `Combo-03B`:
    - Reviewer가 `revisionAudit.resolutions`에서 직전 차단 지적 ID를 명시적으로 `status: "unresolved"`로 판정한 경우, 또는 동일한 `qualityAssessment` 필수 요구/체크 항목(`quality:requirement:R1` 등)이 연속으로 `missing`인 경우, 그리고 `storageValidation.rules`에서 동일한 `rule` 문자열이 배열 인덱스와 무관하게 연속 차단된 경우에는 반복 차단(`STOP_REPEATED_REVIEW_ISSUES`) 후보로 감지되어야 한다.
- **현재 동작과 기대 결과의 차이:**
  1. `src/planning/google-genai.ts` L393-L395의 `normalizeIssues()`는 `sha256(kind + "\n" + relatedRequirementId + "\n" + description)`으로 `issue.id`를 생성하므로, 실제 Gemini 호출에서는 v1과 v2의 `description` 문구가 한 글자만 달라도 `issue.id`가 달라져 `findUnresolvedRepeatedIssues()`(L244: `candidate.id === issue.id`)가 **절대 매칭되지 않는다.**
  2. 이 한계를 보완하기 위해 도입된 `revisionAudit.resolutions`는 컨트롤러가 주입한 정확한 `previousIssueIds`를 사용하지만, 정작 `findUnresolvedRepeatedIssues()`는 `revisionAudit.resolutions`를 전혀 참조하지 않는다.
  3. `findUnresolvedRepeatedIssues()`(L247-L253)는 `issue-storage-validation-(\d+)`에 대해 동일한 배열 인덱스(`rules[index]`)의 `rule` 문자열만 비교하므로, 규칙 배열에 항목이 추가·삭제되어 인덱스가 밀리면 동일 규칙의 반복 차단을 놓친다.
- **코드 위치 및 판단 근거:**
  - `src/planning/policy.ts` L196-L203, L236-L256
  - `src/planning/google-genai.ts` L393-L395
  - `src/planning/revision-audit.ts` L36-L54, L134-L140
- **심각도:** `Combo-03A` **None (정상)**, `Combo-03B` **High**
- **사용자 승인·Scope 위반 가능성:** 승인 우회는 없으나, 동일 결함 조기 중단(`STOP_REPEATED_REVIEW_ISSUES`)이 작동하지 않아 `maxIterations`까지 불필요한 유료 모델 호출이 반복될 수 있음.
- **추가 테스트 필요 여부:** 필요 (`tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`에 포함)
- **불확실하거나 확인하지 못한 사항:** `revisionAudit.resolutions`의 `status: "unresolved"`를 즉시 `STOP_REPEATED_REVIEW_ISSUES`로 연결할지, 아니면 `REVISE`를 허용하되 Shadow 중재 입력에만 경고를 줄지는 정책 설계 결정 사항이다.

---

### 사례 4: `Combo-04A`, `Combo-04B`, `Combo-04C` — Review 실패, 사용자 질문, Scope 변경 요청, 반복 한도의 복합 발생 (필수 상황 4)

- **사례 ID:** `Combo-04A` (`outcome: "failed"` + 질문 + Scope 변경), `Combo-04B` (`currentPlan` Scope 불일치 + 실패/무효 Review + 일반 이슈), `Combo-04C` (`iterationCount === maxIterations` + Scope 변경/질문)
- **입력 조건 및 재현 방법:**
  - `Combo-04A`: `review.outcome: "failed"`, `review.scopeViolation: true`, `issues: [{ id: "s1", kind: "scope_violation", severity: "major", scopeDisposition: "change_scope", ... }]`, `userJudgmentRequired: true`, `suggestions: ["질문 1"]`.
  - `Combo-04B`: `currentPlan.scopeVersion: 2` (`approvedScope.version: 1`), `review.outcome: "failed"`, `review.issues: [{ id: "bug-1", kind: "omission", severity: "major", description: "저장 누락", suggestedDirection: "저장 추가" }]`.
  - `Combo-04C`: `iterationCount: 2, maxIterations: 2`, `review.issues: [{ id: "s1", kind: "scope_violation", severity: "major", scopeDisposition: "change_scope", ... }]` (또는 `userJudgmentRequired: true`, `suggestions: ["질문 1"]`).
- **현재 Policy의 실제 분기:**
  - `Combo-04A`: P4(L166)에서 `{ type: "FAILED", reason: "Reviewer reported a failed review." }` 반환 (**정상**).
  - `Combo-04B`: P2(L139-L150)가 P3(L151-L165) 및 P4(L166)보다 먼저 실행되어 `{ type: "REQUEST_SCOPE_CHANGE_APPROVAL", issueIds: [], ... }` 반환. 이후 `PlanningLoopController.applyDecision`(`controller.ts` L318)에서 `decision.issueIds.length === 0` 조건이 참이 되어 일반 결함 `bug-1`(`kind: "omission"`)이 `ScopeChangeRequest.proposedChanges`에 들어감.
  - `Combo-04C`: P5b(L177) 또는 P6(L189)가 P9(L213 `iterationCount >= maxIterations`)보다 먼저 실행되어 `STOP_LIMIT_REACHED` 대신 `REQUEST_SCOPE_CHANGE_APPROVAL` 또는 `REQUEST_USER_INPUT`을 반환함.
- **권장되는 잠정 기대 결과 (`provisional`):**
  - `Combo-04A`: `FAILED` 반환 (현재 동작과 일치).
  - `Combo-04B`: Review 자체의 출처·근거 검증(P3) 및 `review.outcome === "failed"`(P4) 검사가 `REQUEST_SCOPE_CHANGE_APPROVAL` 반환보다 선행되어야 하며, `issueIds: []`일 때 일반 결함 이슈가 `ScopeChangeRequest.proposedChanges`로 복사되지 않아야 한다.
  - `Combo-04C`: 반복 한도(`iterationCount >= maxIterations`)에 도달한 상태에서의 `REQUEST_USER_INPUT` / `REQUEST_SCOPE_CHANGE_APPROVAL` 전이 여부는 `SupervisorController.report()`(L231: `exhausted` 시 `"STOP: Planning iteration budget is exhausted."` 표시) 및 `continuation.ts`(L148: 재개 차단)와 일관되게 처리되어야 한다.
- **코드 위치 및 판단 근거:**
  - `src/planning/policy.ts` L139-L166, L177-L191, L213-L215
  - `src/planning/controller.ts` L309-L331 (`decision.issueIds.length === 0` 처리)
  - `src/supervisor/controller.ts` L231, `src/supervisor/continuation.ts` L148
- **심각도:** `Combo-04A` **None**, `Combo-04B` **Medium**, `Combo-04C` **Medium**
- **사용자 승인·Scope 위반 가능성:** `Combo-04B`에서 무효/실패 Review가 Scope 변경 요청 레코드를 생성할 수 있음(단, `Controller`에서는 `validatePlanReview`가 선행 호출되어 방어되나 `decideAfterReview` 단독 호출 시 노출됨).
- **추가 테스트 필요 여부:** 필요 (`tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`에 포함)
- **불확실하거나 확인하지 못한 사항:** `Combo-04C`에서 한도 도달 시에도 질문/Scope 변경 요청 상태를 먼저 저장한 뒤 예산 증액 후 재개할 수 있게 한 의도인지 확인 필요(현재 `PlanningContinuationController`는 `maxIterations`가 설정 파일 고정값이면 재개를 영구 차단함).

---

### 사례 5: `Combo-05A` & `Combo-05B` — Reviewer가 PASS를 반환했지만 로컬 품질 검증이나 저장 감사가 실패하는 경우 (필수 상황 5)

- **사례 ID:** `Combo-05A` (로컬 품질·저장·보존 감사 차단), `Combo-05B` (제목만 인용한 `onlyHeadings` 우회 경계)
- **입력 조건 및 재현 방법:**
  - `Combo-05A`: `review.outcome: "pass"`, `review.issues: []`, `review.scopeViolation: false`, `review.userJudgmentRequired: false`이지만:
    1. `qualityAssessment.requirements[0].behaviorEvidence.failure`가 빈 배열이고 `failureNotApplicableReason`도 빈 문자열이거나,
    2. `storageAudit.cases` 중 `present_empty`가 승인 근거 없이 `action: "initialize"`이거나, `read_error`의 `trigger`가 단순 손상 JSON 문장만 인용했거나, `storageAudit.validation.rules[0]`의 확인 사례 연결이 없거나,
    3. `revisionAudit.preservation[0].status`가 `"missing"` 또는 `"unclear"`인 경우.
  - `Combo-05B`: `review.outcome: "pass"`, `review.issues: []`이고, Plan의 1행이 `# 1. 저장소 및 예외 처리 설계`(마크다운 제목)일 때:
    1. `storageAudit.cases`의 `invalid`, `present_empty` 항목이 `evidenceLines: [1]`, `trigger: { evidenceLines: [1], ... }`로 제목 줄만 인용한 경우, 또는
    2. `qualityAssessment.checks`가 전부 `evidenceLines: [1]`(제목 줄)만 인용한 경우, 또는
    3. `revisionAudit`가 `undefined`인 오프라인/합성 Review에서 `behaviorEvidence`가 제목 줄만 인용한 경우.
- **현재 Policy의 실제 분기:**
  - `Combo-05A`: `decideAfterReview()`가 `review.outcome === "pass"`를 무시하고 정확히 `REVISE`(또는 반복 시 `STOP_REPEATED_REVIEW_ISSUES`, 한도 도달 시 `STOP_LIMIT_REACHED`)를 반환한다. `buildShadowContext()` 또한 모든 로컬 지적을 `quality:*`, `storage:*`, `assurance:*`로 생성하고 `technicalBlocker: true`로 설정한다 (**정상**).
  - `Combo-05B`: `onlyHeadings()` 검사가 적용되지 않아 `decideAfterReview()`가 **`REQUEST_USER_APPROVAL`을 반환**하고 `buildShadowContext()`의 `findings`도 `[]`(0개)가 된다.
- **권장되는 잠정 기대 결과 (`provisional`):**
  - `Combo-05A`: 현재 동작(`REVISE` / `STOP_*`)이 정확하고 안전하다.
  - `Combo-05B`: `revision-audit.ts` L143에서 `review.revisionAudit`가 없더라도 `qualityAssessment.requirements[].behaviorEvidence`가 존재하면 `onlyHeadings` 검사를 수행하고, `storageAudit.cases`의 동작/trigger 근거에도 `onlyHeadings` 검사를 일관되게 적용하는 것이 안전하다.
- **코드 위치 및 판단 근거:**
  - `src/planning/review-quality.ts` L120-L132
  - `src/planning/storage-audit.ts` L117-L170 (`onlyHeadings`가 `storageValidationChecks`에만 사용됨)
  - `src/planning/revision-audit.ts` L142-L150 (`if (!review.revisionAudit) return [];`로 인해 `roles`의 `onlyHeadings` 검사까지 건너뜀)
- **심각도:** `Combo-05A` **None (정상)**, `Combo-05B` **Medium**
- **사용자 승인·Scope 위반 가능성:** `Combo-05B`의 경우 실제 규칙 문장이 아닌 마크다운 제목 줄만 인용한 모델 응답이 `REQUEST_USER_APPROVAL`까지 도달할 수 있음.
- **추가 테스트 필요 여부:** 필요 (`tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`에 포함)
- **불확실하거나 확인하지 못한 사항:** 레거시 불변 Review 호환성 때문에 의도적으로 `storageAudit.cases`의 `onlyHeadings` 검사를 생략했는지 확인 필요.

---

### 사례 6: `Combo-06A` — 서로 다른 결함에 서로 다른 조치가 필요한 경우 및 질문 증발 결함 (필수 상황 6)

- **사례 ID:** `Combo-06A`
- **입력 조건 및 재현 방법:**
  - 하나의 Review에 다음 세 가지가 동시에 존재:
    1. **Scope 명확화 질문 (`scope_violation` + `clarify`):** `id: "clarify-scope"`, `kind: "scope_violation"`, `severity: "major"`, `scopeDisposition: "clarify"`, `description: "동일 이름 우산의 중복 허용 여부 불명확"`, `dispositionReason: "사용자 선택 필요"`
    2. **로컬 저장소/품질 질문 (`needs_user_input`):** `storageAudit.cases` 중 `present_empty`가 `verdict: "needs_user_input"`, `rationale: "빈 파일일 때 초기화를 허용할지 사용자 확인 필요"` (및 `qualityAssessment`의 `needs_user_input` 질문 1건)
    3. **심각한 기술 결함 (`critical`):** `id: "data-loss"`, `kind: "implementation_risk"`, `severity: "critical"`, `scopeDisposition: "not_applicable"`, `description: "수정 실패 시 기존 기록 유실"`
- **현재 Policy의 실제 분기:**
  1. `decideAfterReview()` (`src/planning/policy.ts` L181-L184):
     - P5c 분기(`if (scopeIssues.some(issue => issue.scopeDisposition === "clarify"))`)에서 즉시 반환한다.
     - 반환값: `{ type: "REQUEST_USER_INPUT", questions: ["동일 이름 우산의 중복 허용 여부 불명확 — 사용자 선택 필요"] }`.
     - **L186-L191에 있는 `qualityFindings(needs_user_input)` 질문, `storageFindings.questions` 질문, `review.suggestions` 질문이 전부 버려진다!**
  2. `buildUserReviewTable()` (`src/planning/user-review.ts` L95-L96):
     - `const questions = [...findings.filter(f => f.status === "needs_user_input").map(f => f.message), ...storage.questions, ...(review?.outcome === "needs_user_input" || review?.userJudgmentRequired ? review.suggestions : [])];`
     - 반대로 `buildUserReviewTable()`은 **`scopeDisposition === "clarify"` 이슈를 `table.questions`에 전혀 넣지 않는다!** (만약 1번 `clarify-scope`만 있는 Review였다면, 상태는 `awaiting_user_input`인데 사용자 검토표 `review.md`의 `## 사용자 확인이 필요한 질문`에는 `- 기록된 질문 없음`이 출력된다!)
- **권장되는 잠정 기대 결과 (`provisional`):**
  - `decideAfterReview()`에서 `scopeDisposition === "clarify"` 질문은 조기 반환으로 다른 질문들을 덮어쓰지 말고, L188의 `questions` 배열에 통합하여 모든 사용자 질문(`clarify` + `quality(needs_user_input)` + `storage.questions`)이 누락 없이 반환되어야 한다.
  - `buildUserReviewTable()`과 `revisionIssueSources()` 또한 `scopeDisposition === "clarify"` 질문을 동일하게 질문 목록에 포함해야 한다.
- **현재 동작과 기대 결과의 차이:**
  - `policy.ts`는 `clarify`가 있으면 나머지 질문을 모두 버리고, `user-review.ts`는 언제나 `clarify` 질문을 버리는 **상호 모순(Mutual Question Dropping)** 상태다.
- **코드 위치 및 판단 근거:**
  - `src/planning/policy.ts` L181-L191
  - `src/planning/user-review.ts` L95-L96, L206
- **심각도:** **High**
- **사용자 승인·Scope 위반 가능성:** 필수 사용자 확인 질문(특히 `storageAudit`의 데이터 초기화 허용 여부 질문 등)이 `collect-feedback` 과정에서 누락되어 사용자 답변 없이 다음 단계로 넘어갈 위험이 있음.
- **추가 테스트 필요 여부:** 필요 (`tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`에서 재현 완료)
- **불확실하거나 확인하지 못한 사항:** 없음(코드 대조 및 실행으로 확정 확인).

---

### 사례 7: `Combo-07A` & `Combo-08` — Reviewer의 일부 지적은 잘못됐지만 다른 지적은 유효한 경우 및 레거시 `scopeDisposition` 모순 (필수 상황 7 + 추가 발견)

- **사례 ID:** `Combo-07A` (오독 지적 + 유효한 치명적 결함), `Combo-08` (레거시 `scope_violation`의 `technicalBlocker` 판정 모순)
- **입력 조건 및 재현 방법:**
  - `Combo-07A`:
    - `currentPlan.content`: `"L1: 삭제 취소 시 기존 우산 기록을 그대로 유지한다.\nL2: 수정 화면에서 잘못된 날짜를 입력하면 기존 기록에 먼저 덮어쓴다."`
    - `review.issues`:
      1. `id: "false-delete-cancel"` (`kind: "unverifiable"`, `severity: "major"`, `description: "삭제 취소 시 데이터 유지 규칙이 없다."` — 실제로는 L1에 명시되어 있는 Reviewer 오독)
      2. `id: "valid-edit-overwrite"` (`kind: "implementation_risk"`, `severity: "critical"`, `description: "수정 시 잘못된 입력이 기존 기록을 덮어쓴다."` — L2의 실제 결함)
  - `Combo-08`:
    - `userRequest`: `"우산 위치를 가족에게 SMS로도 공유하고 싶다."`
    - `review.issues`:
      1. `id: "legacy-scope-issue"` (`kind: "scope_violation"`, `severity: "major"`, `scopeDisposition: undefined` — 레거시/과거 형식의 Scope 위반 지적)
      2. `id: "valid-edit-overwrite"` (`kind: "implementation_risk"`, `severity: "critical"`)
- **현재 Policy의 실제 분기:**
  - `Combo-07A`:
    - `decideAfterReview()`는 원문 의미를 해석하지 않으므로 `REVISE`를 반환하고 두 지적을 모두 `feedback`에 포함한다.
    - `buildShadowContext()`는 두 지적을 모두 `technicalBlocker: true`로 등록하며, `validateShadowProposal()`은 `review:false-delete-cancel`에 `REVIEWER_RECHECK`(L1 인용), `review:valid-edit-overwrite`에 `WRITER_REWORK`(L2 인용)를 부여한 제안을 `structurally_valid_for_manual_inspection`으로 정상 통과시킨다.
  - `Combo-08`:
    - `decideAfterReview()`는 L177(`issue.scopeDisposition === undefined`)에 의해 `REQUEST_SCOPE_CHANGE_APPROVAL`을 `baseline`으로 반환한다.
    - 그러나 `buildShadowContext()`(`src/supervisor/triage-shadow.ts` L94-L95)는:
      `(i.severity === "major" || i.severity === "critical") && i.scopeDisposition !== "clarify" && i.scopeDisposition !== "change_scope"`
      조건으로 `technicalBlocker`를 계산하므로, `i.scopeDisposition === undefined`일 때 **`technicalBlocker = true`**가 된다!
    - 그 결과 `validateShadowProposal()`(L133)에서 `review:legacy-scope-issue`를 `SCOPE_CHANGE_REQUIRED`(또는 `USER_CLARIFICATION`)로 분류하면 `BLOCKER_DOWNGRADED:review:legacy-scope-issue` 오류가 발생하여 거부된다!
    - 반대로 `kind: "scope_violation"`, `severity: "minor"`, `scopeDisposition: "revise_plan"`인 이슈는 `decideAfterReview()`(L205: `scopeIssues.length > 0`)에서 승인 차단 및 `REVISE`를 강제하는 필수 교정 대상임에도, `buildShadowContext()`(L95)에서는 `severity === "minor"`라는 이유로 `technicalBlocker: false`가 되어 `USER_CLARIFICATION`이나 `SCOPE_CHANGE_REQUIRED`로 격하해도 `BLOCKER_DOWNGRADED`가 발생하지 않는다!
- **권장되는 잠정 기대 결과 (`provisional`):**
  - `Combo-07A`: `decideAfterReview()`가 보수적으로 `REVISE`를 유지하고 Shadow 중재에서 `REVIEWER_RECHECK`과 `WRITER_REWORK`로 분리하는 현재 구조는 설계 의도에 부합한다. (단, 오독 지적이 `change_scope`나 `clarify`로 잘못 표기된 경우에는 `Combo-02B`/`Combo-06A`의 선점 문제가 동일하게 발생한다.)
  - `Combo-08`: `triage-shadow.ts` L94-L95의 `technicalBlocker` 판정식이 `decideAfterReview()`의 차단 기준과 일치해야 한다.
- **코드 위치 및 판단 근거:**
  - `src/supervisor/triage-shadow.ts` L94-L95, L133
  - `src/planning/policy.ts` L177, L205
- **심각도:** `Combo-07A` **Low (설계 의도 부합)**, `Combo-08` **Medium**
- **사용자 승인·Scope 위반 가능성:** `Combo-08`에서 `minor` 등급의 `scope_violation`(`revise_plan`)이 Shadow 제안에서 사용자 취향 질문(`USER_CLARIFICATION`)으로 격하될 수 있음.
- **추가 테스트 필요 여부:** 필요 (`tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`에 포함)
- **불확실하거나 확인하지 못한 사항:** 없음.

---

### 사례 8: `Combo-09` & `Combo-10` — 추가 발견된 경계 결함 (빈 질문 배열 선점 및 `validateRevisionSource` 누락)

- **사례 ID:** `Combo-09` (구조화된 질문/이슈 없는 플래그 단독 켜짐 + 치명적/반복 결함), `Combo-10` (`validateRevisionSource` 호출 누락)
- **입력 조건 및 재현 방법:**
  - `Combo-09`:
    - 변형 1: `review.userJudgmentRequired: true` (또는 `review.outcome: "needs_user_input"`), `review.suggestions: []`, `questions: []`이면서 동시에 `review.issues`에 반복된 `critical` 결함(`loss`)이 존재하는 경우.
    - 변형 2: `review.scopeViolation: true`, `review.issues: []`(구조화된 `scope_violation` 이슈 없음)이면서 `buildShadowContext()`를 호출하는 경우.
  - `Combo-10`:
    - `input.previousPlan`(v1)과 `input.previousReview`(`id: "loss"` 지적 포함)를 `buildShadowContext(input)` 및 `decideAfterReview(input)`에 전달하면서, `review.revisionAudit`에는 `previousIssueIds: []`, `resolutions: []`로 이전 지적을 누락시키거나 `baseline.content`를 위조한 경우.
- **현재 Policy의 실제 분기:**
  - `Combo-09` 변형 1: `policy.ts` L189에서 `review.userJudgmentRequired`가 참이므로 `{ type: "REQUEST_USER_INPUT", questions: [] }`(**빈 질문 배열**)을 반환하며, 뒤쪽의 `STOP_REPEATED_REVIEW_ISSUES`와 `REVISE`를 모두 건너뛴다.
  - `Combo-09` 변형 2: `policy.ts` L170에서 `REQUEST_USER_INPUT`을 반환하지만, `buildShadowContext()`(`triage-shadow.ts` L94-L101)는 `review.scopeViolation === true` 단독 플래그에 대한 `ShadowFinding`을 생성하지 않아 `context.findings`가 `[]`이 된다.
  - `Combo-10`: `validatePlanReview()`는 `revisionAudit` 내부에 내장된 `baseline`과 `previousIssueIds`의 자체 일관성만 검사하고 `validateRevisionSource(review.revisionAudit, input.previousPlan, input.previousReview)`를 호출하지 않으므로, `buildShadowContext()`와 `decideAfterReview()`가 위조·누락된 `revisionAudit`를 오류 없이 통과시킨다.
- **권장되는 잠정 기대 결과 (`provisional`):**
  - `Combo-09`: `REVISE`가 L209에서 피드백 부재 시 `FAILED`를 반환하는 것처럼, `outcome === "needs_user_input"` 또는 `userJudgmentRequired === true`인데 실제 생성된 질문(`questions` 및 `suggestions`)이 0개이면 `FAILED`로 처리하거나 빈 질문으로 다른 차단 분기를 덮어쓰지 않아야 한다. 또한 `buildShadowContext()`는 `review.scopeViolation && scopeIssues.length === 0`일 때 대응하는 finding을 생성하거나 입력 검증에서 거부해야 한다.
  - `Combo-10`: `buildShadowContext()`, `decideAfterReview()`, `buildUserReviewTable()`에서 `previousPlan` 또는 `previousReview`가 주어진 경우 `validateRevisionSource()`를 호출해 실제 이전 기록과의 일치 여부를 검증해야 한다.
- **코드 위치 및 판단 근거:**
  - `src/planning/policy.ts` L162-L165, L170-L175, L189-L191, L209-L211
  - `src/supervisor/triage-shadow.ts` L60-L70, L94-L101
  - `src/planning/revision-audit.ts` L129-L133 (`validateRevisionSource`가 `src/planning/controller.ts` L217에서만 호출됨)
- **심각도:** **Medium**
- **사용자 승인·Scope 위반 가능성:** `Combo-10`에서 오프라인/합성 스냅샷이나 외부 호출자가 `previousReview`의 미해결 지적을 `revisionAudit.previousIssueIds`에서 누락시켜도 `decideAfterReview()`가 `REQUEST_USER_APPROVAL`을 반환할 수 있음.
- **추가 테스트 필요 여부:** 필요 (`tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`에 포함)
- **불확실하거나 확인하지 못한 사항:** 없음.

---

## 4. 정상적으로 동작하는 조합

기존 ADTF 구현이 복합 조건에서도 안전하고 일관되게 동작하는 영역은 다음과 같다.

1. **프로젝트·기획·Scope 버전 불일치 및 구조 오류의 최우선 차단 (P1, P3, P4):**
   - `review.outcome === "failed"`이거나 `qualityAssessment`·`storageAudit`·`revisionAudit`의 인용 줄 번호·원문 텍스트·필수 요구 커버리지가 맞지 않을 때, 같은 Review에 사용자 질문이나 Scope 변경 요청이 함께 들어 있어도 `FAILED`가 우선하여 잘못된 질문이나 승인 요청이 생성되지 않는다 (`Combo-04A`).
2. **모델의 거짓 `pass`에 대한 로컬 감사 오버라이드 (`Combo-05A`):**
   - Reviewer 모델이 `outcome: "pass"`, `issues: []`를 반환하더라도 `qualityFindings`(`missing`), `storageAuditFindings`(`unsafe`/`unspecified`/무근거 초기화/검증 규칙 연결 누락), `reviewAssuranceFindings`(`preservation` 누락/미해결) 중 하나라도 발견되면 `REQUEST_USER_APPROVAL`로 가지 않고 `REVISE` 또는 `STOP_*`으로 정확히 차단된다.
   - `buildShadowContext()` 또한 원시 `review.issues`가 0개여도 로컬 감사 지적들을 모두 고유 ID(`quality:*`, `storage:*`, `assurance:*`)와 `technicalBlocker: true`로 포함하며, `validateShadowProposal()`이 이들의 누락(`OMITTED_FINDING`)이나 취향 질문 격하(`BLOCKER_DOWNGRADED`)를 엄격히 차단한다.
3. **반복 결함과 반복 한도 도달의 동시 발생 시 진단 정보 보존 (`Combo-03A`):**
   - 동일 `review.issues` 또는 `storage` 검증 차단 지적이 반복되면서 동시에 `iterationCount === maxIterations`에 도달한 경우, `STOP_REPEATED_REVIEW_ISSUES`가 반환되어 단순 횟수 초과보다 구체적인 반복 지적 ID와 원인을 보존하며 Loop는 동일하게 즉시 정지(`stopped`)한다.
4. **Shadow 중재 계층에서의 다중 지적 1:1 분리 분류 (`Combo-01A`, `Combo-02A`, `Combo-07A`):**
   - 단일 Review 안에 유효한 기술 결함(`WRITER_REWORK`), 사용자 선택 질문(`USER_CLARIFICATION`), Reviewer 오독/과잉 요구(`REVIEWER_RECHECK`), 사용자 명시 요청 기반 Scope 변경(`SCOPE_CHANGE_REQUIRED`)이 섞여 있을 때, `buildShadowContext()`와 `validateShadowProposal()`은 원래 `baseline` 결정을 변조하지 않으면서 각 지적별 개별 분류와 원문 근거 인용을 구조적으로 검증한다.

---

## 5. 문제가 의심되는 조합

기존 구현에서 논리적 결함 또는 권한/상태 불일치가 확인되거나 강하게 의심되는 조합은 다음 8가지다.

1. **[High] `Combo-02B` — `scopeIssueIds` 미필터링으로 인한 `ScopeChangeRequest.proposedChanges` 오염 및 무요청 Scope 변경 선점:**
   - `scope_violation` 이슈 중 `change_scope`(1건)와 `revise_plan` 또는 `clarify`(1건 이상)가 함께 있을 때, `policy.ts` L178이 `scopeIssueIds` 전체를 반환하여 `controller.ts` L318이 **범위 내 수정(`revise_plan`) 및 질문(`clarify`) 이슈까지 Scope 변경 제안서(`proposedChanges`)에 포함**시킨다. 또한 `decideAfterReview()`는 `userRequest` 없이도 Reviewer 단독의 `change_scope` 주장을 최우선 채택한다.
2. **[High] `Combo-06A` — `scopeDisposition: "clarify"`와 일반 질문(`quality`/`storage`/`suggestions`) 간의 상호 질문 누락:**
   - `policy.ts` L181은 `clarify` 이슈가 있으면 즉시 반환하여 같은 Review의 `qualityFindings(needs_user_input)`·`storageFindings.questions`·`review.suggestions` 질문을 모두 증발시킨다.
   - 반대로 `user-review.ts` L95는 `clarify` 이슈를 `table.questions`에 포함하지 않아 사용자 검토표에서 질문이 사라진다.
3. **[High] `Combo-01B` — 사용자 질문(P5c/P6)이 반복된 치명적 결함 차단(P7 `STOP_REPEATED_REVIEW_ISSUES`)을 우회:**
   - 직전 버전에서 해결되지 않은 동일한 `critical` 결함이 반복되었음에도, 같은 Review에 질문이 하나라도 있으면 `STOP_REPEATED_REVIEW_ISSUES` 대신 `REQUEST_USER_INPUT`이 반환되어 자동 중단 정책이 우회된다.
4. **[High] `Combo-03B` — `findUnresolvedRepeatedIssues`의 반복 감지 사각지대:**
   - ① `qualityFindings`(`missing`) 및 `reviewAssuranceFindings`(`revisionAudit.resolutions`의 `unresolved`) 반복 미감지, ② `GeminiPlanningReviewer.normalizeIssues()`의 `description` 해시 기반 ID 생성으로 인한 문구 변경 시 반복 미감지, ③ `storageValidation.rules` 배열 순서 변경 시 동일 규칙 반복 미감지.
5. **[Medium] `Combo-08` — `buildShadowContext`의 `technicalBlocker` 판정식과 `decideAfterReview` 간의 불일치:**
   - 레거시 `scope_violation`(`scopeDisposition: undefined`, `severity: "major"`)은 `baseline`이 `REQUEST_SCOPE_CHANGE_APPROVAL`인데 `technicalBlocker: true`로 설정되어 Shadow에서 `SCOPE_CHANGE_REQUIRED`가 거부되며, 반대로 `minor` + `revise_plan`인 `scope_violation`은 Policy에서 필수 수정 대상인데 `technicalBlocker: false`로 설정되어 `USER_CLARIFICATION` 격하가 허용된다.
6. **[Medium] `Combo-09` — 빈 질문 배열(`questions: []`) 반환 및 `scopeViolation: true` 단독 플래그의 Shadow Finding 누락:**
   - `userJudgmentRequired: true`이면서 실제 질문/제안이 비어 있을 때 `questions: []`인 `REQUEST_USER_INPUT`이 반환되어 뒤쪽의 `STOP_REPEATED_REVIEW_ISSUES`나 `REVISE`를 덮어쓴다. 또한 `scopeViolation: true`이고 `scopeIssues`가 없을 때 `buildShadowContext()`의 `findings`가 비어버린다.
7. **[Medium] `Combo-04B` & `Combo-04C` — Plan Scope 버전 불일치(P2) 및 반복 한도 도달(P9)의 우선순위 역전:**
   - `currentPlan`의 Scope 버전이 다를 때 `review.outcome === "failed"`보다 먼저 `REQUEST_SCOPE_CHANGE_APPROVAL`(`issueIds: []`)이 반환되어 `controller.ts` L318이 모든 일반 결함을 `proposedChanges`에 복제한다. 또한 `iterationCount === maxIterations`에 도달한 상태에서도 P5/P6가 P9보다 앞서 실행된다.
8. **[Medium] `Combo-10` & `Combo-05B` — `validateRevisionSource()` 호출 누락 및 `onlyHeadings` 검사 범위 불균형:**
   - `buildShadowContext()`, `decideAfterReview()`, `buildUserReviewTable()`이 `validateRevisionSource()`를 호출하지 않으며, `storageAudit.cases` 및 `qualityAssessment.checks`에는 `onlyHeadings()` 검사가 적용되지 않는다.

---

## 6. 코드 근거와 재현 절차

### 6.1 주요 코드 위치 요약

1. `src/planning/policy.ts`
   - **L139-L150:** `currentPlan.scopeVersion !== approvedScope.version`일 때 L151-L166(`FAILED`)보다 먼저 `REQUEST_SCOPE_CHANGE_APPROVAL` (`issueIds: []`) 반환.
   - **L167-L185:** `scopeIssueIds`가 `scopeDisposition`을 구분하지 않고 모든 `scope_violation` 이슈 ID를 수집(L168)하여 L178에서 반환; L181-L184에서 `clarify` 이슈만 반환하고 L188의 `questions`를 누락.
   - **L186-L203:** L189(`REQUEST_USER_INPUT`)가 L196(`STOP_REPEATED_REVIEW_ISSUES`) 및 L213(`STOP_LIMIT_REACHED`)보다 먼저 실행됨; L190에서 비질문 시에도 `review.suggestions`를 병합하거나 빈 `questions: []`를 허용.
   - **L236-L256:** `findUnresolvedRepeatedIssues()`가 `qualityFindings`, `reviewAssuranceFindings`(`revisionAudit.resolutions`), 배열 인덱스가 이동한 `storageValidation.rules`, 설명 문구가 바뀐 Gemini 이슈 ID를 감지하지 못함.
2. `src/planning/controller.ts`
   - **L317-L319:** `decision.issueIds.length === 0 || decision.issueIds.includes(issue.id)` 조건으로 인해 `issueIds: []`이거나 `scopeIssueIds`에 `revise_plan`/`clarify`가 섞여 있을 때 `ScopeChangeRequest.proposedChanges`가 오염됨.
3. `src/planning/user-review.ts`
   - **L95-L96:** `questions` 배열 생성 시 `scopeDisposition === "clarify"`인 이슈를 누락함.
4. `src/supervisor/triage-shadow.ts`
   - **L60-L70:** `input.previousPlan` / `input.previousReview`가 제공되었을 때 `validateRevisionSource()`를 호출하지 않음.
   - **L94-L95:** `technicalBlocker` 계산식이 `scopeDisposition === undefined`(레거시 Scope 변경)를 `true`로, `severity === "minor" && scopeDisposition === "revise_plan"`(필수 범위 내 교정)을 `false`로 설정함.

### 6.2 오프라인 재현 절차

본 저장소는 Node.js `v26.13.0` 환경에서 외부 패키지나 빌드 산출물(`dist/`) 생성 없이 TypeScript 원문을 직접 실행할 수 있는 격리 로더를 통해 기존 작업 폴더를 전혀 변경하지 않고 오프라인 테스트를 실행할 수 있다.

```powershell
node --test tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs
```

- 위 테스트는 임시 폴더나 `dist/`를 작업 트리에 생성하지 않으며, 네트워크·Vertex AI·ADC 호출을 일절 수행하지 않는다(`newModelCalls = 0`).

---

## 7. 중대 결함 및 위험도

발견된 문제 중 우선 조치가 필요한 상위 위험 항목은 다음과 같다.

| 순위 | 결함 항목 | 관련 사례 | 위험도 | 영향 및 발생 조건 |
| :---: | --- | :---: | :---: | --- |
| **1** | `scopeIssueIds` 미필터링 및 `issueIds: []` 처리로 인한 `ScopeChangeRequest.proposedChanges` 오염 | `Combo-02B`, `Combo-04B` | **High** | 한 Review에 `change_scope`와 `revise_plan`/`clarify`가 함께 있으면 범위 내 수정 지시까지 Scope 변경 안건으로 둔갑함 |
| **2** | `scopeDisposition: "clarify"`와 일반 질문(`quality`/`storage`/`suggestions`) 간 상호 질문 누락 | `Combo-06A` | **High** | `decideAfterReview()`는 `clarify` 외의 모든 질문을 버리고, `buildUserReviewTable()`은 `clarify` 질문을 버려 사용자 질문이 유실됨 |
| **3** | 사용자 질문(P5c/P6)에 의한 `STOP_REPEATED_REVIEW_ISSUES`(P7) 선점 우회 | `Combo-01B` | **High** | 치명적 기술 결함이 해결되지 않고 반복되었음에도 질문이 함께 있으면 기술 중단 대신 사용자 질문 대기로 빠짐 |
| **4** | `findUnresolvedRepeatedIssues`의 반복 감지 사각지대 (Gemini 이슈 ID 해시 변경, `revisionAudit.resolutions`, `qualityFindings`, 규칙 순서 이동) | `Combo-03B` | **High** | 실제 Gemini 응답에서 문구가 조금만 달라지거나 로컬 품질/보존 감사 항목이 반복될 때 반복 중단이 작동하지 않음 |
| **5** | `buildShadowContext`의 `technicalBlocker` 판정 모순 (`scopeDisposition: undefined` 및 `minor` + `revise_plan`) | `Combo-08` | **Medium** | 레거시 Scope 위반에 대해 `SCOPE_CHANGE_REQUIRED` 제안이 거부되고, `minor` 범위 내 교정 이슈가 `USER_CLARIFICATION`으로 격하 가능함 |
| **6** | `validateRevisionSource()` 호출 누락 (`buildShadowContext`, `decideAfterReview`, `buildUserReviewTable`) | `Combo-10` | **Medium** | `previousPlan`/`previousReview`가 함께 전달되어도 `revisionAudit`가 이전 지적을 누락·조작한 경우를 감지하지 못함 |
| **7** | 빈 질문 배열(`questions: []`)의 `REQUEST_USER_INPUT` 허용 및 `scopeViolation: true` 단독 시 Shadow Finding 누락 | `Combo-09` | **Medium** | 질문 텍스트가 하나도 없는 상태에서 `userJudgmentRequired: true`만으로 루프가 멈추고 다른 차단 분기를 가림 |

---

## 8. 추가 테스트 제안

기존 `test/planning-contracts.test.ts`, `test/review-consistency.test.ts`, `test/triage-shadow.test.ts`는 단일 조건 위주로 구성되어 있으므로, 향후 Codex가 Core 테스트 스위트(`test/`)를 보강할 때 다음 복합 시나리오를 회귀 테스트로 추가할 것을 제안한다. (독립 재현 코드는 `tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`에 작성 완료.)

1. **복합 `scope_violation` 테스트:** 하나의 Review에 `scopeDisposition: "change_scope"`, `"revise_plan"`, `"clarify"`가 동시에 존재할 때 `decision.issueIds`와 `ScopeChangeRequest.proposedChanges`에 `"change_scope"`만 포함되는지 검증.
2. **복합 질문 병합 및 검토표 일관성 테스트:** `scopeDisposition: "clarify"` 이슈와 `storageAudit`(`verdict: "needs_user_input"`), `qualityAssessment`(`status: "needs_user_input"`)가 동시에 존재할 때 `decideAfterReview().questions`와 `buildUserReviewTable().questions`가 양쪽 모두 모든 질문을 누락 없이 포함하는지 검증.
3. **반복 차단 + 질문 동시 발생 테스트:** v1→v2에서 동일한 `critical` 결함이 반복되면서 동시에 질문이 추가되었을 때 `STOP_REPEATED_REVIEW_ISSUES`가 우선하는지 검증.
4. **`revisionAudit.resolutions` 및 배열 순서 이동 반복 감지 테스트:** Gemini 이슈 설명 문구가 바뀌어 `issue.id`가 달라졌으나 `revisionAudit.resolutions`에 `status: "unresolved"`가 기록된 경우, 그리고 `storageValidation.rules`의 인덱스가 밀린 경우의 반복 차단 검증.
5. **Shadow `technicalBlocker` 경계 테스트:** 레거시 `scope_violation`(`scopeDisposition: undefined`)과 `minor` `scope_violation`(`scopeDisposition: "revise_plan"`)에 대한 `validateShadowProposal` 허용/거부 검증.
6. **`validateRevisionSource` 교차 검증 테스트:** `buildShadowContext`에 전달된 `previousPlan`/`previousReview`와 `review.revisionAudit`의 `baseline`/`previousIssueIds`가 불일치할 때 즉시 거부되는지 검증.

---

## 9. 검증하지 못한 사항

1. **실제 Gemini 모델을 통한 중재(Shadow Proposal 생성) 성능 및 프롬프트 민감도:**
   - 본 과제는 비용 및 권한 제한 규칙(섹션 7)에 따라 유료 Gemini API / Vertex AI 호출을 일절 수행하지 않았으므로, 실제 LLM이 복합 지적 상황에서 각 지적을 얼마나 정확히 분류하는지는 측정하지 않았다.
2. **기존 `npm test` 전체 빌드 스크립트의 작업 폴더 내 직접 실행 생략:**
   - 현재 로컬 QA 작업 폴더(`c:\dev\create_agent-gemini-qa`)에는 `node_modules/`와 `dist/`가 존재하지 않는 깨끗한 상태다.
   - `npm run build` 또는 `npm test`를 작업 폴더에서 직접 실행하면 `dist/`가 생성되어 섹션 7의 지침(“빌드·테스트가 `dist/` 또는 다른 임시 파일을 생성해야 한다면, 기존 작업 폴더를 변경하지 않도록 별도의 폐기 가능한 복제본이나 격리 환경을 사용하세요”)을 위반할 수 있다.
   - 따라서 작업 폴더의 기존 파일을 일절 수정·생성하지 않고, Node.js `v26.13.0`의 내장 TypeScript 실행 및 메모리 내 모듈 해석 로더를 사용하여 `tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`에서 `src/planning/policy.ts`, `src/supervisor/triage-shadow.ts`, `src/planning/user-review.ts` 등을 직접 로드해 모든 반례를 검증했다. (`@google/genai` 패키지가 필요한 어댑터/CLI 통합 테스트는 로컬 `node_modules` 미설치 및 외부 호출 금지 원칙에 따라 실행하지 않았다.)

---

## 10. Codex에게 전달할 수정·검토 요청

Codex가 다음 Core 보완 작업을 진행할 때 아래 6개 항목을 순서대로 검토·수정할 것을 요청한다.

1. **`src/planning/policy.ts` (L167-L185) & `src/planning/controller.ts` (L317-L319) — Scope 위반 필터링 및 질문 병합 수정:**
   - L178에서 `REQUEST_SCOPE_CHANGE_APPROVAL`을 반환할 때 `issueIds`를 `scopeIssues.map(i => i.id)` 전체가 아니라 `scopeIssues.filter(i => i.scopeDisposition === undefined || i.scopeDisposition === "change_scope").map(i => i.id)`로 제한할 것.
   - `controller.ts` L318에서 `decision.issueIds.length === 0`일 때 `review.issues` 전체를 `proposedChanges`에 넣지 않도록 수정할 것.
   - L181-L184에서 `scopeDisposition === "clarify"`일 때 조기 반환하지 않고, L188의 `questions` 배열에 합산하여 다른 `quality`/`storage` 질문이 증발하지 않게 할 것.
2. **`src/planning/user-review.ts` (L95-L96) — `clarify` 질문 표시 누락 수정:**
   - `buildUserReviewTable()`의 `questions` 생성 시 `review?.issues.filter(i => i.kind === "scope_violation" && i.scopeDisposition === "clarify")` 항목도 함께 포함하여 `decideAfterReview()`의 질문 목록과 일치시킬 것.
3. **`src/planning/policy.ts` (L186-L203) — `STOP_REPEATED_REVIEW_ISSUES`와 `REQUEST_USER_INPUT` 간 우선순위 및 빈 질문 방어 검토:**
   - `findUnresolvedRepeatedIssues()`(P7)를 `REQUEST_USER_INPUT`(P6)보다 먼저 평가하여 반복된 치명적 기술 결함이 질문으로 인해 우회되지 않도록 할지 검토할 것.
   - `questions.length === 0 && review.suggestions.length === 0`일 때 `outcome === "needs_user_input" || review.userJudgmentRequired`만으로 빈 `questions: []`를 반환하지 않도록 가드(`FAILED` 등)를 추가하고, 일반 `suggestions`가 비질문 상황에서도 강제 질문으로 합쳐지는 조건(L190)을 `user-review.ts` L96과 맞출 것.
4. **`src/planning/policy.ts` (L236-L256) — `findUnresolvedRepeatedIssues()` 반복 감지 범위 보강:**
   - `storageValidation.rules` 반복 검사 시 배열 인덱스(`ordinal`) 위치가 달라져도 동일한 `rule` 문자열이 이전·현재 모두 차단(`blocked`) 상태이면 반복으로 감지할 것.
   - `revisionAudit.resolutions`에서 `status === "unresolved"`로 보고된 이전 차단 지적 및 반복된 `qualityFindings`(`missing`)의 기술 중단 연계 여부를 검토할 것.
5. **`src/supervisor/triage-shadow.ts` (L94-L95, L170) — `technicalBlocker` 판정식 및 비구조화 플래그 보완:**
   - 레거시 `scope_violation`(`i.kind === "scope_violation" && i.scopeDisposition === undefined`)은 `technicalBlocker: false`로, 반대로 `i.kind === "scope_violation" && i.scopeDisposition === "revise_plan"`은 `severity`와 무관하게 `technicalBlocker: true`로 설정하는 등 `decideAfterReview()`와 기준을 일치시킬 것.
6. **`src/supervisor/triage-shadow.ts` (L60-L70), `src/planning/policy.ts` (L162-L165), `src/planning/user-review.ts` (L75) — `validateRevisionSource()` 연결:**
   - `previousPlan` 또는 `previousReview`가 입력에 존재하고 `review.revisionAudit`가 정의된 경우 `validateRevisionSource()`를 호출하여 내장 복사본과 실제 이전 기록의 일치 여부를 검증할 것.
