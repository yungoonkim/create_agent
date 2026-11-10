# 소스를 받아 ADTF 실행하기

기준일: 2026-11-09 (한국 시간). **실행 대상은 터미널에서 사용하는 ADTF 지휘자·기획자 CLI**다. 예제 ‘할 일 관리’ 앱은 기획과 작업 지시 자료이며, 이 저장소에 완성된 할 일 웹앱이 들어 있는 것은 아니다.

처음에는 **소스 받기 → 설치 → 모델 없는 데모**까지만 실행해도 된다. 실제 Gemini를 쓰려면 그다음 ADC 인증과 새 프로젝트 설정을 진행한다. 현재 팀원 Agent 자동 실행은 제공하지 않는다.

추가 기능: [사용자 기획 검토표](user-planning-review.md)를 모델 호출 없이 생성할 수 있다. 처음 확인하려면 `npm.cmd run planning:review-demo -- --output "review-demo-01"`로 고정 응답 예시를 만들고 review.md를 연다. 기존 기획은 `review-plan`으로 읽기 전용 내보낸다. 새 폴더를 사용하며 승인/기획 재실행은 필요 없다. 이전 실제7개 응답의 관찰·한계는 [실모델 결과](planning-review-live-results-20261109.md), 이후 원문 비교·지적 해결·공통 검증 근거와 전체171개 오프라인 검사는 [최신 보완](review-evidence-preservation-20261109.md)을 따른다. [새 택배 시험](../examples/review-evidence-live/README.md)은 나중에 PC에서 수행하며 지금 로컬 실행은 필요 없다.

## 1. 준비할 프로그램

| 프로그램 | 필요한 경우 | 확인 명령 |
| --- | --- | --- |
| Node.js 24 LTS 권장 + npm | 모두 필요. package.json의 최소 조건은 Node.js 20 이상 | `node --version`, `npm.cmd --version` |
| Git | Git으로 소스를 받을 때. ZIP 다운로드는 없어도 됨 | `git --version` |
| Google Cloud CLI | 실제 Gemini를 호출할 때 | `gcloud --version` |

설치: [Node.js](https://nodejs.org/), [Git](https://git-scm.com/downloads), [Google Cloud CLI](https://cloud.google.com/sdk/docs/install). 설치 뒤 PowerShell을 다시 열어 PATH를 적용한다.

아래 기본 명령은 **Windows PowerShell** 기준이다. `npm.cmd`는 PowerShell 실행 정책 때문에 `npm.ps1`이 차단되는 문제를 피하는 npm 실행 파일이다. macOS/Linux에서는 `npm`을 사용한다.

## 2. 소스 받기

Git 방식:

```powershell
git clone --branch main --single-branch https://github.com/yungoonkim/create_agent.git
cd create_agent
```

ZIP 방식: [main 브랜치](https://github.com/yungoonkim/create_agent/tree/main)에서 **Code → Download ZIP**을 선택하고 압축을 푼다. 저장소가 비공개이면 권한이 있는 GitHub 계정으로 접속한다. PowerShell에서 압축 해제 폴더로 이동한다.

```powershell
cd "C:\압축을 푼 위치\create_agent-폴더"
Get-ChildItem package.json
```

`package.json`, `src`, `examples`, `docs`가 보이는 폴더가 실행 루트다. 이후 명령은 모두 이 폴더에서 실행한다. 소스를 이미 수정하고 있다면 변경을 보존하고 브랜치를 확인한다. 이 가이드는 기존 파일을 강제로 되돌리는 명령을 사용하지 않는다.

## 3. 설치와 기본 검사

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
```

`ci`는 저장된 package-lock.json에 맞춰 의존성을 설치한다. `typecheck`는 타입 검사, `test`는 빌드 후 프레임워크 회귀 검사다. 빌드 결과는 `dist`에 생성된다. 종료 코드0과 테스트 실패0을 확인한다. 테스트 개수는 후속 변경에 따라 늘어날 수 있다.

## 4. 가장 빠른 확인: 모델 없는 Planning 데모

```powershell
npm.cmd run planning:demo
```

Fake Writer/Reviewer가 고정 응답으로 **v1 작성 → 수정 → v2 검토 → REQUEST_USER_APPROVAL**까지 진행한다. 이 데모 자체는 Gemini 요청·ADC·모델 사용료가 없고, 설치에는 인터넷이 필요하다. DEMO FIXTURE의 Scope 승인은 실제 사용자 승인이 아니다.

기록은 `.adtf/projects/planning-demo/`에 남는다. 같은 데모를 다시 실행하면 기존 상태가 있다는 이유로 중단하는 것이 정상이다. 반복 실행하려고 기존 기록을 삭제하지 않는다. 새 폴더에서 확인하거나 새로운 프로젝트·Scope fixture 결합을 준비한다. 자동 테스트 `npm.cmd test`는 별도 임시 데이터를 사용하므로 반복 실행할 수 있다.

## 5. 지휘자의 질문·Scope 입구도 모델 없이 확인

처음 한 번만 순서대로 실행한다.

```powershell
npm.cmd run supervisor -- start --config examples/supervisor-demo/config.json --file examples/supervisor-demo/request.md
npm.cmd run supervisor -- questions --config examples/supervisor-demo/config.json --fixture examples/supervisor-demo/fixture.json
npm.cmd run supervisor -- answer --config examples/supervisor-demo/config.json --file examples/supervisor-demo/answers.json
npm.cmd run supervisor -- propose-scope --config examples/supervisor-demo/config.json --fixture examples/supervisor-demo/fixture.json
npm.cmd run supervisor -- report --config examples/supervisor-demo/config.json
```

마지막 상태는 `scope_proposed`, 다음 행동은 `approve-scope or reject-scope`다. 여기까지 TEST/STUB 확인이다. 실제 제품 승인·구현·팀원 실행을 한 것으로 보지 않는다.

## 6. 실제 Gemini 사용: 본인 PC에서 ADC 인증

GCP 프로젝트 `iceu-songpa11`에 Vertex AI 사용 권한과 API 활성화가 필요하다. Google Cloud CLI 설치 후 **모델을 실행할 같은 PC·사용자 계정**에서 다음 명령을 실행한다.

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project iceu-songpa11
$env:GOOGLE_CLOUD_PROJECT = "iceu-songpa11"
$env:GOOGLE_CLOUD_LOCATION = "global"
```

열린 본인 브라우저에서 로그인·권한 확인을 마친다. quota-project 설정이 거부되면 해당 프로젝트의 사용 권한을 확인한다. `gcloud auth login`과 **application-default login**은 용도가 다르며, 이 프로그램은 ADC를 사용한다.

ADC는 gcloud가 로컬 사용자 설정 폴더에 저장하고 SDK가 읽는다. 인증 코드·토큰·ADC 파일 본문을 채팅이나 저장소에 보내지 않는다. Cloud의 `/workspace/.gcloud-adc/...` 경로는 이 실행 환경 전용이므로 로컬 PC에 그대로 복사하지 않는다. 기존 ADC가 유효하면 매번 다시 로그인할 필요는 없다.

## 7. 본인용 새 실행 설정 만들기

예제 config의 실제 인수 projectId를 그대로 재사용하지 않는다. 아래는 현재 PowerShell 세션에서 고유한 새 ID와 설정 파일을 만든다. 이 설정에는 인증 비밀을 넣지 않는다.

```powershell
$localRunId = "my-supervisor-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$localConfig = Get-Content examples/supervisor-todo-gemini/config.json -Raw -Encoding UTF8 | ConvertFrom-Json
$localConfig.projectId = $localRunId
$localConfigPath = "examples/local-$localRunId.json"
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $localConfigPath), ($localConfig | ConvertTo-Json -Depth 10), $utf8WithoutBom)
$localRequestPath = "examples/request-$localRunId.md"
Copy-Item examples/supervisor-todo-gemini/request.md $localRequestPath
```

Writer/Reviewer는 예제의 `vertex-ai` / `gemini-3.8-flash`, maxIterations5, requireUserApproval=true를 유지한다. projectId는 영문·숫자·하이픈 등 안전한 ID를 사용한다. 요청 파일은 원하는 내용으로 UTF-8 저장해도 된다. JSON은 특히 **UTF-8 BOM 없이** 저장한다. 위 파일 생성 방식은 Windows PowerShell 5.1의 기본 JSON 저장 인코딩 문제를 피한다.

PowerShell을 닫았다 다시 열면 위 변수가 사라진다. 이미 만든 설정을 계속 쓸 때는 새 ID를 만들지 말고 기존 파일 경로를 다시 지정한다.

```powershell
Get-ChildItem examples/local-*.json
$localConfigPath = "examples/local-my-supervisor-실제기존ID.json"
$localRunId = (Get-Content $localConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json).projectId
$localRequestPath = "examples/request-$localRunId.md"
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
```

새 터미널에서는 6절의 GCP 환경 변수도 다시 설정한다.

## 8. 실제 요청 → 질문 → Scope → 기획 → 작업 지시

### 8-1. 요청 등록과 질문

```powershell
npm.cmd run supervisor -- start --config $localConfigPath --file $localRequestPath
npm.cmd run supervisor -- questions --config $localConfigPath
```

모델 요청 명령은 보낼 문맥을 보여주고 **CALL**을 요구한다. 비용이 발생할 수 있으므로 내용을 확인한 뒤 터미널에 직접 입력한다. 질문·Scope·기획·작업 제안이 실제 모델을 호출한다. 질문의 개수와 ID는 응답에 따라 달라진다.

질문에 답할 JSON 파일을 만든다. 아래 빈 파일을 연 뒤 실제 출력된 Q-ID와 본인 답변을 넣고 저장한다.

```powershell
$localAnswersPath = "examples/answers-$localRunId.json"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $localAnswersPath), "{}", $utf8WithoutBom)
notepad $localAnswersPath
```

형식 예시이며 실제 질문/답변으로 바꿔야 한다:

```json
{
  "Q-1": "실제 첫 질문에 대한 답변",
  "Q-2": "실제 두 번째 질문에 대한 답변"
}
```

```powershell
npm.cmd run supervisor -- answer --config $localConfigPath --file $localAnswersPath
npm.cmd run supervisor -- propose-scope --config $localConfigPath
npm.cmd run supervisor -- report --config $localConfigPath
```

일부만 답해도 저장되지만 모든 질문에 답해야 Scope를 제안한다. 이미 답한 ID는 덮어쓸 수 없으므로 추가 답변 파일에는 아직 답하지 않은 ID만 넣는다.

### 8-2. Scope 승인과 기획 실행

```powershell
npm.cmd run supervisor -- approve-scope --config $localConfigPath --reason "이 버전의 포함/제외 기능과 제약을 검토함"
npm.cmd run supervisor -- plan --config $localConfigPath
npm.cmd run supervisor -- report --config $localConfigPath
```

승인 명령이 보여주는 정확한 `APPROVE ... v...` 문구를 읽고 입력한다. Scope 버전은 고정 숫자가 아니므로 예제 번호를 외워 입력하지 않는다. 동의하지 않으면 `reject-scope --reason "이유"`를 사용한다. Scope 승인은 최종 기획 승인과 별개다.

Writer/Reviewer가 한도 내에서 기획·검토·수정을 진행한다. 새 리뷰는 요구별 근거·점검표와 필요할 때 추가 반례 점검을 사용한다. **maxIterations는 기획 반복 한도이며 모델 요청 총수는 아니다.** Reviewer 절차당 최대2회 모델 요청이 발생할 수 있다. 역할의 pass는 사용자 승인이 아니다.

### 8-3. 최종 기획 승인과 작업 지시 확인

report.nextAction이 `approve-plan`이고 해당 기획을 검토해 동의할 때 진행한다.

```powershell
npm.cmd run supervisor -- approve-plan --config $localConfigPath --reason "이 기획 버전의 동작과 제안 사항을 검토함"
npm.cmd run supervisor -- propose-tasks --config $localConfigPath
npm.cmd run supervisor -- report --config $localConfigPath
```

명령이 보여주는 기획 ID/버전에 맞는 승인 문구를 입력한다. 작업 제안은 **향후 개발 지시 데이터**다. 현재 범위에서는 여기서 멈추며 `initialize-tasks`, 담당자 지정, 팀원 실행으로 자동 진행하지 않는다. 제안된 미래 제품의 `npm run dev` 등을 ADTF 루트 명령으로 혼동하지 않는다.

## 9. 수정하거나 중단 후 이어가기

Reviewer API 실패로 reviewing에 남은 저장 기획은 [진단·수정본 적용·명시적 재시도](reviewer-request-recovery-20261109.md)를 따른다. 수정 PR이 main에 머지됐는지 먼저 확인한다. `retry-review --reason "이유"`는 프로젝트당 한 번 예약하며 현재 초안을 재사용한다. 재실패·중단 시 예약을 지우거나 자동 반복하지 않는다.

먼저 같은 설정으로 현재 상태를 읽는다.

```powershell
npm.cmd run supervisor -- report --config $localConfigPath
```

| 상태/요청 | 이어갈 방법 |
| --- | --- |
| 질문 답변 대기 | 아직 답하지 않은 ID만 `answer`로 기록 |
| Reviewer 추가 질문 | `collect-feedback` → 실제 새 질문에 `answer` → `resume-plan` |
| 최종 승인 전 같은 Scope의 기획 수정 | `request-plan-revision --reason "수정 내용"` → `resume-plan` → 새 버전 검토·최종 승인 |
| 작업 초기화 전 지시 수정 | `revise-tasks --reason "수정할 내용"`; 기존 승인 출처와 이전 제안 보존 |
| Scope 변경 필요 | 작업 제안 전 `request-scope-change` → `propose-scope-change` → 변경/새 Scope 승인 또는 거절 → 필요 시 `resume-plan` |
| 모델 호출 중 중단, drafting/reviewing, started continuation | 자동 재호출하지 말고 상태·잠금·오류·완료 receipt 확인. 일반 `plan`이나 `start`를 다시 실행하지 않음 |
| limit_reached | 설정을 바꿔 예산을 초기화하지 않음. 기존 결과를 보존하고 후속 시험 범위를 결정 |

같은 프로젝트에 기획·개발 명령을 동시에 실행하지 않는다. 사용 중인 프로세스가 있는지 확인하지 않고 lock을 삭제하지 않는다. 호출 도중 중단의 자동 재생은 지원하지 않는다. 자세한 재개 경계는 [지휘자 사용법](supervisor-workflow.md)을 따른다.

## 10. 기록과 흔한 문제

기록은 `.adtf/projects/<projectId>/`의 supervisor, planning, scope 아래에 있고 승인 레코드는 `.adtf/approvals/`에 있다. 모델 사용량은 supervisor/usage.jsonl과 planning/usage.jsonl에서 본다. API 응답 파싱 success가 Controller 수락이나 제품 완료를 의미하지 않는다. 공급자가 제공하지 않은 토큰 수는 추정하지 않는다.

| 증상 | 확인할 점 |
| --- | --- |
| `npm` 실행 정책 오류 | PowerShell에서 `npm.cmd` 사용 |
| `node`, `npm`, `gcloud`를 못 찾음 | 설치 후 터미널 재시작, PATH와 버전 확인 |
| npm 캐시 경로/권한 오류 | 사용자에게 쓰기 가능한 캐시 지정. 예: `npm.cmd ci --cache "$env:TEMP\adtf-npm-cache"` |
| JSON 파싱 오류 | JSON 문법, `.json` 확장자, UTF-8 BOM 없는 인코딩 확인 |
| `Project already exists` | 기존 프로젝트는 report로 확인, 새 시험만 새 projectId 사용 |
| ADC/401 | 같은 PC·사용자에서 ADC 로그인 확인 |
| 403 | 해당 프로젝트의 Vertex AI API 활성화/사용 권한·quota project 권한 확인 |
| 404 | config의 모델 ID와 `global` 위치 및 프로젝트의 모델 이용 가능 여부 확인 |
| 429 | 할당량/속도 제한 확인. 저장 상태를 확인하고 무작정 반복 호출하지 않음 |
| 확인 입력 EOF/불일치 | 명령을 일반 대화형 터미널에서 실행해 표시 문구를 직접 입력. 승인/CALL 입력을 파이프로 미리 흘리지 않음 |
| nextAction=initialize-tasks, completed=false | 작업 지시 제안만 있고 실제 제품 작업을 시작하지 않은 정상 상태일 수 있음 |

Git/ZIP에는 실행 중인 Cloud의 `.adtf`나 ADC가 포함되지 않는다. 이 환경의 인수 데이터를 받은 소스에서 자동으로 이어받는다고 가정하지 않는다. 보존된 체크포인트는 승인/해시/프로젝트 결합을 확인해야 하는 기록이며 이 가이드는 자동 복원을 수행하지 않는다.

## 11. macOS/Linux 차이

소스 받기·설치·오프라인 데모는 `npm.cmd` 대신 `npm`을 사용한다.

```sh
npm ci
npm run typecheck
npm test
npm run planning:demo

gcloud auth application-default login
gcloud auth application-default set-quota-project iceu-songpa11
export GOOGLE_CLOUD_PROJECT=iceu-songpa11
export GOOGLE_CLOUD_LOCATION=global
```

새 설정을 만들 때는 Node의 UTF-8 파일 기록을 사용할 수 있다.

```sh
export ADTF_LOCAL_RUN_ID="my-supervisor-$(date +%Y%m%d-%H%M%S)"
node --input-type=module -e 'import fs from "node:fs"; const c=JSON.parse(fs.readFileSync("examples/supervisor-todo-gemini/config.json","utf8")); c.projectId=process.env.ADTF_LOCAL_RUN_ID; fs.writeFileSync(`examples/local-${c.projectId}.json`,JSON.stringify(c,null,2)+"\n","utf8");'
export ADTF_LOCAL_CONFIG="examples/local-${ADTF_LOCAL_RUN_ID}.json"
```

이후 같은 Supervisor 명령의 `--config`에 `"$ADTF_LOCAL_CONFIG"`를 전달한다. 회사/실행 환경 프록시를 쓰는 Node24 환경에서는 기존 HTTP_PROXY/HTTPS_PROXY·CA 설정을 유지하고 필요 시 `node --use-env-proxy dist/src/cli/supervisor.js ...` 형태로 실행한다. Cloud 내부 프록시 주소를 개인 PC의 일반 설정으로 복사하거나 인증서 검증을 끄지 않는다.

## 12. 이 가이드의 검증 범위

현재 소스를 별도 빈 폴더로 내보내고 `.git`, `.adtf`, node_modules와 인증 파일 없이 설치했다. Cloud의 기본 npm 캐시 경로가 없어 첫 설치가 실패했지만 작업용 writable 캐시를 지정한 `npm ci`는 42개 패키지 설치·typecheck·전체 132개 테스트·오프라인 Planning 데모를 통과했다. ADC/프로젝트 환경 변수를 제거한 상태에서도 Supervisor 질문·답변·Scope 제안·report를 실행해 승인 대기와 Worker 미연결을 확인했다.

검증한 호스트는 Cloud Linux/Node24이며 Windows PowerShell 자체를 실행한 결과는 아니다. 실제 Gemini의 GCP/ADC 연결은 본 인수 작업에서 사용했지만 로컬 PC 로그인 성공을 대신 보장하지 않는다. 설치 및 실행 검증 기록은 [별도 기록](acceptance/local-guide-smoke-20261109.json)에 남긴다.
