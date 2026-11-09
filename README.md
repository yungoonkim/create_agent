# ADTF — Agent Development Team Framework

ADTF는 여러 AI Agent를 조율하기 위한 재사용 가능한 프레임워크다. 현재 개발 목표는 지휘자 겸 기획자 Agent 하나의 완성과 단독 검증이다. 요구 정리·기획·검토·승인·작업 지시·판단·보고를 시험하며, 팀원 Agent 관련 작업은 보류한다. 현재 Agent의 [완료·합격 기준](docs/supervisor-acceptance.md)을 따른다.

## 현재 상태

- Node.js CLI를 초기 실행 환경으로 정한다.
- TypeScript strict mode와 JSON 설정을 사용한다.
- Runtime과 LLM Provider/Model을 분리하고, Core는 특정 SDK에 종속되지 않는다.
- 프로젝트별 로컬 JSON 메모리, Fake Writer/Reviewer, Planning Controller, 오프라인 CLI 데모를 제공한다.
- 사용자 승인된 Scope와 최종 기획안 승인을 구분하며, 검토/계획 버전 이력을 보존한다.
- Gemini Writer/Reviewer와 실제 Scope 승인 CLI, 기획안 최종 승인 및 수동 Development Loop를 제공한다.
- 검증 프로필 작업은 파일 해시·실제 검사 결과를 수집하고 시도·재작업 한도를 관리한다. 객관적 검사 후 최종 완료 조건은 별도로 검수한다.
- 지휘자 기본 통합 CLI로 원문·질문 답변·Scope 제안·개별 승인·기획·작업 분해·지시서·진행 보고를 연결한다.
- 기획 중 추가 답변·Scope 변경 승인/거절 후 명시적 재개를 지원하며 원문·기획 버전·총 반복 한도를 보존한다.
- 재고·유통기한 대표 시나리오의 실제 Gemini 단독 인수를 마쳤다. Worker Runtime 자동 실행과 무인 재작업 루프는 제공하지 않는다.

소스를 처음 받는 경우 [Windows 중심 실행 가이드](docs/local-run-guide.md)를 따른다. [당초 계획 대비 구현 현황](docs/plan-vs-implementation-20261109.md)에서 ADTF 기능과 기획만 완료된 할 일 웹앱을 구분해 확인할 수 있다.

## 개발

Node.js 20 이상과 npm이 필요하다.

```sh
npm ci
npm run typecheck
npm test
npm run planning:demo
```

`npm test`는 TypeScript를 빌드한 뒤 Node 내장 테스트 러너로 핵심 계약을 확인한다. 생성 파일은 `dist/`에 저장된다.
`npm run planning:demo`는 샘플 승인 fixture를 이용해 오프라인 개선 루프를 실행한다. fixture의 Scope 승인은 실제 사용자 승인이 아니며, 데모는 최종 Plan 승인을 pending 상태로 남긴다. 메모리는 `.adtf/projects/planning-demo/`에 저장되고 기존 실행 상태가 있으면 자동으로 덮어쓰지 않고 중단한다.

## Gemini Planning (로컬 PC)

라이브 실행은 Vertex AI의 Gemini 3.8 Flash를 사용하고 Google Gen AI SDK가 로컬 ADC 자격 증명을 찾도록 한다. ADC 파일이나 토큰을 저장소에 복사하지 않는다.

```sh
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export GOOGLE_CLOUD_LOCATION="global"
npm run planning:gemini -- --config examples/planning-gemini/config.json --scope examples/planning-gemini/scope-contract.json --requirements examples/planning-gemini/requirements.md
```

실행 명령은 실제 Scope 승인을 기록하고 모델 요청에 Google Cloud 사용량이 발생할 수 있음을 알린다. 모델을 호출하기 전에 `CALL`을 입력해야 하며, 검토 통과 후에도 최종 Plan 승인은 별도로 남는다. 데모 경로는 계속 오프라인이고 실제 API를 호출하지 않는다.

## 지휘자 기본 통합 (STEP 5A)

```sh
npm run supervisor -- start --config examples/supervisor-demo/config.json --file examples/supervisor-demo/request.md
npm run supervisor -- questions --config examples/supervisor-demo/config.json --fixture examples/supervisor-demo/fixture.json
npm run supervisor -- report --config examples/supervisor-demo/config.json
```

예제는 TEST/STUB이며 실제 Gemini를 호출하지 않는다. 답변 → Scope 제안·승인 → 기획·최종 승인 → 작업 제안·수락으로 이어가는 전체 명령과 실제 Gemini 설정은 [지휘자 통합 사용법](docs/supervisor-workflow.md)에 정리했다. 자동 승인이나 실제 Worker 실행은 수행하지 않는다.

## 수동 개발 작업 관리

최종 기획안 승인을 기록한 후 작업을 생성할 수 있다. 다음 명령은 LLM API를 호출하지 않는다. 기획안 ID와 버전은 실제 Planning 메모리의 값을 사용한다.

```sh
npm run development -- plan-approve --config examples/planning-gemini/config.json --plan planning-gemini-sample-plan --reason "기획안 검토 완료"
npm run development -- init --config examples/planning-gemini/config.json --plan planning-gemini-sample-plan --file examples/development-manual/tasks.json
npm run development -- list --config examples/planning-gemini/config.json
```

작업 정의 예제를 승인 기획에 맞게 수정한 뒤 `init`을 실행한다. `plan-approve`는 기획안 본문을 표시하고 해당 버전의 승인 문구를 입력받는다. 이 명령을 실행했다고 다른 기획안이 함께 승인되지는 않는다. 담당자 지정·결과 제출·수동 검수 명령은 [Development Loop](docs/development-loop.md)에 설명되어 있다.

## 문서

- [처음 읽는 총괄 PM·슈퍼바이저 안내서](docs/supervisor-guide.md)
- [지휘자 테스트 주제·절차·실행 보고서 양식](docs/supervisor-test-plan.md)
- [지휘자 통합 CLI 사용법](docs/supervisor-workflow.md)
- [STEP 5A 구현·검증 보고서](docs/step5a-report.md)
- [STEP 5B 재개·변경 승인 검증 보고서](docs/step5b-report.md)
- [실제 Gemini 인수 실행 이력](docs/gemini-acceptance-status.md)
- [아키텍처](docs/architecture.md)
- [PM Agent 명세](docs/pm-agent-spec.md)
- [Planning Loop](docs/planning-loop.md)
- [Development Loop](docs/development-loop.md)
- [검증 근거 수집과 재작업 정책](docs/verification.md)
- [STEP 4 구현·검증 보고서](docs/step4-report.md)
- [로드맵](docs/roadmap.md)
- [설계 결정](docs/decisions.md)

실제 Gemini로 질문·Scope·기획·수정·작업 지시와 격리 정책·Scope 변경 두 분기를 시험하고 [지휘자 단독 인수 최종 보고서](docs/supervisor-final-acceptance-20261108.md)에 정리했다. [Reviewer 이력](docs/acceptance/2026-11-08/reviewer-history.md)에 수정 사유와 원문을 보존했다. typecheck 및 전체 119개 테스트 통과. 사람의 Scope·기획 승인 절차를 유지하며, 실제 제품 구현·팀원 실행은 보류한다.

두 번째 주제인 [내 할 일 목록 관리 시험](docs/supervisor-todo-acceptance-20261108.md)은 쉬운 설명·사용 예시 중심으로 진행하며 Scope v6/기획 v4 사용자 승인과 작업 지시 6개의 품질 인수를 완료했다. 최신 상태는 [최종 보고서](docs/supervisor-todo-final-acceptance-20261109.md)를 따른다. 제품 구현·팀원 실행은 보류한다.

Writer·Reviewer의 [품질 절차 보완과 실제 비교](docs/planning-quality-hardening-20261108.md)를 추가했다. 새 Gemini 리뷰는 요구별 근거·고정 점검표와 통과 전 반례 검토를 사용한다. 전체 128개 테스트 통과. 고정 개발 사례에서 개선됐지만 미검출이 남아 사람의 최종 승인을 유지한다.

저장 복구 검토와 새 사례 반복 검증을 [추가 보고서](docs/reviewer-reliability-20261109.md)에 기록했다. 최종 typecheck/132개 테스트 및 깨끗한 소스 설치·오프라인 실행을 통과했다. 새 사례는 전후 모두 결함6/6 차단·정상6/6 승인 단계 도달로, 이번 표본에서 성능 향상을 주장하지 않는다. 사람 승인과 팀원 실행 보류를 유지한다.

Windows 실제 기획의 Reviewer challenge HTTP400에 대해 [긴 응답 형식 보완·저장 기획 재검토](docs/reviewer-request-recovery-20261109.md)를 추가했다. typecheck/137테스트 통과이며 수정본의 사용자 PC 실호출 재검증은 대기다. 기존 실행 데이터는 보존하고 `plan`을 다시 실행하지 않는다.
