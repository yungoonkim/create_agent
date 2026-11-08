# 지휘자 단독 실제 Gemini 인수 보고서 — 2026-11-08

- 현재 판정: **Scope 승인 후 실제 Writer 기획 v1 / Reviewer pass. 최종 기획안 사용자 승인 대기. 전체 인수 미완료.**
- 기준 코드: `2681579` + `docs/supervisor-only-acceptance`의 이번 변경. 제안 어댑터 파일 SHA-256: `8b3bc16beb6650a6f0a767b68944fb34b6d8be9c4956ab098310af9b53ee3d12`.
- 환경: Codex Cloud Linux, Node 24.22.1, GCP `iceu-songpa11` / `global`, ADC, Writer/Reviewer 설정 `vertex-ai / gemini-3.8-flash`, 총 기획 검토 한도 5.
- 수행 범위: 지휘자 질문·답변·Scope 제안 및 승인 전 차단. Writer 기획 v1과 Reviewer review-1을 실행했다. 작업 지시는 아직 실행하지 않았다. 제품 구현·팀원 Agent 실행 없음.
- 인증·네트워크 준비와 사용자 UI 차이는 [환경 실행 기록](gemini-acceptance-status.md)에 시간순으로 남겼다. ADC 갱신 성공과 파일 권한 600을 확인했으며 토큰은 출력하지 않았다. quota project는 disabled 상태지만 실제 생성 호출이 성공했다. 이를 다른 API 권한 확인으로 확대 해석하지 않는다.

## 입력·실행 분리

원문은 [기존 요청](../examples/supervisor-gemini/request.md)을 그대로 사용했고 저장된 원문과 일치한다.

| 실행 ID | 목적 | 현재 상태 |
| --- | --- | --- |
| `supervisor-gemini-acceptance` (primary) | 기존 intake 이어가기, 최초 질문 기준, Scope 지침 수정 후 제안 | revision 6 / scope_approved / Scope v4 승인, Plan v1 승인 pending |
| `supervisor-gemini-acceptance-qfix-20261108` (qfix) | 같은 원문으로 질문 개선 재시험, 수정 전 Scope 결함 관찰 | revision 4 / scope_proposed / scope-v4 v4 / 승인 pending |

두 프로젝트의 Scope ID·버전 숫자는 같아도 프로젝트가 다르다. **현재 사용자가 승인한 것은 primary Scope이며, 다음 승인 대상은 primary Plan v1**이다. qfix의 결함 있는 제안에 사용자 거절을 대신 기록하거나 본문을 고쳐 덮어쓰지 않았다.

답변은 실제 매장의 운영 요구를 사용자에게 받아 기록한 것이 아니다. 시험 진행자가 [재현용 시나리오](supervisor-test-plan.md)를 구체화해 입력했으며 각 답변에 그 출처를 표시했다. [qfix 답변](../examples/supervisor-gemini/question-fix-answers.json), [primary 답변](../examples/supervisor-gemini/acceptance-answers.json)을 별도로 보존한다. primary는 기존 네 Q-ID에 같은 규칙을 매핑하고 N 안전정수·날짜 범위와 세션 실행 제한을 추가 명시했다. 따라서 Scope 전후는 입력까지 동일한 통제 실험이 아니며, 같은 원문으로 한 질문 전후 비교와 구분한다.

## 관찰·수정·재시험

1. 최초 실제 질문은 환경, 바코드/POS, 알림, 사용자 수의 네 가지였다. lot별 날짜 보존·수량 정밀도/음수·임박 경계 등 업무 정확성 질문이 누락됐다. [최초 질문과 후속 시험 답변](acceptance/2026-11-08/primary-clarifications.json)을 보존했다.
2. 질문 프롬프트에 업무 데이터의 식별·그룹·수치·상태/시간 경계를 우선하고 선택적 연동을 필수로 가정하지 않도록 했다. 프로젝트 업무 규칙을 프레임워크 코드에 고정하지 않았다. 같은 원문으로 qfix를 시작했다.
3. qfix 첫 질문 호출이 실패했다. 이 시점 코드가 원인을 숨겼고 토큰도 제공되지 않아 **실패 원인은 불명**이다. 인증·한도 오류라고 추정하지 않는다. revision 1과 원문은 보존됐다.
4. 원문/헤더/오류 본문 없이 허용된 실패 분류와 HTTP 숫자만 반환·기록하도록 고쳤다. 401/403/404/429/400/5xx·네트워크·일반 공급자 실패·잘못된 응답을 구분한다. 기존 ledger 필드는 유지하고 선택 필드만 추가했다. 원인 코드가 없는 과거 실패에 분류를 소급해 채우지 않았다.
5. qfix에서 명시적으로 한 번 재시도해 성공했다. [새 질문 8개](acceptance/2026-11-08/question-fix-clarifications.json)는 lot 관리·수량 제약·날짜 기준·업무 이벤트·환경·제외 범위를 다룬다. 업무 핵심 질문의 누락은 개선됐다. 일부 질문은 여러 결정을 묶고 있으므로 모든 주제에서 질문 품질이 보장된다고 판정하지 않는다.
6. qfix Scope는 수량 증감을 요구하면서 기술 제약에 '모든 수량 및 증감 연산은 ... 0 이상 정수만 허용'이라고 썼다. 음수 증감량으로 출고할 수 있다는 답변과 충돌한다. [결함 있는 Scope 원본](acceptance/2026-11-08/question-fix-scope-v4.json)을 수정·승인하지 않았다.
7. Scope 프롬프트에 피연산자·저장 값·결과 값을 구분하고 제약/기능의 모순을 점검하며, 현재 시험의 실행 제한을 향후 제품 기능 제외와 혼동하지 않도록 보완했다. primary를 이어 답변 후 Scope를 생성했다.
8. [primary Scope 원문](acceptance/2026-11-08/primary-scope-v4.md)의 REQ-02는 양수·음수·0 증감량을 허용하고 음수/안전정수 범위 밖 결과를 거부한다. REQ-04는 N의 안전정수·양 끝 포함·수량 0 제외·정렬·날짜 계산 범위 검증을 명시한다. 한국어 기획·지시와 이번 세션의 실제 구현/팀원 실행 제외를 분리했다.
9. primary의 실제 미승인 Scope에서 CLI `plan`을 실행해 `Operation is not allowed in scope_proposed`와 exit 1을 확인했다. [승인 차단 근거](acceptance/2026-11-08/scope-approval-gate.json): state와 usage의 SHA-256 모두 동일, Planning 상태 파일 미생성. 이 확인은 기획 생성 호출이 아니다.

Scope 문서의 세부 제외 문구는 사용자가 검토할 제안이다. 예를 들어 별도 lot 수정 workflow 제외는 REQ-02의 수량 증감과 구분해 읽어야 한다. 최종 Scope 승인 전에는 기획을 시작하지 않는다.

## 자동 검증

- 환경 재개 시 기준 전체 111개 통과, typecheck 통과.
- 질문 프롬프트 수정 후 전체 111개 통과.
- 안전한 실패 분류 추가 및 Scope 프롬프트 수정 후 각각 `npm run typecheck`와 `npm test` 전체 **112개 통과**, 실패/건너뜀 0.
- 신규 회귀 검증은 공급자 오류에 민감 문자열이 있어도 UI 오류와 ledger에 남지 않고, 상태/원문이 그대로이며 자동 제안 재호출이 없는지 확인한다. 잘못된 진단 메타데이터 저장도 거부한다. 기존 invalid JSON 테스트에 분류 검증을 추가했다.
- 프롬프트 문구 일치 테스트로 의미상 품질을 주장하지 않는다. 내용 평가는 위 실제 모델 결과에 근거한다.
- 테스트 프로세스만 사용했으며 제품 코드·실제 팀원 결과는 없다.

## 사용량·시간

아래는 제안 어댑터 호출 기록이다. HTTP 하위 재시도 횟수나 청구 금액이 아니며, 미제공 토큰을 0으로 추정하지 않는다. [ledger 사본](acceptance/2026-11-08/usage.jsonl)에 역할과 시각도 있다. 모든 실제 호출은 지휘자 제안용 Writer 모델이며 Planning Reviewer 호출은 아직 없다.

| 실행 | 동작 | 결과 | ms | 입력 | 출력 | reasoning |
| --- | --- | --- | --- | --- | --- | --- |
| primary | questions | success | 7250 | 278 | 129 | 579 |
| qfix | questions | failure | 5439 | 미제공 | 미제공 | 미제공 |
| qfix | questions | success | 16346 | 397 | 441 | 1227 |
| qfix | scope | success | 19268 | 1776 | 839 | 1729 |
| primary | scope | success | 10218 | 1570 | 1174 | 미제공 |

- 실제 제안 호출 5회: 성공 4, 실패 1. 제공받은 입력 토큰 합계 4,021, 출력 2,583, reasoning 3,535. 실패 1회 지표는 미제공이다.
- 기록된 호출 소요시간 합계 58,521ms. 환경·인증 준비와 사용자 대기 시간은 포함하지 않는다.

## Scope 승인 후 기획·검토 실행

- 사용자가 채팅의 Scope 질문에서 primary `scope-v4 v4` 승인을 선택했다. 저장된 제안과 검토용 JSON이 같은지 확인하고 CLI의 `APPROVE scope-v4 v4`로 그 결정을 기록했다. [Scope 결정](acceptance/2026-11-08/primary-scope-approval.json)은 approved, 원본 Scope JSON은 변경하지 않았다.
- 기존 상태에서 `plan`을 한 번 실행했다. Writer v1 저장(39,173ms), Reviewer review-1 / pass / issues 0(6,691ms), iterationCount 1 / maxIterations 5 / awaiting_approval이다. 자동 수정 반복은 발생하지 않았다.
- [실제 기획안](acceptance/2026-11-08/primary-plan-v1.md), [Reviewer JSON](acceptance/2026-11-08/primary-review-v1.json), [진행자 독립 내용 대조·후속 점검](acceptance/2026-11-08/primary-plan-v1-assessment.md), [Planning 상태](acceptance/2026-11-08/primary-planning-state.json)를 보존했다.
- 한국어 기획은 목적·REQ/EXC 추적·모델/검증·저장/서비스/CLI 순서·수량/날짜 경계·실패·위험·판정 가능한 완료 조건을 포함한다. 시험표의 기대 결과를 규칙으로 설명할 수 있다. 제품 코드를 실행한 검증은 아니다.
- CLI 문법/기본 경로는 기획안에서 작업 지시 단계로 남겼다. 진행자 점검에서는 정수 입력 표기 설명, 로드 JSON의 구조/업무 규칙 검증, 원자적 rename의 내구성 설명을 작업 지시에서 명확히 해야 할 항목으로 남겼다. 이 메모를 원본 기획 또는 Gemini Review에 조용히 병합하지 않았다.
- 미승인 Plan에서 propose-tasks를 실행해 exit 1 / Development requires a user-approved current plan을 확인했다. state/usage 해시는 동일하며 taskProposal도 없다. [승인 차단 근거](acceptance/2026-11-08/plan-approval-gate.json).
- Planning 제공 토큰: Writer 입력 2,302 / 출력 3,346 / reasoning 1,756, Reviewer 입력 6,224 / 출력 111 / reasoning 713. 두 호출 합계 45,864ms. [Planning ledger](acceptance/2026-11-08/planning-usage.jsonl).
- 지금까지 전체 실제 모델 어댑터 호출 7회(제안 5 + Planning 2): 성공 6, 실패 1. 제공 토큰 합계 입력 12,547 / 출력 6,040 / reasoning 6,004. 미제공 실패 지표는 합산하지 않았다. 호출 소요시간 합계 104,385ms이며 사용자·환경 준비 대기는 제외했다.

## 사용자 결정·남은 인수

- primary Scope v4는 사용자 승인 완료다. primary Plan `supervisor-gemini-acceptance-plan v1`은 별도 최종 승인 pending이다. qfix Scope는 비교 기록으로 pending을 유지하며 사용자 거절 기록은 없다.
- Plan v1 최종 승인 또는 수정 결정을 받은 뒤 작업 분해·지시 품질 시험을 수행한다. Reviewer pass를 사용자 승인으로 취급하지 않는다.
- 실제 추가 답변/범위 변경 승인·거절 후 재개, 실패/중단의 사람용 보고, 독립 실행의 전체 흐름 반복은 아직 미실행이다. 기존 112개 정책·fixture 테스트 통과와 실제 모델 인수를 구분한다.
- 현재 완료 판정은 **기획/지시 인수 대기**다. 팀원 연결이나 제품 구현으로 자동 진행하지 않는다.

## 재개 체크포인트

[primary 실행 데이터 체크포인트](acceptance/2026-11-08/primary-runtime-checkpoint.json)는 Git 제외 `.adtf` 중 이번 primary 프로젝트와 연결된 Scope/Plan 승인 기록만 경로·SHA-256·UTF-8 본문으로 내보낸 것이다. 자격 증명·잠금은 제외했다. 현재 state를 먼저 확인하고, 더 최신인 state를 덮어쓰거나 사용자 결정을 중복 기록하지 않는다. 다른 환경의 ADC는 별도로 준비한다. 원격 브랜치에 있던 환경 점검 문서 커밋 `512a6c5`는 fast-forward로 보존했으며 이 문서의 실제 모델 실행 근거와 구분한다.
