# 지휘자 통합 CLI 사용법 — STEP 5A / 5B

## 지금 가능한 흐름

원문 저장 → 질문 제안 → 답변 기록 → Scope 제안 → 사용자 Scope 승인 → Writer/Reviewer 기획·수정 → 사용자 최종 기획 승인 → 작업 분해·지시서 제안 → 운영자 작업 수락 → 기존 Development 검수·보고를 연결한다.

`supervisor`는 각 단계별 명령이다. 사용자가 명령을 실행해 다음 행동을 선택하며, 한 번 호출해 모든 승인과 위임을 자동 실행하는 서비스가 아니다. `report`의 `nextAction`으로 다음 명령이나 중단 이유를 확인한다. 모델은 제안만 하고 Controller가 저장·승인·의존성 규칙을 적용한다.

## 오프라인 예제

저장소 루트에서 실행한다. Node.js 20 이상이 필요하다. Windows PowerShell에서는 `npm`을 `npm.cmd`로 바꿔 사용할 수 있다.

```sh
npm ci
npm run supervisor -- start --config examples/supervisor-demo/config.json --file examples/supervisor-demo/request.md
npm run supervisor -- questions --config examples/supervisor-demo/config.json --fixture examples/supervisor-demo/fixture.json
npm run supervisor -- answer --config examples/supervisor-demo/config.json --file examples/supervisor-demo/answers.json
npm run supervisor -- propose-scope --config examples/supervisor-demo/config.json --fixture examples/supervisor-demo/fixture.json
npm run supervisor -- report --config examples/supervisor-demo/config.json
npm run supervisor -- approve-scope --config examples/supervisor-demo/config.json --reason "TEST Scope 검토"
npm run supervisor -- plan --config examples/supervisor-demo/config.json
npm run supervisor -- approve-plan --config examples/supervisor-demo/config.json --reason "TEST 기획안 검토"
npm run supervisor -- propose-tasks --config examples/supervisor-demo/config.json --fixture examples/supervisor-demo/fixture.json
npm run supervisor -- report --config examples/supervisor-demo/config.json
npm run supervisor -- initialize-tasks --config examples/supervisor-demo/config.json
```

승인 명령은 본문을 표시한 뒤 **표시된 ID·버전·revision에 맞는 문구**를 입력받는다. 예제 Scope 버전도 실제 상태에서 확인한다. 범위 버전은 제안 시점 revision을 사용하므로 연속 번호라고 가정하지 않는다. `reject-scope --reason "이유"`로 제안을 거절하면 질문 보충 또는 새 Scope 제안으로 돌아간다. 거절 이유는 이력에 남는다. Scope 제안은 거절 시에도 별도 버전으로 보존된다.

질문에는 Controller가 `Q-1`, `Q-2` 등을 붙인다. 답변 JSON은 `{ "Q-1": "답변" }` 형식이고 일부만 답할 수도 있다. 모든 질문에 답해야 Scope를 제안한다. 이미 기록한 답변은 덮어쓸 수 없다. 질문 없는 제안은 바로 Scope 제안으로 이동한다.

예제는 고정된 **TEST/STUB** 응답이며 AI의 도메인 이해 품질을 검증하지 않는다. 작업 수락도 팀원이나 실제 제품을 실행하지 않는다. 기존 프로젝트에 `start`를 다시 실행하면 거부한다. 새 시험은 config의 projectId를 변경하며 기존 `.adtf`를 삭제하지 않는다.

## 실제 Gemini 사용

기존 Gemini config를 복사해 **새 projectId**를 정한다. Writer와 Reviewer는 현재 확정값 `vertex-ai` / `gemini-3.8-flash`를 사용한다. 원문과 답변 파일을 실제 요청에 맞게 작성한다. 이전 `planning-gemini-sample`은 기존 실행 데이터이므로 새 지휘자 실험에 재사용하지 않는다.

위 명령에서 `--config`를 새 설정 경로로 바꾸고 `--fixture`를 제거한다. 질문·Scope·작업 제안은 Writer 모델을 사용하며, 기획은 기존 Writer/Reviewer를 사용한다. 각 모델 명령은 보낼 문맥과 모델을 표시하고 `CALL` 확인 후 호출한다. 제안의 의미상 적합성은 Scope/Plan/작업 수락 시 검토한다. 요구 ID 추적·DAG 검사는 자연어 의미 검토를 대신하지 않는다.

Windows PowerShell의 프로젝트 루트 예시:

```powershell
$env:GOOGLE_CLOUD_PROJECT = "iceu-songpa11"
$env:GOOGLE_CLOUD_LOCATION = "global"
npm.cmd run supervisor -- start --config examples/my-supervisor/config.json --file examples/my-supervisor/request.md
npm.cmd run supervisor -- questions --config examples/my-supervisor/config.json
```

`examples/my-supervisor/`는 사용자가 준비하는 입력 경로다. 바로 시작할 수 있는 실제 모델 인수용 설정과 원문은 `examples/supervisor-gemini/`에 추가했다. 로컬 ADC가 만료·누락된 경우에만 해당 PC에서 `gcloud auth application-default login`으로 인증한다. Cloud에는 이 ADC가 자동 공유되지 않는다. `start`, 답변, 승인, 작업 수락, 보고는 API 호출이나 ADC 없이 실행할 수 있다. 신규 질문·Scope·작업 제안의 호출 메타데이터와 토큰은 `supervisor/usage.jsonl`, 기존 기획 역할은 `planning/usage.jsonl`에 기록한다. 토큰을 제공하지 않은 실패는 임의로 추정하지 않는다.

## 추가 질문 후 기획 재개

`report`의 nextAction이 `collect-feedback`일 때 실행한다. 아래 답변 파일의 질문 ID는 실제 출력에 맞게 작성한다. 예시 경로는 운영자가 준비하는 파일이다.

```sh
npm run supervisor -- collect-feedback --config examples/supervisor-gemini/config.json
npm run supervisor -- report --config examples/supervisor-gemini/config.json
npm run supervisor -- answer --config examples/supervisor-gemini/config.json --file answers.json
npm run supervisor -- resume-plan --config examples/supervisor-gemini/config.json
```

Reviewer 질문은 기존 질문 뒤의 새 Q-ID로 기록한다. 모든 질문에 답해야 재개할 수 있다. 답변 저장은 API를 호출하지 않는다. `resume-plan`은 별도 CALL 확인을 거쳐 같은 Plan ID의 다음 버전을 만들고 Reviewer에게 검토받는다. 원문과 이전 Plan/Review는 보존하고, 검토 통과 후 새 버전의 최종 승인을 다시 받는다.

## Scope 변경 승인 또는 거절 후 재개

작업 제안 **이전**의 검토된 기획에서 사용자가 변경을 요청하거나 Reviewer가 범위 위반을 보고하면 다음을 사용한다. 진행 중인 다른 continuation은 먼저 완료하거나 결정해야 한다. 초기화된 작업 정의를 변경하는 명령은 아니다.

```sh
npm run supervisor -- request-scope-change --config examples/supervisor-gemini/config.json --reason "만료 예정 7일 조회를 필수 범위에 추가하고 싶다"
npm run supervisor -- propose-scope-change --config examples/supervisor-gemini/config.json
npm run supervisor -- report --config examples/supervisor-gemini/config.json
npm run supervisor -- approve-scope-change --config examples/supervisor-gemini/config.json --reason "변경 요청과 새 Scope 전체 검토 완료"
npm run supervisor -- resume-plan --config examples/supervisor-gemini/config.json
```

Reviewer가 이미 생성한 요청이 있으면 그 요청·승인 ID를 재사용한다. 사용자의 새 요청은 별도로 기록한다. 제안 시에는 변경 이유와 기존 Scope를 모델에 전달한다. `approve-scope-change`가 표시하는 **기준 Scope·변경 이유·새 Scope 전체**를 검토한다. 입력 문구는 `APPROVE CHANGE <continuationId> <scopeId> v<version>`이며 변경 요청과 새 범위 스냅샷 **두 승인 모두**를 결정한다. 한 번의 쓰기 도중 끊기면 같은 문구로 나머지 저장을 마칠 수 있다. 반대 결정으로 기존 결정을 덮어쓰지 못한다.

거절은 `reject-scope-change --reason "이유"`와 표시된 REJECT 문구를 사용한다. Reviewer 범위 위반의 변경을 거절한 경우에는 별도 `resume-plan`으로 기존 Scope에 맞는 수정본을 만든다. 사용자 제안 변경을 거절한 경우에는 이전 기획의 승인/질문 절차로 돌아간다. 어느 경우에도 거절한 범위를 채택하지 않는다.

변경을 승인해도 기획안 최종 승인은 자동으로 나지 않는다. `resume-plan` 이후 새 Plan의 `approve-plan`을 거쳐야 작업 분해가 가능하다. 이전 Scope·기획·승인 기록은 그대로 유지한다. 승인 출처가 새 버전에 연결된 작업만 초기화한다.

## 검증 프로필 연결

모델이 검사 실행 파일이나 재작업 예산을 결정하지 않도록, 자동 생성 작업은 기본 수동 검수 방식이다. `initialize-tasks` **이전**에 운영자가 필요한 작업의 프로필을 지정할 수 있다.

```json
{
  "storage": {
    "verificationProfile": { "commandIds": ["check-storage"], "inputFiles": ["check.cjs"] },
    "maxReworkAttempts": 2
  }
}
```

```sh
npm run supervisor -- configure-verification --config examples/supervisor-demo/config.json --file profiles.json
npm run supervisor -- initialize-tasks --config examples/supervisor-demo/config.json
```

`profiles.json`은 운영자가 작성하는 파일이다. 프로필 수정은 proposal revision을 올리므로 수락 문구도 갱신된다. 실제 실행 파일·인수는 별도의 운영자 검증 정책으로 제공하며, 모델의 제안에서 가져오지 않는다. 작업 초기화 후에는 같은 config로 기존 [Development 명령](development-loop.md)의 `assign`, `submit`, `verify`, `review`, `transition`을 사용한다. 이 명령들은 실제 Worker를 실행하지 않는다. 작업 정의는 초기화 이후 변경할 수 없다.

## 보고와 저장

`report`는 원문·질문 답변·승인 상태·현재 Plan/Review·Scope 변경 요청·작업 지시서와 상태별 집계를 JSON으로 출력한다. 작업 지시서에는 승인 기획 본문·출처 해시·요구 ID·의존성·산출물·완료 조건·검증 방법·제외 범위·제약이 포함된다. `completed`는 현재 승인 출처가 유효하고 모든 작업이 검수 승인된 경우에만 true다. 검사 성공 수와 수동 승인 수는 별개이며, 근거 없는 작업은 `unverified`로 센다. 근거 집계는 **저장된 검사 결과**이고 보고 시 검사를 재실행하거나 파일 신선도를 다시 검증하지 않는다.

새 기록은 `.adtf/projects/<projectId>/supervisor/state.json`이다. 원문·질문·답변·제안·continuation·이력을 revision과 함께 원자적으로 저장하고 명령 실행 중 프로젝트 잠금을 유지한다. continuation은 기준 기획 상태·Scope·출처 해시·질문 ID·변경 결정·시작/완료를 보존한다. 기획 시작 시 `requirements.md`에도 원문을 그대로 저장하며 답변은 별도 settledDecisions 문맥으로 Writer/Reviewer에게 전달한다. Scope/Plan/개발 근거는 기존 파일 구조를 유지한다.

## 중단과 남은 범위

- 질문·변경 대기는 report에 수집/제안/결정/재개 명령을 표시한다. 반복 한도·실패·모델 호출 도중 중단은 STOP이다. 일반 `plan`으로 기존 상태를 재실행하지 않는다.
- 기획의 총 iterationCount/maxIterations는 재개 사이에도 유지한다. 설정을 바꿔 예산을 초기화하지 못하며 소진되면 호출하지 않는다. 한도를 늘려 기존 실행을 복구하는 기능은 없다.
- 재개 시작 후 모델 실행이 완료됐으나 supervisor 기록만 실패했다면 `resume-plan` 재시도가 완료 기록만 마무리한다. Planning의 continuationId·버전·Scope로 확인하며 모델을 다시 부르지 않는다. 도중 끊긴 drafting/reviewing 상태는 자동 재호출하지 않는다.
- **남음:** 실제 Gemini로 전체 주제 기획의 의미상 인수 시험. 현재 Cloud에는 ADC와 Vertex AI 접속 설정이 없어 실행하지 않았다.
- Scope 승인 또는 작업 초기화의 하위 저장 직후 중단되면 같은 명령으로 명시적으로 재시도할 수 있다. 기획 도중 중단된 실행의 자동 복구는 지원하지 않는다.
- 여러 저장소를 묶는 DB 트랜잭션은 없다. 기획·개발 명령을 같은 프로젝트에서 동시에 실행하지 않는다. 남은 잠금은 실제 프로세스 종료를 확인한 운영자가 복구하며 자동 제거하지 않는다.
- 실제 개발·테스트 팀원 Runtime, 자동 Worker 재호출, 제품 개발 완료, 모바일 푸시 전송은 이번 구현에 포함되지 않는다.

구현·시험 근거는 [STEP 5A 보고서](step5a-report.md)와 [STEP 5B 보고서](step5b-report.md), 전체 목표는 [테스트 계획](supervisor-test-plan.md)을 참고한다.
