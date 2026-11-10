# 택배 반례 인용 상한 보완 시험

결과 분석용 권장 Codex는 **GPT-6 Sol · medium**입니다. 업로드 전에 설정하세요.

이전 압축·실행 폴더를 보관하고 새 ZIP을 짧은 새 경로에 풉니다. `package.json`이 있는 `adtf-run` 폴더의 PowerShell에서 실행합니다.

```powershell
npm.cmd ci
npm.cmd run complete:parcel-eight -- --run-live --bundle
```

두 번째 명령은 새 Gemini 유료 요청 **최대1회**입니다. 이전 관련8시도(최초 인증 실패 별도)에 추가됩니다. 성공했던 일반 검토는 재사용하고 반례만 다시 요청합니다. 이번 후보는 모든 `evidenceLines` 배열을 최대8개로 제한하도록 지시합니다. 실제 모델의 준수와 기획 품질은 아직 미확인입니다.

실행 후 `RESULT_ARCHIVE=`의 `.tar.gz` 하나를 전달하세요. 실패해도 다시 실행하거나 시작 예약 파일을 삭제하지 마세요. 이전 원본 기획/승인/압축을 변경하지 않으며 분리한 DEMO FIXTURE 복사본에만 정식 Review 또는 승인 대기를 기록할 수 있습니다. 최종 승인은 자동으로 생성하지 않습니다.

호출 없이 확인하려면 `npm.cmd run complete:parcel-eight -- --dry-run --bundle`을 실행합니다. TEST/STUB은 의도적으로 `limit_reached`로 멈추므로 실제 품질 근거가 아닙니다.
