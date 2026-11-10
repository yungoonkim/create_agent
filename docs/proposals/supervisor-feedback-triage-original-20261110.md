# ADTF Supervisor 피드백 분석·중재 기능 개선안

> 문서 유형: 현행 아키텍처 분석 및 향후 개선 제안  
> 기준 소스: `create_agent-main.zip` 내 `src/supervisor/controller.ts`, `src/planning/controller.ts`, `src/planning/policy.ts` 등  
> 작성 기준일: 2026-11-10  
> 상태: **설계 제안(미구현)** — 현행 ADTF에서 이미 수행되는 정책 분기와 신규 Supervisor 판단 기능을 구분함.

## 1. 배경과 목적

현재 ADTF의 Supervisor는 사용자 요구사항 수집, 질문, Scope 제안·승인, 기획 실행, 최종 Plan 승인, 작업 지시 생성·수락, 전체 상태 보고를 담당한다. 기획 단계에서는 `PlanningLoopController`가 **Writer → Reviewer → 정책 판단** 루프를 실행한다. 이때 Reviewer가 찾은 결함은 `decideAfterReview()`에서 분류되어 재작성, 사용자 질문, Scope 변경 승인 요청, 승인 대기, 한도 중단, 실패로 연결된다.

따라서 **현행 ADTF가 Reviewer 결과를 무조건 Writer에게 되돌리는 것은 아니다.** 이미 결정론적 정책 분기가 존재한다. 다만 **Supervisor 자체가 Reviewer의 피드백을 의미적으로 종합·중재하고, 근거를 들어 구체적인 작업 지시를 만드는 독립 판단 단계**는 제한적이다.

**개선 목표:** Supervisor를 단순한 전체 워크플로우 지휘 역할에서, 기획 루프의 **피드백 중재자(Feedback Triage & Coordination)** 역할까지 수행하도록 확장하되, 기존 정책 검증 및 사용자 승인 권한을 절대 우회하지 않는다.

## 2. 현재 구조 — 확인된 사실

### 2.1 Supervisor의 현행 책임

- `start()`: 원 요구사항 기록
- `questions()` / `answer()`: 불명확한 요구사항 질문 및 답변 수집
- `proposeScope()` / `decideScope()`: Scope 제안과 사용자 승인·거절
- `plan()`: 승인된 Scope를 기반으로 Planning Loop 실행
- `approvePlan()`: Plan 승인 문구와 저장된 버전 확인 후 승인
- `retryReview()`: 제한 조건 하에서 명시적 재검토 실행
- `proposeTasks()` / `reviseTasks()` / `initializeTasks()`: 작업 지시 제안·수정·수락
- `report()` / `continuation()`: 상태 조회, 다음 행동과 보류·계속 진행 제어

**주의:** Supervisor의 모든 동작이 개별 LLM 판단인 것은 아니다. 코드 기반 상태 전이·정책 검증도 핵심이다.

### 2.2 현재 Writer–Reviewer 루프

1. 승인된 Scope, 원 요구사항, 사용자 답변으로 Writer 컨텍스트 구성
2. Writer가 기획안 작성 또는 이전 Review 피드백으로 수정
3. Reviewer가 해당 Plan/Scope/근거를 검토
4. 구조·출처·품질 등의 검증을 거쳐 `decideAfterReview()`가 다음 행동 선택
5. `REVISE`면 피드백을 Writer로 전달하고 다음 반복 수행
6. 사용자 판단·Scope 변경이 필요하면 해당 승인·질문 대기 상태 저장
7. 수정 불필요하면 **Plan 자체를 자동 승인하지 않고** `REQUEST_USER_APPROVAL`로 전환
8. 반복 한도, 검증 오류, 실패는 적절한 중단/오류 상태로 처리

### 2.3 현행 정책 분기(중요)

| 현행 정책 결정 | 현재 의미 | 구현 여부 |
|---|---|---|
| `REVISE` | 적용 가능한 결함 피드백을 Writer에게 전달하고 재작성 | 구현 |
| `REQUEST_USER_INPUT` | 누락된 요구나 사용자 판단을 질문 | 구현 |
| `REQUEST_SCOPE_CHANGE_APPROVAL` | 승인된 Scope에 영향을 줄 변경을 별도 승인 흐름으로 보냄 | 구현 |
| `REQUEST_USER_APPROVAL` | 검토 결과를 사용자 Plan 승인 대기로 전환 | 구현 |
| `STOP_LIMIT_REACHED` | 반복 예산 소진 시 중단 | 구현 |
| `FAILED` | 검증/검토 실패, 잘못된 입력 등 실패 처리 | 구현 |

`decideAfterReview()`는 Scope 위반, 품질 감사, 저장 감사, 이전 Review의 반복 미해결 결함, 반복 예산 등을 검사한다. 이는 **정책 기반 분류**이며, 제안하는 Supervisor 의미적 중재와 혼동해서는 안 된다.

## 3. 개선하려는 핵심 간극

현행 Policy가 행동을 고르는 능력은 있으나, 다음 상황에서 Supervisor의 **설명 가능한 의미적 판단**을 추가할 가치가 있다.

- Reviewer 지적을 **실행 가능한 단일 Writer 재작업 지시**로 명확히 변환
- Reviewer가 찾아낸 불명확성을 **사용자 의사결정 vs 기획 문장 보완**으로 분리
- Writer와 Reviewer가 같은 결함을 반복해 고칠 수 없을 때 **충돌의 원인**을 요약
- 한 개의 Review에 혼재된 여러 결함의 우선순위·의존성을 정리
- Reviewer의 지적이 기존 Scope나 증거와 충돌할 때 **근거를 명시해 재검토를 요청**
- 사용자의 최종 결정을 위해 **쟁점·가능한 선택지·영향**을 간결하게 제공

단, **Supervisor LLM이 리뷰를 임의로 무효화하거나 Plan을 승인할 권한은 없다.**

## 4. 제안하는 Supervisor Feedback Triage 단계

Reviewer 결과가 저장·검증된 직후, Policy의 최종 분기 이전에 **제한된 구조화된 Supervisor 중재 제안**을 생성한다. 위험이 큰 정책 분기는 기존 결정론적 검증을 우선한다. 설계 구현 시 정확한 호출 지점은 데이터 무결성·호출 예산을 고려해 결정한다.

### 4.1 역할 분담

| 담당 | 역할 | 권한 범위 |
|---|---|---|
| Writer | 기획안 작성·수정 | 승인된 Scope 안에서만 수정 |
| Reviewer | 결함, 반례, 누락, 품질 및 근거 검토 | 발견사항과 근거 제시 |
| **Supervisor Triage (신규 제안)** | 결함 분류·조정·재작업 지시/질문 초안 | **행동 제안**만 가능 |
| Policy/Controller | 제안 검증, 허용 상태 전이, 반복/버전/승인 검증 | 최종 프로그램 결정 |
| 사용자 | 요구사항 결정, Scope 변경 승인, Plan 최종 승인 | 핵심 승인 권한 |

### 4.2 권장 분류 범주

- `WRITER_REWORK`: Scope 변경 없이 작성·논리·기술 내용을 보완 가능
- `USER_CLARIFICATION`: 사용자가 결정을 내려야 하는 불명확성
- `SCOPE_CHANGE_REQUIRED`: 승인된 요구 범위 변경이 필요한 사안
- `REVIEWER_RECHECK`: 근거 충돌·오독 등으로 Reviewer 재검토 필요
- `ESCALATE_OR_STOP`: 반복 결함, 한도 초과, 정책상 해결 불가

위 범주는 **제안하는 Triage 결과의 의미적 라벨**이며, 실제 Policy 결과 타입과 일대일로 동일하다고 가정하지 않는다. 최종 결정을 내려면 기존 `PlanningDecision`으로 안전하게 매핑해야 한다.

### 4.3 제안 데이터 계약(초안)

```ts
interface SupervisorTriageProposal {
  projectId: string;
  planId: string;
  planVersion: number;
  scopeId: string;
  scopeVersion: number;
  reviewId: string;
  findings: Array<{
    issueId: string;
    category:
      | 'WRITER_REWORK'
      | 'USER_CLARIFICATION'
      | 'SCOPE_CHANGE_REQUIRED'
      | 'REVIEWER_RECHECK'
      | 'ESCALATE_OR_STOP';
    rationale: string;
    evidenceRefs: string[];
    proposedAction: string;
  }>;
  summaryForUser: string;
}
```

이 타입은 구현 예시이며, 실제 저장 스키마·ID·타입 규칙 검토 후 확정해야 한다.

### 4.4 반드시 유지할 검증 원칙

1. **Scope 승인 우회 금지**: 변경 요청은 별도의 사용자 승인 전까지 적용 불가.
2. **Plan 자동 승인 금지**: Reviewer와 Supervisor의 긍정 판단만으로 사용자 승인을 대체할 수 없음.
3. **버전·출처 일치**: 제안은 원 Review/Plan/Scope의 ID와 버전에 결합.
4. **정책 우선**: Supervisor 제안과 기존 Policy 충돌 시 보수적 중단 또는 사용자 질문.
5. **반복 한도 준수**: Triage 추가가 무한 루프나 숨은 재시도를 만들면 안 됨.
6. **감사 가능성**: Review 원본, Supervisor 분류, Policy 선택, 사용자 결정, 실행 결과를 구분하여 기록.
7. **오류 시 안전 종료**: Triage LLM 오류나 스키마 불일치 시 승인을 자동 통과시키지 않음.
8. **실제 도입 전 기존 승인·인수 기록 보존**: 배포와 테스트를 분리하고 원본 데이터는 불변.

## 5. 예시 시나리오

### 사례 A — 단순 보완
Reviewer: “유통기한 경고의 예외 케이스가 문서에 빠져 있음.”  
Supervisor 제안: `WRITER_REWORK`; 예외 조건과 수용 기준을 명시하도록 지시.  
Policy: Scope 내 수정이며 반복 여유가 있는지 검증 → 허용 시 Writer로 회귀.

### 사례 B — 사용자 결정 필요
Reviewer: “알림 수단이 확정되지 않음. 이메일인가, 앱 내 알림인가?”  
Supervisor 제안: `USER_CLARIFICATION`; 선택지와 장단점을 사용자에게 전달.  
Policy: 기존 결정을 임의로 가정하지 않고 질문 대기로 전환.

### 사례 C — Scope 변경 필요
Reviewer: “기획을 완성하려면 승인 범위 밖의 외부 SMS 발송 기능이 필요함.”  
Supervisor 제안: `SCOPE_CHANGE_REQUIRED`; 변경 영향·비용·대안 정리.  
Policy: 별도 Scope 변경 승인 요청. 승인 전 관련 Plan 진행 금지.

### 사례 D — 반복 결함
Reviewer: “같은 치명적 결함이 두 번 연속 해결되지 않음.”  
Supervisor 제안: 반복 원인 요약, 사용자 결정 요청 또는 중단.  
Policy: 반복 문제/한도를 검사하고 허용되는 분기로만 이동.

## 6. 단계별 도입 계획

### Phase 0. 현행 기준선 확정
- 기존 `PlanningDecision`, Review 검증, Supervisor 상태 저장 및 continuation 경로를 문서화.
- 현행 테스트 통과 기준과 인수 기록 고정.

### Phase 1. 구조화된 Triage 제안(시뮬레이션)
- 실제 실행 경로에 영향을 주지 않는 **Shadow Mode**로 분류만 생성·기록.
- 현행 Policy 결정과 비교하여 일치·불일치·추가 질문 빈도 분석.

### Phase 2. 결정론적 검증 및 안전한 매핑
- 허용 가능한 분류/행동과 거부·보류 조건 정의.
- Supervisor 판단에 없는 근거 추가, 출처 변경, 승인 우회 차단.

### Phase 3. 제한적 실제 적용
- 우선 Writer 재작업 지시의 문장·우선순위 개선부터 적용.
- 사용자 질문 및 Scope 변경 제안은 명시적 기존 승인 경로로만 연결.

### Phase 4. 평가
- 기획 품질, 반복 횟수, 불필요한 질문, Scope 위반, 토큰 비용, 평균 소요 시간, 실패율을 비교.
- **개선이 입증되지 않으면 기능을 유지하지 않고 비활성화**할 수 있어야 함.

## 7. 현재 Web Console과의 관계

`adtf-web-console`은 별도의 Mock UI 프로젝트이다. 실제 Supervisor 중재는 **기존 ADTF Core의 후속 설계 대상**이며, UI에서 먼저 'Supervisor 중재'를 Mock으로 표현하더라도 실제 Core 기능이라고 표시하면 안 된다. 향후 Core에 기능이 구현되고 API로 노출되면 이벤트 타임라인에 `Reviewer feedback → Supervisor triage → Policy decision`을 순서대로 표시할 수 있다.

## 8. 범위 제외

- 독립 Worker/Developer/QA Agent 구현
- 무제한 자율 실행 또는 자동 Scope 승인
- 기존 Controller와 상태 저장소의 전면 재작성
- 새로운 DB 또는 Agent별 별도 영구 세션 강제
- 기존 시험 로그·승인 기록의 일괄 변경

## 9. 완료 기준(향후 구현 시)

- Supervisor 중재 제안이 Review·Plan·Scope 버전에 결합됨
- 모든 분기에서 기존 Policy와 사용자 승인 규칙 유지
- Reviewer 피드백에 대응하는 근거 있는 재작업 지시 생성
- 사용자 결정 사안은 추측으로 처리하지 않음
- 반복/중단 조건 유지, 숨은 자동 재시도 없음
- Triage 이전/이후 결정과 근거가 감사 로그로 분리되어 기록됨
- 기존 테스트 및 신규 승인 우회·Scope 변경·반복 결함 회귀 테스트 통과
- Shadow Mode 비교 결과로 유용성 평가

---

**핵심 결론:** ADTF는 이미 Reviewer 결과에 대한 정책 기반 분기를 갖고 있다. 새로 제안하는 것은 이 위에 **Supervisor가 의미적으로 쟁점을 정리하고 중재안을 제안하는 계층**을 추가하는 것이며, 권한의 최종 경계는 계속 Policy/Controller와 사용자 승인에 둔다.
