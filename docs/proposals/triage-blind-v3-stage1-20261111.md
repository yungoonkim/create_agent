# Supervisor 중재 블라인드 평가 v3: 1단계 검토안

상태: **사용자 콘텐츠 검토 대기**. 이 문서는 v3 입력과 오프라인 기록기 변경의 제안이다. v3 입력, Gold, Scorecard, 블라인드 투영기 및 모델 평가 결과를 생성·확정하지 않는다.

기준은 `main`의 `19aeed3f8e7966df88fbc5c8e9af2dfbce63ede0`(PR #39 병합)이다. PR #40은 독립 QA 자료로만 참조하며 병합하지 않는다. 기존 v1/v2 사례 카드, `synthetic-snapshots-v2.tar.gz`, Gold, Scorecard, 해시 매니페스트와 `prepare`/`record` 모드는 그대로 보존한다. v2와 v3 결과는 서로 다른 입력 조건이며 합산·직접 점수 비교하지 않는다.

## v2 대비 v3 콘텐츠 변경안

| 사례 | v2의 관련 원문·동작 | v3 후보 및 차이 | 도메인 의미 / 검수점 |
| --- | --- | --- | --- |
| `plant-invalid-input` | 잘못된 수정 날짜의 기록 보존 | 변경 없음 | 기존 값 보존 요구 유지 |
| `umbrella-choice` | Review 이슈는 선택 미정이라고 설명하지만 `suggestions: []`; 고정 v2 baseline은 빈 질문의 `REQUEST_USER_INPUT`, 최신 Policy로 재생성하면 `FAILED` | **질문은 `review.suggestions[0]`에 둔다:** “같은 이름의 우산을 새로 입력하면 별도 항목으로 저장할까요, 기존 항목의 위치를 갱신할까요?” 기존 `omission` 이슈, Scope, Plan, `outcome: needs_user_input`, `userJudgmentRequired: true`는 유지 | 명시적 두 선택지를 추가한다. 현재 Review 계약에 전용 질문 필드가 없어 suggestions를 사용한다. Shadow에 `suggestion:1` finding이 추가되고 신규 Gold 예시도 두 finding을 다뤄야 한다. `scope_violation/clarify`로 이슈 종류를 바꾸는 안은 채택하지 않는다. |
| `plant-reviewer-overreach` | SMS 요구와 승인 Scope의 SMS 제외 | 변경 없음 | 사용자 요청 없는 Reviewer 범위 확대와 혼동하지 않는지 확인 |
| `plant-explicit-sms-request` | 별도 사용자 SMS 요청이 있음 | 변경 없음 | 요청을 승인 완료로 취급하지 않는지 확인 |
| `umbrella-false-review` | 삭제 취소 시 기존 기록 유지 문장이 있음 | 변경 없음 | Reviewer 오독 여부를 원문으로 대조 |
| `plant-repeated-loss` | Plan: “실패 시 기존 값을 유지한다고 적었으나 구현 순서에서는 먼저 덮어쓴다.” Review: “같은 데이터 손실 위험이 직전 버전에도 지적됐고, 이번에도 해결 근거가 없다.” | **Plan 후보:** “수정 화면에서 입력한 날짜를 기존 기록에 먼저 덮어쓴다.\n그다음 날짜 형식을 검사한다.\n검사에 실패하면 오류를 표시하고 기존 기록을 유지한다.” **Review 후보:** “날짜 검사에 실패한 뒤 이전 값으로 되돌리는 절차가 없어 수정 전 기록이 손실될 수 있다.” | 데이터 손실 위험·계획 내부 모순은 유지하면서 평가자 시점의 ‘반복’ 설명을 제거한다. 반복 여부는 이전 Plan/Review와 현재의 동일 이슈 ID로 판단한다. Plan 줄 번호와 인용은 v3에서 다시 생성·검수한다. |
| `umbrella-limit` | Plan: “잘못된 위치 입력 처리 방식이 빠졌다.” Review: “수정 보완이 필요하지만 허용된 기획 반복 횟수를 모두 사용했다.” | **Plan 후보:** “사용자가 우산 위치를 수정하면 입력한 위치값으로 기존 위치를 갱신한다.” **Review 후보:** “위치 수정 시 입력값이 유효하지 않은 경우 기존 기록을 어떻게 처리할지 설명이 필요하다.” | 잘못된 입력 처리 누락은 유지하되 반복 한도 설명을 본문에서 제거한다. 한도는 `iteration:state`의 실제 값으로 판단한다. |
| `plant-unrelated-citation` | 카드의 Plan 표기는 `L1`/`L2`가 한 문장에 있지만 v2 생성기는 별도 두 줄로 바꾼다. Review: “삭제 범위를 설명할 때 L1의 제목 표시만 근거로 인용했다.” | **Plan 후보(두 줄):** “식물 이름을 제목으로 표시한다.\n삭제 시 선택한 기록만 제거한다.” **Review 후보:** “삭제 시 다른 기록도 보존된다는 근거로 식물 이름을 제목으로 표시하는 문장을 인용한다.” | 인용이 실재하지만 삭제 범위의 직접 근거가 아니라는 상황을 유지한다. ‘L1이 잘못됐다’는 평가자 해설을 제거하고, 인용 관련성은 Plan 두 줄을 대조해 판단한다. 카드와 실제 생성 입력의 줄 구성을 일치시킨다. |

위 문구는 **제안**이며 Gold 변경·확정이 아니다. 특히 `umbrella-choice`는 Shadow finding 수가 1개에서 2개로 바뀌므로 잠정 Gold, 유효 응답 예시와 채점 범위를 새로 검수해야 한다. 다른 세 사례도 문구·줄 번호·해시가 바뀌므로 v2 Gold를 v3 정답으로 복사하지 않는다. 나머지 사례도 v3의 Policy·Shadow 생성 결과를 확인한 뒤 별도 잠정 Gold를 마련한다. 가능하면 Gold를 보지 않은 사람이 Scope·Plan·Review·이력과 한도를 먼저 독립 판정한다.

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

1. 위 네 사례의 v3 문구, 특히 `umbrella-choice`의 `review.suggestions[0]` 질문과 추가 finding을 승인할지.
2. 제안 문구가 데이터 보존·잘못된 입력·근거 관련성의 원래 의미를 유지하는지, Gold를 보지 않은 사람의 검수를 어떻게 진행할지.
3. v3 블라인드 기록기를 위의 별도 공개/비공개 폴더와 `prepare-blind`/`record-blind` 인터페이스로 구현할지. 이는 유료 모델 평가나 실제 실행 경로 연결의 승인이 아니다.

이 판단 전에는 v3 입력 확정, Gold 확정, 블라인드 투영 구현, 평가 실행을 하지 않는다.
