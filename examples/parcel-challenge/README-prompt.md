# 택배 v2 반례 JSON 형식 후보 시험

권장 Codex: **GPT-6 Sol · medium**. 결과 파일을 올리기 전에 설정하세요.

새 ZIP을 기존 결과와 다른 짧은 폴더에 풉니다. `package.json`이 있는 `adtf-run` 폴더에서 **PowerShell**로 실행합니다.

```powershell
npm.cmd ci
npm.cmd run complete:parcel-prompt -- --run-live --bundle
```

두 번째 명령은 **새 Gemini 유료 요청 최대1회**입니다. 이전 관련7시도(최초 인증 실패는 별도)에 추가됩니다. 기존 일반 검토 응답을 재사용하고 반례만 전송합니다. 이전 실패 요청 및 새 프롬프트 후보의 해시/내용을 모델 호출 전에 확인합니다. 프롬프트 효과와 기획 품질은 미확인입니다.

`RESULT_ARCHIVE=`에 표시된 `.tar.gz` 파일 하나를 전달하세요. 실패해도 재실행하거나 시작 예약 파일을 삭제하지 마세요. 별도 시작 예약은 이 폴더의 중복 실행만 막습니다. 원래 프로젝트/승인과 이전 실행 기록은 변경하지 않습니다. 검증 통과 시에만 분리한 DEMO FIXTURE 복사본에 Review 또는 승인 대기를 기록하며 최종 승인은 자동 생성하지 않습니다.

모델 호출 없이 확인하려면 `npm.cmd run complete:parcel-prompt -- --dry-run --bundle`을 실행할 수 있습니다. TEST/STUB이므로 `limit_reached`가 정상이고 품질 근거는 아닙니다.
