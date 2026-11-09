# 한 번 작성과 ADTF 기획 과정의 짝 비교

현재 생산 코드 개선 후에는 고정한 이 세트의 새 생성/재실행이 차단된다. 보존된 결과는 `node examples/planning-comparison/verify-archive.mjs --run-id local-20261109-162415`로 읽기 전용 검증한다. 이 검증기는 현재 생산 소스와 과거 소스가 같다고 요구하지 않으며 원자료와 당시 생성기/설정/라이브러리 해시를 확인한다. 옛 결과와 입력·평가기·점수는 수정하지 않는다.

같은 Gemini·같은 입력·같은 최초 초안에서 출발해 검토/수정 과정의 효과를 비교한다. [평가 계획과 한계](../../docs/planning-comparison-protocol-20261109.md)를 먼저 읽는다. `local-20261109-162415`의 실제6쌍 분석은 [최종 보고서](../../docs/planning-comparison-results-20261109.md)에 완료했고 원자료도 보존했다. 아래 명령은 실행 방법 기록이며 완료한 실험을 다시 실행할 필요 없다. 후속 개선 효과는 새 사례로 검증한다.

## 사용자 PC: 한 번 실행하고 결과 파일 하나 전달

이 코드가 main에 포함된 ZIP을 새 폴더에 풀어 실행한다. 이전 승인 프로젝트를 복사할 필요가 없고 기존 폴더는 그대로 둔다. Node.js24 권장, 로컬 ADC는 기존 로그인을 사용한다. 새 폴더에서 `npm.cmd ci` 후 PowerShell로 실행한다.

```powershell
$env:GOOGLE_CLOUD_PROJECT = "iceu-songpa11"
$env:GOOGLE_CLOUD_LOCATION = "global"
$evalRunId = "local-" + (Get-Date -Format "yyyyMMdd-HHmmss")
npm.cmd run eval:planning-comparison -- generate --run-id $evalRunId --run-live --bundle
```

`--run-live`는 유료 Gemini 실험을 명시적으로 실행하는 옵션이다. 별도 CALL 입력 없이 새3주제×2회 비교를 일괄 실행한다. 생성은 최대54 SDK 모델 호출, 전체 평가의 선택적 모델 채점까지 포함한 절대 상한은66이다. 자동 모델 채점은 위 명령에 포함하지 않는다. 실제 사용자 승인·제품 구현·팀원 실행은 하지 않는다. OpenAI API는 연결하지 않는다.

끝의 `RESULT_ARCHIVE=...tar.gz` 파일 하나를 전달하면 된다. 경로는 `docs/acceptance/planning-comparison-20261109/<실행ID>.tar.gz`다. 원자료는 같은 이름의 폴더에도 남는다. 원본 기획·검토·모델 요청/응답·실패·사용량·대응표를 포함하며 ADC나 환경 변수 값·HTTP 인증 헤더는 포함하지 않는다. 한글 결과를 PowerShell의 네이티브 파이프로 JSON 변환하지 않는다.

실패하면 같은 실행 ID를 재실행하거나 결과 폴더를 지우지 않는다. 일괄 처리는 실패 사례도 기록하고 다른 사례를 이어가며, 실패는 품질 개선 성공으로 세지 않는다. 아카이브 생성만 실패했으면 아래 읽기 전용 패키징 단계로 원자료를 묶을 수 있다. 기존 동일 이름의 아카이브는 덮어쓰지 않는다.

```powershell
npm.cmd run eval:planning-comparison -- pack --run-id $evalRunId
```

운영 환경에 프록시가 필요한 경우 기존 프록시/CA 설정을 유지하고 Node24의 `--use-env-proxy`를 실행에 적용한다. Cloud 전용 프록시 주소를 개인 PC에 복사하거나 TLS 검증을 끄지 않는다. Node 실행을 직접 쓰면 `node --use-env-proxy examples/planning-comparison/run.mjs ...` 형태다(먼저 빌드).

## 진행자 평가 순서

1. 결과 아카이브는 경로 탈출·심볼릭 링크를 검사해 새 경로에 데이터로만 가져온다. 업로드 안의 스크립트를 실행하지 않는다. 고정된 이 저장소의 평가 코드를 사용한다.
2. `blind/index.json`과 해당 익명 파일만 읽는다. `private/`, `provider/`, usage·상태·대응표는 먼저 열지 않는다.
3. 익명 후보마다 고정9기준을0/1/2로 평가하고 원문 줄·이유·결함을 기록한다. 점수 파일은 결과 폴더 밖에 둔다. `seal-manual --run-id ID --file 점수파일`로 근거와 점수를 봉인한다.
4. 이후 `private/pairs/*/feedback.json`을 읽어 지적의 근거와 수정 전후를 감사한다. supported/unsupported/unclear 및 resolved/unresolved/regressed/not_attempted를 실제 근거 줄과 함께 기록하고 `seal-feedback --run-id ID --file 감사파일`로 봉인한다.
5. `unblind --run-id ID`로 작성 방식을 공개하고 품질·잘못된 지적·수정 효과·요청수·토큰·시간·요금표 소계를 비교한다. `verify --run-id ID`로 기록 무결성을 확인한다. 원자료와 평가표·대응표를 함께 Git에 보존한다.

동일 모델의 추가 익명 채점을 원하면 수동 점수 봉인 후 `judge --run-id ID --run-live`를 사용할 수 있다. 이는 별도 유료 단계이며 수동 감사와 중복 파일을 만들지 않도록 한 평가 경로만 선택한다. 같은 모델의 채점은 별도 진실 증명이 아니다.

## 오프라인 확인

```sh
npm run build
node examples/planning-comparison/run.mjs dry-run --run-id UNIQUE-DRY-ID
npm test
```

dry-run은 Fake 모델이며 실제 품질 결과가 아니다. 전체 npm test는 임시 dry-run·점수 봉인·감사·공개·압축·변조 탐지를 검증하고 임시 데이터를 정리한다. 시작/완료 이력과 원자료는 실제 평가에서 자동 재실행하지 않는다.
