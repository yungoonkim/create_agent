# 사용자 검토표 1차 검증 기록

[구현 보고서](../../planning-review-table-report-20261109.md)와 [사용 안내](../../user-planning-review.md)를 먼저 읽는다. 이 디렉터리의 독서 목록 예시는 **TEST/STUB 고정 응답**이며 실제 Gemini 품질이나 사용자 승인 자료가 아니다.

- [기획 원문](demo-bundle/plan.md) · [사용자 검토표](demo-bundle/review.md) · [검토표 JSON](demo-bundle/review.json) · [묶음 완료/해시](demo-bundle/bundle.json).
- [검증 결과](validation.json): 타입 검사/155개 테스트, 실제 호출0회, 기존 승인 프로젝트 읽기 전용 내보내기, 구형 데이터 호환과 한계.
- [테스트 로그](test-output.txt), [읽기 전후 동일한 primary50파일 해시](primary-file-hashes.json).

검증에 기존 승인 프로젝트의 변경·승인 재실행은 없다. 해당37개 체크포인트 파일은 별도로 원본과 대조했다. 새 세부 근거 없는 기존 Review는 확인 필요로 표시되지만 실제 승인 기록은 그대로다. 완료한6쌍 비교의 원자료162파일/원압축과 당시 생성기·입력·봉인 점수도 보존했다.

새 모델 응답 형식·16000 출력 한도·프롬프트의 실제 Gemini 성공과 품질 향상은 아직 확인하지 않았다. 문구 기반 읽기 예외 검사는 보수적 근거 점검이며 의미상 정답을 보증하지 않는다. 다음 품질 시험은 새 사례를 고정해 별도 실행한다.
