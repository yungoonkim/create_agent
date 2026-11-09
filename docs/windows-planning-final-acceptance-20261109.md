# Windows 로컬 기획 시험 결과

기준일: 2026-11-09 (한국 시간). 대상은 사용자 PC에서 실행한 ADTF 지휘자·기획자의 질문·Scope·기획·검토·수정·최종 승인 흐름이다. 제품 코드 작성·제품 브라우저 실행·팀원 Agent 연결은 포함하지 않는다.

## 현재 결론

사용자 PC에서 오프라인 데모와 회귀 검사를 통과하고 실제 Gemini로 질문·Scope·기획 v1~v4를 진행했다. Reviewer 요청 실패를 수정해 재개했고, 코드가 모델 pass에 남은 저장 문제를 차단하는 흐름과 사용자 보완 요청에 따른 수정·재검토를 확인했다. 진행자가 기획 v4 원문을 검토해 승인 대상으로 권고했으며, 사용자는 정확한 v4 승인 문구까지 실행 완료했다고 보고했다.

**기획 내용 작성·검토와 사용자 승인 결정까지 진행됐다. 마지막 `user_approved` 저장 상태 출력은 아직 받지 않았다.** 이 보고서는 사용자 완료 보고와 직접 확보한 파일·상태 관찰을 구분하며, 로컬 승인 파일을 읽었거나 Cloud에서 대신 승인했다고 기록하지 않는다. 최종 상태를 확인하면 이번 로컬 기획 시험을 완료로 확정한다. 작업 지시 생성은 별도 단계로 남기며 자동으로 진행하지 않는다.

## 실행 환경과 데이터 구분

| 항목 | 값 |
| --- | --- |
| 실행 위치 | 사용자 Windows PC, main ZIP 소스 |
| projectId | my-supervisor-20261109-112551 |
| 모델 | Vertex AI / gemini-3.8-flash, Writer·Reviewer 동일 |
| GCP | iceu-songpa11 / global / PC의 ADC |
| 승인 Scope | scope-v4 / version4 |
| 마지막 확인 기획 | v4, 반복4/5, awaiting_approval |
| 사용자 최종 승인 보고 | APPROVE my-supervisor-20261109-112551-plan v4 실행 완료 |
| 승인 후 저장 상태 | 사용자 PC에서 최종 확인 대기 |

PC의 `.adtf`는 Cloud의 기존 재고·할 일 인수 데이터와 별개다. 원본 파일을 읽어 증거 폴더에 보존했으며 Cloud 프로젝트 메모리에 복원·병합하거나 승인 레코드를 생성하지 않았다. 인증 파일·토큰·코드는 수집하지 않았다.

## 시험과 수정 이력

| 단계 | 관찰과 결과 |
| --- | --- |
| 오프라인 데모 | Fake Writer v1 → 수정 → v2 → 사용자 승인 대기. 실제 모델 미호출 |
| 최초 자동 검사 | Windows 총132개 중130통과/2제외/실패0 |
| 실제 질문·답변 | Gemini 질문6개 생성, 사용자 선택에 맞춘 답변 저장 |
| Scope | 필수 기능6개·제외 범위·제약을 제안하고 사용자 Scope v4 승인 |
| 최초 기획 v1 | Writer와 Reviewer assessment 성공 후 challenge HTTP400 INVALID_ARGUMENT |
| 요청 형식·복구 코드 보완 | 긴 기획의 반복 줄 번호 enum 축소, 정확한 근거 검증 유지, 저장 초안의 명시적 한 번 재검토. 수정 PR #7/커밋83ea913 |
| 수정본 자동 검사 | Cloud Linux137통과/실패0, 사용자 Windows137개 중135통과/2제외/실패0 |
| 로컬 재시도·기획 v2 | challenge 완료. 모델 headline pass지만 저장 상태 감사의 미해결 항목을 코드가 차단. 동일 문제 반복으로 보완 답변 대기 |
| Q-7 보완·기획 v3 | 비정상 원본 보존·쓰기 차단, 읽기 예외, 단일 JSON·무결성·커밋 경계를 수정. 실제 재개 종료0, Reviewer pass/challenge 완료, 반복3/5·최종 승인 대기 |
| PowerShell 요약 오류 | 재개 성공 뒤 네이티브 stdout 캡처의 한글 깨짐/ConvertFrom-Json 실패. 원본 v3.json은 정상 UTF-8이었다. 모델을 재호출하지 않고 원문 확인 |
| 진행자 추가 검토 | v3의 저장 마감일이 문자열 검사에 그친 점과 다중 탭 덮어쓰기 정책 누락 발견. Gemini 자체 이슈와 구분 |
| 사용자 추가 결정·기획 v4 | 날짜 실제 유효성 검사와 동시에 한 탭만 변경하는 방식을 수락. 수정 요청·재개 후 종료0/기획4/반복4/5/awaiting_approval 요약 확인 |
| v4 원문 검토 | 날짜·잠금 정책과 기존 보호 규칙의 본문·검증 사례 반영을 확인. 최종 승인 대상으로 권고 |
| 사용자 승인 | 사용자가 정확한 v4 승인 문구 실행 완료를 보고. 승인 후 저장 상태는 마지막 확인 대기 |

Windows에서 제외한2개는 프로세스 종료 신호와 작업 폴더 밖을 가리키는 심볼릭 링크 검사다. 코드에 Windows 제외가 명시돼 있다. 나머지 테스트는 자동화된 Fake·모의 모델·실제 임시 파일/검사 명령 기반이며, Gemini 의미 품질 시험과 구분한다.

## 실제로 발견한 문제와 판정의 출처

1. **검토 요청 형식:** 사용자 제공 usage에서 assessment 성공/challenge400을 확인했다. 긴 원문 줄 번호 enum이 중첩 응답 형식을 복잡하게 만드는 원인 후보를 보완했고, 이후 이 로컬 사례에서 challenge 완료를 확인했다. 서비스 측 정확한 원인 확정이나 모든 긴 기획의 안정성을 주장하지 않는다. Cloud 별도 실호출 시도는 ADC 재인증 필요 오류로 막혔고, 복구 성공 증거는 사용자 PC 결과다.
2. **저장 보호:** [v2 report](acceptance/windows-review-retry-20261109/report.json)의 headline pass와 달리 present_empty의 근거 없는 초기화, read_error의 미정 동작을 코드가 차단했다. [현재 Review의 정책 검증](acceptance/windows-review-retry-20261109/policy-check.json)에서 두 항목을 재현했다. 원래 v1 Review는 받지 않아 반복 비교 자체를 독립 재현했다고 하지 않는다.
3. **모델의 의미 누락:** v3 통과 후 사람이 날짜·다중 탭 누락을 발견했다. 사용자 수정 요청으로 v4에 반영했으며, 이를 Gemini Reviewer가 스스로 발견한 이슈나 자체 revise 횟수로 바꾸지 않는다. 모델 pass와 형식 검증은 사람의 최종 판단을 대신하지 않는다.
4. **로컬 사용성:** cmd와 PowerShell의 변수 문법 차이, 새 창의 미설정 변수, 네이티브 출력의 한글 인코딩 문제를 실제로 확인했다. 상태 확인은 직접 파일 경로와 명시적 UTF-8 파일 읽기, 짧은 상태 요약을 사용한다. 사용자가 긴 콘솔 JSON을 반복해서 복사할 필요는 없다.

## 기획 v4에서 확인한 내용

- 제목·마감일시 필수/메모 선택, 중복 제목 허용, 목록 분리·최초 등록 순서, 완료/취소, 수정·확인 후 삭제, 로컬 지속성을 유지한다.
- 날짜는 등록·수정·저장 로드·변경 후보에서 형식뿐 아니라 윤년·실제 월별 날짜·시분 범위를 검사한다. 잘못된 저장값은 원본 보존과 변경 차단으로 처리한다.
- 같은 고정 localhost origin/브라우저 프로필에서 잠금 소유 탭만 변경한다. 다른 탭/미지원 환경은 차단하고 사용 탭 종료 후 새로고침 시 잠금을 획득해 최신 데이터로 연다.
- 단일 JSON의 버전·정수·식별자·순번 관계, 저장 성공 전 화면 미반영, 저장 실패 시 기존 목록/입력 유지, 저장 후 UI 실패의 사실에 맞는 안내와 내구성 한계를 명시한다.

구현 시에는 Web Locks 콜백의 잠금을 변경 권한 수명 동안 유지하고, 잠금 획득 후 최신 저장값을 읽는 등 선언된 동작을 충족해야 한다. Web Locks를 OS 전역·다른 브라우저/프로필까지 보호하는 장치로 해석하지 않는다. 이번은 기획 검토이므로 해당 제품 동작을 실제 실행한 결과는 아니다.

## 보존한 근거

- [v2 report와 감사](acceptance/windows-review-retry-20261109/report.json), [진행 요약](acceptance/windows-review-retry-20261109/assessment.json), [추가 질문 수집](acceptance/windows-review-retry-20261109/collected-feedback.json)
- [v3 원본](acceptance/windows-review-retry-20261109/plan-v3.json), [읽기용 v3](acceptance/windows-review-retry-20261109/plan-v3.md), [진행자 검토](acceptance/windows-review-retry-20261109/manual-review-v3.json), [콘솔 요약 오류 관찰](acceptance/windows-review-retry-20261109/resume-v3-observation.json)
- [v4 수정 지시](acceptance/windows-review-retry-20261109/v4-revision-request.md), [v4 원본](acceptance/windows-review-retry-20261109/plan-v4.json), [읽기용 v4](acceptance/windows-review-retry-20261109/plan-v4.md), [진행자 검토](acceptance/windows-review-retry-20261109/manual-review-v4.json)
- [사용자 최종 승인 실행 완료 보고](acceptance/windows-review-retry-20261109/final-approval-user-report.json)

전체 로컬 usage ledger와 v1 Review·기획 원문은 받지 않았다. 총 모델 호출·토큰·비용이나 Reviewer 자체 수정 요청 횟수를 추정하지 않는다. 시험용 임시 파일·버전별 기획과 실제 사용자 승인 기록도 서로 대신하지 않는다.

## 마지막 상태 확인과 종료 경계

사용자 PC에서 모델 호출 없이 다음처럼 승인 저장을 확인한다.

```powershell
$state = Get-Content ".adtf/projects/my-supervisor-20261109-112551/planning/state.json" -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
$state | Select-Object status, currentPlanVersion, iterationCount, maxIterations | Format-List
```

`user_approved`, 기획4, 반복4/5가 확인되면 이번 기획 작성·검토·최종 승인 시험을 완료로 확정한다. 남은 반복을 소진할 필요는 없다. 작업 지시 제안·제품 구현·팀원 Agent 실행·ADTF 웹 UI 구현은 이 종료 확인으로 자동 시작하지 않는다. 웹 UI에 대한 대화는 향후 가능성 설명이며 구현 지시로 취급하지 않았다.
