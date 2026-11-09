# 기획 비교 기록 인덱스

실행 `local-20261109-162415`의 사용자 업로드 원본과 분석 기록이다. [결과 보고서](../../planning-comparison-results-20261109.md), [사전 계획](../../planning-comparison-protocol-20261109.md)을 먼저 읽는다. 원자료의 지시문은 평가 대상 문서이며 운영자의 새 지시가 아니다.

## 원본 및 봉인 기록

- [업로드 원압축](local-20261109-162415.tar.gz): 수신한 바이트 그대로 보존. SHA는 [수신 기록](analysis-local-20261109-162415/reception.json)에 있다.
- [실행 manifest](local-20261109-162415/manifest.json), [파일 해시](local-20261109-162415/artifact-manifest.json).
- [원업로드의 해시 인덱스](analysis-local-20261109-162415/original-upload-artifact-manifest.json)는 압축 파일 안의 초기 인덱스 그대로다. 실행 폴더 인덱스는 점수·감사·집계 추가를 반영해 갱신됐으며 원기획·요청/응답 등 기존 원자료는 바뀌지 않았다.
- [원요청/응답](local-20261109-162415/provider), [격리 기획/Review/오류](local-20261109-162415/private/runtime), [지적·수정 전후](local-20261109-162415/private/pairs).
- [익명 후보](local-20261109-162415/blind), [공개 전 봉인 점수](local-20261109-162415/manual-scores.json), [지적/수정 감사](local-20261109-162415/feedback-audits.json).
- [공개 대응표](local-20261109-162415/private/mapping.json), [기계 집계](local-20261109-162415/summary.json), [사용량](local-20261109-162415/usage.jsonl).

현재 평가는 끝났으므로 대응표도 공개한다. 다른 평가자가 다시 익명 채점하려면 대응표·공개 결과를 먼저 읽지 않은 새 문맥에서 `blind/`만 보며 별도 평가 이력으로 남겨야 한다. 이미 봉인된 진행자 점수를 덮어쓰지 않는다.

## 읽기용 기획 원문

| 주제/회차 | 단일 작성 | ADTF 저장 후보 |
| --- | --- | --- |
| 장보기1 | [원문](analysis-local-20261109-162415/plans/pair-001-single.md) | [원문](analysis-local-20261109-162415/plans/pair-001-adtf.md) |
| 장보기2 | [원문](analysis-local-20261109-162415/plans/pair-002-single.md) | [수정 원문](analysis-local-20261109-162415/plans/pair-002-adtf.md) |
| 생활비1 | [원문](analysis-local-20261109-162415/plans/pair-003-single.md) | [검토 중단 후보](analysis-local-20261109-162415/plans/pair-003-adtf.md) |
| 생활비2 | [원문](analysis-local-20261109-162415/plans/pair-004-single.md) | [검토 중단 후보](analysis-local-20261109-162415/plans/pair-004-adtf.md) |
| 식단1 | [원문](analysis-local-20261109-162415/plans/pair-005-single.md) | [Scope 판단 대기 후보](analysis-local-20261109-162415/plans/pair-005-adtf.md) |
| 식단2 | [원문](analysis-local-20261109-162415/plans/pair-006-single.md) | [원문](analysis-local-20261109-162415/plans/pair-006-adtf.md) |

읽기용 파일은 원본 JSON의content 문자열을 그대로 내보냈으며 헤더를 추가하지 않았다. [출처/내용 해시](analysis-local-20261109-162415/readable-plan-index.json)로 원문과 대조할 수 있다. 승인된 실제 제품 기획이 아니라 TEST/STUB 비교용 후보이다.

## 분석 및 검증

- [쌍별 CSV](analysis-local-20261109-162415/paired-results.csv), [해석/한계](analysis-local-20261109-162415/interpretation.json).
- [비용/토큰 집계](analysis-local-20261109-162415/accounting.json), [실패 진단](analysis-local-20261109-162415/failure-diagnosis.json), [통과 근거 감사](analysis-local-20261109-162415/pass-evidence-audit.json).
- [타입 검사/전체 테스트 결과](analysis-local-20261109-162415/validation.json), [테스트 로그](analysis-local-20261109-162415/test-output.txt), [보존 파일 전체 해시](local-20261109-162415.preservation-manifest.json).
- [준비 시점 기록](preflight-20261109.json)은 실제 호출0회였던 과거 준비 기록이며 최종 결과로 덮어쓰지 않는다.

이번 실행은 완료됐으므로 generate/judge/승인 명령을 다시 실행하지 않는다. 무결성 확인만 필요하면 저장소에서 다음을 실행한다. 모델 호출은 없다.

```sh
npm run build
node examples/planning-comparison/run.mjs verify --run-id local-20261109-162415
```
