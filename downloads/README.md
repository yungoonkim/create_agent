# Windows 실행용 ZIP

**현재 택배 반례 프롬프트 후보 시험:** [adtf-parcel-prompt.zip](adtf-parcel-prompt.zip)을 새 폴더에 풀어 [실행 안내](../examples/parcel-challenge/README-prompt.md)에 따릅니다. 새 Gemini 요청 최대1회이며 과거 명령을 반복하지 않습니다. 아래는 이전 단계 안내입니다.

**현재 택배 반례 호환성 시험:** [adtf-parcel-no-schema.zip](adtf-parcel-no-schema.zip)을 새 폴더에 풀어 [실행 안내](../examples/parcel-challenge/README-no-schema.md)에 따라 진행합니다. 새 Gemini 요청은 최대1회이며 이전 반례 명령을 재실행하지 않습니다. 아래는 과거 단계의 패키지 안내입니다.

**현재 택배 v2 후속 시험:** [adtf-parcel-challenge.zip](adtf-parcel-challenge.zip)을 받습니다. 과거 일반 검토 응답을 재사용하고 반례만 **추가 최대1회** 요청합니다. [실행 안내](../examples/parcel-challenge/README.md)를 따르세요. 아래 adtf-run.zip의 전체 시험 시작은 이번 후속 단계에 사용하지 않습니다.

Windows 탐색기로 전체 저장소 ZIP을 풀 때 과거 시험 기록의 깊은 경로 때문에 오류가 날 수 있다. **[adtf-run.zip](adtf-run.zip)** 파일을 열고 GitHub의 Download 버튼으로 받는다. 이것은 Code → Download ZIP과 다른 실행 전용 패키지다. ZIP의 기준 소스 커밋과 파일 해시는 압축 안의 `bundle-manifest.json`에 있다. 배포된 시점의 고정 패키지이므로 이후 main 변경이 자동 반영되는 것은 아니다.

1. 기존 작업 폴더는 보관한다. 새 ZIP을 `C:\adtf` 같은 짧은 곳에 푼다.
2. `C:\adtf\adtf-run\package.json`이 있는 폴더에서 PowerShell을 연다.
3. 다음을 순서대로 실행한다.

```powershell
npm.cmd ci
npm.cmd run eval:review-evidence -- generate --run-live --bundle
```

두 번째 명령은 실제 Gemini 유료 요청 **최대5회**다. 기존 PC ADC를 사용하고 별도 CALL/변수 설정은 없다. 끝의 `RESULT_ARCHIVE=`에 표시된 `.tar.gz` 파일 하나를 전달한다. 실패하면 반복 실행하지 않고 원자료를 보존한다. 인증 코드/토큰/ADC 파일을 전달하거나 복사하지 않는다.

`src`·예제·잠금파일은 기준 커밋의 원본이며 과거 원자료/인증/실행 데이터는 포함하지 않는다. 실행 ZIP의 `npm.cmd test`는 과거 원자료 검증6개와 배포도구 검사2개를 제외한 **165개** 검사다. 전체 Git 저장소의 **173개** 검사와 구분한다. `package.json`은 이 테스트 명령 조정과 Git이 필요한 배포 명령 제거만 달라진다. 고정 실모델 시험의 생산 소스·입력·실행기·잠금파일 해시는 바꾸지 않는다.

[ZIP SHA-256](adtf-run.zip.sha256), [배포 구성·검증·한계](../docs/windows-run-bundle-20261110.md). 실제 Windows 탐색기/실행 확인은 사용자 결과로 이어가며 Cloud의 Linux 확인과 구분한다.

유지보수자는 전체 Git 체크아웃에서 `npm run bundle:windows -- --output NEW.zip`으로 새 파일을 만든다. Git에 커밋된 HEAD를 읽어 만들며 기존 ZIP을 덮어쓰지 않는다. 코드가 바뀌면 새 커밋으로 다시 생성·검증·배포한다.
