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

## 다음: STEP 2B — 실제 Writer/Reviewer 연결

- 실제 LLM Provider/Model 및 Runtime 조합을 선택하고 공식 문서와 호환성을 확인한다.
- Fake 포트를 실제 구현으로 교체하고 비밀정보 설정, 오류/사용량 기록, 승인 UX를 정의한다.
- 실제 API 호출은 별도 승인을 받은 범위에서만 추가한다.

## 후속 단계

3. Task State Manager와 수동 Development Loop 위임/검수 구현
4. 검증 증거 수집과 제한된 재작업 적용
5. 명시적 호환성 표를 갖춘 추가 Runtime Adapter
6. 실제 사용 필요가 확인된 경우 SQLite/PostgreSQL 및 웹 대시보드 검토

각 단계에서 범위를 다시 확인한다. 병렬 실행, 외부 메모리 서비스, UI는 구체적인 필요가 확인되기 전까지 추가하지 않는다.
