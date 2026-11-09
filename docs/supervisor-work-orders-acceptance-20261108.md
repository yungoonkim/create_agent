# 기획 승인 후 작업 지시·정책·독립 재현 인수 — 2026-11-08

> 이 문서는 Scope 변경 분기 실행 전 체크포인트다. 이후 사용자 허용으로 두 분기를 완료했다. 현재 판정·사용량·남은 경계는 [최종 보고서](supervisor-final-acceptance-20261108.md)를 따른다.

당시 판정: **primary Plan v3 사용자 승인 완료. 작업 지시와 대표 실패 정책 검증, 독립 기획 반복 실행 완료. 격리 Scope 변경 승인/거절 시험의 사용자 결정 대기.** 전체 지휘자 인수 완료를 아직 선언하지 않는다.

## 현재 primary 실행

- 사용자가 채팅에서 기획안 v3 승인을 명시했고, 검토용 JSON과 현재 Plan v3 일치를 확인한 뒤 정확한 승인 문구로 기록했다. [승인 결정](acceptance/2026-11-08/primary-plan-v3-approval.json)은 approved다.
- 실제 Scope v4·기획 v3은 유지했다. Supervisor revision 16 / tasks_proposed, 기획은 user_approved / iterationCount 3/5다. 작업 초기화·제품 구현·팀원 실행은 없다.
- 실제 Gemini로 작업 5개를 제안했고, 진행자가 의미상 결함을 찾아 두 번 재제안했다. 질문/Scope/작업 제안은 Writer 모델을 사용한다. 작업 지시의 의미상 점검은 진행자가 했으며 Gemini Reviewer가 작업 지시를 검토한 것으로 기록하지 않는다.

## 작업 지시 품질과 수정

| 제안 | 관찰 | 처리 |
| --- | --- | --- |
| v1 | 모든 수치 결과의 0 이상 제약이 음수 증감량과 충돌할 수 있고 CLI 명령·경로가 미정 | 피연산자/결과 구분과 CLI 상세 규약 요청 |
| v2 | 수량 규칙·CLI 명령/경로/종료 코드·장애 경계·예제 개선. 빌드/테스트 기반이 후행 CLI 작업에만 있어 선행 검증이 불가능 | 기본 빌드/테스트 설정을 첫 작업으로 이동 요청 |
| v3 | 첫 작업에서 package.json/tsconfig/test/typecheck/build 제공, 세부 CLI 및 관찰 가능한 수량/날짜·저장 실패 조건 포함 | 인수 진행자 점검 완료, 데이터 제안으로 보존 |

[최초 제안 JSON](acceptance/2026-11-08/primary-task-proposal-v1.json), [중간 제안 JSON](acceptance/2026-11-08/primary-task-proposal-v2.json), [최종 작업 지시서](acceptance/2026-11-08/primary-work-orders-v3.md), [최종 JSON](acceptance/2026-11-08/primary-task-proposal-v3.json), [첫 피드백](../examples/supervisor-gemini/task-revision-feedback.md), [의존성 피드백](../examples/supervisor-gemini/task-revision-build-order-feedback.md)을 보존했다.

작업 순서는 parser/validation → storage → domain → CLI → fault verification이다. REQ-01~05 전체 연결·DAG·상대 산출물 경로는 Controller가 검증했다. 수량/날짜의 구체 판정, sourceScope/Plan 승인·해시, 제외 기능·제약이 연결된 전체 report도 저장했다. CLI는 add/update-quantity/list-all/list-expiring, 기본 경로 ./data/inventory.json, --data-file > INVENTORY_DATA_PATH > 기본값 우선순위, 0/1/2 종료 규칙을 제안한다. 이는 미래 제품 명세이며 여기서 해당 CLI나 제품 테스트를 구현·실행하지 않았다.

미수락 지시 수정용 revise-tasks를 추가했다. 승인 출처가 같은지 모델 호출 전후 확인하고, 이전 제안과 이유를 taskRevisions에 추가 기록한다. 기존 이력은 바꿀 수 없고 이전 revision의 수락 문구는 거부된다. 초기화 후 수정은 불가하다. 모델은 검증 프로필·실행 정책·예산을 설치하지 못한다.

초기 재제안 호출에서 here-document가 stdin을 이미 사용해 CALL이 전달되지 않았고 Node가 상태 변화 없이 exit 0으로 종료되는 문제를 발견했다. 상태·usage가 변하지 않은 것을 확인한 뒤, EOF를 명시적 실패로 처리하도록 CLI를 수정하고 확인 입력을 직접 전달해 정상 호출했다. 이 무호출 사례를 모델 사용량으로 계산하지 않았다.

## 실제 승인 출처를 사용한 TEST/STUB 정책 시험

[재현 스크립트](../examples/supervisor-gemini/approved-source-policy-test.mjs)는 실제 승인된 Scope v4/Plan v3와 최종 작업 제안의 **격리 복사본**을 쓴다. 새 사용자 승인을 만들거나 primary를 수정하지 않는다. 모델/Agent Runtime 포트는 호출 시 오류를 내도록 막았다. 환경 차단 시험의 파일은 TEST/STUB 텍스트 플레이스홀더이고 제품 구현물이 아니다. 임시 복사본은 시험 후 제거했다.

[실제 관찰 결과](acceptance/2026-11-08/approved-source-policy-fixture.json):

- 선행 작업 승인 전 후행 작업 지정 거부.
- 완료 주장과 빈 검수만으로 승인하려는 시도 거부.
- 산출물 부재: 검사 명령 실행 전 evidence failed, rework로 이동.
- 같은 실패 2회: attemptCount 2 / reworkCount 1 / verification_limit 차단, pending으로 초기화해 예산 우회 불가.
- 실행 도구 부재: evidence blocked / environment, 품질 재작업 카운터 0 유지.
- report는 pending 4/blocked 1/completed false/sourceCurrent true/workerRuntimeConnected false를 반환해 실패와 미완료를 보존.
- primary state 해시가 시험 전후 동일함을 확인했다.

이는 지휘자의 판단 정책 시험이며 실제 제품 수량/날짜 구현을 검증한 결과가 아니다. report.progress.completed는 제품 작업의 완료 여부이고 지휘자 인수 완료 판정과 별개다.

## 독립 실제 모델 재현

[스크립트](../examples/supervisor-gemini/approved-scope-planning-replay.mjs)는 approved-scope-replay-20261108이라는 별도 실행 ID·메모리 경로에서 원문·답변·동일한 실제 승인 Scope를 사용했다. 승인 레코드의 프로젝트 결합을 보존하기 위해 projectId는 유지하지만 primary 실행 메모리를 재사용하거나 덮어쓰지 않는다. 사용자 원요청 세 항목을 문맥에 포함했고 primary v3을 currentDraft로 주입하지 않아 새 Writer v1부터 시작했다. 따라서 primary의 두 차례 외부 피드백 수정과 입력까지 같은 통제 실험이라고 주장하지 않는다.

[재현 결과](acceptance/2026-11-08/approved-scope-replay-20261108/result.json):

- Writer v1 → Reviewer revise(major 2개: 파일 내 중복 lotId, 원자적 저장 장애 경계·고아 임시 파일) → Writer v2 → Reviewer pass.
- 실제 Reviewer 수정 요청 **1회**, Writer 2회/Reviewer 2회. 총 반복 2/5 유지, REQUEST_USER_APPROVAL에서 정지했다.
- 결과를 [v1](acceptance/2026-11-08/approved-scope-replay-20261108/plan-v1.md), [v1 검토](acceptance/2026-11-08/approved-scope-replay-20261108/review-v1.json), [v2](acceptance/2026-11-08/approved-scope-replay-20261108/plan-v2.md), [v2 검토](acceptance/2026-11-08/approved-scope-replay-20261108/review-v2.json)에 보존했다. 새 기획의 사용자 최종 승인은 기록하지 않았고 실제 primary 기획을 대체하지 않는다.
- 독립 점검에서는 중복 lotId·고아 파일/전원 한계 설명의 개선을 확인했다. 하지만 cleanup '즉시 삭제', rename 후 동기화 실패의 불확실성 설명은 primary 승인 v3보다 덜 구체적이다. 따라서 반복 흐름은 실제 관찰했으나 자동 Reviewer가 모든 보장 설명을 독립적으로 완전 검증한다고 판정하지 않는다. 기존 사람 승인·검토 경계가 계속 필요하다.
- primary Supervisor/Planning state가 전후 같았다. 이미 존재하는 실행 경로는 스크립트가 재호출하지 못하게 해 중복 모델 실행을 방지한다.

## 남은 Scope 변경 분기 시험

같은 격리 실행에서 범위 변경 컨텍스트를 TEST/STUB로 가져오고, 실제 Gemini로 [시험용 Scope v5](acceptance/2026-11-08/scope-change-test/proposal.md)를 제안했다. 내용은 N 미입력 시 기본 7일을 사용하는 변경이다. 실제 primary Scope v4/Plan v3은 그대로이며 새 Scope·변경 승인 두 레코드는 pending이다. [요청·출처·제안 JSON](acceptance/2026-11-08/scope-change-test/proposal.json), [격리 데이터 체크포인트](acceptance/2026-11-08/scope-change-test/runtime-checkpoint.json).

사용자에게 이 원문으로 **승인·거절 두 분기를 각각 별도 복사본에서 시험하도록 허용할지** 질문했다. 아직 실행하지 않았다. [분기 실행 스크립트](../examples/supervisor-gemini/approved-scope-change-cases.mjs)는 사용자 허용 후에만 실행하며, 검토한 제안 JSON 일치를 확인하고 새로운 격리 경로를 만든다. 거절은 원래 Scope/Plan 보존·모델 미호출, 승인은 새 Scope 승인 출처·반복 예산 유지·기획 재개를 확인한다. 변경 기획의 최종 승인이나 제품/팀원 실행은 하지 않는다. 필요한 사용자 결정 없이 이 단계 결과를 통과로 바꾸지 않는다.

## 검증·사용량·판정

- typecheck / 전체 **119개 테스트 통과**(116 + 작업 수정 2 + 확인 EOF 1), 실패/건너뜀 0. 독립 정책·실제 모델 재현 스크립트는 별도 실행 근거다.
- 새 작업 수정 회귀는 이전 제안·승인 출처 보존, 오래된 수락 문구·초기화 후 수정·이력 위조·불완전 커버리지·오래된 출처 차단을 검증한다. EOF 회귀는 모델/상태/usage 생성 없이 exit 1을 확인한다.
- 현재까지 전체 실제 모델 19회(성공 18/실패 1). 제공받은 입력 토큰 합계 124,188 / 출력 35,340 / reasoning 15,296 / 호출 소요시간 375,316ms다. 지표 없는 실패와 일부 미제공 reasoning은 추정하지 않는다. 역할 ledger는 각 실행 폴더에 따로 저장했다.
- 현재 대표 시나리오의 기획·작업 지시·기본 정책·실제 수정 반복 근거는 확보했다. 격리 Scope 변경 승인/거절 실제 분기와 최종 인수 행렬 확정이 남았다. 팀원 Agent 작업으로 자동 확장하지 않는다.
