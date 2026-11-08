# ADTF 개발 인수인계

마지막 정리: 2026-11-08 (Asia/Seoul)
개발 환경: Codex Cloud `/workspace/create_agent`

## 최신 재개 상태 — 기획안 v1 최종 승인 대기

- 브랜치 `docs/supervisor-only-acceptance`, 기준 `2681579`에 질문·Scope 지침 및 안전한 오류 분류를 수정했다. typecheck, 전체 **112개 테스트**, diff 검사 통과.
- Cloud ADC 로그인/SDK 갱신 완료. 실제 모델 호출에 성공했다. 인증 파일은 `/workspace/.gcloud-adc/application_default_credentials.json` (권한 600)이며 토큰·코드를 출력하지 않는다. Node 24.22.1에서 `--use-env-proxy`와 파일 selector를 사용한다. GCP `iceu-songpa11` / `global`, Writer/Reviewer `gemini-3.8-flash` 유지.
- 사용자가 primary `supervisor-gemini-acceptance`의 **scope-v4 v4를 명시적으로 승인**했다. 동일 스냅샷 확인 후 승인 결정을 저장했다. qfix 비교 실행의 결함 있는 Scope는 별도 프로젝트에서 pending으로 보존한다.
- `plan` 1회 실행: Writer 기획 **v1**, Reviewer **review-1 / pass / issues 0**, iterationCount 1 / maxIterations 5 / **awaiting_approval**. 자동 수정 반복은 없었다. Supervisor revision 6 / scope_approved다.
- **현재 사용자 결정 대기:** `supervisor-gemini-acceptance-plan v1` 최종 승인. 오른쪽에 [실제 기획안 원문](acceptance/2026-11-08/primary-plan-v1.md)을 열고 승인 질문을 보냈다. Reviewer pass를 최종 사용자 승인으로 취급하지 않는다.
- [독립 점검](acceptance/2026-11-08/primary-plan-v1-assessment.md): 핵심 lot·수량·날짜·저장 규칙은 포함됐다. CLI 문법/기본 경로, 숫자 입력 표기 설명, 로드 JSON 구조/업무 검증, atomic rename 내구성 한계는 상세 작업 지시에서 구체화할 항목이다. 원본 기획은 수정하지 않았다.
- 미승인 Scope에서 plan 차단, 미승인 Plan에서 propose-tasks 차단을 실제 CLI로 확인했다. 두 차단 모두 상태·usage 변화와 후속 산출물 생성이 없었다.
- 전체 실제 모델 어댑터 호출 7회(성공 6/실패 1), 제공 토큰 입력 12,547 / 출력 6,040 / reasoning 6,004. 미제공 실패 지표는 추정하지 않았다. 모델 소요시간 합계 104,385ms.
- 다음: **사용자의 Plan v1 최종 승인** 후 approve-plan → propose-tasks. 작업 지시의 요구 추적·완료 조건·검증·의존성 및 위 점검 항목을 평가한다. 실제 제품 구현·팀원 Agent 실행은 보류한다. 추가 답변/범위 변경/전체 독립 반복 시험은 아직 남았다.

```sh
# Plan v1 승인 결정 후에만 실행한다. 현재는 사용자 결정 대기다.
node dist/src/cli/supervisor.js approve-plan --config examples/supervisor-gemini/config.json --reason "사용자가 기획안 v1 원문을 검토하고 최종 승인"
# CLI의 정확한 문구: APPROVE supervisor-gemini-acceptance-plan v1
GOOGLE_APPLICATION_CREDENTIALS=/workspace/.gcloud-adc/application_default_credentials.json node --use-env-proxy dist/src/cli/supervisor.js propose-tasks --config examples/supervisor-gemini/config.json
```

`start` 또는 일반 `plan`을 다시 실행하지 않는다. 이미 기획 상태가 있다. JSON 스냅샷·승인·ledger·점검·재현 명령은 [실제 인수 보고서](supervisor-live-acceptance-20261108.md)와 `docs/acceptance/2026-11-08/`에 저장했다. primary 실행 데이터는 [경로·SHA-256·본문 체크포인트](acceptance/2026-11-08/primary-runtime-checkpoint.json)에도 저장했다. 새 실행 환경에는 ADC와 Git 제외 `.adtf`가 자동 이전되지 않으므로 실제 파일 존재를 먼저 확인한다. 체크포인트는 자격 증명·잠금을 포함하지 않는다. 복원 시 새 상태를 덮어쓰지 않고 경로·해시·외부 데이터 검증을 적용해야 한다. 스냅샷만 보고 기획 호출이나 승인 결정을 중복 실행하지 않는다. 아래는 기존 구현 인수인계다.

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
