# PM Agent 역할 및 책임

## 목적

PM은 사용자 의도를 보존하고 요구사항을 검증 가능한 기획으로 발전시키며, 명시적으로 승인된 Scope 안에서만 작업을 조정한다. PM의 판단은 사용자 승인을 대신하지 않는다.

최우선 개발 대상은 지휘자 겸 기획자 역할의 총괄 PM·슈퍼바이저 하나다. 지휘자를 독립적으로 검증한 뒤 개발·테스트 등 팀원 Agent를 하나씩 만들어 연결한다. Writer와 Reviewer는 지휘자의 기획 작성·검토를 나눈 역할이다. 현재 이 둘의 모델 호출과 Controller를 구현한 것이 전체 지휘자 또는 실제 개발 팀원의 완성을 뜻하지 않는다.

지휘자는 요구 정리·질문·Scope 제안, 기획 작성·검토·승인 관리, 작업 분해·지시서, 결과 검수·재작업·중단 판단, 진행 보고를 맡는다. 현재 구현과 남은 기능은 [전체 안내서](supervisor-guide.md), 최종 평가 방법은 [테스트 계획](supervisor-test-plan.md)을 따른다.

## Planning Writer

- 원본 요구사항을 분석하고 승인된 Scope Contract 안에서 기획안을 작성한다.
- Reviewer의 구조화된 피드백을 반영하되 기존 요구사항을 유지하고 새 버전으로 반환한다.
- 기능을 기본적으로 추가하지 않고, 단순하고 명확하며 검증 가능한 기획을 우선한다.
- Controller에 결과를 반환한다. Scope Contract나 공유 메모리를 직접 수정하지 않는다.

## Planning Reviewer

- 원본 요구사항, 승인된 Scope, 현재 기획안, 확정된 결정을 대조한다.
- 범위 위반, 누락, 모순, 구현 위험, 검증 불가 항목을 찾는다.
- 심각도와 개선 방향이 포함된 구조화된 이슈를 반환한다.
- Writer의 결론을 무조건 신뢰하지 않는다. Writer의 전체 대화 기록을 요구하지 않고 검토 통과를 사용자 승인으로 처리하지 않는다.
- 새 기능 제안은 현재 기획안에 조용히 추가하지 않고 변경 요청으로 분리한다.

Writer와 Reviewer는 독립된 역할이지만 별도 프로세스일 필요는 없다. 초기에는 동일 모델을 서로 다른 페르소나 지시와 함께 호출할 수 있다.

## 역할별 모델 설정

`PlanningModelConfig`는 별도의 `writer`, `reviewer` 설정을 갖는다. 각 설정은 공통 `LlmModelConfig`(`providerId`, `modelId`)와 페르소나 ID를 사용한다. 이는 `RuntimeTarget`과 별개이며, Runtime과 모델은 따로 설정하고 호환성을 임의로 가정하지 않는다.

다음 YAML은 설정 모양의 설명 예시일 뿐 Provider 공식 규격이나 실제 저장 형식이 아니다. 저장 설정 형식은 기존 결정에 따라 JSON이다.

```yaml
pm:
  planning:
    writer: { provider: openai, model: ${PM_WRITER_MODEL}, persona: planning-writer }
    reviewer: { provider: openai, model: ${PM_REVIEWER_MODEL}, persona: planning-reviewer }
```

현재 STEP 2B의 Gemini 어댑터는 Writer/Reviewer 호출을 구현한다. 초기 설계의 Provider 예시는 실제 지원 확인을 대신하지 않는다. 수동 개발 작업 관리에는 모델 호출이 필요하지 않으며 실제 Worker Runtime은 아직 연결하지 않았다.

## Scope 권한

- 최초 Scope Contract는 사용자 승인을 받은 뒤 기획을 시작한다.
- Writer와 Reviewer는 변경을 제안할 수 있지만 승인된 스냅샷을 직접 수정할 수 없다.
- 구조적 변경과 의미상 범위 우려는 Scope Change Request와 ApprovalManager 절차로 보낸다.
- 승인된 변경은 더 높은 버전의 새 Scope Contract로 기록한다. 기존 기획안은 생성 시점의 Scope 버전을 계속 참조한다.
- 의미가 불확실하면 사용자에게 묻는다. 문자열 비교는 의미를 판정하는 Scope Guardian이 아니다.

## 페르소나 파라미터

향후 템플릿에는 `planningMaxIterations`, `developmentMaxReworkAttempts`, `approvalMode`, `verificationProfile`, `riskTolerance`, Runtime 선택을 노출할 수 있다. 잘못된 값은 조용히 보정하지 않고 설정 오류로 알려야 한다.

## 완료 기준

정확히 현재 기획안 버전이 중대/치명 이슈 없이 검토를 통과하고, 연결된 Scope 버전이 승인되었으며, 사용자가 그 기획안을 명시적으로 승인하고 결정 기록이 있을 때만 확정한다. 승인되지 않은 Scope 변경, 검증 실패, 미해결 차단 항목은 대기·중단·실패 상태를 유지한다.
