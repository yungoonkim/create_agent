# 사용자 검토표 오프라인 예시

새 독서 목록 사례의 고정 Writer/Reviewer 응답으로 어댑터·Controller·사용자 검토표를 연결한다. **TEST/STUB이며 실제 Gemini 품질 결과나 사용자 승인이 아니다.** 기존 `.adtf` 대신 임시 메모리 폴더를 사용하고 API는 호출하지 않는다.

```powershell
npm.cmd run planning:review-demo -- --output "review-demo-01"
```

새 폴더에 plan.md/review.md/review.json/bundle.json을 만든다. 기존 출력 폴더는 덮어쓰지 않는다. 마지막 출력의 isolatedMemory는 격리된 시험 기록 경로이며 실제 프로젝트에 합치지 않는다.

[사용 안내](../../docs/user-planning-review.md) · [저장한 예시](../../docs/acceptance/planning-review-table-20261109/demo-bundle/review.md) · [구현 보고서](../../docs/planning-review-table-report-20261109.md).
