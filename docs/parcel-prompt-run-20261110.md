# 택배 v2 반례 프롬프트 후보 단일 실행 준비

이전 실응답은 JSON/STOP이지만 필수 `questions`, 저장 감사 상위 근거/이유, 다섯 사례의 상태/판정이 누락돼 정식 Review 검증에서 중단됐다. 별도 [프롬프트 후보](../examples/parcel-challenge/prompt-candidate.mjs)는 정확한 필드 이름과 사례 구조를 명시하고 근거를 지어내지 않도록 한다. 이전 요청에서 systemInstruction만 변경한 [고정 후보](../examples/parcel-challenge/prompt-candidate-request.json)를 실제로 보내는 도구를 준비했다. 프롬프트의 실제 효과는 아직 미확인이다.

이 실행은 과거 성공한 일반 검토 응답을 재사용하고 새 반례만 최대1회 요청한다. 기존 관련7시도와 새 명시 상한1회를 구분한다(최초 인증 실패는 별도). 원래 실패 요청 해시를 다시 계산한 뒤 새 후보와 전체 값이 일치해야 모델에 전송한다. 기존 실행 폴더와 예약은 손대지 않으며 새 시작 예약과 SDK retry attempts=1로 같은 폴더에서 두 번째 새 호출을 막는다. 다른 새 폴더에 대한 전역 과금 한도는 아니다.

기존 production Reviewer의 JSON 파싱, 필수 필드, 정확한 인용/저장 사례, 정책 검증을 그대로 적용한다. 출력 누락·미해결 지적은 승인으로 바꾸지 않는다. 모든 Review/승인 대기는 분리한 DEMO FIXTURE 복사본에만 저장할 수 있고 최종 사용자의 승인은 자동 생성하지 않는다. Writer/기획 원본/팀원 실행은 변경하지 않는다.

실행 안내는 [Windows README](../examples/parcel-challenge/README-prompt.md). 타입 검사와 전체190개 오프라인 검사 통과, 실제 추가 Gemini/OAuth 호출0회. 짧은 경로 ZIP은 고정 커밋과 SHA-256 manifest로 식별한다. 해제 패키지178개 검사와 dry-run의 `limit_reached`/유료0회를 확인했다. [검증 기록](parcel-prompt-validation-20261110.json).
