# HTTP400 이후 스키마 호환성 후보

권장 Codex는 GPT-6.1 Sol · medium이며 결과 파일 전송 전에 설정한다. 원본 요청 진단에서 HTTP400/INVALID_ARGUMENT가 확인됐지만 거부된 필드는 불명이다. 아래 기존 안내는 원본 진단의 기록이며 동일 요청을 반복하지 않는다.

새 후보 ZIP은 같은 v2의 전송 스키마만 단순화하며 해결을 보장하지 않는다. 새 폴더의 package.json 위치에서 다음을 실행한다.

```powershell
npm.cmd ci
npm.cmd run diagnose:review -- --schema-candidate --run-live --bundle
```

최대1회 과금 가능 요청이다. Writer 재작성/원래 상태 변경/정식 Review 저장/자동 반례·승인은 없다. 기존 후속3+진단1=4이며 후보 실행 후5다. 성공/실패 모두 RESULT_ARCHIVE tar.gz 하나를 전달하고 재실행하지 않는다. 실제 후보 응답을 받아도 원문·스키마·의미 검증 전 품질 통과로 보지 않는다.

모델 없는 확인은 --schema-candidate --dry-run --bundle이다. npm 명령이 먼저 빌드하므로 dist를 수동 복사하지 않는다.

---

# 중단된 택배 기획 v2 요청의 단일 진단

실제 진단은 아직 실행하지 않았다. 원인 분석 권장 설정은 **GPT-6.1 Sol · medium**이며 결과 파일을 보내기 전에 설정한다.

기존 새 시험은 일반 검토 성공→Writer v2 성공→재검토 전송 실패였다. 3개 SDK 시도 중2개만 응답했고 오류가 일반화돼 HTTP400/500/연결 문제를 구분할 수 없다. 이 도구는 원래 실패한 call-003 요청을 해시로 고정해 **최대1회** 재검토 요청만 보낸다. Writer를 재실행하지 않으며 원래 프로젝트/기획/승인/예약을 수정하지 않는다. 응답을 받아도 정식 Review 저장·반례 검토·최종 승인을 수행한 것으로 보지 않는다.

새 진단용 ZIP의 package.json 폴더에서 실행한다.

```powershell
npm.cmd ci
npm.cmd run diagnose:review -- --run-live --bundle
```

`--run-live`는 유료 가능성이 있는 단일 요청의 명시 실행이다. SDK 자동 재시도는1시도이며 같은 폴더의 두 번째 실행은 시작 예약으로 거부한다. 기존3시도와 별도로 진단1시도만 추가한다. 결과의 `RESULT_ARCHIVE=` tar.gz 하나를 전달한다. 실패/성공 어느 쪽도 다시 실행하지 말고 보존한다. 추가 실행이 필요하면 먼저 기록을 분석한다. 인증 코드/토큰/ADC 파일은 보내지 않는다.

진단은 HTTP 상태, 허용목록 오류 코드, 고정 메시지 분류만 남긴다. 원시 예외 메시지·헤더·스택은 저장하지 않는다. 따라서 상세 필드 설명이 생략될 수 있으며 정보가 없으면 null/빈 분류로 남긴다. 정상 모델 응답은 text/candidates/usageMetadata/modelVersion만 기록한다. Gemini 모델·thinking·출력 설정과 요청 본문은 원본 그대로이며 ADC 프로젝트는 iceu-songpa11/global이다.

모델 없는 확인은 `npm.cmd run diagnose:review -- --dry-run --bundle`이다. TEST/STUB은 실제 모델 품질이나 오류 해결의 근거가 아니다.
