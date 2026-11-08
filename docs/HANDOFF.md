# ADTF 개발 인수인계

마지막 정리: 2026-11-08 (Asia/Seoul)
개발 환경: Codex Cloud `/workspace/create_agent`

## 새 주제 시험 — 내 할 일 목록 관리, Scope v6 승인 대기

사용자가 쉬운 일상 주제로 다시 시험하도록 요청했다. 재고 시험 완료 결과는 아래에 보존한다. 새 projectId는 `supervisor-todo-acceptance-20261108`, [설정](../examples/supervisor-todo-gemini/config.json), [원문](../examples/supervisor-todo-gemini/request.md), [진행 기록](supervisor-todo-acceptance-20261108.md)이다. 같은 `.adtf` 안의 별도 프로젝트로 기록하며 기존 재고 프로젝트는 바이트 단위로 그대로다.

현재 revision 6 / scope_proposed. 실제 Gemini 질문 7개에 사용자가 모두 답했다. [답변 원문](acceptance/todo-20261108/answers.json): 웹 브라우저 버튼, 제목·메모·마감일, 수정·삭제, 완료 취소, 미완료/완료 분리·각 등록순, 동일 제목 개별 등록 허용, 내 컴퓨터 저장·세부 방식 위임. 부분 답변 3회는 answer 명령으로 순서대로 저장했고 덮어쓰지 않았다.

[Scope v6 원문](acceptance/todo-20261108/scope-v6.md), [JSON](acceptance/todo-20261108/scope-v6.json)을 생성했고 **사용자 승인 대기**다. 승인 ID `approval-36e20af8-210a-4f7b-a4bc-57bf96673f03` pending. Scope·기획 최종 승인으로 답변을 해석하지 않는다. [실행 체크포인트](acceptance/todo-20261108/runtime-checkpoint.json)를 보존했으며 start/questions/answer/propose-scope를 중복 실행하지 않는다. 다음은 사용자 Scope v6 승인 또는 수정 결정이다. 승인 시에만 approve-scope → plan으로 진행하고 새 기획도 최종 승인을 받는다. 제품 구현·팀원 실행은 보류한다. 설명은 쉬운 말·사용 예시 중심, 기술 절은 분리한다. 메모/마감일 필수 여부·날짜/시각·삭제 확인·저장 실패 동작은 아직 답변에서 확정되지 않았으며 기획 전 구체화할 항목이다.

기존 ADC로 질문·Scope 호출 성공, GCP iceu-songpa11/global / gemini-3.8-flash 유지. 타입 검사 및 전체 119개 테스트 통과. 파일/토큰 값을 출력하지 않는다. 새 시험은 아직 진행 중이므로 재고 주제의 인수 완료 판정을 새 주제에 적용하지 않는다.

## 최신 상태 — 지휘자 단독 대표 인수 완료

- 브랜치 `docs/supervisor-only-acceptance`. 구현 체크포인트 `3fef309`, typecheck 및 **119개 테스트** 통과. [최종 인수 보고서](supervisor-final-acceptance-20261108.md)를 우선한다.
- **primary 실제 상태:** 사용자 승인 Scope v4 / Plan v3, planning user_approved / iterationCount 3/5. Supervisor revision 16 / tasks_proposed, 작업 제안 5개 / taskRevisions 2개. [최종 지시서](acceptance/2026-11-08/primary-work-orders-v3.md). primary 작업 초기화·제품 구현·팀원 실행 없음.
- 질문·Scope 지침, 안전한 실패 분류, 승인 대기 기획 수정과 재개, 미수락 작업 재제안 이력, 확인 stdin EOF 실패를 개선했다. 기존 원문·승인·버전·총 예산을 보존한다.
- [승인 출처 정책 시험](acceptance/2026-11-08/approved-source-policy-fixture.json): 선행 조건/근거 부족 거부, 재작업·한도, 환경 차단·품질 카운터 구분과 사실에 맞는 보고 확인. TEST/STUB 텍스트만 사용했다.
- [독립 실제 모델 재현](acceptance/2026-11-08/approved-scope-replay-20261108/result.json): 새 Writer v1 → Reviewer revise(major 2) → Writer v2 → Reviewer pass, 2/5. 이 후보는 최종 사용자 승인하지 않았고 primary 승인 기획을 대체하지 않는다.
- 사용자가 시험 Scope v5 원문을 검토하고 **두 격리 분기 실행을 승인했으며 시험 완료**했다. [결과](acceptance/2026-11-08/scope-change-test/results.json): 거절은 Scope v4/독립 Plan v2·2/5 유지, 모델 미호출. 승인은 시험 Scope v5/새 Plan v3·Reviewer pass·3/5이며 새 기획 최종 승인 pending. 양 분기에서 과거 스냅샷·총 예산을 보존했고 실제 primary는 그대로다. 시험 요구는 N 생략 시 기본 7일이며 실제 제품 변경으로 채택하지 않았다.
- 실제 Reviewer 검토 **6회 / 수정 요청 1회**. 사유·심각도·관련 요구·수정 방향·원문은 [Reviewer 이력](acceptance/2026-11-08/reviewer-history.md)에 보존했다. primary v1→v2→v3의 수정은 사용자·진행자 요청이므로 Reviewer 자체 요청 횟수와 구분한다.
- 전체 모델 어댑터 호출 21회(성공 20/실패 1), 제공 토큰 입력 137,489 / 출력 38,749 / reasoning 16,901, 호출 시간 410,995ms. [집계](acceptance/2026-11-08/model-usage-summary.json)는 복사 ledger 중복을 제거하며 미제공 지표를 추정하지 않는다.

### 재개 시 경계

현재 사용자 목표인 사람 승인형 CLI 지휘자·기획자 구현과 재고·유통기한 대표 단독 인수는 완료했다. 팀원 Agent 설계·개발·연결·제품 구현은 사용자 재지시 전까지 보류한다. `report.progress.completed=false`는 제품 작업 미완료 의미이며 이번 지휘자 인수 판정과 다르다. 모델 pass는 사람 승인이나 무인 품질 보장이 아니다.

완료한 모델/결정 스크립트를 재실행하지 않는다. 격리 데이터는 `/workspace/scratch/approved-scope-replay-20261108`, `approved-scope-change-reject-20261108`, `approved-scope-change-approve-20261108`에 각각 있다. projectId는 기존 genuine Scope 승인 결합을 유지하기 위해 같지만 물리 메모리 루트와 실행 ID는 다르다. [원본 격리 체크포인트](acceptance/2026-11-08/scope-change-test/runtime-checkpoint.json), [거절 분기](acceptance/2026-11-08/scope-change-test/reject/runtime-checkpoint.json), [승인 분기](acceptance/2026-11-08/scope-change-test/approve/runtime-checkpoint.json)는 각 격리 루트에만 복원하며 primary와 합치지 않는다. 시험 후보의 최종 승인·작업 생성은 하지 않았다.

ADC 파일 `/workspace/.gcloud-adc/application_default_credentials.json`은 마지막 호출에서 유효했고 토큰을 출력하지 않는다. GCP iceu-songpa11/global, Writer/Reviewer gemini-3.8-flash, Node 24.22.1의 --use-env-proxy를 사용했다. [primary 체크포인트](acceptance/2026-11-08/primary-runtime-checkpoint.json)는 실제 프로젝트 데이터다. 최신 상태·해시를 확인하고 더 최신인 데이터를 덮어쓰거나 모델 호출·사용자 결정을 중복 실행하지 않는다. primary에서 start/plan/resume-plan을 다시 실행하지 않는다. 아래는 과거 구현 기록이다.

## 기존 구현 상태 (실제 인수 전 기록)

**사용자 최신 우선순위:** 현재 지휘자 겸 기획자 Agent 하나를 확실히 완성하고 테스트한다. 팀원 Agent 설계·개발·연결은 사용자 재지시 전까지 보류하며, 인수 완료 후에도 자동으로 착수하지 않는다. [현재 Agent 완료 기준](supervisor-acceptance.md)에 따라 부족한 부분을 수정·재시험한다.

STEP 1 / 1.5 / 2A / 2B / 3 / 4 / 5A / 5B의 코드를 구현했다. 현재 브랜치는 `feature/supervisor-continuation`이며 STEP 5A `792cad1`, STEP 4 `24f9d39`, 기반 문서 `f5528e0`, 수동 개발 `d5780ac`, Gemini 연결 `4d78972`를 포함한다. main 병합은 하지 않았다. 다음은 실제 Gemini로 주제별 기획 품질을 검증하는 인수 시험이다.

사용자는 지휘자 겸 기획자 Agent 하나를 먼저 완성하고 이후 팀원 Agent를 하나씩 연결하는 순서를 확인했다. 통합 CLI와 변경 후 재개는 구현했지만 실제 모델을 포함한 지휘자 전체 인수는 아직 완료하지 않았다. [전체 안내서](supervisor-guide.md), [사용법](supervisor-workflow.md), [STEP 5B 보고서](step5b-report.md)를 먼저 읽는다.

- TypeScript 타입 검사 통과, Node 테스트 111개 통과(기존 93개 + STEP 5B 신규 18개). 신규 테스트는 답변·Scope 변경 승인/거절 후 재개·새 작업 출처·총 한도·오래된 출처·중단/동시 실행 중복 호출 방지·승인 부분 저장·CLI·사용량 기록을 검증한다.
- 신규 CLI 통합 테스트에서 기획안 최종 승인 → 작업 생성 → 담당자 지정 → 결과 제출 → 수동 검수 → 후속 작업 준비를 Cloud의 격리된 임시 디렉터리에서 확인했다.
- Gemini 실제 호출은 사용자가 Windows PC에서 ADC로 실행한 화면으로 확인했다. Writer Plan v1 저장, Reviewer 결과, REQUEST_USER_APPROVAL까지 도달했다. 이 기획안의 실제 최종 사용자 승인을 Cloud에서 대신 기록하지 않았다.
- Cloud는 Windows 로컬 ADC 또는 `.adtf` 데이터에 접근하지 않는다. 개발 및 오프라인 검증은 모바일의 Cloud 대화에서 이어갈 수 있다. 컴퓨터 페어링은 필요하지 않다.

## 주요 구현

- `src/supervisor/`: 원문·질문 답변·Scope 제안·승인·기획·작업 분해·지시서·보고 통합. 모델은 제안만 반환한다. 파일 잠금·revision·불변 원문/답변/이력으로 저장한다.
- `src/supervisor/continuation.ts`: 질문 수집, 변경 요청·제안·결정, 명시적 resume-plan. 기준 상태·Scope·Plan/Review 해시를 보존하고 시작 권한을 먼저 저장한다. 총 반복 한도와 새 기획 최종 승인을 유지한다. `continuation-validation.ts`가 상태·기록과 다음 행동을 검증한다.
- `src/cli/supervisor.ts`: `start`, `questions`, `answer`, `propose-scope`, `approve-scope`, `reject-scope`, `plan`, `approve-plan`, `propose-tasks`, `configure-verification`, `initialize-tasks`, `report`. 입력 원문·답변은 파일로 받는다.
- STEP 5B CLI: `collect-feedback`, `request-scope-change --reason`, `propose-scope-change`, `approve-scope-change --reason`, `reject-scope-change --reason`, `resume-plan`. 실제 모델 설정에서도 답변/승인/보고는 API 없이 동작한다.
- `examples/supervisor-gemini/`: 실제 기획 인수용 새 projectId·maxIterations 5·Gemini 3.8 Flash 설정과 원문. 아직 실호출하지 않았다. 기존 프로젝트에 반복 실행하지 않고 새 실험에는 별도 projectId를 쓴다.
- 모델 제안 사용량은 `supervisor/usage.jsonl`, 기존 기획 역할은 `planning/usage.jsonl`에 기록한다. 성공은 JSON 응답 파싱 성공이며 Controller가 Scope나 작업을 승인했다는 뜻이 아니다. 실패 응답이 토큰을 제공하면 기록하고 없으면 추정하지 않는다.
- `examples/supervisor-demo/`: TEST/STUB 오프라인 예제. 질문·Scope·작업 제안은 고정 fixture이며 실제 의미상 품질 평가가 아니다. 실제 제안 어댑터는 Writer 모델을 재사용하고 CLI에서 CALL을 확인한다.
- `src/planning/`: Fake/Gemini Writer·Reviewer, Planning Controller, 검토 정책, JSON 설정과 파일 저장소.
- `src/development/plan-approval.ts`: Plan의 최종 승인 및 상태 갱신, 실제 Scope 승인 확인. 승인 레코드 기록 후 중단되면 동일 명령으로 상태 갱신을 마칠 수 있다.
- `src/development/controller.ts`: 프로젝트별 TaskStateManager와 수동 작업 생성·위임 기록·결과 제출·검수·차단·취소·재작업.
- `src/verification/`: Core VerificationEngine 구현, 운영자 명령 목록, 파일·입력 해시와 실제 제한된 검사 프로세스, 시도에 연결된 근거.
- `src/development/validation.ts`: 외부 JSON, 버전, 프로젝트, DAG, 체크 결과와 완료 조건 검증.
- `src/development/memory-store.ts`: 작업 및 변경 전후 이력을 단일 schemaVersion 1 / revision 스냅샷으로 저장. 잠금, 기대 revision 비교, 임시 파일 교체를 사용한다.
- `src/cli/development.ts`: `plan-approve`, `init`, `list`, `assign`, `submit`, `verify`, `review`, `transition`.
- `examples/development-manual/`: 편집용 작업/결과/검수 예제. 검수 파일 기본값은 미검토(false)다.

## 경계와 정책

- Core는 SDK에 의존하지 않는다. Runtime과 LLM Provider/Model은 별개다.
- 승인 Plan/Scope와 작업 정의는 불변이다. 개발 상태는 출처 버전·승인·해시를 매 변경 시 확인한다. Scope의 DEMO FIXTURE 승인은 실제 개발을 허용하지 않는다.
- 작업은 실제 사용자 승인 기획에 연결해야 한다. 제안 작업은 요구 ID 전체 커버리지·DAG를 검사하지만 의미상 Scope 적합성은 사람이 검토한다. 작업 수락 전 운영자가 검증 프로필·재작업 예산을 지정할 수 있으며 실행 명령 정책은 별도다.
- 선행 작업 검수 승인 전 실행할 수 없고, 제출 결과 또는 모든 완료 조건에 대한 수동 검수 없이 작업을 승인할 수 없다.
- Worker 결과는 보고된 주장이다. 이 단계의 assign은 실제 Worker를 실행하지 않고, submit은 파일 존재나 변경 내용을 자동 확인하지 않는다.
- 프로필 작업은 실제 검증 통과 근거와 모든 완료 조건의 최종 검수가 있어야 승인한다. 검증 후 선언 파일 변경 시 승인하지 않는다. 품질 재작업 예산을 적용하고 환경 차단은 별도로 처리한다. 과거 결과·검수·근거는 이력에 남기며 새 시도에서 재사용하지 않는다. 기존 프로필 없는 수동 기록은 자동 변환하지 않는다.
- `.adtf`의 기존 기록을 삭제하거나 덮어쓰지 않는다. stale lock을 자동 제거하지 않으며 쓰는 프로세스가 없는지 먼저 확인한다.
- 인증 토큰이나 ADC 파일을 채팅, 저장소 또는 프로젝트 메모리에 넣지 않는다.

## 다음 작업

실제 인수 실행 현황은 [환경 확인·실행 기록](gemini-acceptance-status.md)에 남겼다. 코드 `29160fc`로 현재 Cloud의 supervisor-gemini-acceptance intake(revision 1)를 등록했고 다음 명령은 questions다. ADC 부재와 Vertex AI/OAuth CONNECT 403을 직접 확인했으며, 실행 환경 연결 방법을 사용자에게 요청했다. 모델 호출과 사용자 Scope/Plan 승인은 아직 없다. 같은 Cloud에서는 start를 반복하지 않고, 로컬 전환 시에는 그 PC의 상태를 먼저 확인한다.

1. 실제 Gemini로 재고·유통기한 주제의 질문·한국어 기획·작업 지시 품질과 추가 답변/변경 후 흐름을 평가하고 전체 인수 보고서를 작성한다. Cloud에는 ADC와 Vertex AI 접속 설정이 없으며 로컬 자격 증명을 복사하지 않는다. 사용자가 수행한 이전 단독 Planning 실행은 이번 전체 인수로 계산하지 않는다.
2. 실제 기획·질문·변경·지시·판단·보고에서 발견한 현재 Agent의 문제를 수정하고 회귀 및 반복 인수 시험을 진행한다. 팀원과 Runtime 확장은 보류한다. 이미 제안/초기화된 작업의 Scope 변경·이관과 중단된 모델 실행의 자동 복구는 현재 한계로 기록한다.

STEP 4의 사용법과 실제 검증 근거는 [검증 안내서](verification.md), [실행 보고서](step4-report.md)에 기록했다. 이 검증은 Cloud Linux의 fixture 프로젝트에서 수행했으며 Windows 실행·실제 모델 호출·전체 제품 개발의 검증이 아니다.

Supervisor 잠금은 하위 저장소 전체의 트랜잭션이 아니다. 동일 프로젝트에서 다른 기획·개발 CLI를 병행 실행하지 않는다. Scope 결정 및 작업 초기화 직후 중단은 명시적 재시도를 지원하지만 기획 도중의 자동 복구·중복 모델 호출은 허용하지 않는다. 기존 로컬 프로젝트의 지휘자 상태 자동 가져오기는 지원하지 않으므로 새 projectId로 시작한다.

기획 재개는 작업 제안 전으로 제한한다. started continuation에 대응하는 Planning 결과가 terminal이고 ID·Scope·버전이 맞으면 완료 기록만 재시도할 수 있다. drafting/reviewing 중단은 재호출하지 않는다. 이전 schemaVersion 1 파일은 continuations/continuationId가 없어도 읽을 수 있다. 승인된 기획의 user_approved→drafting 전이는 별도 Scope 변경 승인을 거친 새 Plan 생성에서만 사용하고, 기존 승인 기획을 자동 덮어쓰지 않는다.

검증 명령은 `npm run typecheck`, `npm test`다. 새 구현의 재현 명령 및 입력 형식은 README와 docs/supervisor-workflow.md를 따른다.
