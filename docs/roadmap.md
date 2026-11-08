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

## 완료: STEP 4 — 검증 근거와 제한된 재작업

- 선택형 작업 검증 프로필, 운영자 명령 목록, 파일·입력 해시와 실제 검사 로그 수집
- 현재 작업·기획·제출 결과·시도에 근거를 연결하고 파일 변경 후 과거 근거의 재사용 거부
- 품질 실패와 환경·설정 차단 구분, 담당자 지정 시도와 재작업 횟수 분리, 한도 차단
- 검증 중 프로젝트 쓰기 잠금, 검사 전후 승인 출처 확인, 변경 전후 증거 이력 보존
- 프로필 없는 기존 수동 작업은 기존 방식 유지. 검사 통과만으로 완료 조건의 수동 검수를 생략하지 않음
- Cloud Linux에서 타입 검사 및 전체 74개 테스트 통과. 실제 Worker 실행·전체 Git 변경 비교·통합 지휘자 인수 시험은 별도 단계

## 개발 우선순위: 지휘자 먼저, 팀원은 이후

우선 지휘자 겸 기획자 Agent 하나를 완성하고 독립적으로 테스트한다. 현재 Writer/Reviewer와 수동 작업 관리가 그 기반이다. 실제 개발·테스트 팀원 Agent는 지휘자 검증 이후 하나씩 연결한다.

전체 역할과 완료 기준은 [슈퍼바이저 안내서](supervisor-guide.md), 첫 주제와 정상·실패 시나리오는 [지휘자 테스트 계획](supervisor-test-plan.md)에 정리한다. 테스트 계획은 실행 결과나 사용자 승인 기록이 아니다.

## 완료: STEP 5A — 지휘자 기본 통합

- 요구 원문·질문 답변 보존, Scope 제안과 명시적 승인·거절, 기존 Writer/Reviewer·최종 승인 연결
- 승인 출처에 묶인 작업 제안, 요구 ID 추적과 의존성 검사, 지시서, 운영자 프로필 설정·작업 수락
- 기존 수동 Development 및 검증·재작업 정책 연결, 승인·실패·대기·미검증 상태 보고
- Gemini 제안 어댑터와 오프라인 TEST/STUB CLI; Cloud 타입 검사·전체 93개 테스트 통과
- 실제 Gemini 전체 기획 품질 시험과 Scope 변경 이후 재개는 남아 있으며 지휘자 전체 인수 완료로 간주하지 않음

## 구현 완료: STEP 5B — 추가 답변·Scope 변경 후 명시적 재개

- Reviewer 질문 수집·답변 기록·새 Plan 버전 생성, 사용자/Reviewer Scope 변경 요청·제안·승인·거절
- 이전 Scope·Plan·승인 유지, 변경 후 새 Plan 검토·최종 승인, 새 출처로 작업 생성
- 재개 권한·출처 해시·시작/완료 기록, 중단 시 중복 호출 방지, 기존 총 반복 한도 유지
- 신규 Gemini 제안 호출의 성공/실패·토큰 사용량을 별도 JSONL에 기록
- Cloud 타입 검사·전체 111개 테스트 통과(기존 93 + 신규 18). 실제 Gemini 전체 품질 인수는 대기

## 후속 단계

5. 실제 Gemini로 재고·유통기한 주제의 질문·기획·수정·변경 후 작업 지시 품질을 평가하고 지휘자 단독 인수 마무리 (다음). 현재 Cloud에는 ADC와 Vertex AI 접속 설정이 없어 실호출하지 않음
6. 팀원 Agent를 하나씩 구현하고, 명시적 Runtime/Provider/Model 호환성을 확인해 실제 위임·결과·검수 연결
7. 실제 사용 필요가 확인된 경우 SQLite/PostgreSQL 및 웹 대시보드 검토

각 단계에서 범위를 다시 확인한다. 병렬 실행, 외부 메모리 서비스, UI는 구체적인 필요가 확인되기 전까지 추가하지 않는다.
