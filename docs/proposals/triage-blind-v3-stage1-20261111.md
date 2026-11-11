# Supervisor 중재 블라인드 평가 v3: 1단계 검토안

상태: **사용자 콘텐츠 검토 대기**. 이 문서는 v3 입력과 오프라인 기록기 변경의 제안이다. v3 입력, Gold, Scorecard, 블라인드 투영기 및 모델 평가 결과를 생성·확정하지 않는다.

기준은 `main`의 `19aeed3f8e7966df88fbc5c8e9af2dfbce63ede0`(PR #39 병합)이다. PR #40은 독립 QA 자료로만 참조하며 병합하지 않는다. 기존 v1/v2 사례 카드, `synthetic-snapshots-v2.tar.gz`, Gold, Scorecard, 해시 매니페스트와 `prepare`/`record` 모드는 그대로 보존한다. v2와 v3 결과는 서로 다른 입력 조건이며 합산·직접 점수 비교하지 않는다.

## v2 대비 v3 콘텐츠 변경안

| 사례 | v2의 관련 원문·동작 | v3 후보 및 차이 | 도메인 의미 / 검수점 |
| --- | --- | --- | --- |
| `plant-invalid-input` | 잘못된 수정 날짜의 기록 보존 | 변경 없음 | 기존 값 보존 요구 유지 |
| `umbrella-choice` | Review 이슈는 선택 미정이라고 설명하지만 `suggestions: []`; 고정 v2 baseline은 빈 질문의 `REQUEST_USER_INPUT`, 최신 Policy로 재생성하면 `FAILED` | 기존 `omission` 이슈는 유지하고, **`review.suggestions[0]`에 질문을 둔다:** “같은 이름의 우산을 새로 입력하면 별도 항목으로 저장할까요, 기존 항목의 위치를 갱신할까요?” `outcome: needs_user_input`, `userJudgmentRequired: true` 유지 | 질문 문구는 사용자가 두 방식의 효과를 비교해 선택하도록 묻는다. 답 자체를 예시 입력이나 Gold에 채워 넣지 않는다. `scope_violation/clarify`로 기존 omission을 바꾸지 않는다. |
| `plant-reviewer-overreach` | SMS 요구와 승인 Scope의 SMS 제외 | 변경 없음 | 사용자 요청 없는 Reviewer 범위 확대와 혼동하지 않는지 확인 |
| `plant-explicit-sms-request` | 별도 사용자 SMS 요청이 있음 | 변경 없음 | 요청을 승인 완료로 취급하지 않는지 확인 |
| `umbrella-false-review` | 삭제 취소 시 기존 기록 유지 문장이 있음 | 변경 없음 | Reviewer 오독 여부를 원문으로 대조 |
| `plant-repeated-loss` | Plan: “실패 시 기존 값을 유지한다고 적었으나 구현 순서에서는 먼저 덮어쓴다.” Review에 반복 횟수/직전 반복 설명이 포함됨 | **Plan 후보:** “수정 화면에서 입력한 날짜를 기존 기록에 먼저 덮어씁니다.\n그다음 날짜 형식을 검사합니다.\n검사에 실패하면 오류를 표시하고 기존 기록을 유지합니다.” **Review 후보(사용자 수정):** “날짜를 검사하기 전에 기존 기록을 덮어쓰고 있습니다. 검사 실패 시 기존 값을 복원하는 절차가 제시되지 않아 이전 기록이 손실될 수 있습니다.” | 현재 동작 순서는 선 덮어쓰기→검사다. 실패 후 기존 값을 유지한다는 문장과 복원 절차 부재가 모순을 만든다. 반복 여부를 설명하는 문장은 빼고, 동일 이슈 ID와 이전 Review에서만 반복 결함을 판정한다. |
| `umbrella-limit` | Plan: “잘못된 위치 입력 처리 방식이 빠졌다.” Review: “수정 보완이 필요하지만 허용된 기획 반복 횟수를 모두 사용했다.” | **Plan 후보:** “사용자가 우산 위치를 수정하면 입력한 위치값으로 기존 위치를 갱신한다.” **Review 후보:** “위치 수정 시 입력값이 유효하지 않은 경우 기존 기록을 어떻게 처리할지 설명이 필요하다.” | 잘못된 입력 처리 누락은 유지하되 반복 한도 설명을 본문에서 제거한다. 한도는 `iteration:state`의 실제 값으로 판단한다. |
| `plant-unrelated-citation` | v2 생성기는 Plan을 L1 제목 문장과 L2 선택 기록 삭제 문장으로 분리한다. Review는 L1을 실제 근거로 제시하지만, 제목 문장은 삭제 범위를 뒷받침하지 않는다. | **Plan 후보:** L1 “식물 이름을 제목으로 표시한다.” / L2 “삭제 시 선택한 기록만 제거한다.” **Review 후보:** “삭제 시 다른 기록도 보존된다는 근거로 식물 이름을 제목으로 표시하는 문장을 인용합니다.” | L1은 존재하는 실제 인용이며 삭제 범위의 직접 근거는 아니다. L2는 선택한 기록만 삭제한다는 관련 근거다. 잠정 Gold는 L1의 존재와 무관성, L2와의 관련성 두 사실을 각각 요구해야 한다. 카드 원문과 생성 Plan 줄을 동일하게 고정한다. |

위 문구는 **제안**이며 Gold 변경·확정이 아니다. 새 입력의 해시와 baseline은 생성 전이라 미확정이다. 특히 `umbrella-choice`는 Shadow finding 수가 1개에서 2개로 바뀌므로 잠정 Gold와 응답 예시는 두 지적을 빠짐없이 포함하되 답의 선택지를 정답으로 고정하지 않아야 한다. 다른 두 사례도 문구·줄 번호·해시가 바뀌므로 v2 Gold를 v3 정답으로 복사하지 않는다. 나머지 사례도 v3의 Policy·Shadow 생성 결과를 확인한 뒤 별도 잠정 Gold를 마련한다. 가능하면 Gold를 보지 않은 사람이 Scope·Plan·Review·이력과 한도를 먼저 독립 판정한다.

## 네 사례의 v2/v3 입력 구조 비교

아래 ID는 현재 v2 생성기의 실제 Shadow ID 규칙을 설명하기 위한 것이다. v3는 같은 내부 규칙을 입력 자료 생성에서 사용하되 블라인드 투영 단계에서 중립화한다. 새 v3 Context SHA-256 값은 아직 생성하지 않았다.

| 사례 | v2 → v3 finding 수와 ID | 근거·인용 관계 | Policy baseline 예상 |
| --- | --- | --- | --- |
| `umbrella-choice` | v2: 1개 `review:issue-umbrella-choice`. v3: 2개 `review:issue-umbrella-choice`, `suggestion:1` | omission finding은 미정인 중복 입력 규칙을 가리킨다. suggestion finding은 사용자에게 별도 저장/기존 항목 갱신을 묻는다. 둘 다 Scope의 미정 선택과 Plan의 “같은 이름의 우산을 새로 입력하면 저장”을 참조한다. 두 finding의 역할은 구별하고 질문 답은 가정하지 않는다. | v2 고정 Archive: `REQUEST_USER_INPUT` + 빈 질문. 최신 main에서 v2 입력 재생성: `FAILED`. v3 후보: `REQUEST_USER_INPUT` + 질문 1개. Shadow finding은 2개. |
| `plant-repeated-loss` | v2/v3 후보 모두 1개 `review:issue-plant-repeated-loss` | L1은 먼저 기존 값을 덮어씀, L2는 날짜 검사, L3는 실패 시 기존 기록 유지라고 명시한다. Review의 주장(검사 전 덮어쓰기·복원 절차 부재)은 L1~L3와 대조한다. 반복임은 이전 Review의 동일 ID 및 이전 Plan으로 판단하며 현재 Review 문구에는 반복이라는 정답 단서를 넣지 않는다. | `STOP_REPEATED_REVIEW_ISSUES` 예상. 반복은 사용자 질문이 아니라 기존 strict ID 기반 Policy가 판단한다. |
| `umbrella-limit` | v2/v3 후보 모두 1개 `review:issue-umbrella-limit` | Review finding은 위치값 유효성 실패 시 동작을 다룬다. 한도 초과 여부는 문장이나 ID가 아니라 `iteration:state`에서 읽는다. | `STOP_LIMIT_REACHED` 예상(`iterationCount === maxIterations`). |
| `plant-unrelated-citation` | v2/v3 후보 모두 1개 `review:issue-plant-unrelated-citation` | Review의 인용 대상은 L1이며 실제 존재한다. L1은 제목 표시라 삭제 범위 근거로는 무관하다. L2의 “선택한 기록만 제거”가 직접 관련 근거다. 잠정 Gold는 잘못된 L1 연결과 L2 관련성을 각각 평가한다. | `REVISE` 예상. Policy는 분류를 의미 검토하지 않으므로, 분류와 인용 관련성 차이는 중재/사람 검수 대상이다. |

v3 baseline 값은 실제 v3 입력을 생성한 뒤 승인된 커밋의 Policy로 계산해야 한다. 표의 값은 현재 입력 필드와 `decideAfterReview()` 순서를 대조한 예상이며, 생성·실행 결과가 아니다. `umbrella-choice`만 Review 구조에 실제 질문을 추가해 기존 `FAILED`에서 `REQUEST_USER_INPUT`으로 바뀔 것으로 예상한다. 나머지 세 baseline은 위 입력 조건을 그대로 생성했을 때의 예상이다.

## 최소 구현 계약 (2단계 승인 후)

1. **별도 버전:** 승인된 카드 후보를 새 v3 자료 경로와 새 생성기로 고정한다. v2 생성기·Archive·기록기 CLI는 건드리지 않는다. v3 `manifest`는 입력 버전 3, 카드/파일 바이트 해시, 생성 코드 커밋, Policy 커밋을 기록한다. 구형 `BASE_COMMIT` 값을 최신 Policy 출처인 것처럼 재사용하지 않는다. 원본 `input.json`으로 최신 `buildShadowContext()`를 재생성해 v3 `context.json`과 정확히 일치하는지 검증한다. v2를 최신 Policy로 재생성했을 때 달라지는 `umbrella-choice`는 v3 출처로 둔갑시킬 수 없다.
2. **입력 단계 투영:** 사례마다 무작위 불투명 토큰을 생성한다. 원본 `ShadowContextInput`의 project/plan/scope/review ID, 현재·이전 Review의 issue ID, requirement/exclusion ID와 관련 ID 참조를 타입별 전단사 사전으로 일관되게 치환한다. 같은 원본 issue ID는 이전/현재 Review 어디에서나 같은 중립 ID, 다른 issue ID는 다른 중립 ID다. 지원하지 않는 ID 필드·충돌·원문에 남은 사례 이름은 실패로 처리한다. 임의의 Plan/Scope/Review 문장 전체를 문자열 치환하지 않는다.
3. **Context 재생성:** 중립 입력과 원래 사용자 요청으로 `buildShadowContext()`를 다시 실행한다. 중립 baseline, `policy:baseline`, `previous-review:source`, finding/reference 키·값 및 새 `contextSha256`을 한 번에 생성한다. 원본과 투영의 Policy 결정 타입·이슈 관계·finding의 설명, 차단 여부, 순서, Plan/Scope의 실제 근거·반복 상태가 보존되는지 확인한다. `context.source.inputSha256`도 투영 입력에서 계산한 값만 공개한다.
4. **물리적 분리:** 신규 `prepare-blind`는 저장소 밖의 서로 겹치지 않는 공개·비공개 폴더를 새로 만든다. 모델 전달 대상은 공개 폴더의 `model-inputs/input.json` 한 파일이며, 파일명·JSON·응답 템플릿에는 원본 사례명, Gold, 원본 ID/해시, 매핑표가 없다. 비공개 폴더에는 원본 파일·Gold·전후 ID 사전과 출처 매니페스트를 보관한다. 한 폴더 전체를 모델에 넘기는 일을 피하기 위해 공개·비공개 폴더를 형제 경로로 분리한다. 기존 `prepare`/`record`의 경로와 출력은 변경하지 않는다.
5. **검증과 역매핑:** 신규 `record-blind`는 공개 입력 파일·비공개 매니페스트의 바이트 해시와 Context 자체의 해시를 먼저 확인한다. 원본 응답 바이트와 `contextSha256`을 보존한 채 중립 Context에서 `validateShadowProposal()`을 통과시킨다. 그다음 `findingId`와 모든 `evidenceRefs`를 사전으로 역매핑하고 원본 Context에서 재검증한다. 배열 인덱스는 매핑 근거가 아니다. 중복·누락·위조·혼합 ID와 수정하지 않은 다른 사례의 응답은 거부한다. SHA-256은 파일의 결합과 변조 탐지 근거이지, 모델이 실제로 그 입력을 읽었다는 서명은 아니다.
6. **결과 보존:** 비공개 결과의 새 UUID 폴더에 응답 원본 바이트, 중립 구조 검증 결과, 복원 제안, 원본 Policy baseline, 결과 매니페스트를 각각 기록한다. 매니페스트는 원본 소스/Context, 매핑표, 투영 Context/입력, 원본 응답, 복원 제안의 SHA-256과 Policy 커밋을 연결한다. 사전 검증 오류는 기존 결과 폴더를 변경하지 않고 종료한다. 기존 저장 방식처럼 새 파일 전용 기록, 경로·심볼릭 링크 검증, 완료 매니페스트 마지막 기록을 적용한다. 의미상 정확도나 실제 모델 사용량은 만들어 기록하지 않는다.

## 2단계 변경 대상 및 회귀 검증 계획

| 대상 | 예정 작업 |
| --- | --- |
| 신규 v3 카드/생성기/매니페스트/잠정 Gold·빈 Scorecard 경로 | 승인 문구만 별도 버전으로 생성. v2 파일 불변 해시 확인. 사람 검수 상태는 `pending` 유지. |
| 신규 오프라인 블라인드 투영 모듈 | 타입별 양방향 매핑, 중립 입력 구성, Shadow 재생성, 누출 검사, 역매핑. Core Policy·승인·STOP 로직은 변경하지 않음. |
| `examples/supervisor-triage-semantic/offline-recorder.mjs` 또는 별도 v3 기록기 CLI | 기존 명령은 동일하게 유지하고 `prepare-blind`/`record-blind`만 분리해 추가. 기존 결과 형식과 v3 결과 형식·입력 버전을 명시적으로 구분. |
| 공식 `test/**`와 v3 사용 안내 | 생성·기록·출처·실패 경계 회귀 검사. Gemini QA 테스트는 참고 자료로 읽고 수정·병합하지 않음. |

검증은 (a) 모든 v3 모델 입력 파일명/JSON에 사례 ID·원본 해시·Gold·정답 단서용 ID가 없는지, (b) 같은/다른 이슈 ID의 이전·현재 Review 매핑, 다중 finding·역순 응답, (c) baseline 및 JSON 문자열 reference 중립화와 정상 Scope/Plan/Review 근거 보존, (d) 원본·투영 Context와 모든 파일 바이트 해시 체인, (e) 다른 사례 응답·ID 위조·중복/누락·잘못된 참조·매핑 변조·경로 이탈·쓰기 실패 거부, (f) 구형 기록기와 v2 archive의 불변성, (g) `npm run typecheck`와 전체 `npm test`를 포함한다. 외부 API·ADC 호출은 0회로 유지한다.

## 사용자 판단 요청

1. 반영한 네 사례의 Plan/Review 후보, `umbrella-choice`의 두 finding 구조와 질문의 표현을 승인할지.
2. `plant-repeated-loss`의 세 줄 Plan에서 덮어쓰기 순서와 실패 후 복원 부재가 충분히 명확한지, `plant-unrelated-citation`의 L1 실제 인용/L2 직접 근거 구분이 의도와 맞는지.
3. 위 Gold 설계가 적절한지, 독립 사람 검수를 한 명 또는 두 명 중 어떻게 진행할지. Gold 자체는 별도 사람 검수 후 새 버전으로 작성한다.
4. v3 블라인드 기록기를 위의 별도 공개/비공개 폴더와 `prepare-blind`/`record-blind` 인터페이스로 구현할지. 이는 유료 모델 평가나 실제 실행 경로 연결의 승인이 아니다.

이 판단 전에는 v3 입력 확정, Gold 확정, 블라인드 투영 구현, 평가 실행을 하지 않는다.
