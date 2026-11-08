# ADTF 개발 인수인계

마지막 정리: 2026-11-08 (Asia/Seoul)
개발 환경: Codex Cloud `/workspace/create_agent`

## 현재 상태

STEP 1 / 1.5 / 2A / 2B / 3까지 구현했다. 현재 브랜치는 `feature/manual-development-loop`이며, Gemini 연결 코드 `4d78972`를 기반으로 한다. 다음 단계는 STEP 4의 검증 증거 수집과 제한된 재작업이다.

- TypeScript 타입 검사 통과, Node 테스트 53개 통과(기존 40개 + STEP 3 신규 13개).
- 신규 CLI 통합 테스트에서 기획안 최종 승인 → 작업 생성 → 담당자 지정 → 결과 제출 → 수동 검수 → 후속 작업 준비를 Cloud의 격리된 임시 디렉터리에서 확인했다.
- Gemini 실제 호출은 사용자가 Windows PC에서 ADC로 실행한 화면으로 확인했다. Writer Plan v1 저장, Reviewer 결과, REQUEST_USER_APPROVAL까지 도달했다. 이 기획안의 실제 최종 사용자 승인을 Cloud에서 대신 기록하지 않았다.
- Cloud는 Windows 로컬 ADC 또는 `.adtf` 데이터에 접근하지 않는다. 개발 및 오프라인 검증은 모바일의 Cloud 대화에서 이어갈 수 있다. 컴퓨터 페어링은 필요하지 않다.

## 주요 구현

- `src/planning/`: Fake/Gemini Writer·Reviewer, Planning Controller, 검토 정책, JSON 설정과 파일 저장소.
- `src/development/plan-approval.ts`: Plan의 최종 승인 및 상태 갱신, 실제 Scope 승인 확인. 승인 레코드 기록 후 중단되면 동일 명령으로 상태 갱신을 마칠 수 있다.
- `src/development/controller.ts`: 프로젝트별 TaskStateManager와 수동 작업 생성·위임 기록·결과 제출·검수·차단·취소·재작업.
- `src/development/validation.ts`: 외부 JSON, 버전, 프로젝트, DAG, 체크 결과와 완료 조건 검증.
- `src/development/memory-store.ts`: 작업 및 변경 전후 이력을 단일 schemaVersion 1 / revision 스냅샷으로 저장. 잠금, 기대 revision 비교, 임시 파일 교체를 사용한다.
- `src/cli/development.ts`: `plan-approve`, `init`, `list`, `assign`, `submit`, `review`, `transition`.
- `examples/development-manual/`: 편집용 작업/결과/검수 예제. 검수 파일 기본값은 미검토(false)다.

## 경계와 정책

- Core는 SDK에 의존하지 않는다. Runtime과 LLM Provider/Model은 별개다.
- 승인 Plan/Scope와 작업 정의는 불변이다. 개발 상태는 출처 버전·승인·해시를 매 변경 시 확인한다. Scope의 DEMO FIXTURE 승인은 실제 개발을 허용하지 않는다.
- 작업은 실제 사용자 승인 기획에 연결해야 한다. 수동 작업 분해가 의미상 Scope에 맞는지는 사람이 검토한다.
- 선행 작업 검수 승인 전 실행할 수 없고, 제출 결과 또는 모든 완료 조건에 대한 수동 검수 없이 작업을 승인할 수 없다.
- Worker 결과는 보고된 주장이다. 이 단계의 assign은 실제 Worker를 실행하지 않고, submit은 파일 존재나 변경 내용을 자동 확인하지 않는다.
- 검수 실패 후에는 명시적 재작업 명령을 사용한다. 새 시도는 이전 결과/검수를 재사용하지 않으며, 이전 내용은 이력에 보존된다. 자동 재작업 및 횟수 한도는 STEP 4 범위다.
- `.adtf`의 기존 기록을 삭제하거나 덮어쓰지 않는다. stale lock을 자동 제거하지 않으며 쓰는 프로세스가 없는지 먼저 확인한다.
- 인증 토큰이나 ADC 파일을 채팅, 저장소 또는 프로젝트 메모리에 넣지 않는다.

## 다음 작업

1. STEP 4에서 실제 검증 프로필과 증거 계약을 정의한다.
2. 실제 산출물 및 검사 결과를 Worker 주장과 독립적으로 확인한다.
3. 실행 시도와 재작업 횟수를 분리하고, 실패·한도 초과·환경 차단을 처리한다.
4. 실제 Runtime Adapter는 호환성 확인 후 별도 단계로 연결한다.

검증 명령은 `npm run typecheck`, `npm test`다. 새 구현의 재현 명령 및 입력 형식은 README와 docs/development-loop.md를 따른다.
