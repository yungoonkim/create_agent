# 실제 Gemini 기획 품질 개발 평가

이 후보들은 TEST/STUB 평가 데이터다. 모델 결과를 실제 사용자 승인이나 제품 구현 결과로 취급하지 않는다. 현재 todo/재고의 `.adtf`와 승인 파일을 변경하지 않는 독립 어댑터 호출이며 실제 기획의 남은 반복 예산을 초기화하지 않는다.

- `baseline-google-genai.ts.txt`: 커밋 951588b의 원본 어댑터. SHA-256은 baseline-manifest.json에 고정했다.
- `cases.json`: 호출 전에 고정한 정상2/결함5 후보·원문·실제 사용자 답변. 이름/라벨/결함 설명은 모델에게 전달하지 않는다.
- `run.mjs`: 후보별2회 비교, 호출 전 started receipt, 원문 응답/ledger/요약, `.adtf` 전후 해시/파일 수 확인. 실행 경로가 이미 있으면 재호출하지 않는다.
- `review-writer-sample.mjs`: 이미 생성한 미승인 Writer 표본을 최종 프로토콜로 별도 검토한다. 정답 라벨이 없어 고정 후보 비율에 합산하지 않는다.

기존 initial/references/challenge/bounded 실행은 모두 완료했다. [보고서](../../docs/planning-quality-hardening-20261108.md)와 각 호출 기록을 먼저 확인한다. 중간 실패를 포함한 4단계 구현/평가를 보존했다. 새 평가를 수행하려면 별도 출력 실행 ID/디렉터리를 정하고 코드·후보 해시를 기록한다. started 상태의 호출을 자동 재시도하지 않는다.

사전 검증은 저장소 루트의 `npm run typecheck`, `npm test`다. 실제 호출은 기존 GCP 프로젝트/위치·ADC 및 inherited proxy/CA를 사용하고 Node의 `--use-env-proxy`로 실행한다. 인증 코드/토큰/ADC 본문을 입력 파일이나 로그에 넣지 않는다. 과거 실행 디렉터리 삭제로 중복 호출 방지 장치를 우회하지 않는다.

최종 방식은 MEDIUM thinking과 통과 후보에만 추가 반례 검토를 사용해 모델 요청·토큰이 증가한다. 이 비교는 프롬프트만의 효과를 분리하는 연구가 아니며, 개발에 사용한 소규모 사례의 반복 결과다. 모델의 의미 판단은 여전히 틀릴 수 있다.
