# 단계별 개발 로드맵

## 완료: STEP 1 — 프로젝트 초기화와 설계 기반

- 프로젝트 문서, strict TypeScript 설정, Core 공통 포트, Node 테스트 러너 구성
- 모델 호출, Worker 실행, 자동 Loop 미구현

## 완료: STEP 1.5 — Planning Loop 아키텍처 및 계약

- Writer/Reviewer 책임과 역할별 Provider/Model 설정
- 버전 Scope Contract, 변경 요청, 기획안/검토 결과, Loop 상태/결정 계약
- Controller 소유의 추가 기록형 Planning Memory 계약과 토큰 사용량 기록
- 상태 전이, Scope 구조 비교, 검토 결과 결정 정책의 순수 함수와 계약 테스트
- LLM, 저장소, CLI, 자동 Loop 미구현

## 완료: STEP 2A — 오프라인 PM Planning Loop

- JSON 설정 검증, 프로젝트별 파일 Memory Store, Fake Writer/Reviewer, Controller, CLI 데모
- Scope 승인 fixture 검증, append-only Plan/Review 버전, 반복 한도, 사용자 승인 대기 및 실패 기록
- LLM API, Runtime Worker, 자동 최종 승인 미구현

## 완료: STEP 2B — 실제 Writer/Reviewer 연결

- **확정:** Gemini를 Vertex AI에서 사용하고, 인증은 로컬 PC의 Application Default Credentials (ADC)로 처리한다.
- Google Gen AI SDK (`@google/genai`)와 Vertex AI 조합을 공식 문서 기준으로 적용한다.
- **확정:** Writer와 Reviewer는 `gemini-3.8-flash`를 사용한다. GCP 프로젝트와 위치는 로컬 실행 환경 변수로 받는다.
- 비밀 키 파일을 저장소에 넣지 않는다.
- 기존 Fake 데모와 별도로 Gemini 포트 구현, 오류/사용량 기록, 실제 Scope 승인 CLI를 추가했다.
- 사용자의 Windows 로컬 실행 결과에서 Writer 생성·저장, Reviewer 검토와 최종 승인 대기까지 확인했다. Cloud에서 로컬 ADC를 공유하거나 실제 API를 재호출한 검증은 아니다.

## 완료: STEP 3 — 작업 상태 관리와 수동 Development Loop

- 최종 기획안 승인 명령과 승인된 Plan/Scope 스냅샷 연결
- 수동 JSON 작업 분해, 산출물/완료 조건/검증 방법, 의존성·순환 검사
- 담당자 지정, 결과 제출, 수동 검수, 명시적 재작업·차단·취소 전이
- 프로젝트별 파일 상태/이력, 버전 충돌 및 동시 쓰기 방지
- Worker 결과는 보고된 내용으로 취급한다. 실제 Runtime 실행과 도구 기반 증거 수집은 후속 단계다.

## 개발 우선순위: 지휘자 먼저, 팀원은 이후

우선 지휘자 겸 기획자 Agent 하나를 완성하고 독립적으로 테스트한다. 현재 Writer/Reviewer와 수동 작업 관리가 그 기반이다. 실제 개발·테스트 팀원 Agent는 지휘자 검증 이후 하나씩 연결한다.

전체 역할과 완료 기준은 [슈퍼바이저 안내서](supervisor-guide.md), 첫 주제와 정상·실패 시나리오는 [지휘자 테스트 계획](supervisor-test-plan.md)에 정리한다. 테스트 계획은 실행 결과나 사용자 승인 기록이 아니다.

## 후속 단계

4. 검증 증거 수집과 제한된 재작업 적용 (다음)
5. 지휘자 통합: 요구 정리·질문·Scope 제안과 변경 승인 후 처리, 기획·작업 분해·지시서·진행 보고를 연결하고 지휘자 단독 인수 테스트
6. 팀원 Agent를 하나씩 구현하고, 명시적 Runtime/Provider/Model 호환성을 확인해 실제 위임·결과·검수 연결
7. 실제 사용 필요가 확인된 경우 SQLite/PostgreSQL 및 웹 대시보드 검토

각 단계에서 범위를 다시 확인한다. 병렬 실행, 외부 메모리 서비스, UI는 구체적인 필요가 확인되기 전까지 추가하지 않는다.
