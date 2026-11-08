# 아키텍처 및 모듈 경계

## 설계 원칙

Core는 도메인 계약과 정책을 소유한다. Runtime SDK, 모델 Provider, 파일 저장소, 검증 도구는 어댑터 뒤에 둔다. Agent Runtime과 LLM Provider/Model은 별도로 선택하며, 호환성이 확인된 조합만 사용한다. 이 계약은 확인되지 않은 SDK 기능을 가정하지 않는다.

현재는 Fake/Gemini Planning, 최종 Plan 승인, 수동 Development Loop, 선택형 파일·명령 검증, 지휘자 통합 및 기획 중 추가 답변·변경 승인 후 명시적 재개를 구현한다. 실제 모델 품질 인수와 Worker Runtime 실행은 후속 단계다.

## 논리 모듈

| 모듈 | 책임 | 현재 상태 |
| --- | --- | --- |
| Agent Orchestrator | Loop와 프로젝트 작업 상태 조정 | Supervisor 기본 통합 CLI, 실제 Worker 실행 없음 |
| Planning Loop Controller | Scope, Writer/Reviewer, 결정, 승인, 반복 한도 조정 | Fake/Gemini 구현, 최종 승인 CLI |
| Development Loop Controller | 의존성 순서로 작업 위임 및 검수 | 수동 CLI 구현 |
| Persona Engine | 역할 템플릿과 파라미터를 지시문으로 조합 | 계약/설계만 |
| Agent Runtime Adapter | 공통 요청을 Runtime 형식으로 변환하고 결과 정규화 | 인터페이스만 |
| LLM 설정 | 역할별 Provider/Model 및 Runtime 별도 선택 | Planning·제안 모델 설정 구현, 실제 Runtime 선택은 후속 |
| Memory Store | 프로젝트 격리 및 계획/검토 이력 보존 | 로컬 파일 JSON 구현 |
| Task State Manager | 작업 상태 전이와 의존성 검증 | 프로젝트별 수동 구현 및 파일 저장소 |
| Verification Engine | 파일·검사 결과 수집과 제출 결과·시도 연결 | LocalVerificationEngine 및 CLI 구현, 수동 최종 검수 유지 |
| Approval Manager | 사용자 승인과 Scope 변경 승인 기록 | 파일 승인 저장 및 작업 제안 전 변경 후 재개 구현 |
| CLI | 설정 및 사용자 상호작용 진입점 | Supervisor, Planning 데모/Gemini, 최종 승인·수동 개발 명령 |
| Fake Writer/Reviewer | 결정론적 오프라인 작성 및 검토 시나리오 | 구현 |

## Planning 도메인 경계

`src/planning/contracts.ts`는 Scope Contract, 기획안 초안, 검토 결과, Loop 상태와 결정, Writer/Reviewer 입력과 포트, 모델 설정, 토큰 사용량, Planning Memory 계약을 정의한다. `src/planning/policy.ts`에는 허용 상태 전이, 구조적 Scope 비교, 버전에 연결된 검토 결과로부터 다음 동작을 고르는 순수 함수만 둔다. `controller.ts`가 흐름을 조정하고 `memory-store.ts`가 파일 입출력을 수행한다. Fake 구현은 외부 모델을 호출하지 않는다.

`src/core/`는 공통 Project, Runtime, 승인, 메모리, 검증, 작업 계약을 유지한다. Planning 계약은 `ProjectId`, `ApprovalId`, `LlmModelConfig`를 재사용한다.

## Planning 데이터 흐름

```text
사용자 요구사항
  → 초기 Scope Contract
  → ApprovalManager가 사용자 승인 기록
  → Writer가 PlanDraft v1 반환
  → Controller가 프로젝트/Scope/버전 확인 후 저장
  → Reviewer에 원본 요구사항 + 승인 Scope + 현재 기획안 + 결정 전달
      (필요 시 이전 검토 결과; Writer 전체 세션 기록은 전달하지 않음)
  → Reviewer가 정확한 기획안 버전에 대한 PlanReview 반환
  → Controller 정책 적용
      ├─ 수정 → Writer에 구조화 피드백 → 새 기획안 버전
      ├─ 사용자 입력/Scope 변경 승인 → 대기, 조용히 진행하지 않음
      └─ 검토 통과 → 사용자 최종 승인 요청
  → ApprovalManager가 사용자 결정을 기록
```

Writer와 Reviewer는 별도 역할이지만 별도 프로세스나 모델이어야 하는 것은 아니다. 서로 다른 `LlmModelConfig`를 설정할 수 있고, 초기에는 같은 모델에 다른 페르소나 지시를 사용할 수도 있다. Runtime은 별도 설정이며 호출 전에 호환성을 확인해야 한다.

## 상태와 영속화

Planning 상태는 작성, 검토, 수정, 사용자 입력 대기, Scope 변경 승인 대기, 사용자 승인 대기, 사용자 승인, 반복 한도 도달, 실패, 중단을 표현한다. Reviewer 통과는 `REQUEST_USER_APPROVAL`만 허용하며 사용자 승인을 대신하지 않는다. 기획안/검토 버전 불일치, 잘못된 반복 상태, 검토 실패는 성공으로 처리할 수 없다.

`FilePlanningMemoryStore`는 Scope/Plan/Review 이력을 추가 전용으로 기록하고 `state.json`은 임시 파일 교체로 갱신한다. 모든 프로젝트 경로에 안전한 Project ID를 적용한다. 승인 레코드는 저장소에서 조회하고 Controller가 Project ID, Subject, Status를 확인한다. Scope 승인 fixture는 오프라인 데모용이며 실제 사용자 결정을 나타내지 않는다. 오류는 프로젝트별 `planning/errors/`에 기록하고 마지막으로 저장된 상태를 보존한다.

## 의존 방향

```text
CLI → Orchestrator → Planning Controller → 순수 Planning 정책
                               ├→ Persona Engine → Runtime Adapter → Runtime SDK
                               ├→ PlanningMemoryStore / MemoryStore 어댑터
                               └→ ApprovalManager / VerificationEngine
```

Core와 Planning 계약은 SDK, HTTP 클라이언트, DB, 특정 Provider에 의존하지 않는다. 파일 저장소 등 구체 어댑터는 도메인 계약을 바꾸지 않고 추가할 수 있다.

## 수동 Development 경계

`src/development/`는 승인 참조·작업·최종 승인·Controller·파일 저장소로 구성된다. Controller는 Core TaskStateManager를 구현한다. `src/verification/LocalVerificationEngine`은 Core VerificationEngine을 구현하고 선언 파일·운영자 명령으로 객관적 근거를 수집한다. Controller는 현재 작업·기획·시도와 연결하고, 품질 실패·환경 차단·재작업 한도를 판단한다. 파일 저장소는 상태와 변경 전후 근거를 단일 revision으로 기록하고 검사 중 프로젝트 쓰기를 잠근다. 최종 완료 조건은 별도 수동 검수하며 실제 Runtime은 아직 연결하지 않는다.

## 지휘자 기본 통합 경계 (STEP 5A)

`src/supervisor/`의 Controller는 원문·질문 답변·Scope 제안과 승인·Planning·작업 제안·초기화·보고를 조정한다. Proposer 포트는 질문·Scope·작업의 미승인 데이터만 반환하며 Gemini SDK는 별도 어댑터에 둔다. 질문 답변은 원문을 대체하지 않고 Writer/Reviewer의 settledDecisions 문맥으로 전달한다. 작업 제안은 승인 출처 해시에 연결하고 요구 ID 전체 커버리지와 의존성 DAG를 검사한다. 자연어의 의미상 적합성은 별도 검토가 필요하다.

`FileSupervisorStore`는 schemaVersion 1 / revision / 불변 원문·답변·이력을 단일 파일에 원자적으로 저장한다. 프로젝트 잠금은 모델 호출과 하위 저장 작업까지 유지한다. 하위 Planning/Development 저장소 전체의 트랜잭션이나 잠금을 대신하지 않으므로 같은 프로젝트의 별도 명령을 동시에 실행하지 않는다. 승인·작업 초기화 일부 중단은 재시도 가능하지만 기획 중단의 자동 재개는 구현하지 않았다. 기존 개발 Controller와 VerificationEngine은 같은 config의 Development 명령으로 사용한다.

STEP 5B의 `PlanningContinuationController`는 대기 중인 기획의 전체 상태·원본 Scope·Plan/Review 출처 해시를 continuation에 보존한다. 질문 답변 또는 명시적 변경 결정 후 `resume-plan`으로만 다음 버전을 생성한다. 변경 승인은 변경 요청과 새 Scope 전체를 함께 결정하며 이전 승인 기록을 변경하지 않는다. `user_approved → drafting`은 작업 제안 전 승인된 Scope 변경의 명시적 재개에서만 사용한다. 새 Plan은 다시 사용자 승인을 받아야 한다.

재개 시작 권한을 먼저 저장하고 Planning 상태의 continuationId와 연결한다. 이미 완료된 기획은 supervisor 완료 기록만 복구할 수 있고, 모델 호출 도중 끊긴 drafting/reviewing 상태를 자동 재호출하지 않는다. iterationCount/maxIterations는 이전 실행에서 이어받고 설정으로 재설정하지 못한다. 모델 제안 호출의 메타데이터는 supervisor/usage.jsonl에 저장하며 원문·응답 본문·자격 증명을 넣지 않는다.
