# ADTF — Agent Development Team Framework

ADTF는 여러 AI Agent를 하나의 개발팀으로 조율하기 위한 재사용 가능한 프레임워크다. 현재는 오프라인 Fake Writer/Reviewer로 총괄 PM의 Planning Loop를 실행하고 로컬 파일에 결과를 남긴다. 외부 LLM이나 Agent Runtime은 호출하지 않는다.

## 현재 상태

- Node.js CLI를 초기 실행 환경으로 정한다.
- TypeScript strict mode와 JSON 설정을 사용한다.
- Runtime과 LLM Provider/Model을 분리하고, Core는 특정 SDK에 종속되지 않는다.
- 프로젝트별 로컬 JSON 메모리, Fake Writer/Reviewer, Planning Controller, 오프라인 CLI 데모를 제공한다.
- 사용자 승인된 Scope와 최종 기획안 승인을 구분하며, 검토/계획 버전 이력을 보존한다.
- 실제 LLM/Runtime 연동과 Development Loop는 후속 단계다.

## 개발

Node.js 20 이상과 npm이 필요하다.

```sh
npm install
npm run typecheck
npm test
npm run planning:demo
```

`npm test`는 TypeScript를 빌드한 뒤 Node 내장 테스트 러너로 핵심 계약을 확인한다. 생성 파일은 `dist/`에 저장된다.
`npm run planning:demo`는 샘플 승인 fixture를 이용해 오프라인 개선 루프를 실행한다. fixture의 Scope 승인은 실제 사용자 승인이 아니며, 데모는 최종 Plan 승인을 pending 상태로 남긴다. 메모리는 `.adtf/projects/planning-demo/`에 저장되고 기존 실행 상태가 있으면 자동으로 덮어쓰지 않고 중단한다.

## 문서

- [아키텍처](docs/architecture.md)
- [PM Agent 명세](docs/pm-agent-spec.md)
- [Planning Loop](docs/planning-loop.md)
- [Development Loop](docs/development-loop.md)
- [로드맵](docs/roadmap.md)
- [설계 결정](docs/decisions.md)
