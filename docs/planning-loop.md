# Planning Loop 설계

## 흐름

1. 원본 요구사항과 프로젝트 맥락을 읽고 목표, 제약, 성공 조건, 미확정 사항을 추린다.
2. 필수/제외 기능과 제약을 포함한 버전 Scope Contract를 만들고 사용자 승인을 요청한다. 승인 전에는 기획안을 작성하지 않는다.
3. Writer가 승인된 프로젝트와 Scope 버전에 연결된 Plan Draft v1을 작성한다.
4. Reviewer에게 원본 요구사항, 승인 Scope, 현재 초안, 확정 결정, 관련 있는 이전 검토 결과를 전달한다. Reviewer는 정확한 기획안 ID와 버전에 연결된 구조화 결과를 반환한다.
5. Controller가 Review 구조와 프로젝트·Plan·Scope 참조를 저장 전에 검증한다. 유효한 Review를 저장한 뒤 Scope 위반, 이슈 심각도, 반복 이슈, 반복 한도에 따라 다음 동작을 선택한다.
6. 수정은 덮어쓰지 않고 새 기획안 버전을 만든다. Reviewer는 새 버전을 검토하고 과거 초안과 검토 결과는 보존한다.
7. 검토 통과 시 사용자 승인을 요청한다. ApprovalManager에 명시적 승인 결정이 기록된 경우에만 사용자 승인 상태로 전환한다.

## 결정과 중단 정책

`decideAfterReview`는 순수 정책 함수이며 Loop 실행기가 아니다. 반환하는 결정은 다음과 같다.

STEP 5B에서는 `PlanningLoopController.resume`을 Supervisor의 명시적 재개 경로로 연결했다. 추가 답변 또는 승인/거절된 Scope 변경을 검증한 뒤 같은 Plan ID의 다음 버전으로 진행한다. 원문·이전 스냅샷·총 반복 한도를 보존하며, 일반 `run`의 기존 상태 재실행 금지는 유지한다. 입력·승인 명령과 중단 복구의 한계는 [지휘자 통합 사용법](supervisor-workflow.md)을 따른다.

- `REVISE`: 수정할 중대 이슈가 남았고 반복 한도를 넘지 않은 경우
- `REQUEST_USER_INPUT`: 필수 정보나 사람의 판단이 필요하거나 같은 중대 이슈가 반복된 경우
- `REQUEST_SCOPE_CHANGE_APPROVAL`: 검토에서 범위 위반을 찾은 경우. 변경을 승인하기 전까지 수정 루프를 진행하지 않는다.
- `REQUEST_USER_APPROVAL`: 중대/치명 이슈 없이 검토를 통과한 경우. 이는 승인 자체가 아니다.
- `STOP_LIMIT_REACHED`: 수정은 필요하지만 설정된 반복 한도를 모두 사용한 경우
- `FAILED`: 프로젝트/기획 버전 불일치, 잘못된 반복 상태, 검토 실패

현재 반복 횟수와 최대 횟수는 명시적으로 관리한다. 설정/Controller에서 한도를 검증하며, 정수가 아니거나 음수인 현재 횟수, 0 이하의 한도, 최대 초과 횟수는 실패 처리한다. 반복 이슈는 ID, 유형, 관련 요구사항 ID를 비교하고 심각도 진행을 고려한다. 동일 ID·유형·관련 요구사항에서 심각도가 낮아지면 개선으로 보고 반복 실패 후보에서 제외한다. 심각도가 유지되거나 높아지면 사용자 입력을 요청한다. ID·유형·관련 요구사항이 다르면 결정론적으로 동일 이슈라고 확정하지 않는다. 이 비교는 설명 문장의 의미를 판정하지 않으며, 의미가 불확실하면 Reviewer 또는 사용자가 판단한다. 범위 위반은 일반 수정 동작보다 우선한다.

Controller는 검토 결과의 프로젝트 ID, Plan ID, 현재 Plan 버전을 확인한다. 이전 검토가 제공되면 같은 프로젝트와 Plan에 속하고 현재 버전보다 낮은지도 확인한다. 잘못된 연결은 `FAILED`다. `pass`와 중대/치명 이슈가 함께 있으면 사용자 승인 요청으로 보내지 않고 `REVISE`로 처리한다. `pass`와 범위 위반 또는 현재 승인 Scope와 다른 Plan Scope가 함께 있으면 일반 승인 흐름으로 보내지 않는다.

`canTransitionPlanningState`는 상태 간 허용 간선만 확인한다. `user_approved` 상태를 만들기 전 Controller는 ApprovalManager에서 승인 기록을 확인해야 한다.

## STEP 2A 오프라인 실행

`PlanningLoopController`는 승인된 Scope를 먼저 확인한 뒤 Writer → Plan 저장 → Reviewer → Review 정합성 검증 → Review 저장 → 정책 판단을 순차 실행한다. 기본 샘플 시나리오는 v1에서 개선 요청, v2에서 통과를 반환하고 최종 상태를 `awaiting_approval`로 저장한다. `always-revise`는 설정된 검토 횟수만큼 호출한 뒤 `limit_reached`로 멈추며 추가 Writer 호출을 하지 않는다. `stale-review`, `scope-violation`, `pass-with-major`, `needs-user-input` 시나리오로 중단 경계도 확인할 수 있다.

Review는 `scopeContractId`와 `scopeVersion`을 명시적으로 포함한다. 공통 파서는 필수 필드, enum, 배열, 버전, ID, 시각을 확인하고, 참조 검증은 현재 프로젝트·Plan ID/버전·승인 Scope와 일치하는지 확인한다. 파일 저장소도 같은 검증을 재사용하며 참조 Plan의 실제 존재와 Scope 승인 기록을 확인한다. 버전 파일은 추가 전용이며 중복 저장은 `REVIEW_DUPLICATE`로 거부한다.

구조/참조 오류가 있는 응답은 정식 `reviews/`에 기록하지 않는다. Controller가 `planning/errors/`에 오류 코드와 마지막 정상 상태를 기록하고 `state.json`을 `failed`로 전환한다. 내용상 중대 이슈나 Scope 변경을 지적한 구조적으로 유효한 Review는 정상 기록으로 보존한 후 기존 정책에 따라 재작업 또는 승인 대기로 보낸다. 승인과 반복 제한 규칙은 유지한다. 과거 Review 파일에 새 Scope 필드가 없다면 읽기 검증에서 거부하며 자동 수정하거나 삭제하지 않는다.

설정은 JSON이며 `providerId`는 이번 단계에서 `fake`만 허용한다. 실제 Provider를 지정하면 실행 전에 오류를 낸다. `requireUserApproval`은 반드시 `true`여야 한다. 설정의 메모리 디렉터리와 CLI 입력 파일 경로는 프로젝트 루트 안으로 제한한다.
외부 JSON의 평면 `providerId`/`modelId`는 내부 `PlanningRoleConfig.model`로 변환하며 Writer/Reviewer의 모델과 페르소나는 독립적으로 유지한다.

## Vertex AI Gemini 라이브 실행

라이브 실행은 별도 `planning:gemini` 명령으로 수행한다. 설정은 `providerId: "vertex-ai"`를 요구하고, Vertex AI 프로젝트는 `GOOGLE_CLOUD_PROJECT`, 위치는 `GOOGLE_CLOUD_LOCATION`에서 읽는다. 위치를 지정하지 않으면 `global`을 사용한다. 기본 예제는 Writer와 Reviewer 모두 `gemini-3.8-flash`를 선택한다.

라이브 CLI는 모델 호출 전에 `CALL` 확인을 받고, 아직 승인 기록이 없는 Scope는 별도 문구로 승인을 기록한다. Reviewer의 통과는 최종 Plan 승인이 아니며, Controller는 최종 사용자 승인을 pending으로 남긴다. API 오류와 토큰 사용량은 로컬 Planning 메모리에 기록한다. ADC 자격 증명 파일을 저장소나 `.adtf`에 복사하지 않는다.

로컬 실행 준비와 명령은 README의 **Gemini Planning (로컬 PC)** 항목을 따른다. 오프라인 데모는 기존 Fake 어댑터만 사용하고 외부 요청을 보내지 않는다.

```sh
npm run planning:demo
```

데모 Scope 승인 fixture는 승인 레코드의 Subject/Project/Scope 링크를 확인해 로컬 저장소에 불러온다. 이 fixture는 실제 사용자가 승인한 기록이 아니며 CLI도 그렇게 표시한다. 최종 Plan 승인 요청은 새 pending 승인 레코드로 저장하고 자동 승인하지 않는다.

파일은 `.adtf/projects/{projectId}/scope/v{version}.json`, `scope/approval-links/`, `planning/plans/{planId}/v{version}.json`, `planning/reviews/{planId}/v{version}.json`, `planning/state.json`, `planning/errors/`에 저장한다. Approval Manager 레코드는 `.adtf/approvals/`에 둔다. Plan/Review/Scope 스냅샷은 이미 존재하는 버전을 덮어쓰지 않는다. 상태 파일은 임시 파일 기록 후 교체한다.

이미 상태가 있는 프로젝트는 자동 resume하지 않고 기존 상태를 보존하며 명확히 중단한다. 저장/Writer/Reviewer 오류는 별도 오류 파일에 작업명과 마지막으로 저장된 상태를 남긴다.

범위 변경 승인 대기는 `awaiting_scope_change_approval` 상태로 표현한다. 현재 구현은 변경 요청 생성과 대기까지다. 승인 후 새 Scope 버전을 만들고 새 버전 기준으로 다시 초안을 작성하는 처리, 거절 후 복귀·중단을 선택하는 처리는 향후 지휘자 통합 범위다.

## Scope Contract와 변경 승인

최초 계약에는 프로젝트 ID, 목표, 고유 ID가 있는 필수/제외 기능, 기술 제약, 선택적 일정/비용 제약을 포함한다. Scope Contract는 불변 스냅샷이며 승인 상태의 단일 원본은 ApprovalManager다. `ScopeApprovalRecord`는 해당 ApprovalManager 기록 ID와 Scope 스냅샷을 연결한다. 변경 제안은 기준 Scope ID/버전과 승인 ID에 연결된 별도 `ScopeChangeRequest`다. 승인된 변경만 다음 Scope 버전으로 만든다. 거절되면 현재 승인 스냅샷은 바뀌지 않는다. Writer와 Reviewer는 Scope를 확정 변경할 수 없다.

`compareScopeContracts`는 프로젝트 ID, 증가 버전, 목표, 요구사항 ID/문구, 제외 기능, 제약, 선택 경계의 정확한 구조 차이를 확인한다. 의미상 동등성이나 의미를 판정하지 않는다. Reviewer가 의미를 검토하고 불확실하면 사용자 확인을 요청한다. 독립 LLM Scope Guardian은 만들지 않는다.

## 공유 프로젝트 메모리

Writer와 Reviewer에게 필요한 맥락은 Controller가 명시적으로 불러와 전달하며, 두 역할은 결과를 반환한다. 검증된 결과를 영속 저장하는 주체도 Controller로 제한한다. 같은 파일을 동시 수정하지 않는다. `PlanningMemoryStore` 인터페이스와 로컬 파일 구현은 분리되어 있다.

권장 파일 구조:

```text
projects/{projectId}/
├── requirements.md
├── scope/
│   ├── v1.json
│   └── approval-links/{scopeContractId}.json
├── decisions.md
├── planning/
│   ├── plans/{planId}/v1.json
│   ├── plans/{planId}/v2.json
│   ├── reviews/{planId}/v1.json
│   ├── reviews/{planId}/v2.json
│   ├── state.json
│   ├── errors/{errorId}.json
│   └── scope-changes/{changeRequestId}.json
└── backlog.json

.adtf/approvals/{approvalId}.json
```

모든 조회/기록은 프로젝트 ID에 한정한다. 과거 기획안과 검토를 덮어쓰거나 삭제하지 않는다. 경로는 설계 예시이며, 파일 경로만 전달해 LLM이 내용을 읽는다고 가정하지 않는다.

## 사용량 기록

`TokenUsageRecord`는 Provider/Model, Writer/Reviewer 역할, 프로젝트/기획안/반복 번호, 선택적 입력·출력·캐시 입력·추론 토큰, 성공/실패, 실행 시간, 선택적 오류, 기록 시점을 표현한다. Provider가 일부 값을 주지 않을 수 있어 토큰 수는 선택 필드다. 토큰 사용량과 금전 비용은 다른 개념이며 이번 단계에는 요금표나 비용 계산이 없다.

## 현재 구현과 남은 범위

STEP 2B에서 실제 Gemini Writer/Reviewer 호출을 구현했고, STEP 3에서 최종 Plan 승인 CLI와 수동 Development Loop를 추가했다. 최종 Plan 승인은 `npm run development -- plan-approve ...`로 기록하며 GUI는 아직 없다.

대화 기반 요구 정리·Scope 제안, 변경 승인 후 이어가기, 자동 작업 분해, 지휘자 통합 진입점, 실제 Worker, 자동 검증·재작업, 메모리 자동 resume, 다중 Agent 실행, 외부 DB 및 웹 대시보드는 남은 범위다. 먼저 지휘자를 독립적으로 완성·검증한 뒤 팀원 Agent를 하나씩 연결한다. [전체 안내서](supervisor-guide.md)와 [테스트 계획](supervisor-test-plan.md)을 참고한다.

새 기능은 준비된 Node.js 환경에서 타입 검사와 해당 자동 테스트로 검증한다. 실제 모델 호출·사용자 승인·미실행 시나리오는 오프라인 테스트 통과와 구분해 기록한다.

## 근거 기반 기획 검토

새 Gemini Review는 qualityAssessment v1의 요구별 판단과 7개 고정 점검을 필수 제출한다. 현재 기획의 근거 줄 번호를 받아 코드가 원문을 추출·확인한다. 필수 요구/점검 누락이나 존재하지 않는 근거는 실패이며, 모델 pass여도 missing은 수정, needs_user_input은 질문으로 처리한다. 기존 총 반복 예산·Scope/최종 기획 승인 경계는 유지한다.

과거 qualityAssessment 없는 Review는 호환해 읽으며 새 검사 근거가 있는 것처럼 변환하지 않는다. 구조 검증은 인용의 실제 존재를 보장하며 인용이 판정의 의미를 충분히 뒷받침하는지는 별도 판단이다. [역할 지침·프로토콜·실제 평가](planning-quality-hardening-20261108.md)를 참고한다.

통과 후보는 같은 Reviewer의 독립 반례 점검을 최대 한 번 더 거친다. 앞선 현재 판정을 전달하지 않으며 반례/질문은 최종 Review에 합친다. 두 번째 요청이 실패하면 앞 pass를 반환하지 않는다. 논리적 기획 반복 한도는 유지하지만 실제 모델 요청은 리뷰 절차당 최대2회이므로 `reviewStage`별 사용량을 따로 확인한다. 의미상 결함을 모두 검출하는 보장은 아니며 최종 비교에서도 미검출 사례를 보존했다.


### JSON 저장 상태와 복구 허용 근거

새 반례 검토는 storageAudit로 저장 형식을 식별한다. JSON이면 absent/present_empty/invalid/valid/read_error 각각의 실제 선언 동작·원문 근거·판정·승인 Scope 근거 ID를 제출한다. 다른 형식·저장 없음은 JSON 상태표를 강요하지 않는다. 코드는 누락/중복·잘못된 인용·알 수 없는 근거를 거부하며, 기존 JSON 초기화/덮어쓰기에 허용 근거가 없거나 동작이 미정/unsafe이면 pass여도 수정으로 보낸다. 명시 승인된 임시 캐시 복구는 허용한다.

원문은 코드가 줄 번호로 추출하고 허용 근거 ID는 승인 Scope의 goal/필수 요구/기술 제약에서만 선택한다. 이슈의 relatedRequirementId는 태그 없는 실제 요구 ID만 사용한다. 구조·근거 존재 검증이 의미 적합성의 증명은 아니다. 과거 storageAudit 없는 기록은 유지하고 Reviewer 최대2요청/총 반복 예산·사람 승인을 보존한다. [구현·실제 시험·중간 실패와 한계](reviewer-reliability-20261109.md)를 참고한다.
