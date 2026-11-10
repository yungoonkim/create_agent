# 택배 v2 반례 호환성 후보 시험

권장 Codex: **GPT-6 Sol · medium**. 결과 파일을 올리기 전에 설정하세요.

기존 폴더와 결과는 보관하고 새 ZIP을 `C:\adtf`처럼 짧은 위치에 풉니다. `package.json`이 있는 `adtf-run` 폴더의 PowerShell에서 실행합니다.

```powershell
npm.cmd ci
npm.cmd run complete:parcel-no-schema -- --run-live --bundle
```

새 Gemini 유료 요청 **최대1회**입니다. 이전 관련6시도(최초 인증 실패는 별도)에 추가되어 실행 시 합계 최대7시도입니다. 기존 일반 검토 응답을 재사용하고 반례만 전송합니다. 원래 실패 요청에서 `responseJsonSchema`만 제거했는지 해시와 값으로 확인한 뒤 전송합니다. JSON MIME과 로컬 검증은 유지되지만, 해결 여부와 응답 형식은 미확정입니다.

성공이나 실패 후 `RESULT_ARCHIVE=`의 `.tar.gz` 하나를 전달하세요. 오류가 나도 재실행하거나 시작 예약 파일을 삭제하지 마세요. 같은 폴더의 두 번째 시작을 차단하지만 폴더를 새로 만들면 전역적으로 막지는 못합니다. 원래 프로젝트/승인은 바꾸지 않고 분리한 DEMO FIXTURE 복사본에만 Review/승인 대기를 기록할 수 있으며 최종 승인은 자동 생성하지 않습니다.

유료 호출 없는 확인: `npm.cmd run complete:parcel-no-schema -- --dry-run --bundle`. TEST/STUB은 의도적으로 승인 대기를 막는 지적을 기록하므로 `limit_reached`가 정상입니다.
