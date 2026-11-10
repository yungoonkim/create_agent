# 오프라인 Supervisor 중재 응답 기록기

이 도구는 PR #33에 포함된 합성 입력 v2와 기존 Shadow 제안 구조 검증기를 사용해, 사람이 직접 붙여 넣은 응답을 별도 평가 폴더에 기록합니다. 모델·Vertex AI·ADC·네트워크를 호출하지 않으며, 중재 제안의 의미상 정답 여부도 평가하지 않습니다.

## 입력 만들기

PowerShell에서 저장소 루트(`package.json`이 있는 `adtf-run` 폴더)를 기준으로 실행합니다. 입력과 평가 자료는 저장소 밖에 둡니다.

```powershell
npm.cmd run eval:triage-semantic -- --output C:\adtf-data\triage-v2
```

생성된 합성 입력은 `C:\adtf-data\triage-v2`에 있습니다. 입력에는 각 사례의 `context.json`, 잠정 정답은 `gold.json`, 빈 채점표는 `scorecard-blank.json`으로 각각 분리됩니다.

## 모델 입력 분리

각 사례를 새로운 평가 폴더에 준비합니다. 같은 출력 폴더를 재사용하면 도구가 기존 자료를 덮어쓰지 않고 실패합니다.

```powershell
npm.cmd run eval:triage-recorder -- prepare --source C:\adtf-data\triage-v2 --case plant-invalid-input --output C:\adtf-data\triage-eval-plant-invalid-input-001
```

평가 대상에 전달할 파일은 `model-inputs\plant-invalid-input.json` 하나입니다. 여기에는 잠정 정답과 채점표가 없고, 기존 Policy 기준선은 비교 대상으로 포함됩니다. `private-reference` 폴더는 평가 대상에 제공하지 마세요. 입력 버전, 기준 커밋, 원본·모델 입력 SHA-256은 매니페스트에 기록됩니다.

## 수동 응답 검증 및 저장

모델 API를 별도로 직접 사용했다면(이 기록기에서는 호출하지 않음), 응답을 `responses\plant-invalid-input.template.json` 형식의 JSON 파일로 직접 저장합니다. 응답 작성자는 `author.kind`를 `offline_recorded_response`로 두고, 제안은 전달받은 `contextSha256`을 그대로 포함해야 합니다.

선택적으로 공급자 UI에 표시된 값 등 수동 메타데이터를 JSON으로 준비할 수 있습니다.

```json
{
  "inputTokens": 1200,
  "outputTokens": 450,
  "cost": 0.01,
  "elapsedMs": 3200
}
```

이 값은 검증할 수 없으므로 `user_supplied_unverified`로 표시됩니다. 제공하지 않은 항목과 API 호출 없이 측정할 수 없는 값은 `null` 및 `not_measured`로 남습니다. 이 도구가 추정하거나 생성하는 측정값은 없습니다.

```powershell
npm.cmd run eval:triage-recorder -- record --workspace C:\adtf-data\triage-eval-plant-invalid-input-001 --case plant-invalid-input --response C:\adtf-data\triage-eval-response.json --metadata C:\adtf-data\triage-eval-metadata.json
```

응답은 기존 오프라인 구조 검증기로 검사합니다. 잘못된 참조나 다른 입력의 `contextSha256`을 사용하면 저장을 거부합니다. 유효한 구조는 의미상 정답이라는 뜻이 아니며 결과에 `semanticCorrectness: not_evaluated`로 기록됩니다. Policy 기준선(`policy-baseline.json`), 파싱한 제안(`proposal.json`), 원본 응답 바이트(`response.raw.json`), 요약과 메타데이터(`result.json`)를 각각 저장하며 매니페스트가 네 파일의 SHA-256을 묶습니다. 재기록은 기존 결과를 덮어쓰지 않고 새로운 UUID 폴더를 추가합니다.

## 검증

```powershell
npm.cmd run typecheck
npm.cmd test
```

테스트가 만드는 사례와 `recordType: synthetic_test_input_not_model_result` 결과는 기록기의 안전 동작 확인 자료입니다. 실제 모델 호출, 의미상 성능, 비용 또는 응답 품질의 증거로 사용하면 안 됩니다.
