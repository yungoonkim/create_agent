# 주차 위치 기록 기획 시험

이 ZIP은 2026-11-10 대화에서 사용자가 승인한 `parking-scope` v1으로 기획안 작성·검토만 한 번 실행합니다. 제품 코드를 만들거나 최종 기획안을 자동 승인하지 않습니다. Writer/Reviewer는 Vertex AI Gemini 3.8 Flash입니다. 최대 Writer 2회 + Reviewer 4회, SDK 호출 최대 6회이며 실제 Google Cloud 비용이 발생할 수 있습니다.

기존 폴더와 결과는 보관하고 ZIP을 짧은 경로(예: `C:\adtf`)에 새로 푼 뒤, `adtf-run` 폴더에서 **PowerShell**로 실행하세요. 이전에 ADC 로그인을 마쳤다면 폴더마다 다시 로그인할 필요는 없습니다.

```powershell
npm.cmd ci
$env:GOOGLE_CLOUD_PROJECT = "본인의-프로젝트-ID"
$env:GOOGLE_CLOUD_LOCATION = "global"
npm.cmd run trial:parking-planning -- --run-live
```

`GOOGLE_CLOUD_PROJECT`는 실제 Vertex AI 프로젝트 ID로 바꾸세요. 실행은 한 번만 합니다. 실패해도 자동 재실행하지 말고 `RESULT_ARCHIVE=` 뒤의 `parking-planning-result.tar.gz`와 표시된 `RESULT_SHA256`을 보관하세요. 이 파일에는 원요청, 승인 Scope, 모델 요청·응답, 상태, 사용량, 검토표, 파일별 해시가 들어 있으므로 개인 자료를 포함한 결과물로 취급하세요. 인증 토큰과 ADC 파일은 넣지 않습니다. 원인과 기획 품질을 검토한 뒤 다음 동작을 결정합니다.

결과 분석을 맡길 때 권장 Codex 설정은 **GPT-6.1 Sol · medium**입니다. 이 설정은 Gemini API 과금 설정과 별개입니다.
