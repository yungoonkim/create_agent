# 택배 반례 인용 최대8개 프롬프트 후보

사용자 실응답의 `valid.trigger.evidenceLines` 11개가 production 로컬 최대8개 제한을 넘겨 정식 Review 전에 중단됐다. 원본은 [결과 보고서](parcel-prompt-result-20261110.md)와 압축으로 보존한다. 별도 [프롬프트 후보](../examples/parcel-challenge/prompt-candidate-eight.mjs)는 모든 `evidenceLines` 배열의 최대8개와 `valid` 트리거의 대표 라인 선택을 명시한다. 이전 고정 요청에서 `config.systemInstruction`만 바뀐 [후보 요청](../examples/parcel-challenge/prompt-eight-request.json)의 SHA-256은 `14ea0cb0babe7e216f9c3d52f099cb09b7c89beff4cd1d1ba15e2b8da97d7a89`다.

기존 성공 일반 검토 응답을 재사용하고 새 반례 요청만 **최대1회** 전송하는 별도 Windows 실행 패키지를 준비한다. 과거 관련8시도(최초 인증 실패 별도)와 새1회를 구분한다. 모델 호출 전 원래 실패 요청/새 후보의 해시와 전체 값을 검증하고, 새 시작 예약 및 SDK retry attempts=1을 사용한다. 지난 실행 폴더·예약·압축·기획·승인은 변경하지 않는다.

모델이 인용 수를 지킬지, 인용 내용이 충분한지, 다른 검증이 통과할지는 아직 미확인이다. 기존 정확한 줄/출처/저장 감사 및 정책 검증은 그대로 적용하며 형식 실패나 지적을 승인으로 보정하지 않는다. 정식 Review나 승인 대기는 분리한 DEMO FIXTURE 복사본에서만 가능하고 최종 승인은 자동 생성하지 않는다. [Windows 안내](../examples/parcel-challenge/README-eight.md). 타입 검사·전체193개 오프라인 검사 통과, 이 준비 작업의 실제 Gemini/OAuth 호출0회.
