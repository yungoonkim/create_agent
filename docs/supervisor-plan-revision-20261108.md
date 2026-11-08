# 사용자 기획 수정 요청 및 실제 Gemini 재시험 — 2026-11-08

현재 판정: **요청한 기획 수정·재검토 완료, Plan v3 최종 승인 대기. 지휘자 전체 인수는 계속 미완료.**

## 중단 지점 확인

사용자가 사용 한도로 중단됐다고 알린 시점에 직접 파일을 확인했다. 커밋 `2b7568e` 이후 수정 요청 기능의 소스 변경만 있었고, 실제 상태는 Supervisor revision 6 / scope_approved, Plan v1 / awaiting_approval / iterationCount 1이었다. continuation은 없었고 v2 모델 호출도 없었다. 기존 ADC 파일은 존재해 로그인 반복 없이 사용했다.

## 사용자 요청과 구현

사용자는 기획안 승인을 선택하지 않고 다음 세 항목의 수정을 요청했다. [요청 원문](../examples/supervisor-gemini/revision-v1-request.md)을 보존했다.

1. 숫자 입력 표기와 안전 정수 검증을 구분
2. 저장된 JSON의 필드·값 검증을 명시
3. 원자적 저장의 보장 범위와 실패 처리 구체화

당시에는 추가 답변 또는 Scope 변경 후 재개만 있어, 같은 Scope의 미승인 기획 수정용 `request-plan-revision --reason`을 추가했다. 기록 명령은 모델을 부르지 않는다. 현재 Plan 최종 승인이 pending일 때, 작업 제안 전, 진행 중 continuation이 없고 기존 예산이 남아 있을 때만 이유·기준 상태·Scope/Plan/Review 해시를 저장한다. `resume-plan`은 기존 시작 receipt/완료 복구 정책으로 다음 버전을 만들고 새 사용자 승인을 요구한다.

Planning Controller는 revision의 Scope가 동일하고 기존 승인이 pending인지 검증한다. 요청 이유를 Writer와 Reviewer 양쪽의 settledDecisions에 전달한다. Writer는 변경 요약·확인 가능한 조건을 작성하고, Reviewer는 원요청 항목별 해결 여부를 검사하도록 지침을 보완했다. 지속 데이터의 전체 목록 불변 조건과 atomic/flush라는 단어만으로 보장 범위를 추정하지 말라는 검토 지침도 추가했다.

## 실제 실행 결과

| 버전 | 작성·검토 | 독립 내용 점검 | 후속 행동 |
| --- | --- | --- | --- |
| v1 | Writer 1회, review-1 pass | 숫자 표기·저장 데이터 검증·저장 보장 범위 보완 필요 | 사용자 수정 요청 기록 |
| v2 | Writer 1회, review-2 pass | 숫자 표기/안전 정수 및 필드 검증 개선. 전원·rename 후 실패·cleanup 한계와 로드 중복 ID는 불충분 | 원요청의 후속 구체화 기록 |
| v3 | Writer 1회, review-3 pass | 세 요청의 구체 조건·오류 경계·검사 사례 포함 | 최종 사용자 승인 대기 |

[v2 원문](acceptance/2026-11-08/primary-plan-v2.md), [v2 Review](acceptance/2026-11-08/primary-review-v2.json), [v2 미해결 점검](acceptance/2026-11-08/primary-plan-v2-assessment.md), [진행자 후속 요청](../examples/supervisor-gemini/revision-v2-followup.md), [v3 원문](acceptance/2026-11-08/primary-plan-v3.md), [v3 Review](acceptance/2026-11-08/primary-review-v3.json), [v3 최종 내용 대조](acceptance/2026-11-08/primary-plan-v3-assessment.md)를 각각 보존했다.

v3은 저장 루트를 version=1/lots 배열로 확정하고, 필드·값·미확인 필드·중복 lotId를 검사한다. 문자열 표기 검사와 안전 정수 검사는 별도 단계다. 저장은 rename 전 실패, rename 실패, rename 성공 후 디렉터리 동기화 실패를 구분하고 마지막 경우 저장 불확실성을 보고한다. 전원·SIGKILL 때 cleanup이 실행되지 않을 수 있고, cleanup 실패가 원래 오류를 숨기지 않으며, 임시 파일을 자동 승격하지 않는다고 명시한다. 실제 전원 장애 무손실 증명을 수행했다고 주장하지 않는다.

**Reviewer 자체의 수정 요청은 0회**다. Writer 작성 3회·Reviewer 검토 3회는 사용자/진행자 요청으로 발생했다. v2의 pass 이후에도 진행자가 결함을 찾았으므로 자동 Reviewer의 독립적인 완전성을 입증한 시험이 아니다. 현재 승인 요청은 보완한 v3의 내용과 기록을 기준으로 한다.

## 검증과 보존

- `npm run typecheck`, `npm test` 전체 **116개 통과**, 실패/건너뜀 0. 기존 112 + 수정 경로 4개 회귀 테스트.
- 신규 테스트는 요청의 두 역할 전달, Scope·Plan·Review·이전 승인 보존, 새 최종 승인, 오래된 승인 문구 차단, 중복/승인 후/작업 제안 후 요청 차단, 총 반복 예산·출처 변조 차단, CLI의 수정 후 Writer/Reviewer 반복을 검증한다.
- CLI fixture는 improve-once Reviewer라 v2 수정 후 v3로 진행한다. 이 재현용 fixture 결과와 실제 Gemini 결과를 구분했다.
- 실제 Scope v4 / Plan v1 / Review v1의 SHA-256이 수정 전과 같음을 확인했다. v2 저장 JSON·Review도 사본과 동일하다. 실제 Scope 변경 승인이나 v1·v2 최종 승인 결정을 만들지 않았다.
- 현재 Supervisor revision 12 / scope_approved, 두 revision continuation completed, Plan v3 / awaiting_approval, 총 iterationCount **3/5**. [현재 report](acceptance/2026-11-08/primary-report.json).
- 실제 미승인 v3에서 propose-tasks와 오래된 v1 최종 승인 문구를 시험해 둘 다 exit 1을 확인했다. state/usage 해시가 동일하고 taskProposal도 없다. [근거](acceptance/2026-11-08/plan-v3-approval-gate.json).
- [재개 체크포인트](acceptance/2026-11-08/primary-runtime-checkpoint.json)를 v3까지 갱신했다. Scope와 각 Plan 승인 기록을 포함하되 ADC·토큰·잠금을 포함하지 않는다. 기존 더 최신 상태를 덮어쓰면 안 된다.

## 사용량과 남은 작업

이번 수정은 실제 Gemini 4회(Writer v2/v3, Reviewer v2/v3) 모두 성공했다. 최초 질문부터 누적 실제 호출은 **11회(성공 10/실패 1)**, 제공 토큰 합계 입력 **43,519**, 출력 **16,713**, reasoning **7,575**, 호출 소요시간 합계 **189,653ms**다. reasoning을 제공하지 않은 Writer v2/v3와 최초 제안 실패의 미제공 지표는 추정하지 않았다. [Planning ledger](acceptance/2026-11-08/planning-usage.jsonl).

남은 단계는 Plan v3의 별도 최종 승인과 작업 지시 품질 시험이다. CLI 명령/기본 저장 경로는 기획안에 작업 지시 단계에서 확정할 항목으로 남았다. 실제 제품 구현·팀원 실행·물리 전원 단절 시험은 하지 않았다. 전체 독립 반복, 실제 Scope 변경 승인/거절 및 실패 시나리오의 의미상 인수도 아직 전체 완료로 판정하지 않는다.
