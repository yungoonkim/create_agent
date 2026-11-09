# Windows 실호출의 추가 검토 요청 실패와 복구

기준일: 2026-11-09 (한국 시간). 이번 변경은 지휘자 내부 Reviewer 요청과 명시적 복구만 다룬다. 제품 구현·팀원 연결은 보류한다.

## 확인된 사실과 원인 후보

사용자가 main ZIP으로 Windows에서 실행했다. 오프라인 데모는 승인 대기까지 진행했고, 자동 테스트는 132개 중 130통과/2건 Windows 제외/실패0이었다. 사용자 PC의 ADC 인증 후 실제 Gemini 질문6개·답변 저장·Scope v4 제안까지 성공했다. 이어진 기획 실행의 사용자 제공 usage 화면에서 다음을 확인했다.

| 단계 | 결과 |
| --- | --- |
| Writer v1 | success, 초안 저장 후 검토 진입 |
| Reviewer assessment | success |
| Reviewer challenge | failure, HTTP400 INVALID_ARGUMENT, Request contains an invalid argument |

projectId는 `my-supervisor-20261109-112551`이다. 사용자가 읽기 전용 명령으로 확인한 기획 v1의 비공백 줄 수는 **150**이다. 로컬 Plan 원문·report 전체·실행 파일은 이 Cloud에 동기화되지 않았다. Scope 승인 상태와 복구 자격은 로컬 report로 다시 확인해야 한다. 첫 Reviewer의 success는 최종 검토 통과·기획 승인 완료를 뜻하지 않는다.

기존 응답 스키마는 기획의 비공백 줄 번호 전체를 enum으로 넣고, 반례 점검의 중첩 배열에도 반복했다. 큰 enum과 중첩 구조는 Vertex의 응답 제약을 복잡하게 만든다. [공식 문서](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output)도 복잡한 응답 스키마에서 400 오류가 발생할 수 있음을 설명한다. 이번 오류와 맞는 원인 후보지만 **사용자 요청을 그대로 재현한 서비스 측 확정 진단은 아니다.**

Cloud의 기존 ADC로 별도 요청을 시도했으나 `invalid_grant/invalid_rapt`로 인증 단계에서 막혔다. 이는 사용자 PC의 400과 다른 문제이며, 이 작업에서 수정 전후 Vertex 실호출 성공을 주장하지 않는다. 인증 파일·토큰은 읽거나 기록하지 않았다.

## 변경 내용

- 비공백 줄이 32개 이하인 작은 기획은 기존 줄 번호 enum을 유지한다. 그보다 긴 기획은 원문 줄 번호의 최소/최대 정수 범위를 쓴다. 32는 내부 보수적 기준이며 공급자가 보장한 한도가 아니다.
- 모델 문맥에는 비어 있지 않은 줄만 보내되 원래 줄 번호를 유지한다. 잘못된 범위·빈 줄·중복 참조는 기존 코드 검증이 계속 거부한다. 큰 기획을 잘라내거나 승인 기준을 낮추지 않는다.
- 오류 메시지에 assessment/challenge 실패 단계를 포함한다. usage의 성공·실패와 공급자가 제공한 토큰만 기록하는 정책은 유지한다.
- `supervisor retry-review --reason ...`를 추가한다. 기존 승인 Scope·원문·저장된 초안을 재사용하고 첫 Writer 작성을 반복하지 않는다. 저장된 중간 assessment 결과가 없으므로 **Reviewer 절차는 assessment부터 다시 실행**하며 필요하면 challenge도 호출한다.
- reviewing 상태·현재 Review 미저장·같은 프로젝트/Scope·동일 반복 한도·남은 예산·명시 사유·사용하지 않은 재시도만 허용한다. 진행 중 continuation이나 작업 제안/초기화 뒤에는 허용하지 않는다.
- 모델 호출 전에 재시도 예약을 Planning 상태의 `reviewRetry`로 저장한다. 프로젝트당 한 번이며 다시 실패하거나 도중 중단돼도 자동 재생/예약 삭제는 하지 않는다. 원본 기획·Scope·결정의 출처 해시, 사유, 시각을 남기고 이후 상태·기획 승인에서도 예약을 보존한다. Supervisor 잠금으로 동시 호출을 막는다.
- 완료된 논리 리뷰를 기준으로 기존 iterationCount/maxIterations를 이어간다. 재검토가 revise면 정상 수정 루프가 남은 예산 내에서 진행되고 새 기획 버전이 생길 수 있다. pass라도 최종 사용자 승인은 별도다.

이 명령은 일반 중단의 자동 복구나 무제한 API 재시도가 아니다. `plan`/`start`로 기존 상태를 다시 실행하는 것도 여전히 거부한다.

## 검증

`npm run typecheck`, `npm test` 모두 통과: **137개 통과, 실패0 (Cloud Linux)**. 새 검사는 600줄/비공백400줄 기획의 양 단계 응답 스키마 크기 제한과 원문 줄 번호·빈 줄/범위 밖/중복 거부, 저장 초안 재사용·승인 대기, 실패 전 예약·재실행 차단, 설정으로 예산 초기화 거부, 정상 수정 루프, 동시 호출 잠금과 CLI·최종 승인 후 예약 보존을 확인했다. 모의 모델 기반이며 실제 Gemini 성공의 대체 증거가 아니다.

기존 실제 재고·할 일 프로젝트와 승인 파일은 변경하지 않았다. [검증 기록](acceptance/reviewer-schema-400-20261109.json)에 사용자 관찰/코드 검사/Cloud 인증 실패를 구분했다. 원래 로컬 실패 데이터는 사용자 PC에 있다.

## 사용자 PC에 적용하기

1. 실행 중인 명령이 끝난 상태에서 기존 실행 폴더 전체를 별도 위치에 복사해 백업한다. 숨김 `.adtf`, `examples/local-my-supervisor-20261109-112551.json`, 요청·답변 파일을 포함한다.
2. 수정 PR을 머지한 main ZIP을 **다른 폴더**에 압축 해제한다. 새 소스 폴더에 기존 `.adtf`와 위 시험의 설정·요청·답변 파일만 복사한다. 기존 node_modules/dist는 복사하지 않는다. 전체 examples 폴더로 새 예제를 덮어쓰지 않는다.
3. 새 폴더에서 `npm.cmd ci`, `npm.cmd run typecheck`, `npm.cmd test`를 실행한다. Windows는 총137개 중135통과/2건 제외/실패0이 기대값이다. 실제 Windows 재검증 결과는 아직 받지 않았다.
4. 같은 PC의 ADC를 사용하고 GCP 변수를 다시 설정한다. 아래 명령은 모델을 호출하지 않는다.

```powershell
$env:GOOGLE_CLOUD_PROJECT = "iceu-songpa11"
$env:GOOGLE_CLOUD_LOCATION = "global"
$localConfigPath = "examples/local-my-supervisor-20261109-112551.json"
npm.cmd run supervisor -- report --config $localConfigPath
```

5. planning.status가 reviewing, v1이 보존되고 Scope 승인이 유효한지 확인한 뒤 아래 **명시적 재시도 한 번**을 실행한다. 다시 `start`, `plan`, Scope 승인을 실행하지 않는다.

```powershell
npm.cmd run supervisor -- retry-review --config $localConfigPath --reason "Reviewer 요청 형식 보완 후 저장 기획의 검토를 재시도함"
```

`CALL`을 입력하면 실제 비용이 발생한다. 최종 기획 승인은 포함하지 않는다. 다시 실패하면 예약/이력을 지우지 말고 report와 usage 마지막 행으로 조사한다. 성공하면 report의 다음 동작을 따라 내용 검토·사용자 승인을 진행한다. 이번 재검증은 사용자 PC에서 결과를 받아야 완료된다.
