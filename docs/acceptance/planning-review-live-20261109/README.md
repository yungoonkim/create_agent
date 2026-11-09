# 사용자 검토표 실제 재시험 기록

[최종 결과·한계](../../planning-review-live-results-20261109.md)를 우선한다. **실제 Gemini 후속 실행7회와 원문 감사는 완료했다.** 최초 인증 실패도 보존했다. 기능 흐름 확인과 완전한 품질 합격은 구분하며, 완료한 generate를 다시 실행하지 않는다.

## 실제 수신 자료

| 실행 | 원압축 | 원자료 | 관찰 |
| --- | --- | --- | --- |
| 최초 데스크톱 | [인증 실패 압축](local-1794227914170-5fd21835.tar.gz) | [요약](local-1794227914170-5fd21835/summary.json) | 요청 시도1·성공 응답0, 운동 건너뜀 |
| ADC 로그인 후 새 체크아웃 | [후속 압축](local-1794228751746-1ceb6788.tar.gz) | [요약](local-1794228751746-1ceb6788/summary.json) | 응답7·STOP7, 식물v1/운동v2 승인 대기 |

원압축 SHA-256:

- 최초: `81ac681f7048dfde0b8f6192c9f77f5edabf529bdb142fa5b692ee159984010e`
- 후속: `7dec88090afcb56802c89cdd88fa79354546f565ee7cb704becec0bad2d30bff`

경로/종류·중복·링크 안전 검사를 거친 뒤 데이터로만 읽었으며 원자료78파일과 두 manifest의76개 해시를 확인했다. 기존 실패를 지우거나 성공으로 교체하지 않았다. 두 실행에서 실제 최종 사용자 승인·제품/팀원 실행은 없다. 받은 `summary.json`의 `manualAcceptance=pending`은 불변 원자료라 수정하지 않고 진행자 판정을 따로 추가했다.

## 읽기용 기획과 검토표

- 식물: [기획 v1](local-1794228751746-1ceb6788/exports/plants/plan.md), [검토표](local-1794228751746-1ceb6788/exports/plants/review.md).
- 운동: [기획 v2](local-1794228751746-1ceb6788/exports/exercise/plan.md), [검토표](local-1794228751746-1ceb6788/exports/exercise/review.md).
- 운동 고정 초안에 대한 실제 수정 요청과 근거는 후속 실행의 `runtime/exercise/projects/trial-exercise-local-1794228751746-1ceb6788/planning/reviews/trial-exercise-local-1794228751746-1ceb6788-plan/v1.json`에 있다. API 원문은 같은 실행의 `provider/call-004.response.json`에 있다.

## 추가한 수신·감사 기록

- [수신 경위](analysis-20261109/reception.json): 원압축 해시, 최초 인증 실패와 로그인 후 별도 실행 관계, 분석 추가 API0회.
- [구조·원문·사용량 검증](analysis-20261109/verification.json): 설정/소스 일치,79개 근거객체/304개 반복 포함 인용, 검토표 재구성, 실제 요청/토큰/알려진 요금표 소계.
- [진행자 의미 감사](analysis-20261109/manual-audit.json): 사전 기준별 결과와 원문 줄, 타당한 수정 요청, 남은3개 보완점. 모델의 pass를 수정하거나 최종 승인을 대신하지 않는다.
- [보호·검증 기록](analysis-20261109/validation.json), [회귀 로그](analysis-20261109/test-output.txt).
- `analysis-20261109/frozen/`: 호출 전에 고정한 입력·실행기·해시/설정·가격·의존성 잠금 사본. 원래 생산 소스는 freeze에 기록된 Git 커밋/파일 해시로 참조한다.

기존 유료 생성 없이 원자료 해시만 검증하려면 다음을 실행한다.

```sh
node examples/planning-review-live/run.mjs verify --run-id local-1794227914170-5fd21835
node examples/planning-review-live/run.mjs verify --run-id local-1794228751746-1ceb6788
```

## 생성 전 준비 기록 (이력)

[시험 계획](../../planning-review-live-protocol-20261109.md), [당시 PC 실행 안내](../../../examples/planning-review-live/README.md)를 참조한다. 아래 호출0회는 준비 당시 관찰이며 이후 실제 결과와 구분한다.

- [준비/환경/검증 기록](preflight.json): 모델 호출0회, Cloud ADC 재인증 필요, 공유 공식 로그인 브라우저 오류, 타입 검사/158개 테스트, 기존 데이터 보존.
- [오프라인 흐름 요약](dry-run-summary.json): TEST/STUB 고정 응답이며 실모델 품질 결과가 아니다. 원래 Scope를 유지하며 두 번째 사례의 초안v1→v2 수정/검토표 내보내기를 연결했다.
- [테스트 로그](test-output.txt).

실제 실행은 ID별 하위 폴더에 요청/응답·종료 사유·실패·사용량·버전·검토표·해시를 보존했다. 완료/실패 결과를 교체하거나 live 시작 예약을 삭제하지 않는다.
