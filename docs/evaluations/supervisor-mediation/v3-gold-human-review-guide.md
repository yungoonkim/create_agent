# Supervisor 블라인드 평가 v3: Gold 사람 검수 안내서 및 사례별 심층 검토

- **문서 상태:** 독립 사람 검수자용 검토 제안서 (`independentHumanReview: pending` — 사람 승인 전, Gold 미확정)
- **작성 주체:** ADTF 독립 QA 담당자 (Gemini)
- **대상 평가 세트:** Supervisor 의미 중재 블라인드 평가 v3 (`synthetic_v3_pending_human_review`, 8개 합성 사례)
- **기준 커밋:** `cf07004a8459391cd2fb1c9a43997568b8e18443` (PR #42 병합) / `e53debd` (PR #44 병합 최신 main)
- **핵심 원칙:** 
  1. 본 문서는 Gold 확정본이 아니며, **독립 사람 검수자의 공식 판단을 돕기 위한 분석 및 검토 제안서**다.
  2. **Policy Baseline**(결정론적 규칙 기반 코드 결과)과 **Gold 후보**(도메인·정책적 정답 후보)를 엄격히 분리한다. Policy가 통과했다는 이유만으로 Gold를 정답으로 단정하지 않는다.
  3. 모든 사례의 사실 관계는 저장소에 존재하는 실제 코드와 입력을 직접 확인하여 기술하며, 인위적인 사실을 추가하지 않는다.

---

## 1. Executive Summary

8개 v3 합성 사례에 대해 실제 입력 스냅샷, Core Policy 규칙, Shadow Triage 계약, 정보 누출 방어 상태를 종합 분석한 결과는 다음과 같습니다.

| 검토 분류 | 사례 수 | 해당 사례 ID | 주요 특징 |
| :--- | :---: | :--- | :--- |
| **Approve candidate<br>(승인 후보)** | **6건** | `plant-invalid-input`<br>`umbrella-choice`<br>`plant-reviewer-overreach`<br>`plant-explicit-sms-request`<br>`umbrella-false-review`<br>`plant-unrelated-citation` | 도메인 의미, Scope 계약, Reviewer 지적의 타당성 대조 결과 현 Gold 후보가 합리적이며 평가 목적에 부합함. |
| **Ambiguous<br>(모호 / 정책 결정 필요)** | **2건** | `plant-repeated-loss`<br>`umbrella-limit` | 기술적·구조적 판정과 의미 중재 모델의 역할 정의(순수 내용 평가 vs 시스템 상태 승계)에 따라 복수의 정당한 해석이 존재함. |
| **Revise candidate<br>(수정 검토)** | **0건** | — | 즉시 폐기하거나 전면 수정해야 할 명백한 오류는 발견되지 않음. |
| **Insufficient evidence<br>(근거 부족)** | **0건** | — | 8개 사례 모두 입력, Scope, 기획안, 리뷰 근거가 온전히 보존되어 있음. |

### 핵심 분석 통찰
- **Policy Baseline과 Shadow Gold의 목적 차이 규명:**  
  결정론적 Policy(`decideAfterReview`)는 Reviewer의 지적이 참인지 거짓인지, 혹은 Scope 범위 밖인지 검증할 자연어 이해 능력이 없으므로 보수적으로 `REVISE`(Writer 수정)로 몰아넣는 구조적 한계를 지닙니다.  
  8개 사례 중 **3개 사례(`plant-reviewer-overreach`, `umbrella-false-review`, `plant-unrelated-citation`)**는 Policy Baseline이 맹목적으로 `REVISE`를 반환하는 반면, Shadow Gold 후보는 `REVIEWER_RECHECK`(Reviewer 재검토)를 제시합니다. 이는 Shadow 중재기가 존재하는 핵심 이유(결정론적 규칙의 맹점 보완)를 정확히 평가하도록 설계된 결과입니다.

---

## 2. Baseline과 Gold 후보 비교표

| 사례 ID | 주제 및 핵심 상황 | 현재 Policy Baseline (코드 결과) | 잠정 Gold 카테고리 후보 | Gemini 잠정 의견 | 사람 검수 핵심 쟁점 |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **`plant-invalid-input`** | 수정 시 유효하지 않은 날짜 처리 누락 | `REVISE` (`critical`) | `WRITER_REWORK` | **Approve candidate** | Scope의 기존 기록 보존 조건과 기획 누락 대조 (명확함) |
| **`umbrella-choice`** | 동일 이름 우산의 중복 저장 vs 갱신 선택 | `REQUEST_USER_INPUT` (질문 1개) | `USER_CLARIFICATION` | **Approve candidate** | 2개 finding(지적 + 질문)의 역할 분리 및 질문 중립성 검수 |
| **`plant-reviewer-overreach`** | 제외된 SMS를 Reviewer가 임의 요구 | `REVISE` (`revise_plan` 한계) | `REVIEWER_RECHECK` | **Approve candidate** | Policy Baseline(`REVISE`)의 맹점을 Shadow가 교정하는지 평가 |
| **`plant-explicit-sms-request`** | 제외된 SMS를 사용자가 명시적 요청 | `REQUEST_SCOPE_CHANGE_APPROVAL` | `SCOPE_CHANGE_REQUIRED` | **Approve candidate** | 사용자 요청 존재 시 Scope 변경 승인 경로 정상 분기 검수 |
| **`umbrella-false-review`** | 기획 원문 취소 시 유지 문장 오독 | `REVISE` (`unverifiable` 한계) | `REVIEWER_RECHECK` | **Approve candidate** | 기획 원문에 이미 존재하는 규칙에 대한 허위 지적 방어 |
| **`plant-repeated-loss`** | 선덮어쓰기 손실 지적 직전/현재 반복 | `STOP_REPEATED_REVIEW_ISSUES` | `ESCALATE_OR_STOP` | **Ambiguous** | 반복 중단(`STOP`)이 유일한가, Writer 수정 지시 병행이 가능한가? |
| **`umbrella-limit`** | 위치 오류 처리 누락 + 반복 한도 도달 | `STOP_LIMIT_REACHED` (`1/1`) | `ESCALATE_OR_STOP` | **Ambiguous** | 중재기가 '이슈 성격(WRITER)'을 보는지 '한도 상태(STOP)'를 보는지 |
| **`plant-unrelated-citation`** | 삭제 범위 근거로 L1 제목 표시 인용 | `REVISE` (`unverifiable` 한계) | `REVIEWER_RECHECK` | **Approve candidate** | L1(무관 제목 인용)과 L2(실제 삭제 규칙)의 의미적 연결 분리 검수 |

---

## 3. 사례별 상세 검수 카드

---

### [사례 1] `plant-invalid-input`

#### A. 사례 식별
- **사례 ID:** `plant-invalid-input`
- **주제:** 반려식물 물주기 기록
- **입력 생성 코드:** `examples/supervisor-triage-semantic/materialize.mjs` L12, L21-L55
- **검증하려는 정책 상황:** Scope의 "잘못된 입력으로 인한 데이터 손상 방지" 제약 조건을 Writer의 기획안이 누락했을 때, 적절히 기획 재작성(`WRITER_REWORK`)을 지시하는가.

#### B. 핵심 입력 사실
- **Scope Contract (`R1`):** "한 사람이 브라우저에서 물 준 날짜와 식물 이름을 로컬에 저장한다. 잘못된 입력은 기존 기록을 손상시키면 안 된다." (외부 문자 발송 제외 없음)
- **현재 Plan (`L1`):** "날짜가 비어 있으면 저장 요청을 취소하고 기존 기록을 유지한다."
- **현재 Review 지적:** `kind: implementation_risk`, `severity: critical`, `description: "수정 화면에서 잘못된 날짜를 입력할 때 기존 기록을 덮어쓰는 예외가 빠졌다."` (`suggestedDirection: "Review 지적의 근거와 승인 범위 안에서 해결 방향을 확인한다."`)
- **Review 제안(`suggestions`):** `[]` (질문 없음)
- **이력 및 한도:** `iterationCount: 1`, `maxIterations: 2`, `previousReview: undefined`, `userRequest: null`

#### C. 현재 Policy Baseline
- **판정 결과:** `REVISE` (코드: `src/planning/policy.ts` L217-L226)
- **작동 규칙:** P10 (P1~P9에 해당하지 않으며, `critical` 차단 이슈가 존재하고 한도 미달이므로 정상 재작성 반환).
- **피드백 내용:** `"issue-plant-invalid-input: 수정 화면에서 잘못된 날짜를 입력할 때 기존 기록을 덮어쓰는 예외가 빠졌다. — Review 지적의 근거와 승인 범위 안에서 해결 방향을 확인한다."`

#### D. 독립 Gold 후보 검토
- **잠정 Gold 카테고리:** `WRITER_REWORK`
- **금지 카테고리:** `USER_CLARIFICATION`, `SCOPE_CHANGE_REQUIRED`
- **핵심 근거:** 
  1. Scope `R1`에 "잘못된 입력은 기존 기록을 손상시키면 안 된다"는 제약이 명시되어 있습니다.
  2. 기획안은 "날짜가 비어 있을 때"만 다루고 있으며, "형식이 잘못된 날짜"를 입력했을 때 기존 기록 덮어쓰기 방지 예외를 빠뜨렸습니다.
  3. Reviewer의 지적은 타당하며 승인된 Scope 범위 내이므로, 사용자를 호출하거나 Scope를 변경할 이유 없이 Writer가 기획을 보완해야 합니다.
- **반대/대안 해석:** 없음. 기술적 결함이자 범위 내 수정 요구임이 명백합니다.
- **Policy Baseline과의 일치 여부:** 일치 (`REVISE` $\leftrightarrow$ `WRITER_REWORK`).

#### E. 평가 적합성
- **의미 판단 평가성:** 높음. 모델이 기획안의 "날짜가 비어 있을 때"와 리뷰의 "잘못된 날짜 입력" 사이의 논리적 갭을 이해해야 합니다.
- **정답 누출 여부:** v3 블라인드 투영 시 불투명 토큰(`issue-<token>-1`)으로 대체되어 식별자 힌트 없음.
- **편향 점검:** 특정 구현 편향 없음.

#### F. 사람 검수 질문
- **질문 1:** 기획안의 "날짜 비어있음" 처리만으로는 "잘못된 날짜" 예외 처리가 부족하다는 Reviewer의 지적이 타당하며, `WRITER_REWORK`를 정답으로 승인합니까?
  - [ ] 승인 (Approve)  /  [ ] 수정 필요 (Revise)  /  [ ] 판단 보류 (Undecided)

---

### [사례 2] `umbrella-choice`

#### A. 사례 식별
- **사례 ID:** `umbrella-choice`
- **주제:** 개인 우산 위치 기록
- **입력 생성 코드:** `examples/supervisor-triage-semantic/materialize-v3.mjs` L12, L20-L36
- **검증하려는 정책 상황:** Scope에 미정으로 남겨진 정책 선택에 대해 기획자가 임의로 결정했을 때, Reviewer가 제기한 선택 질문을 파악하여 사용자에게 명확화(`USER_CLARIFICATION`)를 요청하는가.

#### B. 핵심 입력 사실
- **Scope Contract (`R1`):** "집에 둔 우산의 위치를 한 사람이 로컬에 기록한다. 동일 이름의 우산 처리 방식은 아직 미정이다."
- **현재 Plan (`L1`):** "같은 이름의 우산을 새로 입력하면 저장한다." (임의로 추가 저장 방식으로 기술)
- **현재 Review 지적 (Finding 1):** `kind: omission`, `severity: minor`, `description: "같은 이름의 두 우산을 별도 항목으로 허용할지 기존 항목을 갱신할지 결정되지 않았다."`
- **Review 제안 (Finding 2):** `suggestions[0]: "같은 이름의 우산을 새로 입력하면 별도 항목으로 저장할까요, 기존 항목의 위치를 갱신할까요?"`
- **Review 속성:** `outcome: "needs_user_input"`, `userJudgmentRequired: true`
- **이력 및 한도:** `iterationCount: 1`, `maxIterations: 2`, `userRequest: null`

#### C. 현재 Policy Baseline
- **판정 결과:** `REQUEST_USER_INPUT` (코드: `src/planning/policy.ts` L186-L191)
- **작동 규칙:** P6 (`review.outcome === "needs_user_input" || questions.length > 0`). PR #39 가드(`questions.length === 0`이면 `FAILED`)를 `suggestions[0]`의 질문으로 정상 통과함.
- **반환 질문:** `["같은 이름의 우산을 새로 입력하면 별도 항목으로 저장할까요, 기존 항목의 위치를 갱신할까요?"]`

#### D. 독립 Gold 후보 검토
- **잠정 Gold 카테고리:** 
  - `review:issue-umbrella-choice`: `USER_CLARIFICATION`
  - `suggestion:1`: `USER_CLARIFICATION`
- **금지 카테고리:** `SCOPE_CHANGE_REQUIRED` (승인 범위 밖 확장이 아니며, Scope 내부의 미정 선택 결정임)
- **핵심 근거:**
  1. Scope에 "동일 이름 우산 처리 방식은 미정"이라고 명시되어 있으므로 기획자가 임의로 "저장한다"고 단정할 수 없습니다.
  2. Reviewer는 omission 이슈와 함께 명확한 대안 선택지(별도 저장 vs 갱신)를 질문으로 제시했습니다.
  3. 따라서 사용자 판단을 구하는 `USER_CLARIFICATION`이 정책적으로 타당합니다.
- **반대/대안 해석 (주의 깊은 검토점):**
  - Finding 1(`review:issue-umbrella-choice`) 자체는 `kind: omission`이므로, 질문과 결합되지 않았다면 "기획자가 중복 처리 규칙을 빠뜨렸다"는 의미에서 `WRITER_REWORK`로 오판될 소지가 있습니다.
  - 하지만 Shadow Context는 Finding 1과 Finding 2(질문)가 같은 Review에서 공존하므로, 두 finding 모두 `USER_CLARIFICATION`으로 분류하는 것이 자연스럽습니다.
- **Policy Baseline과의 일치 여부:** 일치 (`REQUEST_USER_INPUT` $\leftrightarrow$ `USER_CLARIFICATION`).

#### E. 평가 적합성
- **의미 판단 평가성:** 매우 높음. Scope의 "미정" 문구와 기획의 "저장한다" 사이의 충돌, 그리고 질문의 적절성을 평가해야 합니다.
- **정답 누출 여부:** v3에서 description의 단서 문구 및 슬러그가 중립화됨.
- **편향 점검:** v3에서 finding이 2개(`review:issue-...`, `suggestion:1`)로 늘어났으므로, 평가 모델이 두 finding을 모두 식별하고 누락(`OMITTED_FINDING`) 없이 응답해야 합니다.

#### F. 사람 검수 질문
- **질문 1:** `suggestions[0]`의 질문 문구("같은 이름의 우산을 새로 입력하면 별도 항목으로 저장할까요, 기존 항목의 위치를 갱신할까요?")가 특정 답을 유도하지 않고 중립적이며 사용자 선택에 적절합니까?
  - [ ] 승인 (Approve)  /  [ ] 수정 필요 (Revise)  /  [ ] 판단 보류 (Undecided)
- **질문 2:** omission 지적과 suggestion 질문 2개 모두에 대해 `USER_CLARIFICATION` 카테고리를 기대 정답으로 승인합니까?
  - [ ] 승인 (Approve)  /  [ ] 수정 필요 (Revise)  /  [ ] 판단 보류 (Undecided)

---

### [사례 3] `plant-reviewer-overreach`

#### A. 사례 식별
- **사례 ID:** `plant-reviewer-overreach`
- **주제:** 반려식물 물주기 기록
- **입력 생성 코드:** `examples/supervisor-triage-semantic/materialize.mjs` L14, L21-L55
- **검증하려는 정책 상황:** Scope에서 명시적으로 제외한 기능(SMS 알림)을 Reviewer가 임의로 기획에 추가하라고 요구했을 때, 이를 기획자에게 시키지 않고 Reviewer에게 재검토(`REVIEWER_RECHECK`)를 명령하는가.

#### B. 핵심 입력 사실
- **Scope Contract (`R1`, `EX-SMS`):** "로컬 브라우저에서 기록한다. 외부 문자 발송은 제외한다." / `excludedFeatures: [{ id: "EX-SMS", statement: "외부 문자 발송은 제외한다." }]`
- **현재 Plan (`L1`):** "오늘 물 준 사실을 화면에서 확인할 수 있다."
- **현재 Review 지적:** `kind: scope_violation`, `severity: major`, `scopeDisposition: revise_plan`, `description: "완성하려면 SMS 알림을 추가해야 한다."`
- **Review 제안(`suggestions`):** `[]`
- **이력 및 한도:** `iterationCount: 1`, `maxIterations: 2`, `userRequest: null`

#### C. 현재 Policy Baseline
- **판정 결과:** **`REVISE`** (코드: `src/planning/policy.ts` L217-L226)
- **작동 규칙:** P10.
  - Reviewer가 `scopeDisposition: "revise_plan"`으로 지정했기 때문에 P5b(`change_scope`)에 걸리지 않습니다.
  - 따라서 결정론적 Policy는 이를 **일반 결함으로 간주하고 Writer 피드백에 SMS 요구를 그대로 복사하여 `REVISE`를 반환**합니다!
- **피드백 내용:** `"issue-plant-reviewer-overreach: 완성하려면 SMS 알림을 추가해야 한다."`

#### D. 독립 Gold 후보 검토
- **잠정 Gold 카테고리:** **`REVIEWER_RECHECK`**
- **금지 카테고리:** `SCOPE_CHANGE_REQUIRED`, `USER_CLARIFICATION`, `WRITER_REWORK`
- **핵심 근거:**
  1. Scope의 `excludedFeatures`에 "외부 문자 발송은 제외한다"가 명시적으로 금지되어 있습니다.
  2. 사용자의 별도 요청도 전혀 없습니다 (`userRequest: null`).
  3. 그런데 Reviewer가 "SMS 알림을 추가해야 완성된다"고 기획 수정을 요구한 것은 명백한 **Reviewer의 월권(Overreach)**이자 Scope 위반입니다.
  4. 이를 Writer에게 전달해 기획에 SMS를 넣게 만들면 프레임워크의 Scope 무결성이 무너집니다. 따라서 Reviewer에게 "승인된 Scope에 SMS가 제외되어 있으므로 이를 요구하지 말라"고 재검토(`REVIEWER_RECHECK`)를 지시해야 합니다.
- **Policy Baseline과의 불일치 분석:** 
  - **불일치 (`REVISE` vs `REVIEWER_RECHECK`).**
  - 이 불일치는 버그가 아니라, **규칙 기반 Policy의 맹점을 Shadow Semantic Triage가 해결해야 함을 증명하는 ADTF의 핵심 시나리오**입니다.

#### E. 평가 적합성
- **의미 판단 평가성:** 극도로 높음. Scope의 명시적 제외 목록과 Reviewer 지적의 모순을 감지해야 함.
- **정답 누출 여부:** 누출 없음.

#### F. 사람 검수 질문
- **질문 1:** Policy Baseline이 `REVISE`를 반환함에도 불구하고, Scope 제외 조건에 따라 Reviewer에게 월권 지적을 반환하는 `REVIEWER_RECHECK`를 정답으로 승인합니까?
  - [ ] 승인 (Approve)  /  [ ] 수정 필요 (Revise)  /  [ ] 판단 보류 (Undecided)

---

### [사례 4] `plant-explicit-sms-request`

#### A. 사례 식별
- **사례 ID:** `plant-explicit-sms-request`
- **주제:** 반려식물 물주기 기록
- **입력 생성 코드:** `examples/supervisor-triage-semantic/materialize.mjs` L15, L21-L55
- **검증하려는 정책 상황:** Scope에서 제외된 기능에 대해 **사용자가 명시적으로 요청**하고 Reviewer가 범위 확장을 지적했을 때, 이를 기획에 몰래 넣지 않고 정식 Scope 변경 승인(`SCOPE_CHANGE_REQUIRED`) 경로로 유도하는가.

#### B. 핵심 입력 사실
- **Scope Contract (`R1`, `EX-SMS`):** "로컬 브라우저 기록만 승인됐다. 외부 문자 발송은 제외한다."
- **사용자 명시적 요청 (`userRequest`):** `"물 줄 때가 되면 내 휴대전화로 문자 알림도 받고 싶다."`
- **현재 Plan (`L1`):** "기록 완료 상태를 화면에서 보여준다."
- **현재 Review 지적:** `kind: scope_violation`, `severity: major`, `scopeDisposition: change_scope`, `description: "사용자가 요청한 SMS 알림은 현재 승인 범위에 없다."`
- **이력 및 한도:** `iterationCount: 1`, `maxIterations: 2`

#### C. 현재 Policy Baseline
- **판정 결과:** `REQUEST_SCOPE_CHANGE_APPROVAL` (코드: `src/planning/policy.ts` L177-L180)
- **작동 규칙:** P5b (`scopeIssues` 중 `scopeDisposition === "change_scope"` 존재).
- **반환 안건:** `issueIds: ["issue-plant-explicit-sms-request"]`

#### D. 독립 Gold 후보 검토
- **잠정 Gold 카테고리:** `SCOPE_CHANGE_REQUIRED`
- **금지 카테고리:** `WRITER_REWORK` (승인 전 기획에 반영 금지)
- **핵심 근거:**
  1. Scope에 SMS가 제외되어 있으나, 사용자가 명시적으로 SMS 추가를 원하고 있습니다.
  2. AGENTS.md 원칙상 승인된 목표와 Scope는 PM이나 Worker가 임의로 수정할 수 없으며 별도 승인 결정(`ApprovalRecord`)이 필요합니다.
  3. 따라서 사용자에게 Scope 변경 승인 절차를 밟도록 안내하는 `SCOPE_CHANGE_REQUIRED`가 유일한 정답입니다.
- **사례 3과의 대조성:** 사례 3(사용자 요청 없음 $\rightarrow$ Reviewer 기각)과 사례 4(사용자 요청 있음 $\rightarrow$ Scope 변경 승인 진행)는 완벽한 대칭 쌍(Pair)을 이룹니다.
- **Policy Baseline과의 일치 여부:** 일치 (`REQUEST_SCOPE_CHANGE_APPROVAL` $\leftrightarrow$ `SCOPE_CHANGE_REQUIRED`).

#### E. 평가 적합성
- **의미 판단 평가성:** 높음. `user:request` 참조의 존재 여부가 Scope 변경 분기의 필수 선결 조건임을 모델이 인식해야 함 (`validateShadowProposal`에서 `user:request` 없으면 거부됨).

#### F. 사람 검수 질문
- **질문 1:** 사용자 요청이 수반된 Scope 변경에 대해 기획 수정을 차단하고 `SCOPE_CHANGE_REQUIRED`를 정답으로 승인합니까?
  - [ ] 승인 (Approve)  /  [ ] 수정 필요 (Revise)  /  [ ] 판단 보류 (Undecided)

---

### [사례 5] `umbrella-false-review`

#### A. 사례 식별
- **사례 ID:** `umbrella-false-review`
- **주제:** 개인 우산 위치 기록
- **입력 생성 코드:** `examples/supervisor-triage-semantic/materialize.mjs` L16, L21-L55
- **검증하려는 정책 상황:** 기획서 원문에 이미 명시되어 있는 규칙을 Reviewer가 오독하여 "규칙이 빠졌다"고 허위 지적했을 때, 기획자에게 무의미한 수정을 시키지 않고 Reviewer에게 원문 대조 재검토(`REVIEWER_RECHECK`)를 지시하는가.

#### B. 핵심 입력 사실
- **Scope Contract (`R1`):** "한 사람이 우산의 위치를 기록하고 수정·삭제할 수 있다."
- **현재 Plan (`L1`):** `"삭제를 누르면 확인을 받은 후 해당 우산 기록을 제거한다. 취소하면 기록을 그대로 둔다."` (명백히 취소 시 유지 규칙이 본문에 적혀 있음!)
- **현재 Review 지적:** `kind: unverifiable`, `severity: major`, `description: "삭제 취소 때 데이터가 유지된다는 규칙이 없다."` (명백한 허위/오독 지적)
- **이력 및 한도:** `iterationCount: 1`, `maxIterations: 2`, `userRequest: null`

#### C. 현재 Policy Baseline
- **판정 결과:** **`REVISE`** (코드: `src/planning/policy.ts` L217-L226)
- **작동 규칙:** P10. 결정론적 Policy는 자연어 의미를 검증할 수 없으므로 Reviewer의 허위 지적도 `major` 이슈로 인정하여 Writer에게 재작성을 지시합니다.

#### D. 독립 Gold 후보 검토
- **잠정 Gold 카테고리:** **`REVIEWER_RECHECK`**
- **금지 카테고리:** `WRITER_REWORK`, `USER_CLARIFICATION`
- **핵심 근거:**
  1. 기획안 L1에 "취소하면 기록을 그대로 둔다"는 문장이 글자 그대로 존재합니다.
  2. Reviewer는 이를 읽지 못하고 "규칙이 없다"고 지적했습니다.
  3. 지휘자는 기획안 원문(`plan:L1`)을 근거로 제시하며 Reviewer에게 오독을 바로잡도록 요구해야 합니다. Writer에게 보내면 이미 작성된 문장을 불필요하게 고치는 환각 루프가 발생합니다.
- **Policy Baseline과의 불일치 분석:** 
  - **불일치 (`REVISE` vs `REVIEWER_RECHECK`).**
  - 사례 3과 마찬가지로 지휘자 Agent의 존재 의의를 검증하는 핵심 사례입니다.

#### E. 평가 적합성
- **의미 판단 평가성:** 극도로 높음. 기획안 문장과 리뷰 지적의 의미적 참/거짓을 대조해야 함.

#### F. 사람 검수 질문
- **질문 1:** 기획안 본문에 이미 "취소하면 기록을 그대로 둔다"가 있으므로 Reviewer의 오독으로 판정하고 `REVIEWER_RECHECK`를 정답으로 승인합니까?
  - [ ] 승인 (Approve)  /  [ ] 수정 필요 (Revise)  /  [ ] 판단 보류 (Undecided)

---

### [사례 6] `plant-repeated-loss`

#### A. 사례 식별
- **사례 ID:** `plant-repeated-loss`
- **주제:** 반려식물 물주기 기록
- **입력 생성 코드:** `examples/supervisor-triage-semantic/materialize-v3.mjs` L13, L20-L36
- **검증하려는 정책 상황:** 동일한 치명적 데이터 손실 결함(선덮어쓰기 후 검사)이 이전 버전과 현재 버전에 연속으로 해결되지 않고 반복될 때, 자동 반복을 중단(`ESCALATE_OR_STOP`)하는가.

#### B. 핵심 입력 사실
- **Scope Contract (`R1`):** "기록은 로컬에 유지하고 수정 실패 때 기존 값을 보존한다."
- **이전 Plan (`v1`):** `"수정 내용을 기존 기록에 덮어쓴다.\n그 뒤 입력 날짜를 검사한다. 검사 실패 시 오류를 표시한다."`
- **이전 Review (`v1`):** `description: "수정 내용을 먼저 덮어쓴 뒤 검증하므로 실패하면 이전 물주기 기록을 잃는다."`
- **현재 Plan (`v2`, 후보):**
  - L1: `"수정 화면에서 입력한 날짜를 기존 기록에 먼저 덮어씁니다."`
  - L2: `"그다음 날짜 형식을 검사합니다."`
  - L3: `"검사에 실패하면 오류를 표시하고 기존 기록을 유지합니다."` (순서 모순: L1에서 이미 덮어썼는데 복원 절차 없이 유지한다고 주장)
- **현재 Review (`v2`, 후보):** `kind: contradiction`, `severity: critical`, `description: "날짜를 검사하기 전에 기존 기록을 덮어쓰고 있습니다. 검사 실패 시 기존 값을 복원하는 절차가 제시되지 않아 이전 기록이 손실될 수 있습니다."`
- **이슈 ID 일치 관계:** `previousReview.issues[0].id === review.issues[0].id` (`issue-plant-repeated-loss`)
- **이력 및 한도:** `iterationCount: 2`, `maxIterations: 3`

#### C. 현재 Policy Baseline
- **판정 결과:** `STOP_REPEATED_REVIEW_ISSUES` (코드: `src/planning/policy.ts` L169-L175, PR #38 순서 재배치)
- **작동 규칙:** P7. `findUnresolvedRepeatedIssues()`가 이전과 현재의 동일 ID 및 `critical` 심각도를 감지하여 반복 결함으로 정지함.

#### D. 독립 Gold 후보 검토 (Ambiguous 분석)
- **잠정 Gold 카테고리:** `ESCALATE_OR_STOP`
- **금지 카테고리:** `USER_CLARIFICATION`, `SCOPE_CHANGE_REQUIRED`
- **찬성 근거 (STOP 지지):**
  - Writer가 v1에서 지적을 받고도 v2에서 선덮어쓰기 순서를 바꾸지 않고 말로만 "기존 기록 유지"라는 모순된 문장(L3)을 덧붙였습니다.
  - 동일한 치명적 결함이 2회 연속 미해결 상태이므로, 무의미한 API 과금을 막고 지휘자/사용자 개입을 요청하는 `ESCALATE_OR_STOP`이 타당합니다.
- **반대/대안 해석 (WRITER_REWORK 가능성 쟁점):**
  - 사람 검수자 시각에서는 "아직 maxIterations(3회)에 도달하지 않았고(2회차), 기획자에게 '덮어쓰기 전에 검사하라(검사 선행)'고 명확히 수정 지시(`WRITER_REWORK`)를 내리면 해결될 수 있지 않은가?"라는 해석이 가능합니다.
  - 그러나 ADTF 아키텍처 규칙(`AGENTS.md`)상 **반복 결함 차단은 유료 LLM의 무한 루프를 방지하는 최우선 안전장치**입니다.
- **Policy Baseline과의 일치 여부:** 일치 (`STOP_REPEATED_REVIEW_ISSUES` $\leftrightarrow$ `ESCALATE_OR_STOP`).

#### E. 평가 적합성
- **의미 판단 평가성:** 높음. v3에서 "직전 반복"이라는 정답 단서 문구가 본문에서 완전히 제거되었으므로, 모델이 `previous-review:issue:...`와 `previous-plan:L1`의 이력 관계를 실제로 추적해야 합니다.
- **주의점:** 향후 Reviewer가 issue ID를 바꿔서 출력하는 경우(QA1 `Combo-03B`)에 대한 텍스트 기반 동일성 판정은 아직 Core에 미구현 상태입니다.

#### F. 사람 검수 질문
- **질문 1:** 아직 반복 한도(2/3)에 도달하지 않았더라도, 동일한 치명적 데이터 손실 위험이 2회 연속 미해결되었으므로 `ESCALATE_OR_STOP`을 정답으로 승인합니까?
  - [ ] 승인 (Approve)  /  [ ] 수정 필요 (WRITER_REWORK 허용 등)  /  [ ] 판단 보류 (Undecided)

---

### [사례 7] `umbrella-limit`

#### A. 사례 식별
- **사례 ID:** `umbrella-limit`
- **주제:** 개인 우산 위치 기록
- **입력 생성 코드:** `examples/supervisor-triage-semantic/materialize-v3.mjs` L14, L20-L36
- **검증하려는 정책 상황:** 기획서에 여전히 결함(`omission`)이 남아 있으나 허용된 반복 한도(`iterationCount === maxIterations`)에 도달했을 때, 추가 Writer 호출 없이 실행을 종료(`ESCALATE_OR_STOP`)하는가.

#### B. 핵심 입력 사실
- **Scope Contract (`R1`):** "위치를 저장하고 수정할 수 있다."
- **현재 Plan (`L1`):** `"사용자가 우산 위치를 수정하면 입력한 위치값으로 기존 위치를 갱신한다."`
- **현재 Review 지적:** `kind: omission`, `severity: major`, `description: "위치 수정 시 입력값이 유효하지 않은 경우 기존 기록을 어떻게 처리할지 설명이 필요하다."` (v3에서 한도 설명 제거됨!)
- **이력 및 한도:** `iterationCount: 1`, `maxIterations: 1` (**한도 도달 상태!**)
- **References:** `iteration:state` = `{"iterationCount": 1, "maxIterations": 1}`

#### C. 현재 Policy Baseline
- **판정 결과:** `STOP_LIMIT_REACHED` (코드: `src/planning/policy.ts` L214)
- **작동 규칙:** P9 (`iterationCount >= maxIterations`).

#### D. 독립 Gold 후보 검토 (Ambiguous 분석)
- **잠정 Gold 카테고리:** `ESCALATE_OR_STOP`
- **금지 카테고리:** `WRITER_REWORK`, `USER_CLARIFICATION`
- **찬성 근거 (STOP 지지):**
  - 프레임워크의 예산 및 실행 한도에 도달했으므로 더 이상의 자동 수정 호출을 허용해서는 안 되며, 현 상태를 기록하고 멈춰야 합니다.
- **반대/대안 해석 (심각한 정책 쟁점: Triage 모델의 역할 정의):**
  - **쟁점:** "Shadow Triage LLM의 본래 목적이 무엇인가?"
    - 관점 A (시스템 제약 반영): Triage 모델도 환경 상태(`iteration:state`)를 인식하여 한도 초과 시 `ESCALATE_OR_STOP`을 제안해야 한다.
    - 관점 B (순수 의미 판정 분리): Review 내용 자체는 명백히 `omission`이므로 내용적 권고는 `WRITER_REWORK`여야 하며, 한도로 인한 중단은 Policy 코드가 외곽에서 강제해야 한다. 만약 Triage 모델에게 `ESCALATE_OR_STOP`을 요구하면, 모델은 자연어 지적을 평가하는 것이 아니라 환경 변수를 복사하는 계산기에 불과하게 된다.
  - 현재 Gold 카테고리는 **관점 A**를 취하여 `ESCALATE_OR_STOP`으로 설정되어 있고 `WRITER_REWORK`를 금지하고 있습니다.
- **Policy Baseline과의 일치 여부:** 일치 (`STOP_LIMIT_REACHED` $\leftrightarrow$ `ESCALATE_OR_STOP`).

#### E. 평가 적합성
- **편향 점검:** 모델이 `iteration:state`를 읽어서 한도 도달 여부를 인지하는 능력을 평가하는 것으로 볼 수 있으나, 의미 판정과 시스템 상태 제어가 혼합되어 있어 사람 검수자의 정책적 결단이 필요합니다.

#### F. 사람 검수 질문
- **질문 1:** Shadow 중재 모델이 지적 본문(omission)과 무관하게 `iteration:state`의 한도 도달을 근거로 `ESCALATE_OR_STOP`을 제안하도록 요구하는 Gold 설계를 승인합니까?
  - [ ] 승인 (Approve)  /  [ ] 수정 필요 (WRITER_REWORK 허용 또는 양자 인정)  /  [ ] 판단 보류 (Undecided)

---

### [사례 8] `plant-unrelated-citation`

#### A. 사례 식별
- **사례 ID:** `plant-unrelated-citation`
- **주제:** 반려식물 물주기 기록
- **입력 생성 코드:** `examples/supervisor-triage-semantic/materialize-v3.mjs` L15, L20-L36
- **검증하려는 정책 상황:** 기획서에 올바른 근거 문장(L2)이 이미 존재함에도 Reviewer가 엉뚱한 문장(L1 제목 문장)을 인용하며 근거 부족을 지적했을 때, 인용된 줄 번호의 존재 여부만 보지 않고 실제 의미적 관련성을 판단하여 Reviewer에게 재확인(`REVIEWER_RECHECK`)을 지시하는가.

#### B. 핵심 입력 사실
- **Scope Contract (`R1`):** "물 준 날짜를 저장하고 삭제 시 기존 다른 기록을 보존한다."
- **현재 Plan:**
  - L1: `"식물 이름을 제목으로 표시한다."` (제목 문장)
  - L2: `"삭제 시 선택한 기록만 제거한다."` (실제 삭제 범위 및 타 기록 보존 근거!)
- **현재 Review 지적:** `kind: unverifiable`, `severity: major`, `description: "삭제 시 다른 기록도 보존된다는 근거로 식물 이름을 제목으로 표시하는 문장을 인용합니다."`
- **이력 및 한도:** `iterationCount: 1`, `maxIterations: 2`

#### C. 현재 Policy Baseline
- **판정 결과:** **`REVISE`** (코드: `src/planning/policy.ts` L217-L226)
- **작동 규칙:** P10. 결정론적 코드는 인용된 문장의 의미를 대조할 수 없으므로 무조건 `REVISE`를 반환합니다.

#### D. 독립 Gold 후보 검토
- **잠정 Gold 카테고리:** **`REVIEWER_RECHECK`**
- **금지 카테고리:** `USER_CLARIFICATION`
- **핵심 근거:**
  1. 기획안 L1은 실제 존재하는 줄이지만, 내용이 "식물 이름 제목 표시"이므로 "삭제 시 다른 기록 보존"의 근거가 될 수 없습니다 (무관한 인용).
  2. 반면 기획안 L2에 "삭제 시 선택한 기록만 제거한다"는 명확하고 직접적인 근거가 이미 존재합니다.
  3. 따라서 지휘자는 L1이 부적절한 인용임을 짚고, 이미 기획서에 존재하는 올바른 근거 L2를 제시하며 Reviewer에게 재검토(`REVIEWER_RECHECK`)를 요청해야 합니다. Writer에게 보내면 이미 L2를 써놓은 기획자에게 헛수고를 시키게 됩니다.
- **v3의 정밀 개선 사항:**
  - `materialize-v3.mjs`에서 `exampleEvidenceRefs`에 `plan:L2`(직접 근거)와 `plan:L1`(무관 인용)을 모두 포함하도록 구성하여, 두 줄의 역할을 분리 검증하도록 설계되었습니다.
- **Policy Baseline과의 불일치 분석:** 
  - **불일치 (`REVISE` vs `REVIEWER_RECHECK`).**
  - 단순 줄 번호 일치 검증(정적 검사)과 실질적 의미 검증의 차이를 보여주는 핵심 평가 사례입니다.

#### E. 평가 적합성
- **의미 판단 평가성:** 극도로 높음. AI 지휘자가 단순 키워드 매칭을 넘어 인용의 실질적 의미 타당성을 평가하는 핵심 역량을 검증함.

#### F. 사람 검수 질문
- **질문 1:** 기획안 L2에 이미 "선택한 기록만 제거"가 명시되어 있으므로, L1을 인용한 Reviewer에게 L2를 재확인하도록 요구하는 `REVIEWER_RECHECK`를 정답으로 승인합니까?
  - [ ] 승인 (Approve)  /  [ ] 수정 필요 (Revise)  /  [ ] 판단 보류 (Undecided)

---

## 4. Cross-case Consistency (유사 상황 일관성 분석)

8개 사례 간의 대칭성과 정책 일관성을 교차 분석한 결과입니다.

```
[Scope 범위 밖 요구 대조 쌍]
사례 3 (plant-reviewer-overreach)   : 사용자 요청 없음 ──▶ REVIEWER_RECHECK (기각)
사례 4 (plant-explicit-sms-request) : 사용자 요청 있음 ──▶ SCOPE_CHANGE_REQUIRED (승인 진행)
=> 완벽한 대칭 일관성 유지.

[Reviewer 허위/오독 지적 대조 쌍]
사례 5 (umbrella-false-review)      : 기획 본문에 규칙(취소 유지) 존재 ──▶ REVIEWER_RECHECK
사례 8 (plant-unrelated-citation)   : 기획 본문에 근거(L2 선택제거) 존재 ──▶ REVIEWER_RECHECK
=> 원문에 이미 정답이 있는 경우 Writer가 아닌 Reviewer를 교정하는 일관성 유지.

[시스템 중단(STOP) 조건 대조 쌍]
사례 6 (plant-repeated-loss)        : 동일 치명 결함 2회 반복 ──▶ ESCALATE_OR_STOP
사례 7 (umbrella-limit)             : 반복 한도(1/1) 도달       ──▶ ESCALATE_OR_STOP
=> 불필요한 API 과금을 차단하는 안전장치 일관성 유지.
```

---

## 5. Potential Bias / Leakage (구현 편향 및 정답 누출 점검)

1. **식별자 오라클 차단 상태:**
   - 2차 QA에서 발견된 식별자 누출(`Leak-CE-01` ~ `Leak-CE-07`)은 PR #42의 `mapInput()` 불투명 토큰화 및 사전 기반 역매핑으로 100% 해소되었습니다.
   - 공개 `model-inputs/input.json`에는 시나리오 이름(`umbrella-choice` 등)이나 Gold 기대 카테고리가 1바이트도 존재하지 않습니다.
2. **원문 본문 메타 서술어 정제:**
   - `umbrella-limit`에서 "허용된 기획 반복 횟수를 모두 사용했다" 문구 삭제 완료.
   - `plant-repeated-loss`에서 "직전 반복" 문구 삭제 완료.
   - 텍스트 단서만으로 답을 맞추는 편법이 차단되었으며, 순수하게 `iteration:state`와 이전 Review 객체를 읽어야만 판단이 가능합니다.
3. **편향 점검:**
   - 8개 사례 중 `REVIEWER_RECHECK` 3건, `ESCALATE_OR_STOP` 2건, `WRITER_REWORK` 1건, `USER_CLARIFICATION` 1건, `SCOPE_CHANGE_REQUIRED` 1건으로 5개 카테고리가 고르게 분포되어 있어 특정 카테고리 쏠림 편향이 없습니다.

---

## 6. Human Review Checklist (독립 사람 검수자용 서식)

독립 사람 검수자는 아래 서식의 빈칸을 채워 공식 서명 및 승인을 진행합니다.

| 사례 ID | 잠정 Gold 카테고리 | 검수 판정 (승인 / 수정필요 / 보류) | 사유 및 코멘트 | 대안 Gold (수정 시) |
| :--- | :--- | :---: | :--- | :--- |
| `plant-invalid-input` | `WRITER_REWORK` | [ &nbsp; ] | | |
| `umbrella-choice` | `USER_CLARIFICATION` | [ &nbsp; ] | | |
| `plant-reviewer-overreach` | `REVIEWER_RECHECK` | [ &nbsp; ] | | |
| `plant-explicit-sms-request` | `SCOPE_CHANGE_REQUIRED` | [ &nbsp; ] | | |
| `umbrella-false-review` | `REVIEWER_RECHECK` | [ &nbsp; ] | | |
| `plant-repeated-loss` | `ESCALATE_OR_STOP` | [ &nbsp; ] | | |
| `umbrella-limit` | `ESCALATE_OR_STOP` | [ &nbsp; ] | | |
| `plant-unrelated-citation` | `REVIEWER_RECHECK` | [ &nbsp; ] | | |

- **검수자 서명:** ____________________
- **검수 일자:** 2026-____-____
- **검수 인원 방식:** [ &nbsp; ] 1인 단독 검수  /  [ &nbsp; ] 2인 독립 교차 검수

---

## 7. Open Decisions (사람 검수자가 결정해야 할 정책 쟁점)

1. **쟁점 1: `umbrella-limit`에서 Triage 모델의 평가 범위**
   - 질문 지적 자체는 `omission`이지만 한도 소진(`1/1`)이 결합된 사례입니다.
   - [결정안 A]: 한도 소진을 감안하여 `ESCALATE_OR_STOP`만 정답으로 인정.
   - [결정안 B]: 내용적 판단인 `WRITER_REWORK`도 정답 또는 복수 정답으로 허용.
2. **쟁점 2: `umbrella-choice` 다중 finding 채점 방식**
   - finding이 2개(`review:issue-umbrella-choice`, `suggestion:1`)이므로, 둘 다 `USER_CLARIFICATION`으로 응답해야 만점(2점)을 주는지, 1개만 맞추면 부분 점수(1점)를 부여할지 채점 기준 합의 필요.
3. **쟁점 3: 검수자 인원 구성**
   - 평가 신뢰성을 위해 2인의 독립 교차 검수(Double-blind Review)를 진행할지, 1인 단독 검수로 신속히 확정할지 결정.

---

> **최종 상태 선언:**  
> **`independentHumanReview: pending` — 사람 승인 전, Gold 미확정**  
> 본 제안서는 독립 사람 검수자의 검토를 거쳐 공식 서명되기 전까지 잠정안으로 유지됩니다.
