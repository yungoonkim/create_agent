# 주차 반례 검토 이어가기

권장 Codex: **GPT-6.1 Sol · medium**. 결과 파일을 보내기 전에 설정하세요.

기존 주차 시험 폴더는 보관하고 이 ZIP을 `C:\adtf-fix` 같은 새 짧은 경로에 풉니다. `adtf-run` 폴더의 PowerShell에서 실행합니다.

```powershell
npm.cmd ci
$env:GOOGLE_CLOUD_PROJECT = "iceu-songpa11"
$env:GOOGLE_CLOUD_LOCATION = "global"
npm.cmd run complete:parking-review -- --run-live
```

기존 PC의 ADC 인증을 사용합니다. 이 명령은 **실제 유료 가능 Gemini 반례 요청 최대 1회**만 보냅니다. 원래 기획안 v1과 일반 검토 응답을 패키지에 넣어 재사용하므로 옛 폴더에서 파일을 복사하거나 Writer/일반 검토를 다시 실행할 필요가 없습니다. 과거3회+새1회=누적 최대4회로 원래6회 상한을 유지합니다.

공통 Reviewer는 택배에서 통과한 JSON 모드/필수 키/인용 최대8개 지침을 사용합니다. 로컬 내용·형식 검증은 그대로 수행합니다. 모델이 지적을 반환하면 수정 필요로 기록하고 멈추며, 통과하면 사용자 승인 대기로 기록합니다. 최종 기획 승인은 하지 않습니다. 수정 기획 생성도 이 명령에서 실행하지 않습니다.

종료 시 `RESULT_ARCHIVE`의 `parking-review-recovery.tar.gz` 하나를 보내세요. 실패해도 재실행하지 말고 원본과 결과를 보관하세요. 압축에는 요청·응답·사용량·검토표·파일별 해시가 들어 있으며 인증 파일은 넣지 않습니다.
