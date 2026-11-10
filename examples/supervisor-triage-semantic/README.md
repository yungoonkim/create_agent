# Supervisor 의미 평가용 합성 입력

[사례 카드](../../docs/acceptance/triage-semantic-evaluation-20261110/cases.json) 8개를 현재 Shadow API의 정식 자료형으로 변환한다. Scope·Plan·Review는 새로 작성한 **오프라인 합성 스냅샷**이다. 실제 사용자 Scope 승인이나 Gemini의 공식 Review라고 주장하지 않는다. Review는 현재 유효성 검사가 허용하는 과거 형식이며 새 Gemini 리뷰의 품질/저장 감사 전체를 포함하지 않는다.

전체 저장소의 package.json이 있는 폴더에서 실행한다.

```powershell
npm.cmd run eval:triage-semantic -- --output C:\adtf-data\triage-semantic-01
```

존재하지 않는 새 출력 폴더를 지정한다. 모델/API 호출은 없다. 8개 폴더마다 `input.json`(기준 Policy 계산 입력), `userRequest.json`(별도 사용자 요청 또는 null), `context.json`(향후 제안 생성 입력), `gold.json`(평가자용 잠정 정답)이 나온다. `gold.json`이나 원래 `cases.json`을 제안 생성 모델에 넣지 않는다. `scorecard-blank.json`은 사람의 미채점 기록 양식이고 `manifest.json`은 각 파일의 SHA-256을 담는다.

반복 결함 사례는 직전 Review를 별도 스냅샷으로 포함하고 한도 사례는 반복 수를 명시한다. 모든 Scope/Plan/Review는 `buildShadowContext()`에서 검증되고 기존 Policy 결정이 계산된다. 수동 정답의 예시 인용은 구조 검사만 통과한다. 인용이 주장을 실제로 입증하는지는 사람이 [평가 기준](../../docs/triage-semantic-evaluation-protocol-20261110.md)에 따라 확인해야 한다.

현재 합성 입력에는 진짜 승인 레코드, 전체 품질/저장 감사, 독립 두 사람의 채점, 유료 모델의 응답이 없다. 이는 의미 평가의 **준비 자료**이며 성능 결과가 아니다. 저장된 주차 세션과 공식 승인/Review 자료는 사용하지 않는다.
