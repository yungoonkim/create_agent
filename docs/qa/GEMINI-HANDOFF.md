# ADTF Gemini QA — 데스크톱·노트북 작업 인계서

- **작성일:** 2026-11-11 (Asia/Seoul)
- **작성 주체:** ADTF 독립 QA 담당자 (Gemini)
- **문서 목적:** 데스크톱 PC(VS Code + Antigravity)에서 수행한 1차·2차 독립 QA 결과를 기록하고, 대화 기록이 연동되지 않는 노트북 환경의 새 Gemini 세션에서 소스코드와 본 문서만으로 작업 맥락과 판단 근거를 파악하여 다음 작업을 안전하게 이어갈 수 있도록 지원함.
- **문서 상태:** 독립 QA 작업 인계서 (`gemini_qa_handoff_provisional`)

---

## 1. 프로젝트 및 Gemini QA 역할

### 1.1 ADTF 프로젝트 목적 및 현재 범위
- **프로젝트 명:** ADTF (Agent-Driven Test Framework) / GitHub: `yungoonkim/create_agent`
- **핵심 목표:** 특정 관리 대상 프로젝트에 종속되지 않는 Node.js CLI 기반 프레임워크로, 기획(Planning) 루프와 수동 개발 루프, 검증 근거 수집 및 지속형 세션을 제공함.
- **현재 범위 (`docs/roadmap.md`):** 지휘자(Supervisor) 겸 기획자 Agent 하나의 완성과 단독 검증에 한정함. 팀원 Agent 설계·개발·연결 및 Worker 자동 실행은 보류 상태임.
- **아키텍처 원칙 (`AGENTS.md`):**
  - 승인된 목표와 핵심 요구사항은 PM이나 Worker가 조용히 수정할 수 없으며 변경은 별도 승인 결정(`ApprovalRecord`)으로 기록함.
  - 승인된 Scope Contract와 기획안은 버전 불변 스냅샷으로 취급함.
  - Writer/Reviewer는 공유 메모리를 직접 수정하지 않으며 상태와 영속 기록은 Controller가 조정함.
  - 비밀 키, 인증 토큰, 개인 자격 증명을 저장소에 기록하지 않음.

### 1.2 Codex와 Gemini 사이의 책임 경계
- **Codex (Core 개발 및 버그 수정 담당):**
  - `src/**` 소스코드 구현, `test/**` 공식 테스트 작성·유지보수 및 공식 PR 준비를 담당함.
  - 최종 `main` 병합 여부와 범위 변경 승인은 사용자가 직접 결정함.
- **Gemini (독립 QA 및 감사 담당):**
  - Core 구현을 직접 수정하지 않음 (`src/**`, `test/**` 읽기 전용).
  - 기존 구현과 정책의 분기 우선순위, 정보 누출, 무결성 경계를 독립적으로 감사.
  - 오프라인 재현 가능한 반례 테스트 및 감사 보고서를 허용된 전용 경로(`docs/evaluations/supervisor-mediation/**`, `tests-evaluation/supervisor-mediation/**`)에만 작성.
- **독립 QA의 핵심 원칙:**
  1. **자동 확정 금지:** QA가 제시한 기대 결과는 사람의 검수가 완료되기 전까지 잠정안(`Provisional`)으로 표시하며, 기존 정책과 결과가 다르다고 해서 무조건 버그로 단정하지 않고 기존 정책의 의도와 권한 경계를 먼저 확인함.
  2. **원본 불변 보장:** 기존 승인 기록, Review 결과, 세션 기록, `docs/acceptance/**`의 공식 평가 원자료를 덮어쓰거나 완화하지 않음.
  3. **비용 및 네트워크 안전:** 프로젝트 코드에서 Gemini API·Vertex AI 유료 호출을 금지하고, Google Cloud ADC 인증 변경 및 실제 사용자 세션 재실행을 하지 않음. 오프라인 순수 함수 및 파일 해시 검증만 수행함.

---

## 2. Git 및 작업 환경 스냅샷

### 2.1 Git 커밋 및 브랜치 상태 (2026-11-11 확인)
- **로컬 작업 저장소:** `create_agent-gemini-qa` (Windows PC, VS Code + Antigravity)
- **원격 저장소 (origin):** `https://github.com/yungoonkim/create_agent.git`
- **현재 체크아웃 브랜치:** `qa/gemini-blind-input-audit`
- **현재 HEAD SHA:** `4133d5eefa5ec64e408d4f6da36f962125714a38`
- **원격 `origin/main` 최신 SHA:** `19aeed3f8e7966df88fbc5c8e9af2dfbce63ede0` (PR #39 병합 커밋)

### 2.2 각 QA 브랜치와 기준 main 커밋 비교
> [!IMPORTANT]
> 두 Gemini QA 브랜치는 `main`에 병합하지 않고 독립 검증 자료로 보존 중이며, 각각 분기된 기준 `main` 커밋이 최신 `origin/main`과 다릅니다.

| 브랜치명 | 최신 커밋 SHA | 분기 기준 main 커밋 | 커밋 메시지 / 작업 내용 | 상태 |
| :--- | :--- | :--- | :--- | :--- |
| **`qa/gemini-independent-qa`** | `4fb4a10a8f3fa25c8aa6c01042d359c859fd2269` | `2426ebc70e7406de1da359d332a284052c5b453e` (PR #33 머지) | `test: Supervisor 정책 분기 우선순위 독립 QA 검증 추가` | 1차 QA 완료 및 커밋 보존 (PR #37) |
| **`qa/gemini-blind-input-audit`** | `4133d5eefa5ec64e408d4f6da36f962125714a38` | `08d57f0174a7b05f002dfdbf8ea29a5a3781568f` (PR #35 머지) | `test: Supervisor 블라인드 평가 입력 누출 독립 감사 추가` | 2차 QA 완료 및 커밋 보존 (PR #40) |
| **`origin/main`** | `19aeed3f8e7966df88fbc5c8e9af2dfbce63ede0` | — | `Merge pull request #39 from yungoonkim/fix/shadow-scope-empty-questions` | Codex의 1차 QA 반영 최신 main |
| **`feature/triage-blind-v3` (검증 대상)** | `53f8823adb75e4c9fe780d236775829b752951e4` | `19aeed3f8e7966df88fbc5c8e9af2dfbce63ede0` (PR #39 머지) | `블라인드 참조 매핑의 순서 의존성 제거` | Codex PR #42 (3차 재검증 완료, 병합 승인 권장) |

### 2.3 작업 트리 상태 및 로컬 전용 파일 유무
- **작업 트리 상태:** `git status --short -uall` 실행 결과 출력 없음 (Clean).
- **커밋되지 않은 변경사항:** 0건.
- **로컬 전용 비추적 파일:** 없음.
- **주의사항:** 작업 저장소 내에 `node_modules/` 및 `dist/`는 의도적으로 생성하지 않은 상태입니다. (테스트는 Node.js 내장 로더로 메모리에서 직접 실행됨.)

---

## 3. 1차 Gemini QA 완료 내용 (Policy 분기 우선순위 조합 감사)

### 3.1 검증 목적 및 테스트 구조
- **목적:** 하나의 Review에 복합적인 문제(심각한 기술 결함, Scope 밖 요구, 질문, 반복 결함 등)가 동시에 발생할 때, `decideAfterReview()`와 `buildShadowContext()`가 안전한 우선순위로 분기하는지 정적 분석 및 반례 검증.
- **테스트 파일:** `tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs`
- **보고서 파일:** `docs/evaluations/supervisor-mediation/policy-priority-audit.md`
- **실행 명령:** `node --test tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs` (8개 `test()` 선언, 내부 16개 세부 시나리오 검증, 8 pass, 0 fail)

### 3.2 핵심 Combo별 분석 결과 및 Codex 반영 현황

| Combo ID | 핵심 내용 및 발생 결함 | Codex PR 반영 및 현재 상태 | 판정 분류 |
| :--- | :--- | :--- | :--- |
| **`Combo-01B`** | 반복된 심각한 결함(`critical`)과 사용자 질문(`needs_user_input`/`clarify`) 공존 시, 질문 분기(P5c/P6)가 반복 차단(P7 `STOP_REPEATED_REVIEW_ISSUES`)보다 먼저 실행되어 차단을 우회함 | **PR #38 반영 완료:** `policy.ts`에서 `STOP_REPEATED_REVIEW_ISSUES` 평가를 `REQUEST_USER_INPUT`보다 앞 순서로 재배치하여 반복 결함 차단이 정상 선점되도록 해결됨 | **완료 (해결)** |
| **`Combo-02B`** | Reviewer의 범위 밖 요구(`scope_violation` + `change_scope`)와 Scope 내 정상 결함(`critical` 등) 공존 시, `scopeIssueIds` 미필터링으로 인해 일반 결함까지 `proposedChanges`에 복제되어 승인 안건을 오염시킴 | **PR #36 반영 완료:** `controller.ts`와 `policy.ts`에서 `scopeDisposition === "change_scope"`인 이슈만 `issueIds` 및 `proposedChanges`에 들어가도록 필터링 엄격화 | **완료 (해결)** |
| **`Combo-03B`** | 동일 이슈 반복 판정식(`findUnresolvedRepeatedIssues`)이 `storageValidation.rules` 순번 변경 시 미감지되고, `revisionAudit.resolutions` 미해결 및 `qualityFindings` 반복을 감지하지 못함 | **미해결:** Codex는 PR #38에서 순번(ordinal) 매칭에 주석을 달고 배열 인덱스 기반 검사를 유지함. 규칙 텍스트 기반 비교 및 품질 감사 연계는 아직 미구현 | **미해결 (정책 결정 필요)** |
| **`Combo-04B`** | `currentPlan`의 Scope 버전 불일치(P2) 시 실패/무효 Review(P3/P4)보다 먼저 `issueIds: []`인 `REQUEST_SCOPE_CHANGE_APPROVAL`이 반환되고, `controller.ts`가 모든 일반 결함을 `proposedChanges`에 복제하던 안건 오염 | **PR #36 반영 완료:** `controller.ts`에서 `issue.kind === "scope_violation" && (issue.scopeDisposition === undefined || issue.scopeDisposition === "change_scope") && decision.issueIds.includes(issue.id)`로 한정하여 일반 결함 복제 차단 | **완료 (해결)** |
| **`Combo-04C`** | 반복 한도 소진(`iterationCount >= maxIterations`) 상태에서 반복 결함 및 사용자 질문/Scope 변경 시 분기 모순 및 후속 재개 차단 발생 | **PR #38 반영 완료 (부분 해결/주의):** `continuation.ts`에서 한도 소진 시에도 피드백 기록(`collectFeedback`)은 허용하도록 분리되었으나, **신규 Scope 제안 생성(`proposeScopeChange`)에는 여전히 한도 소진 차단 제한이 유지됨** | **완료 (주의)** |
| **`Combo-06A`** | Scope 명확화 질문(`clarify`)과 로컬 저장/품질 질문이 동시 존재할 때, `clarify` 조기 반환으로 다른 질문들이 증발하고 `user-review.ts`에서는 `clarify`가 누락됨 | **PR #36 반영 완료:** `collectReviewQuestions()`를 단일 함수로 신설하여 `policy.ts`와 `user-review.ts` 양쪽에서 질문을 동일하게 통합 수집하도록 통일 | **완료 (해결)** |
| **`Combo-08`** | 레거시 `scope_violation`(`scopeDisposition === undefined`)이 `policy.ts`에서는 Scope 변경 승인으로 가지만, `triage-shadow.ts`에서는 `technicalBlocker: true`로 설정되어 중재 제안이 거부됨 | **PR #39 반영 완료:** `triage-shadow.ts`에서 `scope_violation`은 `scopeDisposition === "revise_plan"`일 때만 기술 블로커로 인정하도록 일치시킴 | **완료 (해결)** |
| **`Combo-09`** | 질문과 제안이 없는 상태에서 `userJudgmentRequired: true`만으로 빈 질문(`questions: []`) 반환 및 무한 대기, 비구조화 `scopeViolation` 플래그 단독 켜짐 시 Shadow finding 누락 | **PR #39 반영 완료:** `policy.ts`에 빈 질문 시 `FAILED` 가드 추가, `triage-shadow.ts`에 가상 지적 `review:scope-violation-flag` 자동 생성 추가 | **완료 (해결)** |
| **`Combo-10`** | `previousPlan`/`previousReview`가 전달되었음에도 `review.revisionAudit`가 이전 지적을 누락/위조했을 때, `validateRevisionSource()`가 Core/Shadow에서 호출되지 않아 위조가 통과됨 | **미해결:** `validateRevisionSource()`는 존재하나 `validatePlanReview`나 `buildShadowContext` 내부에서 아직 호출되지 않음 | **미해결 (후속 과제)** |
| **`Combo-05B`** | Reviewer가 마크다운 제목(`# ...`)만 인용한 경우, `rules` 외의 `storageAudit.cases` 및 `qualityAssessment.checks`에는 `onlyHeadings` 검사가 적용되지 않아 거짓 pass가 통과됨 | **미해결:** 레거시 호환성을 위해 좁은 범위에만 적용되어 있으며, 광범위한 제목 인용 차단은 미적용 상태 | **미해결 (정책 검토 필요)** |

---

## 4. 2차 Gemini QA 완료 내용 (블라인드 평가 입력 누출 감사)

### 4.1 검증 목적 및 테스트 구조
- **목적:** PR #35에서 제기된 오프라인 평가 입력의 정답 암시 식별자 누출 문제를 독립 감사하고, 표면 식별자뿐 아니라 baseline·참조값·해시 전반의 누출 경로를 규명하여 향후 Codex가 구현할 블라인드 투영기의 불변조건과 반례 계약을 확립함.
- **테스트 파일:** `tests-evaluation/supervisor-mediation/blind-input-leak-audit.test.mjs`
- **보고서 파일:** `docs/evaluations/supervisor-mediation/blind-input-leak-audit.md`
- **실행 명령:** `node --test tests-evaluation/supervisor-mediation/blind-input-leak-audit.test.mjs` (7개 테스트 전원 통과)

### 4.2 확인된 정보 누출 경로 (`L-01` ~ `L-13`)
1. **`L-01`:** 파일 경로 `model-inputs/${caseId}.json`, `responses/${caseId}.template.json`에 시나리오 슬러그 노출.
2. **`L-02`:** `modelInput.source.caseId`에 원본 시나리오 ID 노출.
3. **`L-03`:** `context.source.projectId` (`"semantic-${caseId}"`) 노출.
4. **`L-04`:** `context.source.planId` (`"semantic-${caseId}-plan"`) 노출 및 `offline-recorder.mjs` L56 하드코딩 단언.
5. **`L-05` (신규):** `context.source.scopeContractId` (`"semantic-${caseId}-scope"`)가 PR #35 목록에서 누락되어 8개 전 케이스 노출.
6. **`L-06`:** `context.source.reviewId` (`"review-${caseId}-v${version}"`) 노출.
7. **`L-07`:** `context.findings[].id` 및 `context.references["finding:..."]`에 `"review:issue-${caseId}"` 노출.
8. **`L-08`:** `context.references["previous-review:issue:..."]` 키에 `"issue-${caseId}"` 노출.
9. **`L-09` (신규):** `context.references["previous-review:source"]` **JSON 문자열 값 내부**에 원본 ID 내장.
10. **`L-10` (신규):** `context.baseline` 객체 내부의 `feedback`, `issueIds`, `planId`, `reason`에 원본 ID 내장 (6개 케이스).
11. **`L-11` (신규):** `context.references["policy:baseline"]` **JSON 문자열 값 내부**에 `L-10`의 원본 ID가 이중 직렬화되어 복제됨.
12. **`L-12` (신규):** `modelInput.source.contextFileSha256` 등 원본 해시 4종이 공개 매니페스트·스코어카드와 1:1 매칭되어 역추적 가능.
13. **`L-13` (신규):** `cases.json`의 `umbrella-limit` 등 합성 원문 본문에 평가자 관점의 정책 결과 메타 서술어가 포함됨.

### 4.3 독립 반례 7건 검증 결과 (`Leak-CE-01` ~ `Leak-CE-07`)

> [!CAUTION]
> `Leak-CE-01`의 "식별자 오라클 8/8 (100%) 적중"은 **도메인 본문을 전혀 읽지 않고 ID 토큰만으로 정답 분류를 맞출 수 있을 정도로 식별자에 힌트가 과도하게 누출되어 있음을 증명한 결함 재현**이며, 실제 LLM의 평가 성능이나 정확도로 해석해서는 안 됩니다.

- **`Leak-CE-01` [현재 코드 누출 재현]:** 식별자 규칙 오라클이 8개 전 케이스의 Gold 분류를 100% 추론 성공.
- **`Leak-CE-02` [현재 코드 누출 재현]:** PR #35 표면 필드만 부분 중립화 시, `scopeContractId`와 `baseline` 내부 및 직렬화 문자열에서 원본 ID가 100% 누출됨을 확인.
- **`Leak-CE-07` [현재 코드 누출 재현]:** `contextFileSha256` 및 `contextSha256`만으로 공개 매니페스트에서 `caseId`를 100% 역추적 가능함을 확인.
- **`Leak-CE-03` [향후 구현 계약]:** 중립 ID 충돌 시 `DUPLICATE_FINDING` 거부 및 이전 리뷰와의 전역 매핑표 부재 시 반복 이력 단절 증명.
- **`Leak-CE-04` [향후 구현 계약]:** references 키 미동기화 시 `INVALID_REFERENCE`, 해시 미재계산 시 `digest mismatch` 발생 증명.
- **`Leak-CE-05` [향후 구현 계약]:** 모델이 배열 순서를 바꿔 응답할 때 위치(index) 기반 역매핑을 하면 블로커가 비블로커와 뒤바뀌어 `BLOCKER_DOWNGRADED`로 오판됨을 증명 (사전 기반 역매핑은 정상 통과).
- **`Leak-CE-06` [향후 구현 계약]:** 모델 응답의 `contextSha256 === blindedContext.contextSha256` 대조를 생략하고 원본 해시를 주입하면 다른 케이스 응답 재사용(Cross-Case Replay)이 사후 검증을 통과해버리는 출처 위조 허점 증명.

### 4.4 4단 SHA-256 해시 체인의 필요성
블라인드 평가의 위변조 방지를 위해 `result.json`에 다음 4단계 해시 체인을 연결해야 함:
$$\text{originalContextSha256} \longrightarrow \text{blindedContextSha256} \longrightarrow \text{rawBlindedResponseSha256} \longrightarrow \text{unblindedProposalSha256}$$
(여기에 원본↔중립 격리 매핑표의 `blindMapSha256`가 보증값으로 결합됨.)

---

## 5. 합성 평가 원자료와 정책 변화 (`umbrella-choice` 분석)

### 5.1 `umbrella-choice` 사례의 구조와 PR #39의 영향
- **원래 합성 카드 내용 (`cases.json`):**
  - 주제: 개인 우산 위치 기록
  - 승인된 Scope: "집에 둔 우산의 위치를 한 사람이 로컬에 기록한다. 동일 이름의 우산 처리 방식은 아직 미정이다."
  - 기획안 발췌: "같은 이름의 우산을 새로 입력하면 저장한다."
  - 리뷰 지적: "같은 이름의 두 우산을 별도 항목으로 허용할지 기존 항목을 갱신할지 결정되지 않았다."
  - 합성 입력 생성기(`materializeCase`) 설정: `kind: 'omission'`, `severity: 'minor'`, `question: true`
  - 생성된 Review: `outcome: "needs_user_input"`, `userJudgmentRequired: true`, 그러나 `suggestions: []`이며 `issues`의 `scopeDisposition`은 미지정.
- **PR #39의 정책 변화:**
  - `policy.ts` L185에 가드가 추가됨: `if (questions.length === 0) return { type: "FAILED", reason: "Reviewer requested user input without an actionable question." };`
  - `collectReviewQuestions()`는 질문 텍스트가 `scopeDisposition === "clarify"`나 `storageAudit.questions`, `suggestions`에 들어있을 때만 수집함.
  - 따라서 최신 `origin/main` 정책으로 `umbrella-choice`의 Review를 평가하면 `REQUEST_USER_INPUT`이 아니라 **`FAILED`**가 반환됨!

### 5.2 Shadow 기대 분류와 Policy Baseline의 목적 분리
- **Policy Baseline의 목적:** Review 객체의 순수 구조적 규칙에 따라 Planning Loop의 다음 분기(`FAILED`, `REQUEST_USER_INPUT` 등)를 결정하는 보수적 안전장치.
- **Shadow Semantic Evaluation의 목적:** Reviewer의 자연어 지적 본문을 모델이 읽고 문맥상 올바른 대응 분류(`USER_CLARIFICATION`)를 추천하는지 평가.
- **운영 원칙:**
  1. Policy baseline이 `FAILED`로 변경되었다고 해서 기존 합성 입력 v2(`cases.json`)를 임의로 수정하지 않음.
  2. Gold Label을 무오류의 확정 정답으로 단정하지 않으며, 사람 검수 전까지 잠정안으로 유지함.
  3. 향후 합성 입력 v3 작성 여부는 사람 검수자의 공식 판단 후에 결정함.
  4. 실제 모델 평가는 블라인드 투영과 사용자 승인이 완료되기 전까지 실행을 보류함.

---

## 6. 남은 작업과 권장 우선순위

Codex 및 Gemini QA가 다음 단계에서 수행해야 할 작업 목록과 권장 우선순위입니다. (이미 PR #36, #38, #39로 해결된 항목은 재구현하지 않습니다.)

```
[우선순위 1] (Codex) 2차 QA 보고서 독립 검토 및 블라인드 투영기 구현
      │
      ▼
[우선순위 2] (Gemini) 블라인드 투영·역매핑·4단 해시 체인 독립 재검증
      │
      ▼
[우선순위 3] (사용자/사람 검수자) 합성 평가 Gold 사람 검수 및 v3 필요성 판단
      │
      ▼
[우선순위 4] (Codex) Combo-03B: 반복 결함 동일성 규칙(rules 문자열 매칭) 보강
      │
      ▼
[우선순위 5] (Codex) Combo-10: validateRevisionSource()의 Core/Shadow 연결
      │
      ▼
[우선순위 6] (Codex) Combo-05B: 제목 인용(onlyHeadings) 검사 범위 정비 검토
```

1. **Gemini 2차 QA 결과에 대한 Codex 독립 검토:**
   - `L-01` ~ `L-13` 누출 경로 및 불변조건 10개 검토.
2. **블라인드 투영 및 역매핑 구현 (Codex):**
   - `offline-recorder.mjs`의 하드코딩 제거, `blind-projection` 모듈 작성, 사전 기반 역매핑 및 해시 체인 구현.
3. **블라인드 투영 구현 후 Gemini 독립 재검증 (Gemini):**
   - `tests-evaluation/supervisor-mediation/blind-input-leak-audit.test.mjs`의 계약 반례를 통과하는지 검증.
4. **합성 평가 Gold 사람 검수 및 v3 판단 (사람 검수자):**
   - `umbrella-choice` 질문 위치 보완 및 `umbrella-limit` 메타 서술어 정제 여부 결정.
5. **Combo-03B 반복 결함 동일성 판단 보완 (Codex):**
   - 순번 이동에 견고한 규칙 문자열 대조 검토.
6. **Combo-10 `validateRevisionSource()` 연결 (Codex):**
   - `validatePlanReview` 또는 `buildShadowContext`에서 이전 피드백 위조 검증.
7. **Combo-05B 제목 인용 검사 범위 정비 (Codex):**
   - `storageAudit.cases` 등 제목만 인용하는 편법 차단 검토.
8. **한도 소진 시 Scope 제안 별도 제한 주의 (참고):**
   - PR #38로 반복 한도 소진(`iterationCount >= maxIterations`) 상태에서도 사용자 피드백/답변 기록(`collectFeedback`)은 허용되었으나, 신규 Scope 제안 생성(`proposeScopeChange`)에는 모델 호출 차단 예외가 그대로 유지되므로 한도 도달 후 Scope 재개 시 별도 증액 결정이 필요함.

---

## 7. 실행 환경 및 검증 방법

### 7.1 실행 환경
- **OS:** Windows PC
- **런타임:** Node.js `v26.13.0` (내장 TypeScript 스트립 모드 지원)
- **종속성 상태:** 저장소 내 `node_modules/` 및 `dist/` 미설치 (Zero Dependency)
- **로더 구조:** Node.js `registerHooks`를 통해 메모리 내에서 `.ts` 파일을 직접 로드하고 파라미터 프로퍼티(`constructor(readonly ...)`)를 디슈거링하여 외부 빌드 아티팩트 없이 실행.

### 7.2 QA 전용 오프라인 테스트 실행 명령

```powershell
# 1차 Policy 분기 우선순위 조합 테스트 (8 tests pass)
node --test tests-evaluation/supervisor-mediation/policy-priority-combinations.test.mjs

# 2차 블라인드 평가 입력 누출 감사 테스트 (7 tests pass)
node --test tests-evaluation/supervisor-mediation/blind-input-leak-audit.test.mjs

# 3차 PR #42 블라인드 평가 v3 독립 재검증 테스트 (6 tests pass)
# 검증 대상 커밋: 53f8823adb75e4c9fe780d236775829b752951e4 (feature/triage-blind-v3)
# (별도 worktree 참조 시: $env:PR42_ROOT="C:\dev\create_agent-pr42-audit")
node --test tests-evaluation/supervisor-mediation/triage-blind-v3-audit.test.mjs
```

### 7.3 QA 테스트와 공식 Core 테스트의 차이
- **Core 테스트 (`test/**`):** TypeScript 컴파일(`dist/`) 및 개발 환경(`npm test`)을 전제로 하는 공식 저장소 테스트.
- **QA 테스트 (`tests-evaluation/**`):** 저장소 소스코드와 공식 원자료를 일절 수정하지 않고, 순수 Node.js 내장 모듈만으로 격리 실행되는 감사 전용 독립 테스트.
- **과거 실행과 직접 재실행의 구분:** 본 인계서에 기록된 결과는 2026-11-11 데스크톱 환경에서 직접 실행하여 확인된 실측치임 (`7 pass, 0 fail` / `8 pass, 0 fail`).

---

## 8. 보안과 작업 제한

다음 규칙을 철저히 준수해야 하며 위반 시 즉시 작업을 중단합니다.

1. **비밀 정보 보호:** API 키, 인증 토큰, Google Cloud ADC 자격 증명, 특정 PC의 절대 개인 경로(`c:\Users\<user>\...`)를 인계 문서나 커밋에 기록하지 않음.
2. **Core 및 원자료 읽기 전용:** `src/**`, `test/**`, `docs/acceptance/**`, `examples/**` 파일은 수정하지 않음.
3. **브랜치 격리:** QA 브랜치(`qa/**`)를 `main`으로 강제 병합하거나 리베이스하지 않음.
4. **외부 호출 금지:** Vertex AI, Gemini API, 외부 네트워크 호출을 일절 수행하지 않음.
5. **ADC 자격 증명 보존:** 로컬 PC의 Google Cloud ADC 설정을 변경하거나 임의로 인증 명령을 실행하지 않음.
6. **승인 없는 기능 확장 금지:** 지휘자 단독 검증 범위를 벗어나 팀원 Agent, Worker Runtime 자동 실행 등을 선행 구현하지 않음.

---

## 9. 내일 노트북에서 작업 재개 절차 (8단계)

노트북에서 작업 폴더를 복원한 뒤 다음 순서대로 진행합니다.

1. **작업 디렉터리 및 Git 브랜치 확인:**
   ```powershell
   git branch --show-current
   git status --short
   ```
   (현재 브랜치가 `qa/gemini-blind-input-audit`인지 확인)
2. **본 인계 문서 확인:**
   - `docs/qa/GEMINI-HANDOFF.md`를 열어 전체 진행 상태 파악.
3. **프로젝트 공통 규칙 확인:**
   - `AGENTS.md`, `docs/HANDOFF.md`, `docs/roadmap.md` 정독.
4. **1차·2차 QA 보고서 및 테스트 정독:**
   - `docs/evaluations/supervisor-mediation/blind-input-leak-audit.md`
   - `docs/evaluations/supervisor-mediation/policy-priority-audit.md`
5. **오프라인 QA 테스트 재실행 검증:**
   ```powershell
   node --test tests-evaluation/supervisor-mediation/blind-input-leak-audit.test.mjs
   ```
   (7개 테스트가 정상 통과하는지 확인)
6. **원격 최신 상태 대조:**
   ```powershell
   git fetch origin
   git log -n 5 --oneline origin/main
   ```
   (최신 `origin/main`이 `19aeed3`인지, 추가 커밋이 있는지 확인)
7. **백업 압축본 시점 확인:**
   - Google Drive 백업 파일이 GitHub 최신 커밋보다 이전 상태인지 확인하고, 차이가 있다면 변경 내역을 먼저 보고.
8. **사용자 지시 대기:**
   - 사용자의 명시적 지시가 있기 전까지 새로운 코드 수정을 임의로 시작하지 않음.

---

## 10. 다음 Gemini 세션용 재개 프롬프트

다음 날 노트북의 새로운 Gemini 세션을 시작할 때 아래 코드 블록 전체를 복사하여 첫 메시지로 전송하십시오.

```markdown
# 권장 모델 및 Thinking Level
- **권장 모델:** Gemini Flash 계열 (단순 인계 및 상태 확인 시) 또는 Gemini Pro 계열 (신규 심층 감사 시)
- **Thinking Level:** Medium ~ High

---

# ADTF 독립 QA — 노트북 작업 재개

안녕하세요. 어제 데스크톱 PC에서 수행한 ADTF 독립 QA 작업을 이어받아 진행합니다.

작업을 시작하기 전 다음 절차를 먼저 수행하고 상태를 보고해 주세요:

1. `docs/qa/GEMINI-HANDOFF.md`와 `AGENTS.md`를 먼저 읽고 현재 프로젝트 맥락과 역할 경계를 확인하세요.
2. 현재 Git 브랜치, HEAD SHA, `git status --short`, 원격 `origin/main`의 최신 커밋을 확인하세요.
3. 다음 오프라인 테스트를 직접 재실행하여 기존 2차 QA 검증이 깨지지 않고 통과하는지 확인하세요:
   `node --test tests-evaluation/supervisor-mediation/blind-input-leak-audit.test.mjs`
4. 확인된 사실(브랜치 상태, 테스트 통과 여부, 원격 main과의 차이)을 간결히 요약 보고하세요.
5. 보고가 끝나면 사용자 승인 전까지 Core 소스코드나 평가 원자료를 임의로 수정하지 마시고 다음 지시를 기다려 주세요.
```

---

## 11. 3차 Gemini QA 완료 내용 (Codex PR #42 블라인드 평가 v3 독립 감사)

- **검증 일시:** 2026-11-11
- **검증 주체:** ADTF 독립 QA 담당자 (Gemini)
- **대상 PR 및 커밋:** PR #42 (`feature/triage-blind-v3`, 커밋 `574e6dca71c680d2256e834da35d418a271eca86`)
- **작업 환경 및 격리:**
  - 기존 작업 저장소(`create_agent-gemini-qa`)와 격리된 별도 Git worktree(`C:\dev\create_agent-pr42-audit`)를 생성하여 detached HEAD 상태로 읽기 전용 검사 수행.
  - Core 소스코드(`src/**`, `test/**`) 및 PR #42 구현 코드 일체 수정 없음 (Zero Mutation).
  - 외부 LLM API 호출 0회, ADC 인증 변경 0회, 오프라인 순수 인메모리 테스트로 수행.
- **독립 QA 테스트 파일:** `tests-evaluation/supervisor-mediation/triage-blind-v3-audit.test.mjs` (5개 테스트 전원 통과, 0 fail)

### 11.1 주요 검증 결과 요약

1. **v3 8개 합성 사례 Policy Baseline 및 구조 일치:**
   - 8개 사례의 Baseline 판정(`REVISE`, `REQUEST_USER_INPUT`, `REVISE`, `REQUEST_SCOPE_CHANGE_APPROVAL`, `REVISE`, `STOP_REPEATED_REVIEW_ISSUES`, `STOP_LIMIT_REACHED`, `REVISE`)이 예상값과 100% 일치.
   - `umbrella-choice`: `review.suggestions[0]`에 질문 배치 -> PR #39 빈 질문 가드 통과 및 `REQUEST_USER_INPUT` 정상 반환, Shadow finding 2개(`review:issue-umbrella-choice`, `suggestion:1`) 정상 생성 확인.
   - `plant-repeated-loss`: 본문의 정답 단서("직전", "반복") 제거 후 순수 Review 관계 및 issue ID로 `STOP_REPEATED_REVIEW_ISSUES` 판정 확인.
   - `umbrella-limit`: 본문의 한도 소진 단서 문구 제거 후 `iteration:state` 값(`iterationCount: 1, maxIterations: 1`)으로 `STOP_LIMIT_REACHED` 판정 확인.
   - `plant-unrelated-citation`: L1(식물 이름 제목, 무관 인용)과 L2(선택한 기록만 제거, 직접 근거)의 분리 확인.

2. **L-01 ~ L-13 정보 누출 재검증 (100% 차단 확인):**
   - L-01: 고정 파일명 `model-inputs/input.json`, `responses/template.json`으로 슬러그 노출 차단.
   - L-02: `modelInput.source.caseId` 필드 제거 확인.
   - L-03 ~ L-07: `mapInput()`을 통해 `projectId`, `planId`, `scopeContractId`, `reviewId`, `issueId`가 불투명 토큰(`*-<token>-<index>`)으로 100% 전단사 치환.
   - L-08 ~ L-11: `mapped.input`으로 `buildShadowContext()`를 재생성하여 baseline 내부, `policy:baseline`, `previous-review:source` 직렬화 문자열까지 모두 중립 ID로 치환됨을 확인.
   - L-12: `modelInput`에 공개 원본 해시가 전혀 노출되지 않으며, `contextSha256`은 무작위 토큰으로 매번 달라져 공개 매니페스트와 매칭 불가함을 확인.
   - L-13: 원문 본문의 정답 암시 서술어 제거 및 사람 검수 대상으로 명확히 분리.

3. **ID 역매핑, 해시 체인 및 저장 안전성:**
   - findings 역순 응답 제출 시 사전 기반 역매핑을 통해 `restored`에 정확히 역매핑 복원 통과.
   - 알 수 없는 findingId(`UNKNOWN_FINDING`), 위조된 evidenceRefs(`INVALID_REFERENCE`), finding 누락(`OMITTED_FINDING`), 중복 finding(`DUPLICATE_FINDING`) 모두 즉시 거부됨을 확인.
   - 사례 간 응답 재사용(Cross-case replay) 시 `Blinded source mismatch`로 즉시 차단됨을 확인.
   - `inside()` 및 `file()`, `directory()` 가드를 통해 저장소 내부 출력, 공개/비공개 폴더 중첩, 심볼릭 링크 및 경로 탈출 차단 확인.
   - 파일 오류 발생 시 `try { ... } finally { rm(...) }` 트랜잭션 롤백으로 원본 불변성 보장 확인.

4. **신규 관찰사항 및 Codex 보완 권고사항:**
   - **`referenceMap()` 인덱스 의존성 개선 권장:** `blind-recorder.mjs` 라인 38-44에서 `previous-review:issue:` 및 `scope:requirement:`를 `Object.keys()`의 인덱스 순서(`oldPrev.forEach((k,i)=>add(k,newPrev[i]))`)로 매핑하고 있음. 현재 합성 사례는 단일 이슈라 문제없으나, 다중 이슈의 미래 안전성을 위해 `mapped.forward` 사전을 활용한 명시적 키 매핑(`mapped.forward['issue:' + oldId]`)으로 개선을 권장함.
   - **중첩 감사 필드 차단:** `mapInput` 라인 29에서 Review의 중첩 감사 필드(`qualityAssessment`, `storageAudit`, `revisionAudit`)가 존재하면 `Unsupported audit ID field` 예외로 Fail-closed 차단하고 있음을 확인 (현 1단계 합성 평가 범위에서는 적절함).

### 11.2 수정 커밋 `53f8823` 재검증 결과 (순서 의존성 완전 해결 확인)

- **검증 대상 수정 커밋:** `53f8823adb75e4c9fe780d236775829b752951e4`
- **커밋 메시지:** `블라인드 참조 매핑의 순서 의존성 제거`
- **독립 테스트 파일:** `tests-evaluation/supervisor-mediation/triage-blind-v3-audit.test.mjs` (6 tests pass, 0 fail)
- **수정 내용 및 검증 결과:**
  1. **`referenceMap()` 사전 기반 리팩토링 완료:**
     - `referenceMap(original, blind, idForward)` 형태로 시그니처가 확장되어, `idForward` 사전을 직접 참조하도록 수정됨.
     - `previous-review:issue:${id}`에 대해 `idForward['issue:' + id]`를 명시적으로 조회하여 타겟 키(`previous-review:issue:${mapped}`)를 구성.
     - `scope:requirement:${id}`에 대해 `idForward['requirement:' + id]`를 명시적으로 조회하고, 원본과 중립의 statement 일치 여부(`assert.equal(original.references[k], blind.references[target])`)까지 검증.
     - `scope:excluded:${i}` 순번 키와 실제 근거값 일치 검증.
     - `finding:${id}`에 대해 `findingIds[id]`를 명시적으로 조회하여 타겟 키 구성.
  2. **다중 이슈 및 순서 뒤바뀜 반례 검증 통과 (`PR42-F1`):**
     - 이전 Review에 3개의 이슈가 존재하고, 중립 Context에서 의도적으로 역순/무작위 순서로 배치된 상황에서도 사전 매핑을 통해 100% 정상 역매핑 및 복원이 이루어짐을 검증.
     - 미매핑 이슈/Requirement 존재 시 즉시 거부, 근거 내용 불일치 시 즉시 거부, 잉여 finding 존재 시 즉시 거부됨을 확인.
  3. **회귀 검증:**
     - v3 8개 사례 Policy Baseline, L-01~L-13 누출 방어, ID 역매핑 및 위조 거부, 해시 무결성, 기존 v1/v2 원자료 불변성 모두 이상 없이 통과 (기존 5개 테스트 + 신규 1개 테스트 총 6 pass).
  4. **최종 결론:**
     - 3차 QA에서 지적되었던 `referenceMap()` 순서 의존성이 완벽하게 해결되었으며, PR #42는 이제 `main` 병합에 기술적 결함이 없는 상태임.
