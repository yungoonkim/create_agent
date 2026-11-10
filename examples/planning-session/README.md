# 저장된 상태에서 이어가는 기획 세션

권장 Codex: **GPT-6.1 Sol · medium**. 결과 파일을 보내기 전에 설정하세요. 이 도구는 기획·검토만 수행합니다.

이제 주제별 실행 도구를 새로 만들지 않고 공통 명령을 사용합니다. 실행 코드는 업데이트하되 세션 폴더는 별도로 보관합니다. 최초에 승인 Scope·요구·모델·반복 상한을 저장하고, 다음부터 같은 세션을 지정합니다. `run`은 필요한 수정·재검토를 진행하고 사용자 입력·Scope 변경·최종 승인·오류·반복/요청 상한에서 멈춥니다. 작업자 Agent와 제품 구현은 실행하지 않습니다.

## 설치와 현재 주차 결과 가져오기

새 ZIP의 `adtf-run` 폴더에서 **PowerShell**을 엽니다.

```powershell
npm.cmd ci
npm.cmd run planning:session -- import --session C:\adtf-data\parking --config examples/parking-planning/config.json --from C:\adtf-fix-20261110\adtf-run\parking-review-recovery\result
npm.cmd run planning:session -- status --session C:\adtf-data\parking
```

`--from`은 이미 실행한 복구 결과의 실제 `result` 폴더 경로로 바꿉니다. 파일을 옮길 필요는 없습니다. 전체 파일 목록·SHA-256과 기획/검토/Scope 승인 기록을 확인해 별도 세션으로 복사하며 원래 결과는 보존합니다. 현재 주차 기록은4/6회, 수정 반복1/2회, 남은 SDK 요청2회로 가져옵니다. `knownTokens`는 세션 가져오기 이후의 확인 가능한 사용량만 집계하며 이전 사용량은 `import-receipt.json`에 보존합니다. 과거 비용이 0이라는 뜻이 아닙니다.

현재 주차 수정본 작성·일반 검토·반례 검토에는 최대3회가 필요합니다. 따라서 기본 상한6회로는 다음 반복을 시작하지 않습니다. 상태는 `request_budget_decision`, 부족한 호출은1회입니다. 원래 상한과 누적 횟수를 자동으로 늘리거나 초기화하지 않습니다.

## 사용자가 예산을 늘리기로 결정한 경우에만

아래는 **전체 상한6→7회 변경**입니다. 이미 사용한4회에 새 호출 최대3회를 더할 수 있습니다. 이 명령 자체는 모델을 호출하지 않고 원래 상한6과 변경 이유를 별도 기록으로 남깁니다. 작업 준비 과정에서 이 증액은 실행하지 않았습니다.

```powershell
npm.cmd run planning:session -- budget --session C:\adtf-data\parking --max-calls 7 --reason "주차 기획 수정 및 재검토 한 번을 위한 상한 변경 승인"
```

## 같은 명령으로 실행·확인·보관

```powershell
$env:GOOGLE_CLOUD_PROJECT = "iceu-songpa11"
$env:GOOGLE_CLOUD_LOCATION = "global"
npm.cmd run planning:session -- run --session C:\adtf-data\parking --run-live
```

`run-live`는 실제 Vertex AI 비용이 발생할 수 있는 실행입니다. 저장된 Scope/모델/상한으로 진행하며 최종 승인 자동 처리는 없습니다. 기존 PC ADC 로그인을 사용합니다. 정상 종료·모델 오류·예산 중단 모두 상태와 결과를 별도 스냅샷으로 내보내고 `RESULT_ARCHIVE`를 표시합니다. 이어서 확인할 때는 `status`, 필요할 때는 `export --session ...`를 사용합니다. 매 단계 파일 업로드가 필요하지 않으며, 사용자 판단이나 오류 분석이 필요할 때 결과 압축을 전달합니다.

복구하려면 export 압축을 새 폴더에 풀고 내부 `session` 폴더를 `--session`으로 지정합니다. 원래 Scope·버전·호출/예산 기록을 유지하며 조회·재개·재내보내기를 할 수 있습니다. 실행 코드와 인증정보는 압축에 포함하지 않으므로 기존 실행 환경에서 사용합니다.

완료된 **동일 요청 전체**의 응답만 재사용합니다. Scope·기획 버전·프롬프트·모델 등이 바뀌면 다른 요청입니다. 실패 응답과 잘못된 JSON을 자동 보정하거나 재호출하지 않습니다. Ctrl+C/프로세스 종료 후 잠금이나 미완료 요청이 남으면 먼저 기록을 점검합니다. 잠금/예약을 지워 유료 요청을 반복하지 마세요. 서버 오류로 실제 과금됐는지 모를 때도 호출 예약은 사용 횟수로 유지합니다.

상한은 SDK 호출 수 기준입니다. 모델별 토큰 수와 실제 청구액은 달라질 수 있습니다. 저장된 사용량은 확인 가능한 값만 기록하며, API 오류의 미제공 사용량을 0원으로 단정하지 않습니다.

## 새 주제는 코드 변경 없이 초기화

```powershell
npm.cmd run planning:session -- init --session C:\adtf-data\new-topic --config examples/my-topic/config.json --scope examples/my-topic/scope.json --requirements examples/my-topic/request.md --max-calls 6
```

실제 파일 경로와 초기 상한을 지정합니다. 표시된 Scope의 승인 문구를 한 번 입력하면 세션을 만듭니다. 이후 `run --session ... --run-live`를 사용합니다. 질문 답변·Scope 변경·최종 승인 결정은 기존 별도 승인 절차를 통해 처리해야 하며 이 세션 도구가 자동 결정하지 않습니다. 해당 사용자 결정 이후의 연결은 이번 구현 범위에 포함하지 않습니다.
