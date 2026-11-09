# Cloud에서 Gemini ADC 사용을 위한 환경 설정

> 최신: ADC 로그인 및 SDK 갱신이 완료됐고 실제 Gemini 제안 호출에 성공했다. 현재 로그인 재시작이 필요한 상태가 아니다. 사용자 앱에는 Desktop 항목이 없어 Cloud 터미널에서 공식 원격 인증을 실행했고, 코드는 TTY에만 입력했다. [현재 인수 보고서](supervisor-live-acceptance-20261108.md)를 우선한다. 아래 미설정/로그인 대기 설명은 이전 시점의 진단 이력이다.

> 2026-11-08 17:52 한국 시간 재확인: 새 실행기에 프로젝트·위치 변수와 Google 호스트 허용 정책이 적용됐다. CLI 접속은 성공했으며 ADC는 아직 없다. gcloud 592.0.0 설치 및 localhost 브라우저 회수 흐름까지 준비했다. 프록시 지정 Chromium 실행은 사용자 승인 후 수행했다. Cloud CA도 사용자 승인 후 로그인용 프로필의 Trusted Certificates에 등록했고 Google Auth Library 화면을 열었다. 사용자 Windows Codex UI에는 Desktop 항목이 없어 기존 localhost 흐름은 종료했다. 현재는 Cloud 터미널에서 `/workspace/scratch/adtf-adc-login.sh`를 직접 실행하고 PC 브라우저로 로그인하는 공식 원격 인증 흐름을 안내한다. 반환 코드는 Cloud 터미널에만 입력하며 채팅으로 받지 않는다. [최신 실행 근거](gemini-acceptance-status.md)를 우선한다. 아래 미설정 설명은 이전 환경의 확인 기록이다.

확인: 2026-11-08 16:16 (한국 시간)

사용자는 실제 Gemini 인수 시험을 Cloud에서 실행하도록 선택했다. 현재 적용된 실행 환경에는 GCP 인증·런타임 변수가 없고 Google API 접속이 제한되어 있다. 이 대화에 제공된 환경 도구는 조회만 지원하며 변경 요청·초안 저장 도구는 없다. `cloud-environment-runtime` 안내에 따라 환경 설정 화면에서 인증 연결과 네트워크 정책을 적용해야 한다.

## 설정할 값

현재 작업에 연결할 Cloud 환경의 설정을 연다. 조회 가능한 저장 환경 이름은 `create_agent`다. 저장 환경의 변경이 현재 실행 인스턴스에 적용되는지는 별도 확인이 필요하므로, 저장 직후 실행 준비가 끝났다고 가정하지 않는다.

### 일반 환경 변수

| 이름 | 값 |
| --- | --- |
| GOOGLE_CLOUD_PROJECT | iceu-songpa11 |
| GOOGLE_CLOUD_LOCATION | global |

이 값들은 비밀정보가 아니다. 프로젝트 코드에서 GOOGLE_CLOUD_PROJECT는 Vertex AI 프로젝트, config.json의 projectId는 ADTF 인수 데이터의 식별자이며 각각 유지한다.

### 외부 접속 허용

기존 패키지 관리자 허용 설정과 다른 항목을 유지하고 다음 호스트를 추가한다.

```text
aiplatform.googleapis.com
oauth2.googleapis.com
sts.googleapis.com
iamcredentials.googleapis.com
```

Vertex AI 생성 요청은 aiplatform.googleapis.com을 사용한다. 사용자 ADC 토큰 갱신은 oauth2.googleapis.com을 사용하며, 연합 인증·서비스 계정 위임을 사용하는 GCP 연결은 sts.googleapis.com 및 iamcredentials.googleapis.com을 사용할 수 있다. 환경에서 직접 브라우저 로그인을 실행하는 방식이 필요할 때 accounts.google.com 등의 로그인 대상은 실제 인증 경로를 확인해 추가한다.

### GCP 인증 연결

설정 화면에 GCP 계정/클라우드 인증 연결이 있으면 Vertex AI를 사용할 수 있는 GCP 연결을 설정한다. Google SDK가 ADC로 읽을 수 있는 자격 증명이 실행 환경에 제공되어야 한다. 계정 연결 기능이 없다면, 해당 화면의 지원 방식부터 확인하고 환경의 비밀 파일 기능으로 ADC를 제공하는 방식을 정한다. 인증 파일·토큰은 채팅이나 Git 저장소로 전달하지 않는다.

환경이 ADC 파일을 주입하는 경우 GOOGLE_APPLICATION_CREDENTIALS는 **실제로 주입된 파일의 절대 경로**를 가리켜야 한다. 존재하지 않는 예시 경로를 넣지 않는다. 관리형 GCP identity가 제공되면 연결 메타데이터의 실제 credentials_file/config_dir를 확인해 사용할 수 있다. 이전 Windows ADC는 Cloud로 자동 이전되지 않는다.

브라우저 인증이 필요한 방식이 확정되면 실행 환경에서 gcloud를 설치·실행하고 사용자에게 로그인 단계만 요청한다. 현재는 API 접속과 인증 연결 방식이 미설정이므로 gcloud 로그인부터 반복하지 않는다.

## 설정 화면 확인이 필요한 이유

현재 도구에서 환경 설정 UI의 인증 옵션·파일 주입 기능·변경 적용 버튼은 조회되지 않는다. 확인하지 않은 메뉴나 저장 기능을 있다고 단정하지 않는다. 설정을 안내하려면 해당 환경의 인증/연결 및 네트워크 접근 화면이 필요하다. 화면을 공유할 때 비밀값은 가린다.

## 설정 후 제가 확인할 내용

1. 환경 상태를 다시 조회해 새 설정 버전과 관찰 결과를 확인한다. 현재 인스턴스에 적용되지 않았다면 환경의 적용/재연결 흐름을 따른다.
2. 인증 연결과 런타임 변수의 준비 상태, 실제 ADC 파일 경로 유무를 확인한다. 자격 증명 본문은 출력하지 않는다.
3. 새 프로세스로 API/OAuth 접속과 SDK 인증을 확인하고, 실패가 환경 프록시인지 Google의 인증/IAM 응답인지 구분한다.
4. 현재 Cloud의 인수 프로젝트는 이미 intake(revision 1)까지 등록되어 있으므로, 같은 실행 데이터가 유지되면 questions부터 실제 시험을 이어간다. 새 환경 인스턴스라면 인수 상태를 먼저 조회한다.

현재 실제 Gemini 모델 요청이나 사용자 Scope/Plan 승인은 실행하지 않았다. 기존 실행 상태는 [인수 현황](gemini-acceptance-status.md)에 기록했다.

## 현재 Cloud의 Node 실행 주의점 (2026-11-08)

Node 24.22.1의 기본 fetch는 inherited proxy를 자동 사용하지 않아 Google API HEAD에서 EAI_AGAIN이었다. `node --use-env-proxy`로는 같은 호스트가 TLS 검증을 유지하며 HTTP 404를 반환했다. 현재 Cloud에서 실제 Gemini CLI는 다음 형태로 실행한다. ADC 파일 생성 및 인증 성공을 먼저 확인해야 하며 404만으로 모델 사용 권한을 판정하지 않는다.

```sh
GOOGLE_APPLICATION_CREDENTIALS=/workspace/.gcloud-adc/application_default_credentials.json node --use-env-proxy dist/src/cli/supervisor.js questions --config examples/supervisor-gemini/config.json
```

브라우저는 별도 프록시·CA 준비가 필요했고 사용자 승인 후 설정했다. 토큰 출력 명령을 검증 근거로 사용하거나 인증 파일을 Git에 추가하지 않는다.
