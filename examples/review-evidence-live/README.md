# 택배 수령 기획의 근거·수정 보존 시험

**오늘 로컬 실행은 필요 없다.** 현재는 구현·고정 응답 검증·실제 시험 준비 단계이며 Gemini 호출0회다. 실제 실행은 나중에 PC를 사용할 때 진행한다. [사전 시험 계획](../../docs/review-evidence-live-protocol-20261109.md)을 먼저 읽는다.

기존 식물/운동 시험과 다른 새 사례다. 고정 초안에는 저장된 수령 상태의 타입 검증을 건너뛰는 고의 결함이 있다. 실제 Reviewer가 이를 지적하고 실제 Writer가 같은 Scope 안에서 수정하는지, 수정 전후/공통 검증의 근거가 맞는지 확인한다. 최초 초안은 모델 생성 결과가 아니며 전체 기획 품질이나 일반 챗봇 대비 우위를 평가하는 시험도 아니다.

## 나중에 사용자 PC에서 실행

이 도구가 포함된 PR을 병합한 최신 ZIP을 새 폴더에 풀고 기존 폴더/결과는 보관한다. Node.js24 권장, 기존 PC ADC를 사용한다. 새 PC에서는 정상 브라우저 ADC 로그인과 프로젝트 권한을 먼저 준비한다. PowerShell이 gcloud.ps1 실행을 차단하면 정책 변경 없이 `gcloud.cmd`를 사용한다. 인증 코드/토큰/ADC 파일을 채팅이나 시험 폴더에 넣지 않는다.

CMD/PowerShell 어느 쪽에서도 변수 설정 없이 실행한다.

```powershell
npm.cmd ci
npm.cmd run eval:review-evidence -- generate --run-live --bundle
```

`--run-live`는 과금 가능한 최대5 SDK 요청에 대한 명시 실행이다. 별도 CALL 입력은 없고 project/location/model/run ID를 직접 설정할 필요도 없다. 실제 최종 사용자 승인·제품/팀원 실행은 하지 않는다. 끝의 `RESULT_ARCHIVE=`에 표시된 `.tar.gz` 파일 하나를 전달한다.

오류/한도/판단 대기이면 결과를 보존하고 **다시 generate하지 않는다.** 같은 고정 시험은 체크아웃당1회 예약으로 중복 실행을 차단한다. 인증/권한 오류는 후속 사례를 중단하며 미완료 종료코드2라도 압축은 만들어질 수 있다. 압축만 실패하면 원래 실행 ID로 모델 호출 없는 pack을 사용할 수 있다.

```powershell
npm.cmd run eval:review-evidence -- pack --run-id "원래실행ID"
```

기존 압축도 덮어쓰지 않는다. 오류가 반복되면 원본 폴더와 오류를 보존한다. 실패 예약을 삭제해 유료 호출을 재생하지 않는다.

## 모델 호출 없는 확인

```sh
npm run build
node examples/review-evidence-live/run.mjs dry-run --bundle
node examples/review-evidence-live/run.mjs verify --run-id EXISTING_ID
```

dry-run은 고정 응답으로 실제 어댑터/Controller/내보내기/압축을 연결하며 의미상 모델 품질 근거가 아니다. verify/pack은 저장 파일과 고정 실행기/설정 해시를 검사하고 API를 부르지 않는다. 소스가 나중에 바뀌면 새 generation은 차단되지만 기존 원자료 검증은 해당 고정 실행기로 계속할 수 있다.
