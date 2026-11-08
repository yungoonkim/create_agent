# 아키텍처 및 모듈 경계

## 설계 원칙

Core는 도메인 계약과 정책을 소유한다. Runtime SDK, 모델 Provider, 파일 저장소, 검증 도구는 어댑터 뒤에 둔다. Agent Runtime과 LLM Provider/Model은 별도로 선택하며, 호환성이 확인된 조합만 사용한다. 이 계약은 확인되지 않은 SDK 기능을 가정하지 않는다.

현재는 Fake 기반 오프라인 및 Vertex AI Gemini Planning, 최종 Plan 승인, 파일 기반 수동 Development Loop를 구현한다. 실제 Worker Runtime 실행과 자동 검증 증거 수집은 후속 단계다.

## 논리 모듈

| 모듈 | 책임 | 현재 상태 |
| --- | --- | --- |
| Agent Orchestrator | Loop와 프로젝트 작업 상태 조정 | 설계만 |
| Planning Loop Controller | Scope, Writer/Reviewer, 결정, 승인, 반복 한도 조정 | Fake/Gemini 구현, 최종 승인 CLI |
| Development Loop Controller | 의존성 순서로 작업 위임 및 검수 | 수동 CLI 구현 |
| Persona Engine | 역할 템플릿과 파라미터를 지시문으로 조합 | 계약/설계만 |
| Agent Runtime Adapter | 공통 요청을 Runtime 형식으로 변환하고 결과 정규화 | 인터페이스만 |
| LLM 설정 | 역할별 Provider/Model 및 Runtime 별도 선택 | 타입과 설계만 |
| Memory Store | 프로젝트 격리 및 계획/검토 이력 보존 | 로컬 파일 JSON 구현 |
| Task State Manager | 작업 상태 전이와 의존성 검증 | 프로젝트별 수동 구현 및 파일 저장소 |
| Verification Engine | 테스트·정적 분석·수동 검토 증거 정규화 | 인터페이스만 |
| Approval Manager | 사용자 승인과 Scope 변경 승인 기록 | 인터페이스만 |
| CLI | 설정 및 사용자 상호작용 진입점 | Planning 데모/Gemini, 최종 승인·수동 개발 명령 |
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

`src/development/`는 승인 Plan/Scope 참조와 작업 계약, 입력 검증, 최종 승인 연결, 수동 Controller 및 파일 저장소로 구성된다. Controller는 Core TaskStateManager를 구현하고, 파일 저장소는 작업 상태와 변경 전후 이력을 하나의 revision 스냅샷으로 교체한다. `src/cli/development.ts`는 이 포트를 사용하는 별도 명령이다. Worker 결과는 보고이며, 수동 검수 체크가 통과해야만 작업을 승인하고 후속 작업을 준비한다. 실제 Runtime 실행·도구 검증은 이 경계에 후속 구현으로 연결한다.
