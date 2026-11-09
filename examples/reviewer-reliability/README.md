# Reviewer 저장 복구 신뢰성 평가

완료된 실제 Gemini 평가의 입력·baseline·실행 코드다. 실제 프로젝트 승인이나 개발 작업을 만들지 않는다. 결과와 한계는 [보고서](../../docs/reviewer-reliability-20261109.md)를 먼저 읽는다.

- cases.json과 freeze.json: 구현 전에 고정한 회귀 2종/새 사례 6종, 해시·정답·반복 수. 정답/결함 이름은 모델 문맥에 전달하지 않는다.
- baseline/: f95fa75의 관련 모듈 원본. run.mjs가 기존 TypeScript로 별도 빌드한다.
- run.mjs: 최종 빌드와 ADC·GCP 환경이 준비된 루트에서 사용하는 유료 모델 시험. 단계별 출력 폴더가 이미 있으면 중단하며 완료된 시험을 중복 실행하지 않는다.

실행했던 순서는 `npm run build`, `node --use-env-proxy examples/reviewer-reliability/run.mjs regression --run-live`, ID 스키마 보완 후 `regression-fixed --run-live`, 소스 고정 후 `holdout --run-live`다. 프록시가 없는 로컬 환경에서는 Node의 `--use-env-proxy` 옵션이 필요하지 않다. 위 단계의 기존 결과는 docs/acceptance/reviewer-reliability-20261109에 모두 있으므로 다시 호출하지 않는다. 과거 최초 회귀 구현은 해당 결과 폴더에도 보존했다.

이제 이 세트는 결과를 이미 확인한 회귀 자료다. 다음 구현 개선을 독립 평가하려면 새 후보/해시/실행 ID를 정하고 별도 결과 경로를 사용한다. 기존 폴더를 삭제해서 같은 평가를 새 시험처럼 만들지 않는다. 원응답·실패·usage는 유지하며 실제 `.adtf` 파일은 시험 전후 동일해야 한다.
