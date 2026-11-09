# 수정 보존·공통 검증 보완의 오프라인 기록

[구현/한계 보고서](../../review-evidence-preservation-20261109.md)를 참조한다. **실제 Gemini 호출0회이며 모델 품질 결과가 아니다.** 오늘 모바일 작업 중 로컬 실행은 필요 없다.

- [검증과 기존 자료 보호 해시](validation.json): 타입 검사/전체171테스트 통과, 기존672파일 전후 해시 일치, 실제 모델/OAuth0회.
- [전체 회귀 로그](test-output.txt): 기존158+생산 코드 회귀10+새 도구3. 모의 응답과 실제 모델 결과를 구분한다.
- [새 택배 dry-run 요약](dry-run-summary.json): 고정 응답4회/유료0회, 고정 v1→수정 v2, 요구/제약 비교9행·이전 피드백 해결2행·공통 검증1행. 실제 승인 pending과 fixture를 유지한다.
- [TEST/STUB 검토표](test-stub-bundle/review.md), [고정 기획](test-stub-bundle/plan.md), [JSON](test-stub-bundle/review.json), [번들 해시](test-stub-bundle/bundle.json). ‘반영됨’과 ‘해결됨’은 고정 응답 예시이며 실제 Gemini 판단으로 읽지 않는다.

전체 모의 실행 원자료는 Cloud `/workspace/scratch/review-evidence-preparation`에 별도로 보존했다. Git에는 이 명확히 표시한 예시·요약·검증만 남긴다. 마지막 실행은 `release-evidence-ready-20261109`이며 고정 실행기의 해시와 실제 생산 소스 일치를 확인했다. 최종 소스와 실행기를 고정한 뒤 전체171개 검사를 다시 통과했다.

이전 실제 식물/운동 원자료76개 manifest 해시와 역사적 비교162파일도 독립 검증했다. 해당 실험·승인 기록을 재실행하거나 수정하지 않았다. 새 실제 시험은 [사전 기준](../../review-evidence-live-protocol-20261109.md)에 따라 이후 PC에서 수행한다.
