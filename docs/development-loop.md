# Development Loop

## 현재 구현: STEP 3 수동 관리와 STEP 4 선택형 검증

`src/development/`는 Core의 TaskStateManager 계약을 구현한다. 모델이나 Worker를 호출하지 않고 파일로 상태를 관리한다. 검증 프로필을 지정한 작업의 `verify` 명령은 선언된 파일과 운영자 허용 검사 명령을 실제로 실행한다. Windows PC의 `.adtf` 기록은 Cloud로 자동 복사되지 않는다.

1. `development plan-approve`로 현재 기획안의 최종 사용자 승인을 기록한다.
2. `development init`으로 사용자가 작성한 작업 JSON을 승인 Plan/Scope 버전에 연결한다.
3. `development assign`으로 담당자를 지정한다. 이 명령은 위임을 기록하며 실제 Worker를 실행하지 않는다.
4. `development submit`으로 Worker가 보고한 요약과 산출물 목록을 제출한다.
5. 검증 프로필 작업은 `development verify`로 실제 근거를 수집한다. 실패는 재작업 또는 차단으로 기록한다.
6. `development review`로 사람이 수행한 검수 결과를 기록한다. 체크 이름은 작업의 acceptanceCriteria 문구와 일치해야 하고, 통과할 때 모든 조건을 포함해야 한다. 프로필 작업은 현재 시도의 통과 근거와 변경되지 않은 선언 파일도 필요하다.

제출된 산출물 목록만으로 파일의 존재나 코드 변경을 입증하지 않는다. STEP 4의 [검증 프로필과 명령](verification.md)은 실제 파일·검사 결과를 수집한다. 프로필 없는 기존 수동 작업은 검수자가 직접 파일을 확인한다. 예제 result/review JSON은 실제 작업 결과가 아니며, review 템플릿은 미검토(false)로 시작한다.

```sh
npm run development -- assign --config examples/planning-gemini/config.json --task TASK-001 --agent worker-1 --reason "수동 위임"
npm run development -- submit --config examples/planning-gemini/config.json --task TASK-001 --file examples/development-manual/result.json --reason "실제 결과 보고"
npm run development -- review --config examples/planning-gemini/config.json --task TASK-001 --file examples/development-manual/review.json --reason "실제 산출물 수동 검수"
npm run development -- transition --config examples/planning-gemini/config.json --task TASK-001 --status ready --reason "검수 실패 사항에 대한 수동 재작업 허용"
```

`--config`와 모든 JSON 입력 경로는 프로젝트 루트 안에 있어야 한다. `transition`은 ready/pending/blocked/cancelled만 받으며, 실행·결과·검수 상태는 각각 전용 명령을 사용한다. `list`는 최신 상태와 이력을 표시한다. 수동 명령에는 Google 자격 증명이 필요하지 않다.

## 상태 및 저장

일반 흐름은 `pending → ready → in_progress → awaiting_review → approved`다. 품질 실패는 예산 내에서 `rework`, 프로필의 한도 소진은 `blocked`로 기록한다. 환경·설정 차단은 별도 사유로 기록하며 예산을 소비하지 않는다. 사용자가 `ready`로 바꾼 뒤 다시 담당자를 지정하고, 이전 결과·검수·근거는 이력에 보존한다. 환경·수동 blocked는 `pending → ready`로 복구할 수 있지만 한도 차단은 상태 초기화로 재개할 수 없다. approved/cancelled는 종료 상태다.

기획안의 최종 승인 기록, Scope의 실제 승인, Plan/Scope 버전과 해시를 매 변경마다 확인한다. 기획 또는 Scope 변경 후 기존 작업을 자동으로 옮기지 않는다. 새 프로젝트 실행 컨텍스트에서 작업을 검토·초기화한다. 작업 정의·기존 이력은 덮어쓰지 않는다.

저장 위치는 `<memory>/projects/<projectId>/development/state.json`이다. schemaVersion 1과 revision을 검증하고 배타 잠금 파일, 기대 revision 비교, 임시 파일 교체를 사용한다. 잠금 또는 버전 충돌 시 보존하고 중단한다. 비정상 종료로 `.lock` 파일이 남았다면 쓰는 프로세스가 없는지 확인한 후 복구한다. 자동으로 잠금을 빼앗지 않는다.

최종 Plan 승인 도중 중단되면 승인 레코드가 먼저 기록되어 있을 수 있다. 같은 `plan-approve` 명령을 다시 실행하면 동일 승인에 한해 Planning 상태 갱신을 마칠 수 있다.

## 후속 전체 자동화 설계

1. 승인된 기획안 버전에서 작업을 분해하고 각 작업의 산출물, 완료 조건, 검증 방법, 의존성을 명시한다.
2. 의존성이 충족된 작업만 실행 가능 상태로 만들며 순환 의존성은 오류로 처리한다.
3. 페르소나와 호환성이 확인된 Runtime/Model 설정으로 Worker 실행을 요청한다.
4. 결과 요약과 코드 변경을 확인한다. Worker의 주장만으로 파일 변경이나 성공을 간주하지 않는다.
5. 작업별 검증 프로필에 따라 테스트/정적 검사/검토를 수행하고 증거를 기록한다.
6. 통과하면 검수 승인하고 의존 작업을 해제한다. 실패하면 구체적 증거와 함께 제한된 재작업을 요청한다.
7. 재작업 한도 초과, 환경 문제, 범위 변경 필요 시 차단 상태로 두고 사용자에게 상향 보고한다.

## 상태와 제어

공통 `TaskStatus`의 허용 수동 전이와 파일 기반 낙관적 동시성은 STEP 3에서 구현했다. 이하 실제 Runtime 실행과 자동 검증 정책은 후속 단계 설계다.

- 각 작업은 최대 재작업 횟수를 가진다. 실제 Worker 실행 시도와 재작업 횟수는 구분해 기록한다.
- 중단 조건: 사용자 취소/거부, 필수 의존성 실패, 런타임/모델 비호환성, 한도 초과, 승인 범위 이탈.
- 승인 조건: 정의된 검증 조건 통과, 변경 확인, 결과/로그 저장, 미해결 차단 없음.
- 자동 실행/재작업은 현재 범위가 아니며, 사용자 승인이 있는 구현 단계에서만 추가한다.

## 안전한 범위 관리

Worker가 승인 범위 밖 변경을 제안하면 자동 반영하지 않고 영향 분석과 별도 사용자 승인을 요구한다. Runtime 기능, sandbox 및 변경 목록 확보 방법은 공식 문서와 실제 어댑터로 확인된 것만 사용한다.
