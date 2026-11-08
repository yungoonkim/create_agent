# ADTF 개발 인수인계

마지막 정리: 2026-11-06 (Asia/Seoul)  
작업 위치: `D:\Project`

## 현재 상태

ADTF(Agent Development Team Framework)는 프로젝트, Agent Runtime, LLM Provider/Model, Persona를 분리하는 재사용 가능한 AI 개발팀 프레임워크다. 현재 개발 대상은 총괄 PM의 Planning Loop다.

**STEP 2A 오프라인 구현과 안정화 코드까지 반영했다. TypeScript 컴파일, 테스트, CLI 실행은 아직 검증하지 못했다. STEP 2B는 시작하지 않았다.**

`roadmap.md`의 STEP 완료 표시는 코드와 문서 작성 상태다. 실행 검증 통과를 뜻하지 않는다. 다음 세션에서는 기능 확장보다 현재 코드의 검증을 먼저 진행한다.

## 완료한 STEP

| 단계 | 반영 내용 | 실행 검증 상태 |
| --- | --- | --- |
| STEP 1 | Node.js/TypeScript strict 설정, Core 타입·포트, AGENTS.md, 아키텍처 및 로드맵 | 미검증 |
| STEP 1.5 | Writer/Reviewer 역할, Scope Contract, Plan/Review/상태/결정 계약, 역할별 모델 설정, 사용량 계약, 순수 정책 함수 | 미검증 |
| STEP 1.5 안정화 | 선택적 토큰 필드 접근 수정, 심각도 개선을 고려한 반복 이슈 판정, 현재/이전 Review 참조 검사 | 미검증 |
| STEP 2A | JSON 설정, 로컬 파일 메모리, Fake Writer/Reviewer, Controller, CLI, 파일 시스템 통합 테스트 | 미검증 |
| STEP 2A 안정화 | 알려진 타입 불일치 5건과 테스트 초기화/오류 메시지 문제 2건 수정, Review 저장 전 구조·참조 검증, 회귀 테스트 | 미검증 |

## 가장 최근 작업

최근 안정화에서는 다음 코드를 수정했다. 아래 항목은 소스에 반영된 수정이며 컴파일 성공을 확인한 결과는 아니다.

- `config.ts`: 선택적인 `ApprovalRecord.rationale`을 안전하게 확인한다. 외부 JSON의 평면 `providerId`/`modelId`를 내부 `PlanningRoleConfig.model`로 변환한다. Writer/Reviewer의 모델과 페르소나는 독립적이다.
- `contracts.ts`: `PlanningErrorRecord`와 `PlanningMemoryStore.appendError()`를 공통 Planning 계약으로 정의했다. `PlanReview`에 `scopeContractId`와 `scopeVersion`을 필수 필드로 추가했다.
- `memory-store.ts`: `MemoryEvent`를 실제 정의가 있는 Core에서 가져온다. Review 스키마·참조 검증을 재사용하고, 참조 Plan/Scope와 승인 기록을 확인한 후 버전 파일을 추가한다. 중복 버전은 `REVIEW_DUPLICATE`로 거부한다.
- `policy.ts`: `parsePlanReview()`와 `validatePlanReview()`가 구조 검증과 품질 판단의 경계를 제공한다. 안정적인 `ReviewValidationError.code`를 사용한다.
- `controller.ts`: Review를 검증한 후 저장하고 품질 정책을 적용한다. 구조/참조 오류나 Review 저장 실패는 별도 오류 로그와 `failed` 상태로 남긴다.
- 기존 테스트의 승인 연결 fixture 중복 생성 문제를 수정했다. Scope 스냅샷 불일치는 `SCOPE_SNAPSHOT_MISMATCH` 식별자로 검사한다.
- 기존 28개 테스트 시나리오를 유지하고 회귀 시나리오 12개를 추가했다. 현재 정의된 실행 시나리오는 총 40개다. 이 중 6개는 데이터 배열을 순회해 생성한다.

현재 진행 중인 별도 기능 구현은 없다. 남은 우선 작업은 실행 환경에서 위 변경을 검증하고 결과를 기록하는 것이다.

## 다음 세션에서 먼저 할 일

1. `AGENTS.md`를 읽고 실제 소스와 현재 환경을 다시 확인한다.
2. `node --version`, `npm --version`, `git --version`을 확인한다. 이 세션에서는 모두 명령을 찾지 못했다. 사용자가 도구를 준비했거나 PATH가 변경되었을 수 있으므로 이전 결과를 영구적인 사실로 가정하지 않는다.
3. Node.js 20 이상과 npm을 사용할 수 있으면 다음 명령을 순서대로 실행한다.

```sh
npm install
npm run typecheck
npm test
npm run planning:demo
```

4. 타입 오류와 테스트 실패가 있으면 현재 안정화 범위에서 수정한다. 실행한 명령, 실제 테스트 수, 통과/실패 수를 기록한다.
5. 정상 데모의 Plan v1/v2, Review v1/v2, 최종 `awaiting_approval` 상태와 pending 승인 레코드를 확인한다. 잘못된 Review가 정식 `reviews/`에 생성되지 않고 오류 로그와 실패 상태가 남는지도 확인한다.
6. 검증을 마친 뒤 이 문서의 검증 상태를 갱신하고 사용자에게 보고한다. 실제 LLM 연동은 별도 STEP 2B 지시 후 진행한다.

도구를 시스템 전체에 임의 설치하지 않는다. 기존 `.adtf` 데이터가 있으면 삭제하거나 덮어쓰지 않는다. 필요하면 데모 입력 fixture와 설정을 격리된 실행 루트로 복사하고, 그 루트 안의 별도 메모리 디렉터리를 사용한다. CLI의 설정/입력 경로는 실행 시 프로젝트 루트(`process.cwd()`) 안으로 제한된다.

## 검증 기록과 미해결 사항

- Node.js/npm/Git은 현재 명령 경로에서 발견되지 않았다. 일반적인 시스템 설치 경로에서도 Node.js/Git 실행 파일을 확인하지 못했다. Git 상태와 커밋 이력은 검증하지 못했다.
- `npm run typecheck`, `npm test`, `npm run planning:demo`는 실행을 시도했으나 npm 명령을 찾지 못해 시작되지 않았다. `npm install`은 실행하지 않았다.
- 실행된 테스트는 0개다. 정의된 40개 시나리오의 통과/실패 여부는 모두 미검증이다. TypeScript 오류가 0건이라고 주장하면 안 된다.
- PowerShell을 이용한 `package.json`, `tsconfig.json`, 데모 JSON 파일의 구문 파싱은 통과했다. 이는 TypeScript 설정 로더의 실행 검증을 대신하지 않는다.
- 마지막 확인 시 `.adtf` 디렉터리는 없었으며 실제 데모 산출물은 생성하지 않았다.
- 새 Scope 필드가 없는 과거 Review 파일은 읽기 검증에서 거부한다. 자동 마이그레이션이나 삭제는 구현하지 않았다.
- 중간 상태 자동 재개는 구현하지 않았다. 기존 상태가 있으면 명확히 중단하고 보존한다.
- 최종 사용자 승인 입력 UI/CLI는 아직 없다. 정상 데모는 승인 대기 상태에서 끝난다.

## 실행 흐름과 저장 정합성

```text
설정 검증 및 원본 요구사항 저장/확인
  → 저장된 Scope 스냅샷과 승인 레코드 확인
  → Writer → Plan 버전 저장
  → Reviewer
  → Review 구조·프로젝트·Plan·Scope 참조 검증
  → 유효한 Review 저장
  → Policy 결정
      ├─ REVISE → 새 Plan 버전으로 반복
      ├─ 사용자 입력 / Scope 변경 승인 대기
      ├─ 사용자 최종 승인 대기
      └─ 반복 한도 도달 / 실패
```

구조적 오류와 기획 품질 문제를 구분한다.

- 잘못된 프로젝트/Plan/Scope 참조, 누락·잘못된 필드, 중복 Review 버전: 정식 Review 저장 금지. Controller가 오류 로그와 `failed` 상태를 기록한다.
- 구조적으로 유효한 중대 이슈 또는 Scope 변경 제안: 정상 Review로 보존하고 기존 정책에 따라 재작업/승인 대기로 보낸다.
- 유효한 검토 통과: 최종 사용자 승인 요청만 생성한다. 사용자 승인을 자동 처리하지 않는다.
- Writer 호출 등 일반 실행 오류: 별도 오류 로그에 마지막으로 저장된 정상 상태를 남기고 예외를 반환한다. 기존 상태를 무조건 실패 상태로 덮어쓰는 정책은 아니다.

`maxIterations`는 Controller에서 완료한 검토 횟수 기준이다. `always-revise`와 한도 3이면 Plan/Review v1~v3 뒤에 멈추고 Writer를 네 번째 호출하지 않도록 구현했다.

## 주요 파일

| 파일 | 책임 |
| --- | --- |
| `src/core/types.ts` | Runtime/모델/승인/공통 프로젝트 포트 |
| `src/planning/contracts.ts` | Planning 데이터, 역할 포트, 상태, 메모리·오류 기록 계약 |
| `src/planning/config.ts` | 외부 JSON 검증, 내부 역할 설정 변환, 경로 및 데모 fixture 검증 |
| `src/planning/policy.ts` | 순수 정책, Review 스키마·참조 검증, 오류 코드 |
| `src/planning/controller.ts` | 승인 확인, 순차 실행, 저장 순서, 상태 전이 및 중단 |
| `src/planning/memory-store.ts` | 로컬 JSON 파일, 추가 전용 버전, 상태 임시 파일 교체, 승인·오류 기록 |
| `src/planning/fake-writer.ts` | Scope 안의 초안 및 피드백이 포함된 후속 버전 생성 |
| `src/planning/fake-reviewer.ts` | 개선/한도/버전 오류/Scope 위반/모순된 통과/사용자 판단 시나리오 |
| `src/cli/planning.ts` | 오프라인 데모 진입점 |
| `test/contracts.test.ts` | Core 계약 테스트 |
| `test/planning-contracts.test.ts` | 순수 Planning 정책·계약 테스트 |
| `test/planning-loop.test.ts` | 임시 디렉터리 통합 테스트 및 저장 정합성 회귀 테스트 |
| `examples/planning-demo/` | 설정, 요구사항, Scope, 명시적인 데모 승인 fixture |

## 메모리 구조

```text
.adtf/
├── approvals/{approvalId}.json
└── projects/{projectId}/
    ├── requirements.md
    ├── decisions.md                    # 있으면 확정 결정으로 읽음
    ├── scope/
    │   ├── v{scopeVersion}.json
    │   └── approval-links/{scopeContractId}.json
    └── planning/
        ├── plans/{planId}/v{version}.json
        ├── reviews/{planId}/v{version}.json
        ├── scope-changes/{changeRequestId}.json
        ├── errors/{errorId}.json
        └── state.json
```

Plan/Review/Scope 버전과 원본 요구사항은 덮어쓰지 않는다. 최신 상태와 승인 결정 갱신은 임시 파일 기록 후 교체한다. 승인 레코드는 전역 ID로 조회하지만 Controller와 저장소가 프로젝트·Scope·Subject·Status 연결을 확인한다. 샘플 Scope 승인 fixture는 실제 사용자 결정이 아니며 CLI에 이를 표시한다.

## 유지할 설계 결정

- TypeScript strict, JSON 설정, Node 내장 모듈과 테스트 러너를 사용한다. 불필요한 의존성이나 인프라를 추가하지 않는다.
- Core는 특정 SDK/Provider에 의존하지 않는다. Agent Runtime과 LLM Provider/Model을 구분하며 호환성을 임의로 보장하지 않는다.
- Writer/Reviewer는 별도 역할과 설정을 갖지만 반드시 별도 프로세스/모델일 필요는 없다.
- 승인된 Scope와 핵심 요구사항은 사용자 승인 없이 변경하지 않는다. Reviewer 통과와 최종 사용자 승인은 별개다.
- Scope/Plan/Review는 버전 불변 이력으로 보존한다. Writer/Reviewer는 저장소에 직접 쓰지 않고 Controller에 결과를 반환한다.
- Review의 구조·참조 검사와 의미·품질 판단은 별개다. 문자열 비교로 요구사항의 의미적 동일성을 보장하지 않는다.
- 반복 이슈는 ID·유형·관련 요구사항·심각도 진행을 함께 본다. 심각도 감소는 개선으로, 유지/증가는 미해결 후보로 취급한다.
- 토큰 사용량과 금전 비용을 구분한다. Provider가 주지 않은 토큰 필드는 선택적으로 남긴다.
- 프로젝트 공유 메모리와 Runtime 세션 기억을 구분한다. 비밀정보는 코드나 프로젝트 메모리에 저장하지 않는다.

상세 근거는 [decisions.md](decisions.md)의 D-001~D-016을 따른다. 실행 정책은 [planning-loop.md](planning-loop.md), 후속 범위는 [roadmap.md](roadmap.md)를 확인한다.

## STEP 2B 이후 범위

다음 구현 후보는 기존 `PlanningWriter`/`PlanningReviewer` 포트를 구현하는 실제 LLM 어댑터다. 먼저 Provider/Model 및 Runtime 조합을 선택하고 공식 문서, 호환성, 비밀정보 주입, 오류·사용량 기록을 확인해야 한다. 현재 설정 로더는 `fake` Provider만 허용한다.

실제 LLM API, Codex Worker, Development Loop, 병렬 Agent, 외부 DB/Vector DB, Model Router, 웹 UI는 현재 범위에 포함하지 않는다. 이 문서는 후속 기능 구현의 승인을 대신하지 않는다.
