# 최종 사례별 의미 점검

사전 라벨은 모델 호출 전에 고정했다. 아래는 최종 출력 원문을 읽고 주입한 결함과 실제 지적 이유가 일치하는지 진행자가 점검한 기록이다.

| 사례 | 1회 | 2회 | 원문 |
| --- | --- | --- | --- |
| normal-complete | REQUEST_USER_APPROVAL | REQUEST_USER_APPROVAL | [1회](calls/review-enhanced-normal-complete-1.json) / [2회](calls/review-enhanced-normal-complete-2.json) |
| normal-existing-v4 | REQUEST_USER_APPROVAL | REQUEST_USER_APPROVAL | [1회](calls/review-enhanced-normal-existing-v4-1.json) / [2회](calls/review-enhanced-normal-existing-v4-2.json) |
| open-input-choice | REQUEST_USER_INPUT | REQUEST_USER_INPUT | [1회](calls/review-enhanced-open-input-choice-1.json) / [2회](calls/review-enhanced-open-input-choice-2.json) |
| false-user-decision | REVISE | REVISE | [1회](calls/review-enhanced-false-user-decision-1.json) / [2회](calls/review-enhanced-false-user-decision-2.json) |
| clock-order | REVISE | REVISE | [1회](calls/review-enhanced-clock-order-1.json) / [2회](calls/review-enhanced-clock-order-2.json) |
| empty-corrupt-storage | REVISE | REQUEST_USER_APPROVAL | [1회](calls/review-enhanced-empty-corrupt-storage-1.json) / [2회](calls/review-enhanced-empty-corrupt-storage-2.json) |
| post-commit-rollback | REVISE | REVISE | [1회](calls/review-enhanced-post-commit-rollback-1.json) / [2회](calls/review-enhanced-post-commit-rollback-2.json) |

미정 입력은 마감일 필수 여부의 미정/검증 충돌을 질문으로, 잘못된 결정 귀속은 실제 사용자 답변에 없는 과거 마감일 결정을 수정으로 보냈다. 시계 정렬은 순번 수락 기준과 createdAt 우선 정렬의 모순을, commit 후 복구 주장은 저장 완료 뒤 UI 실패가 자동 롤백을 일으키지 않는다는 점을 정확히 지적했다. 빈 저장 문자열 사례 1회도 해당 문자열이 기존 키에 있는 잘못된 JSON이며 자동 덮어쓰기 예외가 보존 규칙과 모순됨을 지적했다. 이 9개 차단은 주입 결함과 무관한 임의 차단으로 계산하지 않았다.

**남는 실패:** [빈 저장 문자열 2회](calls/review-enhanced-empty-corrupt-storage-2.json)는 초기 점검과 독립 반례 점검을 모두 거쳤는데도 pass했다. 따라서 코드가 실제 근거 위치와 점검 구조를 보장하더라도 그 문장의 의미상 올바름은 보장하지 못한다. 이 후보는 시험용이며 실제 todo 기획 v4를 바꾸거나 승인한 것이 아니다.

정상 두 후보는 각각 두 번 모두 통과했고 형식 오류가 없었다. 기존 v4는 사람 점검한 후보이며 완전한 정답/일반 운영 품질을 입증하는 데이터는 아니다. 결함 후보는 한 가지 문구 수정으로 다른 절과 모순을 만들 수 있어 순수한 단일 결함 분리 연구는 아니다. 평가 중 같은 세트를 참고해 개선했으므로 독립된 미지의 평가 세트 성능으로 일반화하지 않는다.
