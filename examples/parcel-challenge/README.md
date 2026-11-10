# 택배 v2 반례 검토 이어가기

권장 Codex: **GPT-6.1 Sol · medium**. 결과 파일을 보내기 전에 설정하세요. Codex 설정과 Gemini API 과금은 별개입니다.

기존 실행 폴더는 보관하고 이 실행용 ZIP을 새 짧은 경로에 풉니다. `package.json`이 있는 `adtf-run` 폴더에서 **PowerShell**을 열고 실행합니다.

```powershell
npm.cmd ci
npm.cmd run complete:parcel-review -- --run-live --bundle
```

이 명령은 **추가 Gemini 유료 요청 최대 1회**입니다. 기존 후속·진단 5회에 새 상한 1회를 추가한 시험이며, 실행되면 합계 최대 6회입니다. 더 앞선 최초 인증 실패 1시도는 이 합계와 별도 이력입니다. 기존 `pass` 일반 검토 응답을 해시로 고정해 재사용하므로 일반 검토·Writer를 다시 호출하지 않습니다. 자동 재시도도 없습니다. 같은 PC/Windows 계정의 ADC를 사용하며 폴더 변경만으로 다시 로그인할 필요는 없습니다.

성공/실패 모두 `RESULT_ARCHIVE=`에 표시된 `.tar.gz` 파일 하나를 전달하세요. **오류가 나도 반복 실행하거나 예약 파일을 삭제하지 마세요.** 시작 예약으로 같은 폴더의 두 번째 유료 실행을 차단합니다. 새 폴더에서 다시 실행하는 것까지 막는 전역 결제 한도는 아닙니다.

결과 해석:

- `challengeCompleted: true`: 반례 응답이 로컬 구조·인용 검증까지 통과함. 품질 무결함을 보증하지 않습니다.
- `formalReviewSaved: true`: **분리한 시험 복사본**에 정식 Review가 저장됨. 원래 프로젝트는 변경하지 않습니다.
- `planningStatus: awaiting_approval`: 정책 검사를 통과해 **승인 대기**. `finalApprovalCreated`는 항상 `false`입니다.
- 문제/질문이 있으면 그 결과를 저장하고 멈춥니다. Writer·추가 모델 호출·제품 구현·팀원 실행은 하지 않습니다.

`challenge-results` 아래에 고정 입력 출처, 재사용 응답, 새 요청·응답·토큰 사용량 또는 허용목록 오류, 분리한 메모리, 사용자 검토표, 요약을 저장합니다. 과거 assessment 토큰을 새 사용량에 중복 합산하지 않습니다. 원래 기획 v1/v2와 이전 Review의 본문은 유지하고 Scope 승인에는 DEMO FIXTURE임을 표시합니다. 시험 결과를 실제 사용자 승인으로 가져오지 마세요.

모델 호출 없이 실행 흐름만 확인하려면:

```powershell
npm.cmd run complete:parcel-review -- --dry-run --bundle
```

이 TEST/STUB은 실제 품질 평가가 아니므로 의도적으로 저장 검토 미확인 지적을 남겨 승인 대기를 막습니다. `limit_reached`가 정상 예상 결과입니다. 실행 소스 커밋과 파일 해시는 ZIP의 `bundle-manifest.json`에서 확인할 수 있습니다. 전체 과거 기록은 Git 저장소에 보존하며 실행 ZIP에는 넣지 않았습니다.
