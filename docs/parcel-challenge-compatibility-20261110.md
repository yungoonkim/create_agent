# 반례 요청 INVALID_ARGUMENT 오프라인 호환성 후보

실패 원본의 HTTP 상태와 거부 필드가 기록되지 않았으므로 `INVALID_ARGUMENT`의 원인은 미확정이다. 저장한 원래 반례 요청은 본문 18,340바이트·스키마 2,793바이트이고, 성공한 일반 검토는 본문 37,071바이트·스키마 3,898바이트였다. 단순 길이만으로 실패를 설명할 수 없다. 다른 필드/조합/서비스 측 조건도 가능하다.

새 후보는 [거부된 원본 요청](acceptance/parcel-challenge-20261110/challenge-request.json)의 `config.responseJsonSchema` **한 필드만 제거**한다. [후보 요청](acceptance/parcel-challenge-20261110/candidate-no-schema.json)은 `responseMimeType: application/json`, 프롬프트, 모델, thinking, 출력 상한, 재시도 1, timeout, 기획 v2와 Scope 내용을 유지한다. 원본 SHA-256은 `8571e457784ea18bcd5ecd89bdcd70ae4ca2b439830f93f216d1f6c119fd7a28`, 후보 SHA-256은 `f1b70c424b287fbb5f3c15c6018280b8010fca70c019654524d62a0c9598c46a`다. 이는 전송 스키마가 거부 원인이라는 주장이 아니라 분리해 볼 수 있는 가설이다.

서버의 구조화 출력 유도가 없어지면 JSON 형태가 어긋나거나 필수 인용·저장 사례가 빠질 수 있다. 기존 `GeminiPlanningReviewer`의 JSON 파싱, 필수 필드, 정확한 줄 인용, 저장 사례, 승인 정책 검증은 그대로 적용해야 한다. 형식이 맞지 않거나 미해결 지적이 나오면 정식 승인으로 처리하지 않는다.

`examples/parcel-challenge/compatibility-candidate.mjs`는 원본 해시를 확인하고 이 필드만 제거하는 **오프라인 도구**다. 유료 호출 모드가 없다. 타입 검사와 전체184개 오프라인 검사 통과, 추가 Gemini/OAuth 요청0회. 이전의 단일 요청 예산은 이미 소진됐으므로 원래 `complete:parcel-review -- --run-live`를 재실행하지 않는다. 실제 후보 검증을 진행하려면 새 상한과 별도 단일 실행 절차를 정하고 기존 기록과 시작 예약을 보존한다.
