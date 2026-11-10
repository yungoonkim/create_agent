# 택배 반례 프롬프트 후보 실응답

사용자가 전달한 `prompt-1794283531575-fc89d831.tar.gz` 원본 SHA-256은 `1f94b450510e7c1dcad3d7e7799db4a7b0b8c0d1e45cac2defbbb7340d6c10b4`이다. 안전한 tar 경로/링크 검사 후 원본과 요청·응답·요약·오류를 [manifest](acceptance/parcel-prompt-20261110/manifest.json)에 보존했다. 기존 일반 검토 재사용, 새 SDK 요청1회, Gemini `STOP` 응답, 이번 총9,775토큰(입력6,357·출력2,139·thinking1,279)이 기록됐다.

Gemini가 별도로 작성한 분석을 원본과 대조했다. `storageAudit.cases`의 `valid.trigger.evidenceLines`가 `[58,60,62,63,64,65,66,67,68,69,70]`으로 **11개**이고, `evidenceFromLines`와 `refs`는 각각 최대8개만 허용한다. 이 사실과 `challengeCompleted:false`, `formalReviewSaved:false`는 일치한다. `failure.json`은 허용목록만 저장하므로 정확한 예외 문자열·스택 자체는 파일에 없다. 따라서 Gemini의 `bindStorageAudit` 내부 예외 설명은 코드 흐름에 부합하지만, 오류 파일이 그 스택을 직접 증명하는 것은 아니다.

원본을 수정하지 않고 별도 임시 복사본의 이 배열만 `[58,62,63,64,65,66,67,70]`로 바꿔 오프라인 production adapter를 재생했다. 이 **가정 시험**에서는 `REQUEST_USER_APPROVAL`·`awaiting_approval`까지 통과했다. 이는 남은 필드가 로컬 구조/정책 검사를 통과할 수 있음을 보여주지만, 원래 모델 응답에 대한 정식 Review나 사용자 승인을 만들지 않는다. 인용의 의미상 충분함도 입증하지 않는다.

프롬프트 후보에 모든 `evidenceLines` 배열의 최대8개 제한을 명시하는 것이 합리적이다. 다만 모든 검증 규칙을 8개 라인에 각각 인용할 필요는 없고, `valid` 조건을 충분히 대표하는 라인과 공통 검증 규칙의 연결을 유지해야 한다. 모델이 다시 제한을 지킬지 미확인이다. 기존 실행 예약/압축은 보존하고 재실행하지 않는다. 관련 이력은 기존7+이번1=8시도(최초 인증 실패는 별도), 이번 추가 상한 소진. 이 분석의 새 유료 호출0회.
