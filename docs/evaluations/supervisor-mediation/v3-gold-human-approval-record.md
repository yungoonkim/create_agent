# Supervisor 블라인드 평가 v3: Gold 사람 검수 공식 승인 기록 (초안)

- **문서 상태:** 독립 사람 검수 결과 공식 기록 초안 (`human_review_approval_record_draft`)
- **검수 대상 세트:** Supervisor 의미 중재 블라인드 평가 v3 (`synthetic_v3`, 8개 합성 사례)
- **승인 주체:** 프로젝트 오너 / 사람 검수자 (사용자 대화 기반 검토 완료)
- **공식 서명 및 확정 일시:** [대기 상태 — 사용자 지정 전 임의 기입 금지]
- **기준 커밋:** `e53debd3e0ee65d140e69882dc70a92f026a76e7` (최신 `origin/main`)

---

## 1. 검수 배경 및 개요

본 문서는 `docs/evaluations/supervisor-mediation/v3-gold-human-review-guide.md`에서 제시된 8개 합성 사례의 입력 사실, Policy Baseline, Shadow 중재 계약을 바탕으로, **사람 검수자(프로젝트 오너)가 ChatGPT 대화를 통해 직접 검토하고 확정한 공식 Gold 결정**을 저장소에 반영하기 위해 작성된 공식 승인 기록 초안입니다.

### 검수 원칙 준수 확인
1. **기존 원자료 불변:** v1/v2 원자료, Archive, Scorecard 및 고정 해시는 일체 변경하지 않습니다.
2. **독립적 도메인 판단:** 규칙 기반 Policy Baseline의 결과와 독립적으로, Scope 계약과 자연어 기획안의 의미적 타당성을 기준으로 평가되었습니다.
3. **추측성 메타데이터 배제:** 공식 서명자 ID, PGP 키, 정확한 서명 시점 등은 추측하여 작성하지 않으며, 사용자의 명시적 입력이 있을 때까지 미확정(대기) 상태로 둡니다.

---

## 2. 8개 합성 사례 Gold 승인 결과표

사람 검수자가 직접 검토하여 승인한 각 사례별 최종 기대 분류(Gold Category)입니다.

| 사례 ID | 승인된 Gold 카테고리 | 현재 Policy Baseline | 일치 여부 | 승인 판정 | 사유 및 도메인 근거 |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **`plant-invalid-input`** | **`WRITER_REWORK`** | `REVISE` | 일치 | **승인** | Scope의 "손상 방지" 제약 대비 "잘못된 날짜" 예외 처리가 기획에서 누락됨 |
| **`umbrella-choice`** | **`USER_CLARIFICATION`** | `REQUEST_USER_INPUT` | 일치 | **승인** | Scope의 "동일 우산 처리 미정"에 대해 기획자가 임의 결정하였으므로 사용자 선택 필수 |
| **`plant-reviewer-overreach`** | **`REVIEWER_RECHECK`** | `REVISE` | **불일치** | **승인** | Scope에서 명시적으로 제외한 SMS를 Reviewer가 요구했으므로 Reviewer 월권 재검토 |
| **`plant-explicit-sms-request`** | **`SCOPE_CHANGE_REQUIRED`** | `REQUEST_SCOPE_CHANGE_APPROVAL` | 일치 | **승인** | 제외된 SMS를 사용자가 명시적으로 요청했으므로 정식 Scope 변경 승인 경로 유도 |
| **`umbrella-false-review`** | **`REVIEWER_RECHECK`** | `REVISE` | **불일치** | **승인** | 기획 원문 L1에 "취소하면 유지" 문장이 이미 존재하므로 Reviewer의 텍스트 오독 교정 |
| **`plant-repeated-loss`** | **`ESCALATE_OR_STOP`** | `STOP_REPEATED_REVIEW_ISSUES` | 일치 | **승인** | 선덮어쓰기 손실 모순이 직전 버전에 이어 연속 해결되지 않았으므로 단독 STOP 확정 |
| **`umbrella-limit`** | **`ESCALATE_OR_STOP`** | `STOP_LIMIT_REACHED` | 일치 | **승인** | 한도 도달(`1/1`) 상태이므로 새 Writer 호출을 차단하고 현 상태 보존 중단 단독 확정 |
| **`plant-unrelated-citation`** | **`REVIEWER_RECHECK`** | `REVISE` | **불일치** | **승인** | 기획에 L2(삭제 규칙)가 존재함에도 L1(제목 표시)만 인용한 Reviewer 지적 재확인 |

- **검수 종합 결과:**
  - 전원 승인: **8건 (100%)**
  - 수정 요청: **0건 (0%)**
  - 판단 보류: **0건 (0%)**

---

## 3. 세부 승인 정책 및 채점 규칙 공식화

### 3.1 `umbrella-choice` 다중 Finding 및 부분 점수 규칙
1. **Finding별 기대 카테고리:**
   - `review:issue-umbrella-choice` (omission 지적): **`USER_CLARIFICATION`**
   - `suggestion:1` (사용자 대안 선택 질문): **`USER_CLARIFICATION`**
   - 두 finding 모두 `USER_CLARIFICATION`을 정답으로 지정합니다.
2. **채점 규칙 (부분 점수 허용):**
   - 평가 대상 모델이 두 finding 모두 올바른 분류(`USER_CLARIFICATION`)와 적절한 근거를 제시한 경우: **만점 (2점)**
   - 두 finding 중 하나만 올바르게 분류하고 다른 하나를 누락/오판한 경우: **부분 점수 (1점)**
   - 두 finding 모두 부적절하게 분류하거나 심각한 오판을 한 경우: **0점**

### 3.2 `plant-repeated-loss` 단독 정답 확정
- **확정 내용:** 대안 해석으로 제기되었던 `WRITER_REWORK`를 배제하고, **`ESCALATE_OR_STOP` 단독 정답**으로 확정합니다.
- **사유:** 동일한 치명적 결함(선덮어쓰기 손실)이 2회 연속 미해결된 상태에서 자동 재작업을 계속 허용하면 무한 과금 루프에 빠지므로, 프레임워크의 안전장치 원칙에 따라 즉각적인 중단이 유일한 정답입니다.

### 3.3 `umbrella-limit` 단독 정답 확정
- **확정 내용:** 내용적 판단인 `WRITER_REWORK`를 배제하고, **`ESCALATE_OR_STOP` 단독 정답**으로 확정합니다.
- **사유:** Triage 모델은 단독 자연어 평가기가 아니라 ADTF의 시스템 상태(`iteration:state`)를 함께 고려하는 지휘자 역할을 수행해야 하므로, 한도 소진(`1/1`)을 인지하여 중단을 제안하는 것이 타당합니다.

---

## 4. 공식 검수 메타데이터 (추측 배제)

| 항목 | 기록 내용 | 상태 / 확인 여부 |
| :--- | :--- | :---: |
| **검수 승인 방식** | 사용자 직접 검토 (ChatGPT 대화 기반 검수) | **확인 완료** |
| **검수 결과 합의** | 8개 사례 전원 승인, 수정 요청 0건, 보류 0건 | **확인 완료** |
| **공식 서명자 (Assessor ID)** | `[사용자 지정 대기]` (임의 생성 금지) | **미확정 (Pending)** |
| **공식 승인 일시 (Timestamp)** | `[공식 반영 커밋 시점 타임스탬프]` (임의 추측 금지) | **미확정 (Pending)** |
| **평가 인원 방식** | 1인 단독 공식 검수 (프로젝트 오너) | **확인 완료** |

---

## 5. 저장소 규칙 및 `pending` 해제 종속성 분석

현재 저장소 소스코드 및 공식 테스트에는 `independentHumanReview: "pending"` 상태가 **하드코딩 단언(Assertion)**으로 결합되어 있어, 파일 수정 없이 단순 값만 변경하면 회귀 에러가 발생합니다.

### 확인된 코드 종속성 3곳
1. **`examples/supervisor-triage-semantic/blind-recorder.mjs` 라인 66:**
   ```javascript
   assert.equal(gold.caseId, caseId);
   assert.equal(gold.independentHumanReview, 'pending'); // 하드코딩 단언!
   ```
   - **영향:** `gold.json`에서 `independentHumanReview`를 `"approved"`로 바꾸면 `prepareBlind` 실행 시 단언 에러가 발생합니다.
   - **필요 조치:** `assert.ok(gold.independentHumanReview === 'approved' || gold.independentHumanReview === 'pending')` 형태로 단언을 확장해야 합니다.
2. **`test/triage-blind-v3.test.mjs` 라인 25:**
   ```javascript
   assert.equal(cases[1].gold.independentHumanReview, 'pending'); // 공식 테스트 단언!
   ```
   - **영향:** `materializeV3()`의 상태를 변경하면 공식 회귀 테스트가 실패합니다.
   - **필요 조치:** 테스트 기대값을 `'approved'`로 갱신하거나 승인 상태를 검증하도록 수정해야 합니다.
3. **`examples/supervisor-triage-semantic/materialize-v3.mjs` 라인 45 (manifest):**
   ```javascript
   independentHumanReviews: 0
   ```
   - **필요 조치:** 승인 완료 시 `independentHumanReviews: 1`로 갱신하고 manifest 바이트 해시를 재계산해야 합니다.

---

## 6. Gold 및 채점 규칙 반영을 위한 최소 변경 파일 목록 및 안전 적용 순서

### 6.1 변경 대상 파일 목록 (향후 승인 반영 시)

| 파일 경로 | 변경 내용 | 영향 범위 |
| :--- | :--- | :--- |
| `examples/supervisor-triage-semantic/materialize-v3.mjs` | • `independentHumanReview: 'approved'`로 갱신<br>• `status: 'human_reviewed_approved_gold'`로 갱신<br>• `manifest.independentHumanReviews: 1` 갱신<br>• `scorecard-blank.json`에 `umbrella-choice` 부분 점수 규칙 메타데이터 추가 | v3 입력 생성기 |
| `examples/supervisor-triage-semantic/blind-recorder.mjs` | • L66 `assert.ok(gold.independentHumanReview === 'approved' \|\| ...)` 단언 확장 | v3 블라인드 기록기 |
| `test/triage-blind-v3.test.mjs` | • L25 단언을 `cases[1].gold.independentHumanReview === 'approved'`로 갱신 | 공식 단위 테스트 |
| `tests-evaluation/supervisor-mediation/triage-blind-v3-audit.test.mjs` | • 독립 QA 테스트의 `pending` 단언을 `approved`로 갱신 | 독립 QA 테스트 |

> **주의:** `docs/acceptance/triage-semantic-audit-20261110/**` 및 `docs/acceptance/triage-semantic-evaluation-20261110/**` 등 **v1/v2의 기존 평가 원자료 및 Archive는 절대 수정하지 않습니다.**

### 6.2 안전한 4단계 적용 순서 (Implementation Sequence)

```
[1단계: 코드 및 테스트 단언 유연화]
  - blind-recorder.mjs에서 'pending' 외에 'approved'도 허용하도록 단언 수정
  - test/triage-blind-v3.test.mjs 수정

[2단계: materialize-v3.mjs 승인 상태 및 부분 점수 스키마 갱신]
  - gold 메타데이터를 approved로 변경
  - scorecard-blank.json 스키마에 partial_credit 규칙 명시

[3단계: 오프라인 정합성 검증 (API 0회)]
  - node --test test/triage-blind-v3.test.mjs
  - node --test tests-evaluation/supervisor-mediation/triage-blind-v3-audit.test.mjs
  - 해시 체인 및 불변성 재검증

[4단계: 공식 승인 기록 및 SHA-256 매니페스트 동기화]
  - v3-gold-human-approval-record.md에 최종 커밋 SHA 및 서명자 메타데이터 고정
```

---

## 7. 외부 API 없이 수행할 수 있는 최종 오프라인 검증 방안

외부 모델 호출(유료 API, ADC) 없이 순수 로컬 Node.js만으로 완전한 정합성을 검증하는 절차입니다.

1. **v3 생성기 및 SHA-256 다이제스트 검사:**
   ```powershell
   node examples/supervisor-triage-semantic/materialize-v3.mjs --output <임시폴더>
   ```
   - 8개 케이스 폴더 생성 확인, `manifest.json` 내 34개 파일의 SHA-256 일치 확인.
   - `gold.json` 내 `independentHumanReview === "approved"` 확인.
2. **블라인드 투영기 및 역매핑 무결성 검증:**
   ```powershell
   node --test test/triage-blind-v3.test.mjs
   node --test tests-evaluation/supervisor-mediation/triage-blind-v3-audit.test.mjs
   ```
   - 8개 baseline 일치, 역순 응답 복원, 식별자 누출 0건, 다중 참조 역매핑 무결성 100% 통과 확인.
3. **v1/v2 원자료 불변성 검증:**
   - 기존 `synthetic-snapshots-v2.tar.gz` 해시 및 manifest 불변 확인.

---

> **현재 저장소 상태 유지 선언:**  
> 본 문서는 공식 기록 준비를 위한 **초안(Draft)**이며, 사용자의 명시적 지시가 있을 때까지 기존 소스코드, 공식 테스트, `cases.json`, `materialize-v3.mjs`의 실제 코드는 일체 수정하지 않고 안전하게 보존합니다.
