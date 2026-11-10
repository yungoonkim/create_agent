# 중재 의미 평가 입력 점검과 v2

Codex가 공개 사례8개와 합성 입력의 일관성을 대조했다. [사례별 검토 기록](acceptance/triage-semantic-audit-20261110/audit.json)을 남겼다. 이는 AI가 수행한 자료 점검이며 독립된 사람의 의미 검수나 중재 모델의 성능 평가가 아니다. 전체8개 기대 분류는 유지하고 다음 자료 문제를 보완했다.

- 범위 밖 SMS 요구 사례의 Review 설명에서 정답을 암시하던 문장을 원문 대조 안내로 바꿨다. 기대 행동은 여전히 gold에만 있다. Reviewer의 구조화된 분류 자체가 힌트가 될 수 있으므로 이후 평가에서는 이를 알고 결과를 해석해야 한다.
- 반복 결함 사례에 실제 v1 합성 기획과 v1 Review를 넣었다. v1 지적은 현재의 '반복됐다'는 문장을 그대로 복사하지 않는다.
- Shadow 입력에 선택적 직전 Plan을 지원했다. 제공하면 같은 프로젝트·기획의 직전 버전/같은 Scope인지 확인하고 이전 Review도 그 Plan에 대조한다. 출처가 틀리면 거부한다. 기존 Review만 있는 호출자는 계속 허용하며 원문이 없다는 상태를 표시한다. 이전 원문과 지적, 반복 수/한도를 인용 가능한 references로 제공한다. Policy와 승인 결정은 바꾸지 않는다.
- 잘못된 인용 사례의 기대 답은 무관한 L1과 관련된 L2를 함께 대조하도록 보완했다. 존재하는 참조만으로 주장의 의미가 맞다고 보증하지 않는다.
- 기대 답을 '사람이 작성한 정답'으로 표시하던 문구는 실제 작성 경위와 달랐다. 현재 생성 자료는 `provisional_agent_authored_expected_answer`, 사람 검수는 pending이다. 과거 원본 카드와 v1 archive는 이력을 위해 보존한다. 과거의 human 표시는 독립 사람 검수 증거로 사용하면 안 된다.
- 빈 채점표의 errorFlags를 null로 바꿔 미채점을 오류0건과 구분했다.

현재 평가 자료는 [v2 archive](acceptance/triage-semantic-audit-20261110/synthetic-snapshots-v2.tar.gz), [파일별 해시](acceptance/triage-semantic-audit-20261110/manifest.json), [빈 채점표](acceptance/triage-semantic-audit-20261110/scorecard-blank-v2.json)를 사용한다. 기존 [v1 archive](acceptance/triage-semantic-evaluation-20261110/synthetic-snapshots.tar.gz)는 교체하지 않았다. 생성 명령은 `npm run eval:triage-semantic -- --output NEW_DIRECTORY`다.

검증: typecheck와 전체224개 테스트를 통과했다. 새 검사는 직전 원문 출처 거부·이력 포함 여부·입력 해시 변화·기존 Policy 유지 및8개 입력의 정답 분리/기대 분기를 다룬다. 생성 자료의 모든 파일 해시도 확인했다. 추가 모델 호출0회이며 기존 주차 세션과 공식 승인/Review는 변경하지 않았다. 이번 변경은 Shadow 입력과 평가 도구에 한정되고 실제 중재 실행 경로는 없다.

다음은 독립 검토자가 이 자료의 기대 답을 확인하고, 필요하면 정보 부족/복수 지적 사례를 추가한 뒤 소규모 실제 평가의 모델·프롬프트·새 호출 상한을 고정하는 단계다. 현 자료가 유효한 스모크 평가 입력이라고 해서 제품 도입이나 일반적인 의미 판단 정확도가 증명된 것은 아니다.
