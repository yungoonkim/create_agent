# Supervisor 중재 v3 블라인드 오프라인 기록기

v3는 사람이 검수하기 전의 합성 입력이며 Gold는 `pending`이다. 이 명령은 모델이나 ADC를 호출하지 않는다. 기존 v2 `eval:triage-semantic` 및 `eval:triage-recorder` 명령은 그대로 사용한다. v2와 v3의 결과는 같은 조건의 점수가 아니다.

저장소 루트에서 `npm.cmd run eval:triage-semantic-v3 -- --output C:\adtf-data\triage-v3`으로 별도 v3 자료를 만든다. 새 경로만 사용하며 기존 폴더를 덮어쓰지 않는다. 이어서 다음과 같이 한 사례를 준비한다.

```powershell
npm.cmd run eval:triage-recorder-blind -- prepare-blind --source C:\adtf-data\triage-v3 --case umbrella-choice --public C:\adtf-data\triage-public-001 --private C:\adtf-data\triage-private-001
```

모델에 전달할 수 있는 파일은 `C:\adtf-data\triage-public-001\model-inputs\input.json` 하나다. 비공개 폴더에는 원본 ID, Gold, 매핑, 원본 해시가 있다. 공개 폴더 전체나 CLI 인자를 모델에 붙여넣지 않는다. 공개 폴더의 `responses\template.json`은 응답 구조 안내용이다.

수동 응답을 검증·보존할 때는 응답 파일을 별도로 작성하고 다음 명령을 사용한다. `contextSha256`은 공개 입력의 Context 해시, `author.kind`는 `offline_recorded_response`여야 한다.

```powershell
npm.cmd run eval:triage-recorder-blind -- record-blind --public C:\adtf-data\triage-public-001 --private C:\adtf-data\triage-private-001 --response C:\adtf-data\triage-response.json
```

기록기는 중립 Context에서 응답을 검증하고, finding ID와 참조를 사전으로 복원한 뒤 원본 Context에서 다시 검증한다. 비공개 `results/<UUID>/`에 원본 응답, 복원 제안, 원본 Policy baseline, 결과 및 파일 해시 매니페스트가 생긴다. 결과의 `semanticCorrectness`는 `not_evaluated`이며 실제 모델 호출 수나 의미상 성능을 증명하지 않는다. 실패한 응답은 기존 결과를 변경하지 않는다.

Gemini QA2 PR #40은 PR #35 시점의 v2 누출 반례다. 원본 테스트 파일을 수정하지 않고 최신 구현을 재검증하려면 저장소 루트에서 `npm run build`, `node --test test/triage-blind-v3.test.mjs`, `npm test`를 실행한다. 새 공식 테스트는 8개 v3 baseline, 원본 ID 비노출, 두 finding 역순 복원, 해시 연결, 위조 ID와 다른 Context 해시 거부, v2 Archive 해시 보존을 확인한다. QA2의 L-13 원문 의미와 잠정 Gold의 정답 여부는 별도 사람 검수가 필요하다.
