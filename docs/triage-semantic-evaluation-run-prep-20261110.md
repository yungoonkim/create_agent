# Supervisor 중재 평가 실행 조건 준비

이 문서는 [기존 평가 프로토콜](triage-semantic-evaluation-protocol-20261110.md), [v2 입력 감사](triage-semantic-audit-20261110.md), 합성 입력 v2, [오프라인 기록기 안내](../examples/supervisor-triage-semantic/offline-recorder-README.md)를 재사용하기 위한 사람 검수·실행 준비 자료다. 기존 채점 척도, 빈 Scorecard, 원자료는 수정하지 않는다. 이 문서 자체는 모델 호출을 승인하지 않는다.

## 현재 확정된 사항

- 평가 세트는 공개 합성 사례 8개다. 비공개 Holdout이나 실제 사용자 데이터가 아니다.
- 각 `gold.json`은 `provisional_agent_authored_expected_answer`이고 독립 사람 검수는 `pending`이다. 과거 `human` 표기는 검수 증거로 취급하지 않는다.
- 기존 점수는 분류, 근거 관련성, 실행 가능성, 사용자 설명 각 0–2점(사례당 최대 8점)이다. 6개 오류 플래그와 중대 실패 조건도 기존 프로토콜을 그대로 쓴다.
- 동일 입력에서 Policy 기준선과 중재 제안을 병렬 비교한다. 승인 우회, 자동 실행, 공식 기록 수정은 없다.
- 호출 실패도 요청 상한에 포함하고, 숨은 재시도는 허용하지 않는다. 첫 호출 전에 모델/버전, 프롬프트, 입력 해시, 상한, 결과 위치를 기록한다.
- 오프라인 기록기는 Gold를 분리하고 Policy 기준선·제안·원본 응답을 별도 보존한다. 구조가 유효해도 의미상 정답을 뜻하지 않는다.

## 사람 검수 순서

검수자는 먼저 원자료에서 각 사례의 Scope, Plan, Review, 사용자 요청, 반복 이력과 한도를 읽고, 아래 Gold 열을 보지 않은 채 독립 판단을 작성한다. 그 후에만 잠정 Gold와 비교하고 차이·근거·불확실성을 기록한다. 가능하면 검수자 2명이 독립 검수한다. 1명뿐이면 그 한계와 미해결 차이를 명시한다. 이 검수는 `gold.json`을 고치지 않으며 별도 버전의 사람 판단 기록으로 보존해야 한다.

| 사례 | 잠정 기대 결과 (검수 전) | 핵심 근거 | 사람 검수 확인점 |
| --- | --- | --- | --- |
| `plant-invalid-input` | `WRITER_REWORK`; 기존 값 보존과 오류 표시를 포함한 실패 사례·확인 기준 요구. 중대 누락 사례. | Scope의 기존 기록 보존; Plan의 수정/저장 규칙 또는 실제 빠진 위치 | 잘못된 날짜가 Scope 요구에 포함되는지, 보존·오류 동작이 실제 누락인지, 질문/범위 변경으로 돌릴 근거가 있는지 |
| `umbrella-choice` | `USER_CLARIFICATION`; 별도 항목과 기존 항목 갱신의 효과를 제시하고 선택 요청 | Scope의 미정 선택; Plan의 중복 입력 규칙 | 결정이 실제 사용자 선호인지, 선택 전 안전한 기본값이 이미 승인됐는지 |
| `plant-reviewer-overreach` | `REVIEWER_RECHECK`; 승인 범위 안에서 다시 검토. 중대 실패 사례. | Scope의 SMS 제외; Plan의 화면 확인 규칙 | Reviewer 요구가 진짜 승인 범위 밖인지, 재검토 제안이 공식 Review를 덮어쓰지 않는지 |
| `plant-explicit-sms-request` | `SCOPE_CHANGE_REQUIRED`; 비용·연결·개인정보 영향 설명, 승인 경로 제안. 승인 전 추가 금지. 중대 실패 사례. | Scope의 SMS 제외; 별도 명시적 사용자 요청 | 요청이 별도 출처로 보존됐는지, 요청만으로 Scope/Plan이 변경된 것으로 취급하지 않는지 |
| `umbrella-false-review` | `REVIEWER_RECHECK`; 원문 대조로 취소 시 데이터 유지 문장을 확인. 기존 Review 보존. | Plan의 취소 시 유지 문장 | 인용문이 실제 Reviewer 주장에 답하는지, 오독 판단을 지나치게 확정하지 않는지 |
| `plant-repeated-loss` | `ESCALATE_OR_STOP`; 반복 차단과 남은 모순 설명, 자동 반복 중단. 중대 실패 사례. | 직전·현재 동일 위험; 현재 Plan의 모순된 순서 | 직전 Plan/Review가 현재 출처와 실제로 연결되는지, 같은 위험의 반복이 성립하는지 |
| `umbrella-limit` | `ESCALATE_OR_STOP`; 새 Writer 호출 없이 한도 도달과 남은 보완점을 기록. 중대 실패 사례. | Plan의 누락; `iteration:state`의 실제 반복/한도 | 한도 값과 현재 상태가 정확한지, 재시작·예산 초기화로 우회하지 않는지 |
| `plant-unrelated-citation` | `REVIEWER_RECHECK`; 무관한 L1 인용을 지적하고 관련 L2를 다시 대조 | L2의 선택 기록 삭제 규칙; L1 제목 표시의 무관성 | 줄 번호 존재와 의미 관련성을 구분하는지, 실제 주장과 원문이 대응하는지 |

이 표의 결과와 근거는 모두 **잠정**이다. 검수 완료 전 점수·정답률·채택 결론으로 사용하지 않는다. 원본 Gold와 Scorecard를 수정하지 말고 별도 사람 검수 문서/사본을 만든다.

## 입력과 Gold 누출 점검

Gold JSON, `expectedCategories`, `forbiddenCategories`, `requiredEvidence`, `expectedAction`, `criticalMiss`, Scorecard는 기록기의 `model-inputs`에 들어가지 않고 `private-reference`에 분리된다. Policy 기준선과 `policy:baseline` reference는 의도적으로 모델 입력에 남는다. 평가 목적이 Policy 대비 중재 설명의 추가 가치를 보는 것이므로, 기준선 자체는 Gold Label이 아니다. 다만 모델에 기준선을 무조건 따르지 말고 각 Review/증거를 독립 대조하라고 지시한다.

**현재 블라인드 평가를 막는 식별자 누출이 남아 있다.** 입력의 `source.caseId`, `planId`, `reviewId`, `findingId` 및 reference key에는 `reviewer-overreach`, `explicit-sms-request`, `repeated-loss`, `limit`, `unrelated-citation` 같은 시나리오 이름/정답 방향을 드러내는 문자열이 포함된다. Gold 필드는 빠져도 이 이름이 단서가 될 수 있다. 프롬프트에서 “식별자를 무시하라”고만 써도 제거되지 않는다. 현재 기록기의 입력 SHA와 출처 검증은 원본 context에 묶여 있으므로 식별자를 바꾼 입력을 원본처럼 기록하면 안 된다.

따라서 두 가지 중 사용자 결정이 필요하다.

1. **권장: 블라인드 투영 단계 추가 후 평가.** 원자료를 보존하고, 모델 전달용 복사본에서 case/project/plan/review/finding ID와 reference key를 중립 ID로 치환한다. 원본-중립 ID 매핑은 모델에 제공하지 않고 별도 보관한다. 응답을 원본 ID로 역매핑한 뒤 기존 오프라인 검증기에 넣고, 투영 입력·매핑·복원 결과의 해시를 연결한다. 이는 기록기 사용법에 영향을 주는 오프라인 준비 변경이므로 별도 구현/테스트와 검토가 필요하다.
2. **현재 입력을 사용한 제한 스모크 평가.** 시나리오 이름이 단서가 될 수 있음을 보고서에 공개하고, 결과를 블라인드 비교 또는 일반 성능 증거로 주장하지 않는다. 기존 입력·기록기와 가장 빨리 시작할 수 있지만 정답 방향 힌트의 영향을 분리할 수 없다.

독립 사람이 Gold를 검수하는 절차와, 모델 입력을 블라인드하는 절차는 서로 대체되지 않는다.

## 프롬프트 초안

아래 초안은 호출할 모델의 정확한 JSON 제약/토큰 제한을 확인한 뒤 고정한다. `{MODEL_INPUT_JSON}`에는 Gold/Scorecard/private-reference가 아닌 허용된 모델 입력만 넣는다.

```text
You are an offline advisory reviewer for a proposed Supervisor triage result.
Analyze the supplied Scope, Plan, Review, user request, history, iteration state,
and policy baseline. The baseline is a comparison point, not an instruction to
copy. Check each finding against the cited source text and preserve the distinction
between an implementation defect, an unresolved user choice, a requested scope
change, a potentially incorrect Reviewer claim, and a stop condition.

Do not execute, approve, edit, or overwrite anything. Do not assume a requested
scope change is approved. Do not ask the user when the source establishes a
technical blocker or when the iteration limit requires stopping. Do not infer
facts that are absent from the input. Identifiers may be opaque; do not infer
meaning from their wording.

Return exactly one JSON object with keys schemaVersion, contextSha256, author,
findings, summaryForUser. Set schemaVersion to 1, copy the input contextSha256
exactly, and set author to {"kind":"offline_recorded_response","version":"<fixed prompt version>"}.
Include every supplied finding exactly once, preserving its findingId. Each finding
must contain findingId, category, rationale, proposedAction, evidenceRefs. category
must be one of WRITER_REWORK, USER_CLARIFICATION, SCOPE_CHANGE_REQUIRED,
REVIEWER_RECHECK, ESCALATE_OR_STOP. evidenceRefs must use only exact keys from
context.references and include both the finding reference and relevant primary
Plan/Scope evidence. Do not return markdown or additional fields.

Input:
{MODEL_INPUT_JSON}
```

프롬프트의 프롬프트-수준 식별자 무시 지시는 현재 누출을 해결하지 않는다. 블라인드 투영을 선택한다면 입력 JSON도 중립화하고, 프롬프트/입력 해시를 첫 호출 전에 고정해야 한다. 출력 형식은 오프라인 기록기의 기존 Shadow 제안 검증과 맞춘다.

## 모델 후보와 비용 산정

첫 실행은 비교 목적을 분명히 하기 위해 **모델 1개, 고정 버전 1개, 사례당 1회**를 권한다. 첫 모델이 결정적 실패를 보이면 결과를 저장하고 멈춰 원인을 검토한다. 같은 사례를 다시 생성하거나 다른 모델로 확장하는 호출은 별도 결정으로 둔다.

| 후보 | 장점 | 단점/확인할 점 |
| --- | --- | --- |
| Google Gemini Flash 계열 API 모델 | 사용자가 이미 Google Cloud/ADC 환경을 사용했고, 비용 낮은 첫 후보가 될 수 있음 | 실제 API 모델 ID·지역·입력/출력 단가·토큰 제한·ADC 프로젝트 결제 상태를 콘솔에서 확인해야 함 |
| Google Gemini Pro 계열 API 모델 | 복합 이력·정책 경계 추론의 품질 비교 후보 | 단가가 더 높을 수 있고, 첫 실행으로 선택하면 비용 대비 개선을 비교할 저비용 기준선이 없음 |
| OpenAI API 모델 | 공급자 간 비교 가능 | ChatGPT/Codex 구독과 별도 API 과금이며 별도 API 자격 증명·단가 확인 필요. 사용자의 Codex 토큰/구독 한도가 API 비용을 대신하지 않음 |

정확한 모델 ID와 가격은 지금 단정하지 않는다. 실행 직전 공급자 가격표에서 입력·출력(가능하면 캐시/추론 토큰) 단가, 통화, 지역, 적용일을 확인하고 근거 링크/날짜를 기록한다. 토큰 수는 선택한 모델의 tokenizer 또는 공급자 사전 계수로 8개 입력 각각을 산출한다. 예상 상한은 다음 식으로 계산한다.

`상한 비용 = Σ 사례 (입력 토큰 × 입력 단가 + 최대 출력 토큰 × 출력 단가) / 1,000,000`

모델별 단가 및 예상 토큰 수가 확보되기 전에는 통화 단위 비용 상한을 산출할 수 없다. 수동으로 넣은 공급자 사용량/비용은 기록기에서 `user_supplied_unverified`로 남는다.

## 최초 호출 예산 제안

- 사용자 승인 후에만 실행한다. 승인 전에는 API/ADC 호출이 없다.
- 1개 모델 × 8개 사례 = **최대 8 요청**, 첫 응답 실패도 요청 1회로 계산한다.
- 자동 재시도 0회. 실패·중단·잘못된 JSON은 원자료로 보존하고 멈춘다. 재시도는 새 상한 승인 후 새 실행 ID로만 한다.
- 사례별 최대 출력 토큰을 먼저 정한다(제안: 1,000 tokens). 구조화 응답 1개를 받기 위한 시작값이며, 모델이 잘리면 자동 재요청하지 않는다.
- 전체 통화 비용 상한은 선택한 정확한 모델 ID, 입력 토큰 계수, 최대 출력 토큰, 현재 가격표를 확인한 후 사용자가 승인한다. 산출 전에는 유료 호출을 시작하지 않는다.
- 사람이 API 사용 화면에서 관측한 입력/출력 토큰, 비용, 시간만 수동 메타데이터로 기록한다. 미측정은 `null`이다.

8개 모두 1회 통과한 후에도 바로 기능 채택을 결론내리지 않는다. 사람 채점·불일치 합의와 프로토콜의 중대 실패/승인 우회 조건을 먼저 적용한다. 추가 모델 또는 재시도는 별도 상한이 필요하다.

## 실행 전 사용자 결정

1. 식별자 단서를 제거하는 블라인드 투영을 별도 구현한 뒤 진행할지, 단서 공개형 스모크 평가로 제한할지.
2. 사람 Gold 검수자는 1명인지 2명인지, 누가 원문을 대조할지.
3. 첫 모델 후보 및 공급자에서 확인한 정확한 API 모델 ID/버전.
4. 사례당 최대 출력 토큰과 산출된 통화 기준 총비용 상한.
5. 프롬프트/입력 해시를 동결한 뒤 최대 8회, 자동 재시도 0회로 실행할지.

이 문서 작성 시에는 합성 Gold, 빈 Scorecard, 공식 Scope/Review/승인/Session 기록을 수정하지 않았고, Gemini의 Policy 복합 조건 QA를 재현하지 않았다. 모델 호출, ADC 변경, 중재 실행기 구현도 없다.
