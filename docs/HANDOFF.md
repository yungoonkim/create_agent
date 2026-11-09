# ADTF 개발 인수인계

마지막 정리: 2026-11-09 (Asia/Seoul)
개발 환경: Codex Cloud `/workspace/create_agent`

## 최신 작업 — 단일 작성/ADTF 익명 비교 준비, 실제 생성 대기

사용자가 같은 모델·같은 요구로 기획 품질을 비교하고 중요한 비교 기록을 보존하도록 요청했다. [사전 고정한 비교 계획](planning-comparison-protocol-20261109.md), [일괄 실행 안내](../examples/planning-comparison/README.md), [준비·검증 기록](acceptance/planning-comparison-20261109/preflight-20261109.json)을 먼저 읽는다. **실제 비교 모델 호출0회이며 품질 우열 결론은 아직 없다.**

- 새 장보기/생활비/주간 식단 주제별2회, 총6쌍. 동일한 최초 Writer 초안을 양쪽이 공유하고 ADTF에만 현재 Reviewer·정책·수정을 추가한다. 평가 한도는 최대3회이며 운영 샘플5회와 다르다. 생산 코드·프롬프트는 변경하지 않았다.
- 생성 최대54 SDK 호출. 선택적 Gemini 보조 채점/감사까지 총66회. 기본 실행은 추가 유료 채점을 하지 않으며 OpenAI API도 추가하지 않았다. TEST/STUB fixture만 격리하고 실제 사용자 승인·제품/팀원 실행은 없다.
- 주 평가자는 진행자 Codex다. `blind/` 후보만 읽고9기준·근거·점수를 `seal-manual`로 봉인한 뒤 지적과 수정 전후를 감사하고 `seal-feedback` 후 공개한다. 대응표·모델 판정·사용량을 먼저 열지 않는다. 외부 사람 패널/완전한 이중 맹검이라고 주장하지 않는다.
- 원응답·실패·모든 버전·검토 이유·사용량·요금표·평가표·대응표·해시를 보존한다. 실패/중단을 성공으로 세거나 같은 유료 단계를 자동 재생하지 않는다. 동일 본문 점수 차이는 평가자 잡음으로 별도 기록한다. 최종 기록은 평가 후 Git에 함께 남긴다.
- `npm run typecheck` 및 전체142개 테스트 통과(Linux, 신규5개 포함). 가짜 전체 실행·봉인·감사·공개·압축·변조 탐지를 검증했고 임시 시험 데이터는 정리했다. Windows 실모델 비교 실행은 아직 확인하지 않았다. 기존 실제 todo20파일·재고17파일 체크포인트 해시가 일치한다.
- Cloud ADC 재인증 필요. 공식 HTTPS 로그인 준비도 공유 브라우저의 `Browser Use could not read requirements`로 실패했고 인증 우회·사용자 코드/토큰 수집은 하지 않았다. 기존 ADC로 성공한 사용자 PC에서 새 소스 폴더로 일괄 생성 후 결과 `.tar.gz` 하나를 받으면 평가를 계속할 수 있다. 옛 승인 프로젝트/설정을 새 실험에 복사하지 않는다.
- 업로드 아카이브는 경로 탈출/심볼릭 링크를 검사하고 데이터로만 가져온다. 업로드된 스크립트를 실행하지 않는다. 생성 당시 PC와 채점하는 Cloud의 `.adtf` 보호 확인은 구분한다. 기존 완료 프로젝트를 재실행하지 않는다.

## 최신 완료 — Windows 로컬 기획 v4 최종 승인 저장 확인

사용자가 최종 상태 화면을 제공했고 status=user_approved/currentPlanVersion4/iterationCount4/maxIterations5가 확인됐다. [최종 보고서](windows-planning-final-acceptance-20261109.md), [상태 관찰](acceptance/windows-review-retry-20261109/final-state-observed.json)을 우선한다. **이번 ‘개인용 로컬 웹 할 일 관리 도구’ 기획 작성·검토·수정·최종 승인 시험은 완료다.**

- 승인된 원문은 [기획 v4](acceptance/windows-review-retry-20261109/plan-v4.json), 승인 Scope는 v4다. 남은 반복1회를 소진하거나 approve-plan/plan/resume/retry를 다시 실행할 필요 없다.
- 사용자 PC의 저장 상태 화면으로 확인한 것이며 전체 state/approval 파일은 받지 않았다. Cloud .adtf에 사용자 로컬 프로젝트를 복원하거나 승인 레코드를 대신 생성하지 않는다.
- 작업 지시 생성은 별도 단계이며 제품 코드·팀원 실행·ADTF 웹 UI 구현은 진행하지 않는다. 기존 Cloud 재고/할 일 두 프로젝트와 이번 Windows 프로젝트를 구분한다. 아래 승인/확인 대기 문구는 이전 시점 이력이다.

## 최신 사용자 보고 — 기획 v4 최종 승인 실행, 저장 상태 마지막 확인 대기

사용자가 정확한 `APPROVE my-supervisor-20261109-112551-plan v4` 문구까지 실행 완료했다고 보고했다. [최종 로컬 기획 보고서](windows-planning-final-acceptance-20261109.md), [승인 완료 사용자 보고](acceptance/windows-review-retry-20261109/final-approval-user-report.json)를 우선한다. 승인 결정은 사용자 보고로 확인했으며 승인 후 state/approval 파일 자체는 아직 받지 않았다. 마지막 직접 상태 관찰은 기획4/반복4/5/awaiting_approval이다. 이 둘을 섞어 사용자 PC의 저장 상태까지 확인했다고 쓰지 않는다.

- 다음 로컬 확인은 planning/state.json을 Get-Content -Raw -Encoding UTF8로 직접 읽어 status=user_approved/currentPlanVersion4/iteration4/max5인지 짧게 확인하는 것이다. 모델 호출·승인 재실행·예산 소진이 필요하지 않다.
- v1 challenge400 → 수정83ea913/PR7 → v2 정책 차단 → Q7 보완 v3 → 사람의 날짜/다중 탭 추가 점검 → 사용자 선택 반영 v4 → 사용자 승인 완료 보고까지 기록했다. Windows 자동 검사137개 중135통과/2제외/실패0. 원문 v3/v4 한글은 정상이며 파이프 요약만 깨진 경우를 구분했다.
- 모델의 headline pass, 코드의 차단, 진행자 발견, 사용자 수정/승인 출처를 구분한다. v1 Review와 전체 로컬 usage는 받지 않아 총 호출/비용/자체 revise 횟수는 추정하지 않는다.
- 사용자가 현재 목표를 기획안 완성으로 재확인했다. 이번 로컬 기획 승인 시험을 종료 확인하며, 작업 지시 제안은 별도 단계다. 제품 구현·팀원 실행·ADTF 웹 UI 구현을 자동 진행하지 않는다. 웹 UI 대화는 가능성 설명이었다.
- 보존된 Windows 근거 파일은 docs/acceptance/windows-review-retry-20261109에만 둔다. 기존 Cloud .adtf의 두 프로젝트와 합치거나 사용자 승인 파일을 대신 생성하지 않는다. 아래는 시점별 이력이다.

## 최신 수동 검토 — 기획 v4 보완 확인, 최종 사용자 승인 대기

사용자가 정상 종료·awaiting_approval·기획4·iteration4/5 요약과 원본 [v4.json](acceptance/windows-review-retry-20261109/plan-v4.json)을 제공했다. [읽기용 v4](acceptance/windows-review-retry-20261109/plan-v4.md), [진행자 검토](acceptance/windows-review-retry-20261109/manual-review-v4.json)를 보존했다. UTF-8/한글·프로젝트/Scope 버전이 맞고 날짜 검증·단일 변경 탭 정책과 기존 Q-7 보호 규칙이 기능·검증 본문에 반영됐다. 이번 기획 인수 범위에서는 최종 사용자 승인 대상으로 권고한다. **아직 최종 승인한 것은 아니다.**

- 날짜 형식·실제 달력·윤년·시분 범위를 등록/수정/로드/후보 저장에 검증하고 잘못된 저장값 원본 보존·쓰기 차단을 명시했다.
- 같은 localhost:8080 origin/프로필에서 실제 Web Locks 소유 탭만 변경, 비소유/미지원 차단, 사용 탭 종료 후 새로고침·잠금 획득·최신 데이터 재로드, 두 탭 검증 사례를 명시했다. 원래 기능6개와 제외 범위를 유지한다.
- 구현 시에는 잠금 콜백을 탭의 변경 권한 수명 동안 유지하고 잠금 획득 뒤 최신 데이터를 로드하는 등 선언된 동작을 충족해야 한다. 실제 제품 코드/브라우저 동작을 시험했다는 의미가 아니다. Web Locks는 origin/프로필 범위이며 OS 전역 잠금으로 해석하지 않는다.
- 다음 로컬 단계는 approve-plan으로 정확한 기획 v4에 대한 사용자 승인을 기록하고 그 상태를 확인하는 일이다. 사용자가 현재 목표를 기획안 작성·검토로 재확인했으므로 제품/팀원 실행은 하지 않으며, 작업 지시 제안은 별도 단계로 구분한다. 일반 plan/resume/retry를 반복하지 않는다. 남은 반복1회를 승인에 소비하지 않는다.

## 최신 사용자 결정 — v4 날짜 검증·한 탭 변경 정책 보완 진행

사용자가 v3 보완 2건과 추천한 동시 한 탭 변경 정책에 동의하고 진행을 지시했다. [구체적 수정 요청](acceptance/windows-review-retry-20261109/v4-revision-request.md)을 보존했다. 사용자가 실행할 request-plan-revision → resume-plan은 아직 실행 결과를 받지 않았다. 현재 마지막 확인 상태는 v3/3회 사용/최종 승인 pending이다.

- 날짜는 단순 문자열 여부를 넘어 실제 달력 날짜/시·분을 등록·수정·로드·저장 후보에 공통 검증한다. 잘못된 저장값 원본 보존·쓰기 차단을 유지한다.
- 한 origin/브라우저 프로필에서 한 탭만 실제 배타 잠금으로 변경 권한을 갖고, 다른 탭은 안내·변경 차단한다. 주 탭 종료 뒤 새로고침하여 최신 데이터 재로드 후 사용한다. 기술적으로는 Web Locks 등 실제 배타 방식·고정 origin/지원 조건·미지원 시 차단을 기획에 구체화한다. API 선택은 기획 설계이며 사용자가 API 자체를 지정했다고 기록하지 않는다.
- 다음 로컬 시험은 v4 보완/재검토 → 내용 검토 및 최종 사용자 승인 → 작업 지시 제안/검증 → 문서 마무리다. 현재 기획 총 한도에서2회 남았고, 모델 API 요청 횟수와 논리적 반복은 구분한다. 제품 브라우저 구현/팀원 실행 시험은 포함하지 않는다.
- 사용자에게 제공하는 다음 실행 블록은 저장 JSON을 Get-Content -Raw -Encoding UTF8로 직접 읽어 짧은 요약을 만든다. Node stdout을 PowerShell ConvertFrom-Json으로 넘기는 이전 인코딩 문제 경로는 사용하지 않는다.

## 최신 수동 검토 — v3 원문 한글 정상, 승인 전 보완 2건

사용자가 원본 [v3.json](acceptance/windows-review-retry-20261109/plan-v3.json)을 제공했다. UTF-8 JSON/예상 projectId·Scope v4·Plan v3가 맞고 한글은 정상이며 대체문자0이다. 앞선 깨짐은 콘솔/PowerShell 요약 경로 문제였고 원본에서 재현되지 않았다. [읽기용 원문](acceptance/windows-review-retry-20261109/plan-v3.md), [진행자 검토](acceptance/windows-review-retry-20261109/manual-review-v3.json)를 보존했다.

- Q-7의 기존 비정상 값 원본 보존·쓰기 차단, 읽기 예외, 단일 JSON·무결성, 저장 후 메모리/UI 반영과 전원 장애 한계는 반영됐다. 모델 검토 성공 사실은 유지한다.
- 별도 진행자 점검에서는 저장 dueDateTime이 문자열이라는 조건만 있어 실제 날짜/시간 유효성 검증을 로드/변경 후보에도 적용할지 명시가 부족하고, 여러 탭이 같은 이전 목록에서 서로 덮어쓰는 경우의 사용/보호 정책이 없다. 이 두 항목을 승인 전 짧게 보완하도록 권고한다. 이는 Gemini Reviewer 자체 이슈가 아니다.
- 실제 로컬 상태는 v3/iteration3/5/awaiting_approval, 최종 사용자 승인 pending 그대로다. 사용자 승인·새 기획 생성·Scope 수정·제품/팀원 실행은 하지 않았다. 후속 수정은 사용자가 권고를 수용하면 request-plan-revision → resume-plan으로 같은 Scope/남은2회 안에서 수행한다. 새 탭 제한 등은 기획자 제안으로 기록하며 기존 사용자 선택으로 꾸미지 않는다.

## 최신 로컬 관찰 — 기획 v3 승인 대기, PowerShell 요약 인코딩 오류

사용자가 Q-7 보완 답변 → resume-plan 실행 로그를 제공했다. [관찰 기록](acceptance/windows-review-retry-20261109/resume-v3-observation.json)에 성공 상태와 표시 오류를 분리했다. 보고서 전체는 깨진 한글과 줄바꿈이 포함돼 유효한 원문 JSON으로 재구성하지 않았다.

- 로컬 모델 재개 종료코드0, continuation completed. Plan v3 / iteration3/5 / awaiting_approval, review-3 pass/issues[]/challengeCompleted=true, plan approval-b00d7ead-ca59-45ae-ba58-47aef133a2b8 pending, nextAction approve-plan이 출력에 보인다. 최종 승인하지 않았다.
- 이후 진행자 안내 스크립트의 `$reportText | ConvertFrom-Json`에서 오류가 발생하고 요약 필드가 비었다. 네이티브 Node stdout을 Windows PowerShell이 캡처할 때 한글 인코딩이 깨진 것으로 보이며 모델 요청 실패가 아니다. 출력에 깨진 문자를 실제 기획 원문으로 간주하지 않는다.
- 다음은 사용자 PC의 원본 `.adtf/projects/my-supervisor-20261109-112551/planning/plans/my-supervisor-20261109-112551-plan/v3.json` 파일을 받아 UTF-8 원문·보완 반영·품질을 확인하는 일이다. answer/resume-plan/retry-review를 반복하거나 기획을 자동 승인하지 않는다. 원문은 아직 받지 않았다.
- 이후 로컬 상태 요약은 `Get-Content -Raw -Encoding UTF8`로 저장 JSON을 직접 읽거나 Node 안에서 처리해 PowerShell 네이티브 출력 파싱을 피한다. 사용자에게 긴 JSON 복사를 반복 요청하지 않는다.

## 최신 로컬 관찰 — 수정본 Reviewer 재검토 성공, 기획 v2 피드백 대기

사용자가 Windows 재시도 후 report 원문을 제공했다. [보존 report](acceptance/windows-review-retry-20261109/report.json), [기획 v2](acceptance/windows-review-retry-20261109/plan-v2.md), [판정 요약](acceptance/windows-review-retry-20261109/assessment.json)을 우선한다. 이 로컬 기록을 Cloud의 기존 재고/todo .adtf에 복원하거나 합치지 않는다.

- local project my-supervisor-20261109-112551: Scope v4 approved, Supervisor r6 scope_approved, Plan v2 / iteration2/5 / awaiting_user_input / nextAction collect-feedback. 최종 기획 승인·작업 제안 없음.
- reviewRetry는 v1 출처·시각을 보존한다. 현재 Review v2는 challengeCompleted=true로 응답 형식 검토까지 완료됐으며 이전400은 이번 report에서 재발하지 않았다. 사용자 PC에서 수정본 요청 성공이 관찰됐다. 전체 긴 기획/모델 안정성 보장은 아니다.
- headline pass/issues[]이지만 storageAudit의 present_empty=initialize+허용근거 없음, read_error=unspecified를 코드가 차단한다. 이전과 같은 issue-storage-present_empty가 남았다는 state.reason으로 사용자 입력 대기에 진입했다. 제공된 현재 Review를 코드로 재검증해 [미해결 2항목](acceptance/windows-review-retry-20261109/policy-check.json)을 확인했다. v1 Review는 제공되지 않아 반복 비교 자체를 독립 재현했다고 주장하지 않는다.
- 다음 로컬 행동은 collect-feedback(모델 없음) → 새 질문에 실제 보완 답변 → resume-plan(실호출)이다. 일반 plan/start/retry-review 재실행, 데이터/예약 삭제, 기획 승인으로 우회하지 않는다. 같은 Scope와 남은 총 반복3회를 유지한다. 보완 방향은 기존 비정상 값 원본 유지·변경 작업 차단, 읽기 예외의 명시 처리 및 관찰 가능한 검증 사례다.
- 로컬 usage ledger 전체는 받지 않았으므로 총 호출/토큰을 추정하지 않는다. 이 파일들은 사용자 제공 결과 보존이며 Cloud에서 실제 모델 재실행·승인·로컬 데이터 변경은 하지 않았다. 아래 재검증 대기 문구는 이번 관찰 전 시점 기록이다.

## 최신 수정 — Windows Reviewer challenge 400, 로컬 재검증 대기

사용자 Windows main ZIP 실호출에서 Writer/assessment success 후 challenge HTTP400 INVALID_ARGUMENT가 발생했다. 기획 v1은 비공백150줄이다. [진단·적용·복구 안내](reviewer-request-recovery-20261109.md), [검증 기록](acceptance/reviewer-schema-400-20261109.json)을 먼저 읽는다. 아래 완료 보고는 이전 Cloud/소규모 평가 범위이며 이번 로컬 기획의 실제 검토 완료를 뜻하지 않는다.

- 큰 줄 번호 enum을 긴 기획에서 정수 범위로 줄이고 모델에는 비공백 원문 줄만 전달한다. 줄 번호/원문 검증은 유지한다. 요청 복잡도가 원인 후보이며 실제 사용자 요청의 서비스 재현은 미완료다.
- `supervisor retry-review --reason ...`로 reviewing 상태의 저장 기획을 명시적으로 한 번 재검토할 수 있다. 현재 초안 재작성 없이 Reviewer부터 시작하고 revise면 원래 예산 내 정상 수정한다. 최초 assessment는 별도 저장되지 않아 Reviewer 절차는 처음부터 다시 호출한다.
- 재시도 예약·사유·출처 해시·시각을 모델 호출 전에 Planning reviewRetry에 저장하고 변경/삭제를 막는다. 실패/중단 뒤 자동 재호출 금지, 동시 잠금·현재 Scope/기획·예산·최종 사람 승인 유지. 진행 중 continuation/작업 제안 뒤에는 재시도 불가다.
- typecheck/전체137개 테스트 통과(Linux). Windows 기준 예상135통과/2제외/실패0이며 아직 수정본 Windows 결과를 받지 않았다. 기존 실제 todo20파일·재고17파일 체크포인트 해시 일치.
- **Cloud ADC는 현재 invalid_grant/invalid_rapt로 재인증 필요**. Cloud에서 수정 전후 Gemini 성공을 주장하지 않는다. 사용자 PC는 이미 모델 연결이 됐으며 인증 코드를 요구하거나 자격 증명을 복사하지 않는다.
- 사용자 PC 실제 프로젝트 `my-supervisor-20261109-112551`: 질문6/답변/Scope v4 제안 후 기획 v1 저장·검토 중. Scope 승인 전체/report는 로컬에서 재확인. 기존 `.adtf`와 해당 examples 설정/요청/답변을 백업·보존한 뒤 수정 소스만 적용한다. start/plan/Scope 승인 중복 실행 금지. 로컬 실제 재시도 결과를 받아야 시험을 마칠 수 있다.

## 최신 완료 — 저장 복구 검토·새 사례 평가·사용자 문서

사용자가 요청한 지휘자 품질 보완·단독 검증과 문서를 완료했다. [최신 품질 보고서](reviewer-reliability-20261109.md), [계획 대비 구현 현황](plan-vs-implementation-20261109.md), [소스 다운로드/실행 가이드](local-run-guide.md)를 먼저 읽는다. 아래 단계별 승인 대기 문구는 과거 이력이다.

- storageAudit: JSON 5상태의 실제 동작·원문 줄·허용 Scope 근거. 기존 JSON 초기화/덮어쓰기에 근거가 없으면 pass라도 수정. 명시 승인된 캐시 초기화·일반 텍스트의 정상 빈 값은 구분한다. 의미상 근거 적합성은 여전히 모델/사람 판단이다.
- f95fa75 baseline 비교: 회귀 결함 기존3/3, 최종3/3 차단·정상 양쪽3/3. 새6종×2회는 양쪽 결함6/6 차단·정상6/6 승인 단계 도달·형식 실패0. 이번 표본에서 성능 향상을 주장하지 않는다. 최초 회귀1건 형식 실패는 보존하고 새 사례 평가 전에 ID 스키마를 보완했다. 새 사례 출력 확인 후 코드 조정 없음.
- 전체 모델 요청72개/논리 리뷰42회, 중간 실패 포함. [집계](acceptance/reviewer-reliability-20261109/aggregate.json), [Reviewer 사유](acceptance/reviewer-reliability-20261109/reviewer-history.json). 예전 품질94요청·실제 todo13기록과 구분한다. 세 평가 디렉터리는 완료했으므로 재실행하지 않는다. 다음 변경은 별도 새 검증 세트가 필요하다.
- typecheck/132개 테스트 통과. ADC·.adtf 없는 별도 소스 폴더에서 npm ci(쓰기 가능한 캐시), typecheck,132테스트, Fake Planning·Supervisor 입구 실행 성공. Windows 명령은 문서 검토했으나 실제 PowerShell 실행은 하지 않았다. [설치 시험](acceptance/local-guide-smoke-20261109.json).
- 실제 todo 최신20파일·재고17파일 체크포인트 해시 일치. 현재 todo Scope v6/Plan v4 approved·iteration4/5·Supervisor r20 tasks_proposed/6작업, 재고 v4/v3 approved·3/5·r16/5작업 그대로다. 사용자 결정을 다시 실행하거나 과거 체크포인트를 덮어쓰지 않는다.
- 모델/환경은 iceu-songpa11/global, gemini-3.8-flash 양 역할, ADC, Node24 --use-env-proxy. 인증 파일 내용·토큰은 출력하지 않는다. 제품 코드/제품 브라우저 시험·팀원 설계/연결/실행은 보류한다. 커밋 메시지는 한국어다.

## 최신 상태 — 할 일 주제의 기획·작업 지시 단독 인수 완료

사용자가 확인한 ‘v4 확정 → 작업 지시 시험 → 최종 정리’를 완료했다. [최종 인수 보고서](supervisor-todo-final-acceptance-20261109.md), [쉬운 작업 요약](acceptance/todo-final-20261109/work-orders-easy-summary.md)을 우선한다. **Git 커밋 메시지는 앞으로 한국어로 작성한다**(사용자 요청, AGENTS.md에도 반영).

- 실제 todo 상태: Scope v6 approved / Plan v4 user_approved / 반복4/5 / Supervisor revision20 tasks_proposed / 작업6개 / taskRevisions1개. Plan 승인 ID `approval-a3422782-30f5-4fc9-a7bf-3971193373c5` approved. [실제 승인](acceptance/todo-final-20261109/plan-approval.json).
- source hash `eb90453cab264d16c0fcbee44e200a804415ed656313a75b48ae3793ed06c3e1` 유지. Scope/Plan/Review 본문·과거 버전과 재고 프로젝트는 해시가 그대로다.
- 작업 제안3요청: v1 정상 저장 → 첫 수정은 Unknown dependency로 Controller 거부/기존r19 보존 → 재시험 v2 정상 저장/r20. 최종6개 ID와 DAG, REQ-01~07, 테스트 산출물·고정 origin·실패 경계·복원 시나리오를 대조했다. [상세 지시](acceptance/todo-final-20261109/work-orders-v2.md), [진단](acceptance/todo-final-20261109/rejected-revision-attempt.json), [원응답](acceptance/todo-final-20261109/retry-raw-orders.json).
- 검증은 실제 Gemini 생성+Controller 구조/출처 검증+진행자 내용 대조다. 작업 제안에 Planning Reviewer가 추가 호출된 것으로 기록하지 않는다. 첫 거부 응답 본문은 CLI가 저장하지 않아 없고, 재시험은 검증 전 원문을 보존했다. usage success는 JSON 파싱 성공이며 Controller 수락/실행을 뜻하지 않는다.
- 제품 코드·제품 브라우저 테스트·팀원 실행·작업 수락/초기화 없음. report.nextAction=initialize-tasks는 기술적 안내이며 현재 승인 범위의 다음 자동 작업이 아니다. 여기서 멈춘다.
- [최신 체크포인트](acceptance/todo-final-20261109/runtime-checkpoint.json), [report](acceptance/todo-final-20261109/report.json), [사용량](acceptance/todo-final-20261109/usage-summary.json). 이전 todo-20261108 체크포인트는 승인 전 역사 자료라 현재 데이터 위에 복원하지 않는다. retry receipt는 completed이므로 모델/결정을 재실행하지 않는다.
- 프롬프트의 CLI 가정을 승인 제품 인터페이스 기준으로 일반화하고 수정 작업 ID/참조 일치를 명시했다. 최종 typecheck/128개 테스트 통과. 실제 본 실행 모델 기록13개, 작업 요청만3개. 별도 품질 평가94개 요청과 구분한다.

이번 주제까지 대표 기획·지시 인수는 완료다. 남는 개선은 품질 평가의 의미 미검출·미지의 독립 사례다. 팀원/제품 구현은 사용자 재지시 전까지 보류한다. 아래는 앞선 시점의 품질 보완 및 승인 대기 이력이다.

## 최신 작업 완료 — Writer/Reviewer 품질 절차 보완·실제 비교

사용자 요청에 따라 시스템 프롬프트·검토 형식·코드 통과 조건을 보완했다. [최종 보고서](planning-quality-hardening-20261108.md)를 우선한다. todo 기획 v4 최종 승인은 여전히 pending이며 제품 구현·팀원 Agent 작업은 보류다.

- Writer는 사용자 선택/제안/미정 출처, 쉬운 이용 흐름, 요구별 정상/실패/수락 기준, 수정·회귀 점검을 지시한다.
- 새 Gemini Review는 qualityAssessment v1에 필수 요구 전체와 7개 점검의 상태·근거 위치·이유를 제출한다. 현재 기획의 실제 비어 있지 않은 줄 번호만 응답 스키마에서 선택할 수 있고 코드는 원문을 추출·참조 검증한다. 미해결은 모델 pass보다 우선해 수정/질문으로 보낸다.
- 승인 대상으로 넘어갈 때만 독립 반례 검토를 한 번 더 호출한다(동일 모델, 앞 판정은 전달하지 않음). 실패하면 이전 pass를 반환하지 않는다. 논리적 반복 예산은 유지하며 실제 모델 호출은 reviewer 절차당 최대2, usage의 reviewStage로 구분한다. MEDIUM thinking·단계별 출력8,000 한도를 사용한다.
- typecheck/전체 **128개 테스트 통과**. 기존 qualityAssessment 없는 리뷰/fixture는 호환하며 과거 기록을 새 방식으로 검증된 것으로 바꾸지 않는다.
- [동일 고정 사례 최종 비교](acceptance/planning-quality-bounded-20261108/comparison.json): 결함5개×2회 차단이 기존6/10 → 최종9/10, 정상2개×2회는 양쪽4/4 통과, 최종 형식 오류0. **빈 저장 문자열 자동 초기화 결함은 최종1회 놓쳤으므로 의미 품질을 보장하지 않는다.** 개발에 사용한 소규모 세트이며 일반 정확도/통계 검증이 아니다.
- 최종 고정 후보 14회 검토에서 모델 요청 기록은21개(기존14). 모든 중간 실패·재시험·Writer 표본까지94개를 [ledger](acceptance/planning-quality-bounded-20261108/all-usage.jsonl)에 보존했다. 기록된 입력470,294/출력100,451/reasoning181,079; 지표 없는10행은 추정하지 않는다.
- 새로운 Writer 미승인 표본은 [최종 별도 검토](acceptance/planning-quality-bounded-20261108/writer-sample-final-review.json)에서 승인 대상으로 제시 가능 판정이다. 실제 사용자 승인이 아니며 현재 todo v4와 합치지 않는다.
- 평가 스크립트/후보/원본 baseline은 examples/planning-quality-eval에 있다. baseline은951588b의 원본 어댑터다. initial/references/challenge/bounded의 기존 실행 경로는 모두 완료했으므로 재실행하지 않는다. 모델 호출·승인·Planning 재개를 중복 실행하지 않는다.

기존 todo·재고와 관련 승인 파일은 전후 동일하다. todo는 Scope v6 approved / Plan v4 awaiting_approval / 반복4/5 / Supervisor revision17이다. 강화된 별도 평가의 기존 v4는 두 번 모두 통과했으나 정식 과거 Review를 덮어쓰거나 기획 승인을 대신하지 않았다. 이후에는 사용자 결정에 따라 최종 승인 또는 같은 Scope의 남은 예산 내 수정을 진행한다. 상세 상태는 아래와 원래 체크포인트를 본다.

## 새 주제 시험 — 내 할 일 목록 관리, 기획 v4 최종 승인 대기

재고 인수 완료 이력은 아래에 보존한다. 새 projectId `supervisor-todo-acceptance-20261108`, [진행 기록](supervisor-todo-acceptance-20261108.md), [설정](../examples/supervisor-todo-gemini/config.json), [입력](../examples/supervisor-todo-gemini/request.md)을 따른다. 기존 재고 프로젝트 파일은 해시가 그대로이며 서로 합치지 않는다.

- **현재 실제 상태:** Scope v6 approved, Supervisor revision 17 / scope_approved, Planning currentPlanVersion 4 / awaiting_approval / iterationCount 4/5. Plan 승인 ID `approval-a3422782-30f5-4fc9-a7bf-3971193373c5` pending. 작업 제안·제품 구현·팀원 실행 없음.
- 사용자 질문 7개 답변 + Scope 승인 + 상세 질문 3개 답변을 기록했다. 상세 확정은 제목·마감일시 필수/메모 선택, 날짜+시간, 삭제 확인이다. [결정 출처](acceptance/todo-20261108/user-decisions.md)를 본다.
- [기획 v4 쉬운 요약](acceptance/todo-20261108/plan-v4-user-summary.md), [전체 원문](acceptance/todo-20261108/plan-v4.md), [점검](acceptance/todo-20261108/assessment-v4.md)을 사용자에게 제시한다. 직접 확정하지 않은 과거 마감일 허용·단일 탭·저장 기술은 승인 대기 제안이다.
- Reviewer 검토 4회 모두 pass / 자체 revise 0회. 사용자 추가 답변·진행자 점검으로 3회 수정했고 v1~v4와 Review/이유를 [이력](acceptance/todo-20261108/reviewer-history.md)에 보존했다. pass 이후 사람이 발견한 누락을 숨기지 않는다.
- **다음은 사용자 기획 v4 승인 또는 수정 결정.** 이미 Scope 승인한 것을 다시 묻지 않는다. 실제 최종 승인 후에만 approve-plan → propose-tasks를 진행하며 제품 구현·팀원 연결로 확장하지 않는다. 모델 반복은 1회만 남았다. 단순 모델/승인 재실행은 하지 않는다.
- [체크포인트](acceptance/todo-20261108/runtime-checkpoint.json)는 todo 프로젝트와 관련 승인만 포함한다. 실제 데이터 최신 상태를 먼저 확인하고 더 최신 데이터를 덮어쓰지 않는다. 이전 재고/격리 시험 체크포인트와 혼동하지 않는다.

기존 ADC로 모델 호출 성공, GCP iceu-songpa11/global / gemini-3.8-flash / Node 24.22.1 --use-env-proxy 유지. 인증 파일 본문·토큰을 출력하지 않는다. 전체 typecheck/119개 테스트 통과. 이 주제의 실제 모델 호출 10회 성공, 입력 60,107 / 출력 21,496 / reasoning 10,708 / 228,051ms. [사용량](acceptance/todo-20261108/usage-summary.json). 새 주제는 최종 승인과 지시 품질 시험이 남아 있어 아직 전체 완료로 선언하지 않는다.

## 최신 상태 — 지휘자 단독 대표 인수 완료

- 브랜치 `docs/supervisor-only-acceptance`. 구현 체크포인트 `3fef309`, typecheck 및 **119개 테스트** 통과. [최종 인수 보고서](supervisor-final-acceptance-20261108.md)를 우선한다.
- **primary 실제 상태:** 사용자 승인 Scope v4 / Plan v3, planning user_approved / iterationCount 3/5. Supervisor revision 16 / tasks_proposed, 작업 제안 5개 / taskRevisions 2개. [최종 지시서](acceptance/2026-11-08/primary-work-orders-v3.md). primary 작업 초기화·제품 구현·팀원 실행 없음.
- 질문·Scope 지침, 안전한 실패 분류, 승인 대기 기획 수정과 재개, 미수락 작업 재제안 이력, 확인 stdin EOF 실패를 개선했다. 기존 원문·승인·버전·총 예산을 보존한다.
- [승인 출처 정책 시험](acceptance/2026-11-08/approved-source-policy-fixture.json): 선행 조건/근거 부족 거부, 재작업·한도, 환경 차단·품질 카운터 구분과 사실에 맞는 보고 확인. TEST/STUB 텍스트만 사용했다.
- [독립 실제 모델 재현](acceptance/2026-11-08/approved-scope-replay-20261108/result.json): 새 Writer v1 → Reviewer revise(major 2) → Writer v2 → Reviewer pass, 2/5. 이 후보는 최종 사용자 승인하지 않았고 primary 승인 기획을 대체하지 않는다.
- 사용자가 시험 Scope v5 원문을 검토하고 **두 격리 분기 실행을 승인했으며 시험 완료**했다. [결과](acceptance/2026-11-08/scope-change-test/results.json): 거절은 Scope v4/독립 Plan v2·2/5 유지, 모델 미호출. 승인은 시험 Scope v5/새 Plan v3·Reviewer pass·3/5이며 새 기획 최종 승인 pending. 양 분기에서 과거 스냅샷·총 예산을 보존했고 실제 primary는 그대로다. 시험 요구는 N 생략 시 기본 7일이며 실제 제품 변경으로 채택하지 않았다.
- 실제 Reviewer 검토 **6회 / 수정 요청 1회**. 사유·심각도·관련 요구·수정 방향·원문은 [Reviewer 이력](acceptance/2026-11-08/reviewer-history.md)에 보존했다. primary v1→v2→v3의 수정은 사용자·진행자 요청이므로 Reviewer 자체 요청 횟수와 구분한다.
- 전체 모델 어댑터 호출 21회(성공 20/실패 1), 제공 토큰 입력 137,489 / 출력 38,749 / reasoning 16,901, 호출 시간 410,995ms. [집계](acceptance/2026-11-08/model-usage-summary.json)는 복사 ledger 중복을 제거하며 미제공 지표를 추정하지 않는다.

### 재개 시 경계

현재 사용자 목표인 사람 승인형 CLI 지휘자·기획자 구현과 재고·유통기한 대표 단독 인수는 완료했다. 팀원 Agent 설계·개발·연결·제품 구현은 사용자 재지시 전까지 보류한다. `report.progress.completed=false`는 제품 작업 미완료 의미이며 이번 지휘자 인수 판정과 다르다. 모델 pass는 사람 승인이나 무인 품질 보장이 아니다.

완료한 모델/결정 스크립트를 재실행하지 않는다. 격리 데이터는 `/workspace/scratch/approved-scope-replay-20261108`, `approved-scope-change-reject-20261108`, `approved-scope-change-approve-20261108`에 각각 있다. projectId는 기존 genuine Scope 승인 결합을 유지하기 위해 같지만 물리 메모리 루트와 실행 ID는 다르다. [원본 격리 체크포인트](acceptance/2026-11-08/scope-change-test/runtime-checkpoint.json), [거절 분기](acceptance/2026-11-08/scope-change-test/reject/runtime-checkpoint.json), [승인 분기](acceptance/2026-11-08/scope-change-test/approve/runtime-checkpoint.json)는 각 격리 루트에만 복원하며 primary와 합치지 않는다. 시험 후보의 최종 승인·작업 생성은 하지 않았다.

ADC 파일 `/workspace/.gcloud-adc/application_default_credentials.json`은 마지막 호출에서 유효했고 토큰을 출력하지 않는다. GCP iceu-songpa11/global, Writer/Reviewer gemini-3.8-flash, Node 24.22.1의 --use-env-proxy를 사용했다. [primary 체크포인트](acceptance/2026-11-08/primary-runtime-checkpoint.json)는 실제 프로젝트 데이터다. 최신 상태·해시를 확인하고 더 최신인 데이터를 덮어쓰거나 모델 호출·사용자 결정을 중복 실행하지 않는다. primary에서 start/plan/resume-plan을 다시 실행하지 않는다. 아래는 과거 구현 기록이다.

## 기존 구현 상태 (실제 인수 전 기록)

**사용자 최신 우선순위:** 현재 지휘자 겸 기획자 Agent 하나를 확실히 완성하고 테스트한다. 팀원 Agent 설계·개발·연결은 사용자 재지시 전까지 보류하며, 인수 완료 후에도 자동으로 착수하지 않는다. [현재 Agent 완료 기준](supervisor-acceptance.md)에 따라 부족한 부분을 수정·재시험한다.

STEP 1 / 1.5 / 2A / 2B / 3 / 4 / 5A / 5B의 코드를 구현했다. 현재 브랜치는 `feature/supervisor-continuation`이며 STEP 5A `792cad1`, STEP 4 `24f9d39`, 기반 문서 `f5528e0`, 수동 개발 `d5780ac`, Gemini 연결 `4d78972`를 포함한다. main 병합은 하지 않았다. 다음은 실제 Gemini로 주제별 기획 품질을 검증하는 인수 시험이다.

사용자는 지휘자 겸 기획자 Agent 하나를 먼저 완성하고 이후 팀원 Agent를 하나씩 연결하는 순서를 확인했다. 통합 CLI와 변경 후 재개는 구현했지만 실제 모델을 포함한 지휘자 전체 인수는 아직 완료하지 않았다. [전체 안내서](supervisor-guide.md), [사용법](supervisor-workflow.md), [STEP 5B 보고서](step5b-report.md)를 먼저 읽는다.

- TypeScript 타입 검사 통과, Node 테스트 111개 통과(기존 93개 + STEP 5B 신규 18개). 신규 테스트는 답변·Scope 변경 승인/거절 후 재개·새 작업 출처·총 한도·오래된 출처·중단/동시 실행 중복 호출 방지·승인 부분 저장·CLI·사용량 기록을 검증한다.
- 신규 CLI 통합 테스트에서 기획안 최종 승인 → 작업 생성 → 담당자 지정 → 결과 제출 → 수동 검수 → 후속 작업 준비를 Cloud의 격리된 임시 디렉터리에서 확인했다.
- Gemini 실제 호출은 사용자가 Windows PC에서 ADC로 실행한 화면으로 확인했다. Writer Plan v1 저장, Reviewer 결과, REQUEST_USER_APPROVAL까지 도달했다. 이 기획안의 실제 최종 사용자 승인을 Cloud에서 대신 기록하지 않았다.
- Cloud는 Windows 로컬 ADC 또는 `.adtf` 데이터에 접근하지 않는다. 개발 및 오프라인 검증은 모바일의 Cloud 대화에서 이어갈 수 있다. 컴퓨터 페어링은 필요하지 않다.

## 주요 구현

- `src/supervisor/`: 원문·질문 답변·Scope 제안·승인·기획·작업 분해·지시서·보고 통합. 모델은 제안만 반환한다. 파일 잠금·revision·불변 원문/답변/이력으로 저장한다.
- `src/supervisor/continuation.ts`: 질문 수집, 변경 요청·제안·결정, 명시적 resume-plan. 기준 상태·Scope·Plan/Review 해시를 보존하고 시작 권한을 먼저 저장한다. 총 반복 한도와 새 기획 최종 승인을 유지한다. `continuation-validation.ts`가 상태·기록과 다음 행동을 검증한다.
- `src/cli/supervisor.ts`: `start`, `questions`, `answer`, `propose-scope`, `approve-scope`, `reject-scope`, `plan`, `approve-plan`, `propose-tasks`, `configure-verification`, `initialize-tasks`, `report`. 입력 원문·답변은 파일로 받는다.
- STEP 5B CLI: `collect-feedback`, `request-scope-change --reason`, `propose-scope-change`, `approve-scope-change --reason`, `reject-scope-change --reason`, `resume-plan`. 실제 모델 설정에서도 답변/승인/보고는 API 없이 동작한다.
- `examples/supervisor-gemini/`: 실제 기획 인수용 새 projectId·maxIterations 5·Gemini 3.8 Flash 설정과 원문. 아직 실호출하지 않았다. 기존 프로젝트에 반복 실행하지 않고 새 실험에는 별도 projectId를 쓴다.
- 모델 제안 사용량은 `supervisor/usage.jsonl`, 기존 기획 역할은 `planning/usage.jsonl`에 기록한다. 성공은 JSON 응답 파싱 성공이며 Controller가 Scope나 작업을 승인했다는 뜻이 아니다. 실패 응답이 토큰을 제공하면 기록하고 없으면 추정하지 않는다.
- `examples/supervisor-demo/`: TEST/STUB 오프라인 예제. 질문·Scope·작업 제안은 고정 fixture이며 실제 의미상 품질 평가가 아니다. 실제 제안 어댑터는 Writer 모델을 재사용하고 CLI에서 CALL을 확인한다.
- `src/planning/`: Fake/Gemini Writer·Reviewer, Planning Controller, 검토 정책, JSON 설정과 파일 저장소.
- `src/development/plan-approval.ts`: Plan의 최종 승인 및 상태 갱신, 실제 Scope 승인 확인. 승인 레코드 기록 후 중단되면 동일 명령으로 상태 갱신을 마칠 수 있다.
- `src/development/controller.ts`: 프로젝트별 TaskStateManager와 수동 작업 생성·위임 기록·결과 제출·검수·차단·취소·재작업.
- `src/verification/`: Core VerificationEngine 구현, 운영자 명령 목록, 파일·입력 해시와 실제 제한된 검사 프로세스, 시도에 연결된 근거.
- `src/development/validation.ts`: 외부 JSON, 버전, 프로젝트, DAG, 체크 결과와 완료 조건 검증.
- `src/development/memory-store.ts`: 작업 및 변경 전후 이력을 단일 schemaVersion 1 / revision 스냅샷으로 저장. 잠금, 기대 revision 비교, 임시 파일 교체를 사용한다.
- `src/cli/development.ts`: `plan-approve`, `init`, `list`, `assign`, `submit`, `verify`, `review`, `transition`.
- `examples/development-manual/`: 편집용 작업/결과/검수 예제. 검수 파일 기본값은 미검토(false)다.

## 경계와 정책

- Core는 SDK에 의존하지 않는다. Runtime과 LLM Provider/Model은 별개다.
- 승인 Plan/Scope와 작업 정의는 불변이다. 개발 상태는 출처 버전·승인·해시를 매 변경 시 확인한다. Scope의 DEMO FIXTURE 승인은 실제 개발을 허용하지 않는다.
- 작업은 실제 사용자 승인 기획에 연결해야 한다. 제안 작업은 요구 ID 전체 커버리지·DAG를 검사하지만 의미상 Scope 적합성은 사람이 검토한다. 작업 수락 전 운영자가 검증 프로필·재작업 예산을 지정할 수 있으며 실행 명령 정책은 별도다.
- 선행 작업 검수 승인 전 실행할 수 없고, 제출 결과 또는 모든 완료 조건에 대한 수동 검수 없이 작업을 승인할 수 없다.
- Worker 결과는 보고된 주장이다. 이 단계의 assign은 실제 Worker를 실행하지 않고, submit은 파일 존재나 변경 내용을 자동 확인하지 않는다.
- 프로필 작업은 실제 검증 통과 근거와 모든 완료 조건의 최종 검수가 있어야 승인한다. 검증 후 선언 파일 변경 시 승인하지 않는다. 품질 재작업 예산을 적용하고 환경 차단은 별도로 처리한다. 과거 결과·검수·근거는 이력에 남기며 새 시도에서 재사용하지 않는다. 기존 프로필 없는 수동 기록은 자동 변환하지 않는다.
- `.adtf`의 기존 기록을 삭제하거나 덮어쓰지 않는다. stale lock을 자동 제거하지 않으며 쓰는 프로세스가 없는지 먼저 확인한다.
- 인증 토큰이나 ADC 파일을 채팅, 저장소 또는 프로젝트 메모리에 넣지 않는다.

## 다음 작업

실제 인수 실행 현황은 [환경 확인·실행 기록](gemini-acceptance-status.md)에 남겼다. 코드 `29160fc`로 현재 Cloud의 supervisor-gemini-acceptance intake(revision 1)를 등록했고 다음 명령은 questions다. ADC 부재와 Vertex AI/OAuth CONNECT 403을 직접 확인했으며, 실행 환경 연결 방법을 사용자에게 요청했다. 모델 호출과 사용자 Scope/Plan 승인은 아직 없다. 같은 Cloud에서는 start를 반복하지 않고, 로컬 전환 시에는 그 PC의 상태를 먼저 확인한다.

1. 실제 Gemini로 재고·유통기한 주제의 질문·한국어 기획·작업 지시 품질과 추가 답변/변경 후 흐름을 평가하고 전체 인수 보고서를 작성한다. Cloud에는 ADC와 Vertex AI 접속 설정이 없으며 로컬 자격 증명을 복사하지 않는다. 사용자가 수행한 이전 단독 Planning 실행은 이번 전체 인수로 계산하지 않는다.
2. 실제 기획·질문·변경·지시·판단·보고에서 발견한 현재 Agent의 문제를 수정하고 회귀 및 반복 인수 시험을 진행한다. 팀원과 Runtime 확장은 보류한다. 이미 제안/초기화된 작업의 Scope 변경·이관과 중단된 모델 실행의 자동 복구는 현재 한계로 기록한다.

STEP 4의 사용법과 실제 검증 근거는 [검증 안내서](verification.md), [실행 보고서](step4-report.md)에 기록했다. 이 검증은 Cloud Linux의 fixture 프로젝트에서 수행했으며 Windows 실행·실제 모델 호출·전체 제품 개발의 검증이 아니다.

Supervisor 잠금은 하위 저장소 전체의 트랜잭션이 아니다. 동일 프로젝트에서 다른 기획·개발 CLI를 병행 실행하지 않는다. Scope 결정 및 작업 초기화 직후 중단은 명시적 재시도를 지원하지만 기획 도중의 자동 복구·중복 모델 호출은 허용하지 않는다. 기존 로컬 프로젝트의 지휘자 상태 자동 가져오기는 지원하지 않으므로 새 projectId로 시작한다.

기획 재개는 작업 제안 전으로 제한한다. started continuation에 대응하는 Planning 결과가 terminal이고 ID·Scope·버전이 맞으면 완료 기록만 재시도할 수 있다. drafting/reviewing 중단은 재호출하지 않는다. 이전 schemaVersion 1 파일은 continuations/continuationId가 없어도 읽을 수 있다. 승인된 기획의 user_approved→drafting 전이는 별도 Scope 변경 승인을 거친 새 Plan 생성에서만 사용하고, 기존 승인 기획을 자동 덮어쓰지 않는다.

검증 명령은 `npm run typecheck`, `npm test`다. 새 구현의 재현 명령 및 입력 형식은 README와 docs/supervisor-workflow.md를 따른다.
