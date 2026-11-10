# 택배 반례 출력 형식 보완 후보

실제 `no-schema-1794277203243-9036abe9` 응답은 JSON/STOP이지만 필수 `questions` 대신 `userQuestions`를 사용했다. 저장 감사 상위 `evidenceLines`·`rationale`, 다섯 사례의 `state`·`verdict`도 빠졌다. 그 결과 production Reviewer가 `questions` 배열 검사에서 중단했고 정식 Review나 승인은 만들어지지 않았다. 원본과 사용량은 이전 결과 문서에 보존되어 있다.

이 실제 응답을 **오프라인으로 재생**한 새 검사는 동일한 중단 경로와 승인 미생성을 확인한다. 응답 필드 이름을 조용히 바꾸거나 빠진 판정을 만들어 채우지 않는다. 기존 기획/승인 자료와 실실행 요청 해시는 유지한다.

[별도 프롬프트 후보](../examples/parcel-challenge/prompt-candidate.mjs)는 `issues`, `questions`, `storageAudit`의 정확한 최상위 이름과 JSON 저장 사례·검증 규칙의 필수 필드를 먼저 명시하고, 빠진 근거를 지어내지 말라고 지시한다. [요청 후보](acceptance/parcel-no-schema-20261110/prompt-candidate-request.json)는 이전에 실제로 전송한 스키마 없는 요청에서 `config.systemInstruction`만 바꾼 것이다. 후보 요청 SHA-256은 `6866e0d20d3e7f185e07a70f6f010b6816d57f3ac43a54d1d0ec33f230b4fc39`다.

이것은 아직 모델에 보내지 않은 가설이다. 프롬프트만으로 JSON 형태나 검토 품질을 보장하지 않는다. 특히 서버 구조화 스키마를 쓰지 않으므로 누락/오타가 다시 발생할 수 있다. 기존 정확한 인용·저장 감사·정책 검증을 통과해야만 정식 Review를 고려할 수 있다. 모델이 `missing`이라고 표시한 저장 규칙 6건도 이번 형식 오류 때문에 정식 지적으로 확정되지 않았다.

과거 실행용 ZIP은 특정 커밋/요청 해시를 고정하므로 공통 프롬프트를 바꾸면 기존 도구가 의도대로 중단된다. 따라서 production 공통 프롬프트와 과거 실행기는 수정하지 않고 후보를 별도 파일로 보존했다. 향후 실제 시험은 **새 상한과 별도 실행 패키지**를 준비해야 하며, 이전 유료 실행을 반복해서는 안 된다. 이번 작업의 Gemini/OAuth 호출0회. 타입 검사와 전체188개 오프라인 검사 통과.
