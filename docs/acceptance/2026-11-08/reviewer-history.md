# Reviewer 검토·수정 요청 이력

실제 모델이 반환한 Review JSON을 실행별로 모은 색인이다. projectId/Plan ID가 같아도 격리 실행과 Scope 버전은 다르므로 실행 이름과 원문 경로를 함께 확인한다.

| 실행 | 기획 | Scope | 결과 | 이슈 수 | 검토 시각(한국) | 원문 |
| --- | --- | --- | --- | --- | --- | --- |
| primary | v1 | v4 | pass | 0 | 2026-11-08 18:52:00 | [JSON](primary-review-v1.json) |
| primary | v2 | v4 | pass | 0 | 2026-11-08 20:49:13 | [JSON](primary-review-v2.json) |
| primary | v3 | v4 | pass | 0 | 2026-11-08 20:52:12 | [JSON](primary-review-v3.json) |
| 독립 재현 | v1 | v4 | revise | 2 | 2026-11-08 21:20:14 | [JSON](approved-scope-replay-20261108/review-v1.json) |
| 독립 재현 | v2 | v4 | pass | 0 | 2026-11-08 21:20:52 | [JSON](approved-scope-replay-20261108/review-v2.json) |
| Scope 변경 승인 분기 | v3 | v5 | pass | 0 | 2026-11-08 22:05:17 | [JSON](scope-change-test/approve/reviews-v3.json) |

## 실제 수정 요청의 이유

### 독립 재현 / Plan v1 / review-1

[전체 원문](approved-scope-replay-20261108/review-v1.json)

- **issue-5fd99cccfff946a2** — omission / major / REQ-05
  - 이유: JSON 영속 데이터 로드 시 개별 Lot 필드 검증만 기술되어 있고, 컬렉션 전체 수준의 불변식인 lotId 고유성(저장 파일 내 중복 lotId 존재 여부)에 대한 검증 명세가 누락되어 있습니다.
  - 수정 방향: 저장소 계층의 JSON 로드 및 검증 단계에 파일 내 중복된 lotId가 발견될 경우 데이터 손상으로 간주하여 로드를 거부하고 기존 파일을 보존하는 컬렉션 불변식 검증 규칙을 추가하십시오.
- **issue-1ee5fffc5a7532c3** — implementation_risk / major / REQ-05
  - 이유: 원자적 영속화 설계에서 커밋(rename) 전후의 장애 경계, 프로세스 비정상 종료(SIGKILL, 전원 차단 등) 시 정리(cleanup) 루틴 미수행으로 인한 고아 임시 파일 발생 가능성 및 보장 한계 규정이 구체화되지 않았습니다.
  - 수정 방향: 커밋 전후 실패 상황별 동작, 비정상 강제 종료로 cleanup이 실패했을 때 잔류하는 임시 파일의 처리 정책(예: 초기 기동 시 또는 저장 시 오래된 고아 임시 파일 정리), 그리고 원자적 보장의 명시적 한계를 기획안에 추가하십시오.

## 횟수와 구분

- 실제 Reviewer 검토 6회 중 수정 요청 1회. 나머지는 pass다.
- primary v1→v2→v3 수정은 사용자·진행자의 피드백으로 요청했다. 이를 Reviewer 자체 수정 요청으로 계산하지 않는다.
- Review JSON에는 ID, 기획/Scope ID·버전, outcome, 이슈 종류·심각도·설명·수정 방향·관련 요구 ID, 제안, 검토 시각을 보존한다.
- 과거 pass 뒤 진행자가 찾은 문제는 각 기획안 점검 문서와 수정 요청 파일에 별도 기록했다. 과거 Review 결과를 고쳐 덮어쓰지 않았다.
