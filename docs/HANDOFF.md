# ADTF 개발 인수인계

마지막 정리: 2026-11-10 (Asia/Seoul)
개발 환경: Codex Cloud `/workspace/create_agent`

## 최신 승인 — 주차 누적 요청 상한7회

사용자는 누적6→7회 증액 질문에 다음 단계를 진행하겠다고 승인했다. 원래6회·기존4회를 보존한 채 새 최대3회를 허용한다. 확인용 세션에서 명시적 증액 기록을 남겼으며 실제 새 모델 호출은0회다. [승인 기록](acceptance/parking-recovery-20261110/budget-approved-7.json). Windows PC에서는 공통 ZIP을 한 번 설치한 뒤 기존 복구 result를 import하고 budget7을 기록해 run한다. 이후 같은 세션을 유지하며 새 import나 초기화를 반복하지 않는다.

## 최신 작업 — 지속 기획 세션과 검토 기준 v2

사용자의 반복 절차 절감 요청으로 `planning:session` 공통 CLI를 추가했다. 최초 승인 입력/복구 import 후 같은 session 경로로 run/status/export를 사용한다. Controller의 수정 반복·사용자 결정 경계를 유지하고 완료 요청 재사용, 누적 SDK 예약/상한, 명시적 예산 증액 이력을 제공한다. 새 v2 저장 검토는 관련 필드의 실패 사례를 그룹으로 묶되 개별 로드/후보 근거·실제 인용은 계속 요구한다. 기존 검토는 수정하지 않는다. [설계/검증](durable-planning-session-20261110.md), [실행 안내](../examples/planning-session/README.md).

실제 주차 복구 원본은 반례 완료·REVISE·4/6회(내부16개 해시 통과)로 보존했다. 원본을 세션으로 오프라인 가져와 revising/반복1/2/남은2를 확인했다. 다음 수정 반복은 최대3회이므로 새 호출0회로 멈췄다. 6→7 상한 증액은 아직 사용자가 결정하지 않았으며 실행하지 않았다. 준비·검증의 유료 호출0회. 다음 실제 생성 전에 명시적 예산 결정을 받아야 한다.

## 최신 수정 — 공통 반례 JSON 모드와 주차 이어가기

사용자가 반례 경로 수정을 요청했다. 공통 Reviewer에서 반례 responseJsonSchema를 제거하고 택배 성공 후보의 필수 키/인용8개 지침을 적용했다. 로컬 검증은 유지한다. 주차 기획 v1/일반 검토를 고정 입력으로 재사용하는 최대1회 도구와 Windows ZIP 프로필을 추가했다. 이전3+새1=최대4/6회, Writer·최종 승인 없음, 준비 중 Gemini0회. [설계](common-challenge-fix-20261110.md), [실행 안내](../examples/parking-planning/README-recovery.md). 실제 모델 결과는 로컬 실행 후 확인한다.

## 최신 준비 — 새로운 주차 위치 기록 기획 Scope 초안

## 최신 관찰 — 주차 v1은 일반 pass 후 반례 API 오류로 중단

사용자가 승인한 Scope v1의 로컬 결과를 받았다. Writer/일반 검토 STOP, 반례 API400 INVALID_ARGUMENT, SDK3/6회, reviewing/v1/iteration0, 공식 Review·최종 승인 없음. 내부25개 해시와 고정 입력 일치 확인. [결과/내용 반례](parking-planning-result-20261110.md), [원본](acceptance/parking-planning-20261110/parking-planning-result.tar.gz). 일반 Reviewer는 updatedAt 누락을 제안으로만 남겼으나 비교 후 setItem의 다중 탭 경쟁으로 기록 소실이 가능한 설계 빈틈이 있다. 공통 전송 경로는 과거 택배 성공 후보를 아직 통합하지 않았다. 전체 재시작/자동 유료 재호출 금지, 다음은 공통 전송 보완과 기존 반례 요청만 이어갈 오프라인 준비다. 이번 분석 추가 모델 호출0회.

## 이전 준비 — 새로운 주차 위치 기록 기획 Scope 초안

사용자는 장보기 주제의 중복을 지적했고, 장보기는 과거 비교 시험에 2회 포함됐음을 확인했다. 대신 주차 위치 기록을 선택했다. 사용자가 위치·시각·선택 메모, 차 찾음 이력, 수정/삭제, 현재 한 개를 정했다. 새 [Scope v1 초안과 입력](../examples/parking-planning/scope-v1.json) 및 [시험 기준](parking-planning-protocol-20261110.md)을 작성했다. 이 Scope는 미승인이고 실제 모델 호출0회다. 기존 live CLI는 원요청/응답 보존/단일 시작 예약이 약해, 실제 시험 전에 한 번 실행 도구를 준비해야 한다. 제품/팀원 실행은 하지 않는다.

## 최신 관찰 — 택배 v2 반례 검토 완료·시험 승인 대기

사용자 `eight-1794288469054-589d8263.tar.gz`를 안전하게 확인했다. STOP, 인용 최대8개, 저장5사례/검증9규칙, 모델 질문/지적0, 분리한 시험 복사본의 정식 Review와 pending 승인 기록. 실제 최종 승인 없음, Scope DEMO FIXTURE. 관련9시도(최초 인증 실패 별도)이며 이 단계에서 추가 유료 호출0회. 원본 SHA-256 `8ca7b7f8d0283e4147ab95bd50c40153b304aa91991c6d42fc63b2120ac06174`. [원자료](acceptance/parcel-eight-20261110/manifest.json), [사용자 관점 검토](parcel-eight-content-review-20261110.md). 더 이상 동일 오류 반복 시험은 권하지 않는다.

## 최신 준비 — 반례 인용 최대8개 지침의 단일 시험

사용자 중단 후 작업 재개 지시로 이전 프롬프트 후보에 모든 evidenceLines 최대8개 지침을 더한 별도 후보를 만들었다. 후보 요청은 systemInstruction만 변경하며 새 최대1회 단일 실행 CLI/ZIP을 준비했다. 해제 ZIP181개 검사/CRC/해시/dry-run도 통과했다. 기존8시도(최초 인증 실패 별도)·원자료·예약을 보존하고 준비 중 Gemini/OAuth0회. 타입 검사·전체193개 오프라인 검사 통과. [설계/한계](parcel-eight-run-20261110.md).

## 최신 관찰 — 프롬프트 후보 실응답은 인용 배열 11개로 실패

사용자 `prompt-1794283531575-fc89d831.tar.gz`는 STOP/새 요청1회·총9,775토큰. `valid.trigger.evidenceLines` 11개가 코드 최대8개를 위반해 정식 Review/승인 없음. 수정 복사본의 8개 라인 오프라인 가정 시험은 `REQUEST_USER_APPROVAL`까지 통과했지만 실제 승인/품질 근거는 아니다. 관련8시도(최초 인증 실패 별도), 새 상한 소진, 재실행 금지. 원본 SHA-256 `1f94b450510e7c1dcad3d7e7799db4a7b0b8c0d1e45cac2defbbb7340d6c10b4`. [분석](parcel-prompt-result-20261110.md). 이번 분석 새 모델 호출0회.

## 최신 준비 — 보완 프롬프트의 단일 실제 반례 도구

사용자 다음 작업 지시로 고정 프롬프트 후보를 새 최대1회 요청하는 별도 CLI/Windows ZIP을 준비했다. 해제 ZIP178개 검사/CRC/해시·dry-run도 통과했다. 과거 성공 assessment 재사용, 원래 실패 요청 해시와 후보 전체 값 확인, 별도 시작 예약을 적용한다. 관련 과거7시도(최초 인증 실패 별도) 및 새1회 상한을 구분한다. 타입 검사·전체190개 오프라인 검사 통과, 실제 Gemini/OAuth0회. 이전 폴더·기획·승인·원자료 보존. [설계와 한계](parcel-prompt-run-20261110.md).

## 최신 준비 — 실응답 재생과 필수 JSON 필드 프롬프트 후보

사용자 다음 작업 지시에 따라 기록된 STOP 응답을 오프라인 재생해 `questions` 누락 시 정식 Review/승인이 없음을 확인했다. 정확한 필드 이름과 저장 사례·검증 규칙을 요구하는 별도 프롬프트 후보를 만들고, 이전 요청에서 systemInstruction만 바뀌는 요청 스냅샷을 고정했다. 공통 production 프롬프트와 과거 실행용 ZIP은 불변이다. 새 모델 호출0회, 타입 검사/전체188개 통과. [분석/후보](parcel-challenge-prompt-candidate-20261110.md). 현재 관련7시도와 새 상한 소진 상태는 그대로다.

## 최신 관찰 — 새 반례 요청은 STOP 응답, 형식 검증 실패

사용자 `no-schema-1794277203243-9036abe9.tar.gz`를 확인했다. 고정 후보 요청 그대로 SDK 1회, STOP 응답, 새 토큰 총11,929 기록. `questions` 대신 `userQuestions`, 저장 감사 상위 근거/이유와 5사례의 상태/판정 누락으로 로컬 검증에서 중단했다. HTTP 제공자 오류는 아니며 정식 v2 Review/최종 승인 없음. 관련 이력7시도(최초 인증 실패 별도), 이번 추가 상한 소진, 재실행 금지. 원본 SHA-256 `fcd3f3ec2e150be27f45927823a34f6a55c6a463598afbd8dbd9dcad62e59a67`. [분석](parcel-no-schema-result-20261110.md), [원자료](acceptance/parcel-no-schema-20261110/manifest.json). 이번 분석 추가 모델 호출0회.

## 최신 준비 — 반례 전송 스키마 없는 단일 시험 도구

사용자가 PR #17 병합 후 다음 작업을 지시했다. GPT-6 Sol·medium을 착수 전에 안내했다. 고정 일반 검토 재사용, 원래 실패 반례 요청 해시 확인, responseJsonSchema 한 필드 제거 후보 일치 확인, 별도 시작 예약/새 최대1회 Gemini 호출 도구와 짧은 경로 ZIP을 준비했다. 전체186개·해제 ZIP176개 테스트/타입 검사/CRC를 통과했다. dry-run은 유료0회·limit_reached로 정지했다. 이전6시도와 새1회 상한을 구분한다. 실제 추가 호출0회. 로컬 출력/원자료/기존 승인 보존, 정식 Review는 분리한 복사본만, 최종 승인 없음. [설계와 한계](parcel-no-schema-run-20261110.md).

## 최신 준비 — INVALID_ARGUMENT 반례 요청의 오프라인 호환성 후보

사용자 진행 지시에 따라 실패 요청에서 `config.responseJsonSchema`만 제거한 JSON MIME 후보를 준비했다. 원인은 여전히 미확정이다. 원본/후보 SHA-256을 고정하고 전체184개 오프라인 검사·타입 검사를 통과했다. 새 Gemini/OAuth0회. 기존1회 상한은 소진됐고 이 후보에 유료 실행 명령은 없다. [분석과 경계](parcel-challenge-compatibility-20261110.md), [후보 요청](acceptance/parcel-challenge-20261110/candidate-no-schema.json). 다음에 명시적 새 상한을 정해 시험하더라도 이전 결과·시작 예약을 지우거나 옛 명령을 반복하지 않는다.

## 최신 관찰 — 반례 요청 INVALID_ARGUMENT, 정식 Review 없음

사용자 `challenge-1794276238394-8d70bb56.tar.gz`를 안전하게 확인했다. 일반 검토 재사용 1회, 새 반례 SDK 시도 1회, `INVALID_ARGUMENT`(HTTP 상태 미기록), 모델 응답/새 usage/정식 Review/최종 승인 없음. 원래 프로젝트 변경 없음. 후속/진단 이력 합계 6시도(최초 인증 실패 별도)이며 이번 허용 상한 1회를 소진했다. 특정 거부 필드와 원인은 불명이다. 재실행을 안내하지 않는다. 원본 SHA-256 `ccbd8cfae6a45fa00165c20c169964383766873d904c23e37f1f7514e9744b09`, [분석](parcel-challenge-result-20261110.md), [원자료](acceptance/parcel-challenge-20261110/manifest.json). 이번 보존·분석 추가 모델 호출 0회.

## 최신 작업 — 기록된 assessment 재사용·추가 challenge 최대1회 준비

사용자가 다음 작업 진행을 지시했다. Sol·medium을 착수 전에 안내했다. `examples/parcel-challenge`는 실제 후보 assessment를 재사용해 일반 검토 과금을 반복하지 않고 반례만 새 최대1회 요청한다. 기존5회는 소진 이력이며 새1회를 더하면6이다(최초 인증 실패 별도). 기존 원문/승인/자료는 변경하지 않으며 분리한 시험 복사본에만 정식 Review·pending 승인을 기록할 수 있다. 최종 승인은 자동 생성하지 않는다. 이번 실제 Gemini/OAuth0회.

타입 검사/전체183개 검사 통과. 새 ZIP `downloads/adtf-parcel-challenge.zip`의 `npm.cmd run complete:parcel-review -- --run-live --bundle`을 새 폴더에서 한 번 실행한다. 이전 진단/전체 generator를 재실행하지 않는다. dry-run은 TEST/STUB 차단 지적 때문에 limit_reached가 정상이다. 결과 요청 전 **GPT-6.1 Sol·medium**을 먼저 안내하고 RESULT_ARCHIVE tar.gz 하나만 받는다. 실제 반례 완료/정식 저장은 업로드 결과를 확인하기 전까지 미확인이다. [설계/한계](parcel-challenge-20261110.md), [실행 안내](../examples/parcel-challenge/README.md).

## 최신 관찰 — 후보 일반 검토 응답 STOP/pass, 반례·정식 저장은 미수행

사용자 review-1794274580543-bbf1125b 원압축 SHA256은5a221227647023945a0982270c8f06d97764c9fa5c58daa2a332955726a316ff다. 같은 v2 요청에서 스키마만 바꾼 후보가1회 정상 응답 STOP을 받았다. 로컬 bind/validate 및 이전 원문 출처 검사를 통과했고 비교9행/해결4행·미해결0이다. 인용 일치는 의미상 완전성 보증이 아니며 단일 성공으로 특정 enum이400 원인이라고 확정하지 않는다.

원자료와 candidate-response-validation.json을 보존했다. 반례 검토/정식 Review 저장/사용자 최종 승인은 미수행이고 기존 프로젝트는 그대로다. 원래 후속3+원본 요청 진단1+후보1=5회이며 추가 유료 호출은 하지 않는다. 반례 등 추가 호출이 필요하면 남은 예산/새 상한을 사용자와 먼저 정한다. 준비/분석 중 추가 실제 호출0회다. 결과 파일 요청 전 권장 Codex GPT-6.1 Sol·medium을 먼저 안내한다.

## 최신 작업 — HTTP400 확인 및 전송 스키마 단순화 후보

[PR #15](https://github.com/yungoonkim/create_agent/pull/15)에 후보 구현과178/169개 오프라인 검증을 제출했다. [후보 ZIP](https://github.com/yungoonkim/create_agent/raw/5a37459c303b8f3b7e69357366045ee9f50d4788/downloads/adtf-review-schema-candidate.zip)의 diagnose:review -- --schema-candidate --run-live --bundle만 새 폴더에서 최대1회 실행한다. 원인 해결은 미확정이며 원본 동일요청 진단이나 전체 기획 시작을 다시 실행하지 않는다. 현재 추가 실제 호출0회다.

사용자 단일 진단 review-1794273612105-a20a09aa는 HTTP400/INVALID_ARGUMENT로 실패했다. 원압축을 보존했으며 어느 필드가 거부됐는지는 불명이다. 원시 상세 메시지는 안전상 생략됐다. 인증 반복이나 무작정 유료 재실행을 요구하지 않는다.

wire-schema.ts는 전송용 줄 번호 enum을 숫자 범위로, 동적 출처/지적/요구 ID enum을 문자열로 단순화한다. 정식 Review의 기존 정확한 줄/ID/중복/개수 검사는 그대로다. 원본 스키마를 변경하지 않는 순수 변환이며 모델/프롬프트/출력/반복 한도는 유지한다. 이것은 원인이 입증된 해결책이 아니라 호환성 후보다. 기존 frozen 사례/실행기/실패 기록은 고치지 않아 옛 generator가 변경 소스를 차단하는 것이 정상이다.

새 schema-candidate 진단 ZIP은 같은 실패 v2 요청의 responseJsonSchema만 변환해 --schema-candidate --run-live --bundle로 최대1회 전송한다. Writer 재작성/정식 Review 저장/자동 반례/자동 승인은 없다. 현재 후속3시도+동일 요청 진단1시도=4이며 후보1회를 실행하면5다. 성공해도 추가 유료 검토를 자동 실행하지 않고 먼저 원문/출처/남은 예산을 확인한다. 결과 업로드 요청 전에 GPT-6.1 Sol·medium을 먼저 권장한다. 이 작업의 추가 실제 Gemini 호출0회다.

## 최신 작업 — 택배 v2 실패 요청의 단일 진단 준비

사용자는 권장 모델/thinking을 작업 시작 및 파일 요청 전에 먼저 안내하도록 재차 요청했다. AGENTS에 저장했으며 이번 및 다음 진단 분석은 GPT-6.1 Sol·medium을 권장한다. 현재 설정을 직접 바꿀 수 있다고 주장하지 않는다.

첫 택배 실행은 인증 실패1시도/응답0, ADC 후 후속은3시도/응답2로 v1 지적→Writer v2까지 성공했다. v2 일반 검토는 provider_or_network_failure이며 정확한 HTTP 상태는 없어 원인 미확정이다. [분석과 단일 진단](parcel-review-diagnostic-20261110.md)을 우선한다. 원압축2개를 보존하며 기존 기획/Scope/승인/실패 기록을 재작성하지 않는다.

examples/reviewer-diagnostic는 원래 실패한 call-003 요청을 해시로 고정해 최대1회만 재전송한다. Writer 재작성/정식 Review 저장/자동 승인 없이 응답 또는 허용목록 HTTP 상태/오류코드/고정 분류만 기록한다. raw 예외/헤더/스택은 생략해 비밀 유출을 줄이며 상세 메시지가 없으면 원인 확정은 계속 불가능할 수 있다. 응답이 성공해도 품질 합격이 아니다. 새 ZIP의 diagnose:review -- --run-live --bundle을 명시 실행할 때만 과금 가능 요청1회다. 현재 준비 중 실제 Gemini/OAuth 호출0회다.

## 최신 작업 — Windows 긴 경로 오류용 실행 ZIP

사용자가 main ZIP 해제 중0x80010135/긴 대상 경로 오류를 보고했고 C:\adtf 안내 후에도 실패했다. 단순 길이 계산만으로 탐색기 성공을 단정한 안내를 정정했다. [별도 ZIP 안내](../downloads/README.md), [구성/검증/한계](windows-run-bundle-20261110.md)를 우선한다. 원본 전체 ZIP과 별도 실행 ZIP을 혼동하지 않는다.

- main 기반 `fix/windows-run-bundle`. Node 내장 ZIP STORE 생성기로 특정 Git 커밋의 src/예제/lock/설정/실행 검사를 묶는다. 과거 docs/acceptance와 인증/기존 실행 데이터는 원본 저장소에 보존하고 ZIP에서 제외한다. 내부 최장 경로73자, 최상위adtf-run이다. src/예제/lock·고정 시험 입력/실행기/생산 해시는 그대로다.
- 실행 package.json은 기록 의존 검사6개와 Git 배포도구 검사2개를 제외한165개 검사 명령으로 조정한다. 전체 저장소는173개다. 두 범위를 구분하고 숨겨진 품질 통과로 해석하지 않는다. 실제 Windows 탐색기/CLI를 Cloud에서 재현한 것은 아니다.
- 전체 타입 검사/173개 통과, 독립 Python ZIP CRC 검사·별도 해제·설치42패키지·타입 검사/165개·택배 고정 응답4회/유료0회 흐름 확인. 최초 Cloud npm 캐시 쓰기 실패는 workspace 캐시로 해결했고 Windows ZIP 문제와 구분했다. 생산/과거자료/승인 전후 해시를 확인한다.
- 사용자는 현재 PC에서 실행을 재개했다. 마지막 모바일 전용 메모는11월9일 이력이다. 다운로드할 것은 Code→Download ZIP이 아니라 별도 adtf-run.zip이다. 기존 부분 해제 폴더/프로젝트는 보관하고 새 ZIP의 package.json 폴더에서 npm.cmd ci와 eval:review-evidence -- generate --run-live --bundle을 실행한다. 최대5유료요청, 결과 tar.gz 하나 전달, 오류 시 재실행/예약삭제 없이 보존한다. 이번 작업 실제 Gemini/OAuth0회다.

## 최신 완료 — 수정 전후 보존·근거 역할 보완, 실제 시험은 PC 복귀 후

사용자가 다음 보완을 지시했고 이후 오늘은 모바일로만 작업한다고 알렸다. **오늘 로컬 실행은 필요 없다.** [보완 보고서](review-evidence-preservation-20261109.md), [검증/TEST-STUB 예시](acceptance/review-evidence-20261109/README.md), [새 시험 계획](review-evidence-live-protocol-20261109.md)를 우선한다.

생산 보완 `b95f5b4`·피드백 연결 `2b8a365`·시험 준비 `8fa2ab5`를 [PR #13](https://github.com/yungoonkim/create_agent/pull/13)에 제출했다. 다음 재개에는 PR 병합 상태와 작업 트리를 확인하고 모바일이면 Cloud 작업만 이어간다. 실제 새 시험은 사용자 PC 복귀 후 수행한다. GitHub PR 생성은 확인했으며 대화 첨부 도구는 응답 지연으로 연결 완료를 확인하지 못했다.

- 생산 코드 `2b8a365`: 직전 Plan을 Reviewer에 전달한다. revisionAudit에 기준 버전/본문 해시, 같은 Scope의 모든 요구/제약 비교, 이전 실제 지적 및 생성된 품질/저장/보존 피드백 해결표를 기록한다. 저장/읽기에서 실제 이전 기록과 대조한다. 미해결/불명은 headline pass여도 수정/기존 한도로 분기하고 바뀐 Scope는 옛 조건의 보존 합격으로 표시하지 않는다.
- JSON 반례에 공통 검증의 로드·전체 후보·확인 사례 근거를 추가하고 valid 조건과 연결했다. 빈/제목 근거와 선언된 미해결 상태를 차단하지만 의미상 올바름이나 모든 규칙의 발견은 보증하지 않는다. 첫 기획의 revision_resolution은 코드 문맥에서 해당 없음이며 그 항목에 중대한 누락/질문이 있으면 버리지 않고 실패로 보존한다. 구형 불변 Review/승인에는 소급 적용하지 않는다.
- 타입 검사/전체171개 오프라인 검사(기존158+생산 회귀10+새 시험도구3) 통과. 빌려준 물건의 v2 로드 조건을 실제로 약화시킨 고정 응답 통합 검사와 택배의 모의4회/실제0회 흐름을 확인했다. LLM이 스스로 탐지했다는 주장이 아니다. 기존 자료 해시는 검증 기록에 남긴다.
- `examples/review-evidence-live`는 택배 고정 초안의 received 타입 검증 우회를 실제 Reviewer/Writer가 고치는 시험이다. 최초 초안은 모델 생성이 아니다. 각2라운드·최대5 SDK요청(검토최대4+수정Writer1), 입력/소스/실행기/요금 고정·단일 시작 예약·실패/원문/토큰/표/압축 보존이다. 오늘 Gemini/OAuth 호출0회다. PC 복귀 후 최신 PR 병합 소스의 새 폴더에서 명시적 --run-live로 실행한다. [PC 안내](../examples/review-evidence-live/README.md)에 명령이 있으며 지금 실행을 요구하지 않는다.
- 브랜치는 main 기반 `feature/review-evidence-preservation`이며 PR #12는 병합됐다. 이전6쌍·식물/운동 원자료·승인 프로젝트를 재생하거나 덮어쓰지 않는다. 제품/팀원/웹 UI는 보류한다. 실제 품질·비용 개선은 아직 미검증이다.
- 사용자 선호: 착수 전 권장 Codex 모델/생각 수준을 먼저 안내한다. 일반 구현/검증은 GPT-6.1 Sol·medium, 단순 문서는 low, 복잡한 원인 분석은 필요할 때 high. 실제 설정은 사용자 UI에서 바꾸며 Gemini API와 구분한다. 이번 API thinking/출력/반복 한도는 유지했다.

## 최신 완료 — 새 실제 Gemini 결과 수신·원문 감사·인증 실패 보존

[최종 보고서](planning-review-live-results-20261109.md), [원자료 인덱스](acceptance/planning-review-live-20261109/README.md), [진행자 감사](acceptance/planning-review-live-20261109/analysis-20261109/manual-audit.json)를 우선한다. 아래 준비 시점의 실제 호출0회/생성 대기 기록은 과거 이력이다.

결과 보존 커밋 `b749d98`을 [PR #12](https://github.com/yungoonkim/create_agent/pull/12)에 제출했다. 브랜치는 `docs/planning-review-live-results`이며 PR #11이 병합된 main을 기반으로 한다. 다음 재개에는 PR 병합 상태와 작업 트리를 먼저 확인한다.

- 사용자가 데스크톱 실행 압축2개를 전달했다. 첫 `local-1794227914170-5fd21835`는 인증/권한 요청 실패1회·응답0·운동 건너뜀이다. 누락 ADC 등 상세 원인은 일반화된 원자료로 확정할 수 없다. PowerShell의 gcloud.ps1 차단은 gcloud.cmd로 해결하도록 안내했고, 사용자가 ADC 로그인 완료를 알렸다. 기존 폴더 보관 후 새 ZIP 체크아웃에서 별도 후속 실행하도록 명시적으로 안내했다. 원래 예약 삭제나 성공 결과 교체로 기록하지 않는다.
- 후속 `local-1794228751746-1ceb6788`: 실제 Gemini7회(Writer2/일반3/반례2), 모두STOP, 식물v1·운동v2가 awaiting_approval이다. 운동 고정 초안의 공개 서버 전송을 critical/revise_plan으로1회 지적했고 실제 Writer가 제거했다. Scope변경/최종 실제 승인/제품/팀원 실행 없음. 두 실행 합계SDK시도8회·성공응답7이며 분석 추가 API0회다.
- 원압축2개·원자료78파일·고정 설정/실행기/요금표 스냅샷을 Git에 보존한다. 안전한 압축 검사와 원자료76개 manifest 해시, 인용304개(반복 포함)/근거객체79개, 생산 검토표 재구성·번들 해시 일치를 확인했다. 업로드된 스크립트를 실행하지 않았다. 받은 Windows manifest의 기존 .adtf는 각각0파일이며 다른 PC 폴더 보호까지 확인한 것은 아니다. Cloud 기존자료는 별도 전후 해시 검사한다.
- 비용은 제공 토큰 소계0.11012025USD, 입력44892/응답12608/제공추론7779(6회제공·1회미제공)다. 첫 실패의 비용과 미제공 추론은0으로 확정하지 않으며 청구서 금액도 아니다.
- 진행자 판정은 기능 흐름 확인·의미 검토 보완점 있음이다. 운동v2의 로드/후보 공통 값 검증 연결은 덜 명시적이고, valid trigger 인용은 검증 통과 조건을 충분히 보여주지 않으며, 식물 첫 기획의 revision_resolution 근거는 이전 지적 해결이 아니라 최초 결정을 인용했다. 모델의 pass/반영됨을 완전 품질 인증으로 재해석하지 않는다. 실제MAX_TOKENS가 없어 잘림 대응의 이번 실모델 재현도 주장하지 않는다.
- 타입 검사/전체158테스트를 재확인한다. 이번 결과 보존·문서화에서 생산 소스/프롬프트/정책/고정 사례는 수정하지 않는다. PR #11은 main에 병합됐으며 결과 기록은 main 기반 별도 문서 브랜치에서 제출한다. 다음은 필요 시 공통 검증표·근거 역할 보완을 별도 변경/새 사례로 검증하는 작업이다. 완료한 시험/이전6쌍/승인 프로젝트를 재실행하거나 시험 후보를 자동 승인하지 않는다.

## 최신 작업 — 새 실모델 재시험 준비 완료, 인증된 PC 생성 대기

사용자의 다음 작업 지시로 검토표/신뢰성 보완의 실제 Gemini 시험을 준비했다. [새 시험 계획](planning-review-live-protocol-20261109.md), [실행 안내](../examples/planning-review-live/README.md), [준비 기록](acceptance/planning-review-live-20261109/preflight.json)을 우선한다. **실제 모델 호출0회, 실모델 합격/품질 결과는 아직 없다.**

- 이번 Cloud ADC refresh는 reauthentication_required였고, 공유 브라우저의 공식 Google HTTPS 첫 호출도 `Browser Use could not read requirements`로 실패했다. CUA 종료를 기록했고 새 로그인 프로세스/코드 흐름은 시작하지 않았다. 토큰 출력·채팅 인증 코드/토큰 요구·네트워크/TLS 우회는 없다. 현재 호스트에는 cloud-desktop 열기 target도 없다. 과거의 추측성 Desktop 메뉴 안내를 반복하지 않는다.
- 새 두 사례: 식물 물주기 기록은 실제 Writer부터 시작, 운동 기록은 고의로 공개 서버 전송을 넣은 고정 초안에서 Scope 유지 교정을 시험한다. 운동 최초 초안은 모델 생성 결과가 아니다. 참고 답안/검사표를 live Writer에게 정답 지시로 보내지 않는다. 입력/기준/생산 소스/실행기/요금표는 생성 전에 고정했다.
- 각2회 반복·전체 최대11 SDK 요청(6+5), SDK1시도, 추가 유료 채점 없음, 실제 사용자 승인/제품/팀원 실행 없음. Scope 승인 fixture만 격리한다. 체크아웃당 고정 trial live 시작1회를 먼저 예약하고 같은 ID/새 ID 자동 재생을 막는다. 인증/권한 실패는 남은 사례를 건너뛴다.
- `npm.cmd run eval:planning-review -- generate --run-live --bundle` 한 번으로 실행명 자동 생성·고정 project/location·진행 로그·결과 압축을 제공한다. CMD/PowerShell 변수 설정은 필요 없다. 실패/대기 종료코드2라도 압축을 전달하며 유료 실행을 반복하지 않는다. 압축만 실패하면 기존 ID의 pack만 수행한다.
- 타입 검사/158개 테스트 통과(기존155+새3). 고정 응답으로두 사례 흐름·범위 내 교정·내보내기·압축·변조/재생 차단을 확인했지만 이는 실모델 증거가 아니다. 전체 준비 dry-run은 `/workspace/scratch/planning-review-live-preparation`에 따로 보존했고 Git에는 명확한 TEST/STUB 요약만 둔다. primary50파일·승인37파일·이전 비교162파일이 보존됐다.
- 다음: 인증된 PC의 실제 결과 압축 하나를 받아 경로/링크/해시를 검사하고 원문 근거·완료/중단·Scope 교정·기존 요구 보존·검토표·사용량을 감사한다. 모델 pass/사례 상태만으로 합격을 단정하지 않는다. 기존6쌍 비교나 실제 승인 프로젝트를 재실행하지 않는다. 이번 trial용 생산 코드 수정은 없다.

## 최신 완료 — 사용자 검토표 1차·신뢰성 보완·재개 자료

중단된 `feature/planning-review-table` 작업을 재개해 코드 점검·사용 안내·검증 기록·문서 갱신을 마무리했다. [사용 안내](user-planning-review.md), [구현 보고서](planning-review-table-report-20261109.md), [검증 기록](acceptance/planning-review-table-20261109/validation.json), [읽기용 예시](acceptance/planning-review-table-20261109/demo-bundle/review.md)를 먼저 읽는다. 아래 재개 당시 점검은 완료 전 이력이다.

- 구현 완료: MAX_TOKENS/비정상 종료 시 완성본 사용 금지·부분 응답/실패 사용량 보존·자동 SDK 재시도 차단, 새 정상/실패/확인 사례 근거 및 저장 상태 trigger, 범위 내 교정/실제 Scope 변경/질문 분리. 불변 과거 Review와 승인/총 예산은 보존한다.
- 사용자 기능: `review-plan --config 실제설정 --output 새폴더`와 `report.userReview`. 추가 API·CALL·승인 변경 없이 plan.md/review.md/review.json/bundle.json을 내보낸다. 부족한 과거 근거는 확인 필요로 표시하며 과거 승인을 취소하지 않는다. 실제 구현 시험과 모델의 문서 판단을 구분한다.
- 오프라인155테스트/타입 검사 통과. 새 독서 목록 fixture, 무ADC live-config CLI, Scope 교정 v1→v2/승인pending, 중단·오래된 출처·출력 덮어쓰기 차단과 역사적 비교 검증을 포함한다. 실제 Cloud의 기존 승인2프로젝트도 읽기 전용 내보내기 확인. 승인37파일 해시와 비교 원자료 보존을 검증했다.
- 이번 변경의 실제 Gemini 호출0회. 새 프롬프트/응답 형식/16000 출력 예산의 실모델 성공·품질 향상은 아직 확인하지 않았다. 출력 한도와 보수적 문구 검사는 보장이 아니다. 다음 실모델 검증은 새 사례를 고정해 수행해야 한다.
- 재개 시 기존 비교/승인 프로젝트의 plan/resume/retry를 다시 실행하지 않는다. 과거6쌍은 `node examples/planning-comparison/verify-archive.mjs --run-id local-20261109-162415`로 원자료만 검증한다. 옛 생성기의 소스 고정 차단을 해제하거나 점수/사례를 바꾸지 않는다. 변경 영향표·웹 UI·일반 채팅 수정 비교·팀원/제품 구현은 별도 범위다.
- 소스·문서는 위 브랜치의 한국어 커밋으로 보존하며 PR은 이 대화의 첨부를 참조한다. 다음 재개는 AGENTS.md와 이 절을 읽고 git 상태·첨부 PR을 확인한다.

구현 커밋: `69027b1` — 사용자 기획 검토표와 응답 중단 및 범위 교정 정책 보완. [PR #11](https://github.com/yungoonkim/create_agent/pull/11)에 소스·예시·검증·문서를 제출했다. 다음 재개에는 이 링크로 PR 상태를 확인한다. 대화 PR 첨부 도구는 응답 지연으로 완료를 확인하지 못했지만 GitHub PR 생성·소스 push는 확인했다. 구현/오프라인 검증은 완료이며 다음 미검증 항목은 새 사례의 실제 Gemini 재시험이다.

## 재개 당시 점검 — 사용자 검토표·신뢰성 보완 구현, 문서/커밋 마무리 전

사용자가 일반 채팅과 구별되는 강점을 위해 제안한 1단계 신뢰성 보완과 2단계 사용자 검토표 구현을 승인했다. 브랜치는 `feature/planning-review-table`이며 아래 실제 비교 기록은 변경/재실행하지 않는다. 팀원·제품 구현·웹 UI·변경 영향표는 이번 범위 밖이다.

- 구현: 모델 MAX_TOKENS/비정상 종료를 완성본으로 사용하지 않고 부분 응답·제공 토큰·사유 보존, SDK 자동 재시도1시도로 제한, Reviewer 출력 한도8000→16000. 새로운 Review는 정상/실패/확인 사례 원문 근거와 저장 상태 trigger 근거를 분리한다. 읽기 예외 근거의 보수적 문구 검사는 의미상 정답을 보증하지 않는다.
- 구현: 새 scopeDisposition으로 기획 교정(revise_plan)·실제 Scope 변경(change_scope)·질문(clarify)을 구분한다. 기존 미분류 Review는 보수적인 기존 경로를 유지하고 승인 스냅샷을 수정하지 않는다.
- 구현: `review-plan --config ... --output 새폴더`가 plan.md/review.md/review.json/bundle.json을 추가 API·CALL·승인 변경 없이 내보낸다. `report`에도 userReview/오류를 포함한다. 이전 세부 근거 없는 Review는 확인 필요로 표시한다. 기존 승인 취소가 아니다.
- 마지막 확인: typecheck/전체155테스트 통과, 로그 `/workspace/scratch/review-table-final-tests.log`. 새 독서 목록 fixture로 오프라인 검증했으며 `docs/acceptance/planning-review-table-20261109/demo-bundle`은 TEST/STUB 샘플이다. 이번 변경의 실제 Gemini 재시험은 아직 하지 않았다.
- 기존 Cloud 승인 재고/할 일 프로젝트도 읽기 전용 export 성공(출력은 `/workspace/scratch/existing-inventory-review-20261109`, `existing-todo-review-20261109`). 최종 원본37파일 해시 대조 기록은 마무리 단계에서 남긴다.
- 역사적 비교 runner/freeze/lib는 그대로 보존한다. 현재 생산 소스가 달라졌으므로 옛 생성기가 차단하는 것이 정상이다. 새 `examples/planning-comparison/verify-archive.mjs --run-id local-20261109-162415`로 원자료만 읽기 전용 검증한다. 새 테스트는 이 보호 경로와 복사본 변조 탐지를 확인한다.
- 남은 작업: 코드 최종 점검, 사용 안내·구현/검증 보고서·이력/로드맵 갱신, 원자료/승인 해시/비밀정보/문서 링크 확인, 한국어 커밋·push·PR 생성 및 첨부. 현재 변경은 아직 미커밋이다. 완료 시 이 절보다 위에 최종 상태를 기록한다.

## 최신 완료 — 단일 작성/ADTF 실제6쌍 비교·익명 채점·원자료 보존

사용자가 `local-20261109-162415.tar.gz`를 업로드했다. [최종 비교 보고서](planning-comparison-results-20261109.md), [원자료 인덱스](acceptance/planning-comparison-20261109/README.md), [수신/평가 순서 기록](acceptance/planning-comparison-20261109/analysis-local-20261109-162415/reception.json)을 우선한다. 아래 실제 호출0회·실행 대기는 이전 준비 시점 이력이다. **이번 비교 분석은 완료했으며 안정적인 품질 향상을 입증한 것은 아니다.**

- Windows/Node24.11.0에서3주제×2회·실제20 SDK 호출(Writer7/일반7/반례6). 주 평가12후보×9기준을 익명 채점/봉인한 뒤 지적 감사/봉인·공개했다. 추가 Gemini/OpenAI API 호출0회, 생산 소스/고정 입력/기준 변경0건.
- 점수 합계83→84/108, 장보기2에서 읽기 자체 예외 누락1건이 수정됐다. 승인 요청3(개선1/동점2), Scope 판단 대기1, 반례 검토 실패2다. 실패/대기 후보는 초안이 그대로라 점수 동점일 뿐 기획 검토 완료가 아니다. 최종 실제 사용자 승인·제품/팀원 실행 없음.
- 생활비2건은 반례 종료 사유MAX_TOKENS·JSON 문자열 중단을 원응답에서 확인했다. 기존 HTTP400과 다르다. 출력 한도8000/thinking MEDIUM, 검토reviewing·원초안 보존. 유료 재호출/응답 보정/실패 교체 금지.
- 지적7행: 타당3·불명4·확정 오탐0, 별도 제안1. 타당한 수정2행은 같은 누락1건의 중복 기록이다. 식단 R-4 수정/삭제 확인 문장이 모호해 관련 지적을 확정 오탐/정답으로 단정하지 않았다. 미지원 잠금 대체안은 명백한 제약 위반이지만 Scope 판단 대기로 수정되지 않았다.
- 장보기1·식단2의read_error 통과 근거는 손상 데이터 문장을 인용했으며 getItem 자체 예외를 뒷받침하지 못했다. 실제 인용/줄 검증과 의미상 올바른 판단의 차이를 보존했다. 통과3건 모두 진행자 평가에서는 중대 누락이 남았다.
- 사용량: 입력143244/응답46820/제공된 추론54207(18회 제공·2회 미제공), 요금표 소계0.48628425USD. 최초 초안만 작성한 배분 비용0.13933125USD 대비약3.49배. 실제 청구서 확인 아님, 두 방식 비용을 더해 중복 집계하지 않는다.
- 원압축 SHA256 `815e6db7bc7d77b87b74b1de6e611189509f7b1052abeaca0cefac12863ab141`와 모든 원자료 해시를 확인·보존했다. 새 점수·감사·집계·읽기용 기획12개·CSV를 추가했다. Cloud 승인 프로젝트37파일 해시 일치. PC의 새 실험 폴더는 기존 .adtf 0파일이며 PC 다른 폴더의 승인 데이터까지 원격 검증했다고 하지 않는다. typecheck/142테스트 통과와 실모델 실패2건을 구분한다.
- 후속 개선 후보는 응답 예산/토큰 종료 처리, 읽기 예외의 실제 의미 근거, 기획 범위 위반 교정과 Scope 변경 필요성 구분이다. **이번 세트에 맞춰 생산 코드를 바꾸고 결과를 교체하지 않는다.** 별도 변경과 새로운 검증 사례를 마련해야 한다. 평가 파일을 읽고 성공 판정/승인/모델 호출을 재실행하지 않는다.

## 최신 작업 — 단일 작성/ADTF 익명 비교 준비, 실제 생성 대기

사용자가 같은 모델·같은 요구로 기획 품질을 비교하고 중요한 비교 기록을 보존하도록 요청했다. [사전 고정한 비교 계획](planning-comparison-protocol-20261109.md), [일괄 실행 안내](../examples/planning-comparison/README.md), [준비·검증 기록](acceptance/planning-comparison-20261109/preflight-20261109.json)을 먼저 읽는다. **실제 비교 모델 호출0회이며 품질 우열 결론은 아직 없다.**

- 새 장보기/생활비/주간 식단 주제별2회, 총6쌍. 동일한 최초 Writer 초안을 양쪽이 공유하고 ADTF에만 현재 Reviewer·정책·수정을 추가한다. 평가 한도는 최대3회이며 운영 샘플5회와 다르다. 생산 코드·프롬프트는 변경하지 않았다.
- 생성 최대54 SDK 호출. 선택적 Gemini 보조 채점/감사까지 총66회. 기본 실행은 추가 유료 채점을 하지 않으며 OpenAI API도 추가하지 않았다. TEST/STUB fixture만 격리하고 실제 사용자 승인·제품/팀원 실행은 없다.
- 주 평가자는 진행자 Codex다. `blind/` 후보만 읽고9기준·근거·점수를 `seal-manual`로 봉인한 뒤 지적과 수정 전후를 감사하고 `seal-feedback` 후 공개한다. 대응표·모델 판정·사용량을 먼저 열지 않는다. 외부 사람 패널/완전한 이중 맹검이라고 주장하지 않는다.
- 원응답·실패·모든 버전·검토 이유·사용량·요금표·평가표·대응표·해시를 보존한다. 실패/중단을 성공으로 세거나 같은 유료 단계를 자동 재생하지 않는다. 동일 본문 점수 차이는 평가자 잡음으로 별도 기록한다. 최종 기록은 평가 후 Git에 함께 남긴다.
- `npm run typecheck` 및 전체142개 테스트 통과(Linux, 신규5개 포함). 가짜 전체 실행·봉인·감사·공개·압축·변조 탐지를 검증했고 임시 시험 데이터는 정리했다. Windows 실모델 비교 실행은 아직 확인하지 않았다. 기존 실제 todo20파일·재고17파일 체크포인트 해시가 일치한다.
- Cloud ADC 재인증 필요. 공식 HTTPS 로그인 준비도 공유 브라우저의 `Browser Use could not read requirements`로 실패했고 인증 우회·사용자 코드/토큰 수집은 하지 않았다. 기존 ADC로 성공한 사용자 PC에서 새 소스 폴더로 일괄 생성 후 결과 `.tar.gz` 하나를 받으면 평가를 계속할 수 있다. 옛 승인 프로젝트/설정을 새 실험에 복사하지 않는다.
- 업로드 아카이브는 경로 탈출/심볼릭 링크를 검사하고 데이터로만 가져온다. 업로드된 스크립트를 실행하지 않는다. 생성 당시 PC와 채점하는 Cloud의 `.adtf` 보호 확인은 구분한다. 기존 완료 프로젝트를 재실행하지 않는다.

## 최신 완료 — Windows 로컬 기획 v4 최종 승인 저장 확인

사용자가 최종 상태 화면을 제공했고 status=user_approved/currentPlanVersion4/iterationCount4/maxIterations5가 확인됐다. [최종 보고서](windows-planning-final-acceptance-20261109.md), [상태 관찰](acceptance/windows-review-retry-20261109/final-state-observed.json)을 우선한다. **이번 ‘개인용 로컬 웹 할 일 관리 도구’ 기획 작성·검토·수정·최종 승인 시험은 완료다.**

- 승인된 원문은 [기획 v4](acceptance/windows-review-retry-20261109/plan-v4.json), 승인 Scope는 v4다. 남은 반복1회를 소진하거나 approve-plan/plan/resume/retry를 다시 실행할 필요 없다.
- 사용자 PC의 저장 상태 화면으로 확인한 것이며 전체 state/approval 파일은 받지 않았다. Cloud .adtf에 사용자 로컬 프로젝트를 복원하거나 승인 레코드를 대신 생성하지 않는다.
- 작업 지시 생성은 별도 단계이며 제품 코드·팀원 실행·ADTF 웹 UI 구현은 진행하지 않는다. 기존 Cloud 재고/할 일 두 프로젝트와 이번 Windows 프로젝트를 구분한다. 아래 승인/확인 대기 문구는 이전 시점 이력이다.

## 최신 사용자 보고 — 기획 v4 최종 승인 실행, 저장 상태 마지막 확인 대기

사용자가 정확한 `APPROVE my-supervisor-20261109-112551-plan v4` 문구까지 실행 완료했다고 보고했다. [최종 로컬 기획 보고서](windows-planning-final-acceptance-20261109.md), [승인 완료 사용자 보고](acceptance/windows-review-retry-20261109/final-approval-user-report.json)를 우선한다. 승인 결정은 사용자 보고로 확인했으며 승인 후 state/approval 파일 자체는 아직 받지 않았다. 마지막 직접 상태 관찰은 기획4/반복4/5/awaiting_approval이다. 이 둘을 섞어 사용자 PC의 저장 상태까지 확인했다고 쓰지 않는다.

- 다음 로컬 확인은 planning/state.json을 Get-Content -Raw -Encoding UTF8로 직접 읽어 status=user_approved/currentPlanVersion4/iteration4/max5인지 짧게 확인하는 것이다. 모델 호출·승인 재실행·예산 소진이 필요하지 않다.
- v1 challenge400 → 수정83ea913/PR7 → v2 정책 차단 → Q7 보완 v3 → 사람의 날짜/다중 탭 추가 점검 → 사용자 선택 반영 v4 → 사용자 승인 완료 보고까지 기록했다. Windows 자동 검사137개 중135통과/2제외/실패0. 원문 v3/v4 한글은 정상이며 파이프 요약만 깨진 경우를 구분했다.
- 모델의 headline pass, 코드의 차단, 진행자 발견, 사용자 수정/승인 출처를 구분한다. v1 Review와 전체 로컬 usage는 받지 않아 총 호출/비용/자체 revise 횟수는 추정하지 않는다.
- 사용자가 현재 목표를 기획안 완성으로 재확인했다. 이번 로컬 기획 승인 시험을 종료 확인하며, 작업 지시 제안은 별도 단계다. 제품 구현·팀원 실행·ADTF 웹 UI 구현을 자동 진행하지 않는다. 웹 UI 대화는 가능성 설명이었다.
- 보존된 Windows 근거 파일은 docs/acceptance/windows-review-retry-20261109에만 둔다. 기존 Cloud .adtf의 두 프로젝트와 합치거나 사용자 승인 파일을 대신 생성하지 않는다. 아래는 시점별 이력이다.

## 최신 수동 검토 — 기획 v4 보완 확인, 최종 사용자 승인 대기

사용자가 정상 종료·awaiting_approval·기획4·iteration4/5 요약과 원본 [v4.json](acceptance/windows-review-retry-20261109/plan-v4.json)을 제공했다. [읽기용 v4](acceptance/windows-review-retry-20261109/plan-v4.md), [진행자 검토](acceptance/windows-review-retry-20261109/manual-review-v4.json)를 보존했다. UTF-8/한글·프로젝트/Scope 버전이 맞고 날짜 검증·단일 변경 탭 정책과 기존 Q-7 보호 규칙이 기능·검증 본문에 반영됐다. 이번 기획 인수 범위에서는 최종 사용자 승인 대상으로 권고한다. **아직 최종 승인한 것은 아니다.**

- 날짜 형식·실제 달력·윤년·시분 범위를 등록/수정/로드/후보 저장에 검증하고 잘못된 저장값 원본 보존·쓰기 차단을 명시했다.
- 같은 localhost:8080 origin/프로필에서 실제 Web Locks 소유 탭만 변경, 비소유/미지원 차단, 사용 탭 종료 후 새로고침·잠금 획득·최신 데이터 재로드, 두 탭 검증 사례를 명시했다. 원래 기능6개와 제외 범위를 유지한다.
- 구현 시에는 잠금 콜백을 탭의 변경 권한 수명 동안 유지하고 잠금 획득 뒤 최신 데이터를 로드하는 등 선언된 동작을 충족해야 한다. 실제 제품 코드/브라우저 동작을 시험했다는 의미가 아니다. Web Locks는 origin/프로필 범위이며 OS 전역 잠금으로 해석하지 않는다.
- 다음 로컬 단계는 approve-plan으로 정확한 기획 v4에 대한 사용자 승인을 기록하고 그 상태를 확인하는 일이다. 사용자가 현재 목표를 기획안 작성·검토로 재확인했으므로 제품/팀원 실행은 하지 않으며, 작업 지시 제안은 별도 단계로 구분한다. 일반 plan/resume/retry를 반복하지 않는다. 남은 반복1회를 승인에 소비하지 않는다.

## 최신 사용자 결정 — v4 날짜 검증·한 탭 변경 정책 보완 진행

사용자가 v3 보완 2건과 추천한 동시 한 탭 변경 정책에 동의하고 진행을 지시했다. [구체적 수정 요청](acceptance/windows-review-retry-20261109/v4-revision-request.md)을 보존했다. 사용자가 실행할 request-plan-revision → resume-plan은 아직 실행 결과를 받지 않았다. 현재 마지막 확인 상태는 v3/3회 사용/최종 승인 pending이다.

- 날짜는 단순 문자열 여부를 넘어 실제 달력 날짜/시·분을 등록·수정·로드·저장 후보에 공통 검증한다. 잘못된 저장값 원본 보존·쓰기 차단을 유지한다.
- 한 origin/브라우저 프로필에서 한 탭만 실제 배타 잠금으로 변경 권한을 갖고, 다른 탭은 안내·변경 차단한다. 주 탭 종료 뒤 새로고침하여 최신 데이터 재로드 후 사용한다. 기술적으로는 Web Locks 등 실제 배타 방식·고정 origin/지원 조건·미지원 시 차단을 기획에 구체화한다. API 선택은 기획 설계이며 사용자가 API 자체를 지정했다고 기록하지 않는다.
- 다음 로컬 시험은 v4 보완/재검토 → 내용 검토 및 최종 사용자 승인 → 작업 지시 제안/검증 → 문서 마무리다. 현재 기획 총 한도에서2회 남았고, 모델 API 요청 횟수와 논리적 반복은 구분한다. 제품 브라우저 구현/팀원 실행 시험은 포함하지 않는다.
- 사용자에게 제공하는 다음 실행 블록은 저장 JSON을 Get-Content -Raw -Encoding UTF8로 직접 읽어 짧은 요약을 만든다. Node stdout을 PowerShell ConvertFrom-Json으로 넘기는 이전 인코딩 문제 경로는 사용하지 않는다.

## 최신 수동 검토 — v3 원문 한글 정상, 승인 전 보완 2건

사용자가 원본 [v3.json](acceptance/windows-review-retry-20261109/plan-v3.json)을 제공했다. UTF-8 JSON/예상 projectId·Scope v4·Plan v3가 맞고 한글은 정상이며 대체문자0이다. 앞선 깨짐은 콘솔/PowerShell 요약 경로 문제였고 원본에서 재현되지 않았다. [읽기용 원문](acceptance/windows-review-retry-20261109/plan-v3.md), [진행자 검토](acceptance/windows-review-retry-20261109/manual-review-v3.json)를 보존했다.

- Q-7의 기존 비정상 값 원본 보존·쓰기 차단, 읽기 예외, 단일 JSON·무결성, 저장 후 메모리/UI 반영과 전원 장애 한계는 반영됐다. 모델 검토 성공 사실은 유지한다.
- 별도 진행자 점검에서는 저장 dueDateTime이 문자열이라는 조건만 있어 실제 날짜/시간 유효성 검증을 로드/변경 후보에도 적용할지 명시가 부족하고, 여러 탭이 같은 이전 목록에서 서로 덮어쓰는 경우의 사용/보호 정책이 없다. 이 두 항목을 승인 전 짧게 보완하도록 권고한다. 이는 Gemini Reviewer 자체 이슈가 아니다.
- 실제 로컬 상태는 v3/iteration3/5/awaiting_approval, 최종 사용자 승인 pending 그대로다. 사용자 승인·새 기획 생성·Scope 수정·제품/팀원 실행은 하지 않았다. 후속 수정은 사용자가 권고를 수용하면 request-plan-revision → resume-plan으로 같은 Scope/남은2회 안에서 수행한다. 새 탭 제한 등은 기획자 제안으로 기록하며 기존 사용자 선택으로 꾸미지 않는다.

## 최신 로컬 관찰 — 기획 v3 승인 대기, PowerShell 요약 인코딩 오류

사용자가 Q-7 보완 답변 → resume-plan 실행 로그를 제공했다. [관찰 기록](acceptance/windows-review-retry-20261109/resume-v3-observation.json)에 성공 상태와 표시 오류를 분리했다. 보고서 전체는 깨진 한글과 줄바꿈이 포함돼 유효한 원문 JSON으로 재구성하지 않았다.

- 로컬 모델 재개 종료코드0, continuation completed. Plan v3 / iteration3/5 / awaiting_approval, review-3 pass/issues[]/challengeCompleted=true, plan approval-b00d7ead-ca59-45ae-ba58-47aef133a2b8 pending, nextAction approve-plan이 출력에 보인다. 최종 승인하지 않았다.
- 이후 진행자 안내 스크립트의 `$reportText | ConvertFrom-Json`에서 오류가 발생하고 요약 필드가 비었다. 네이티브 Node stdout을 Windows PowerShell이 캡처할 때 한글 인코딩이 깨진 것으로 보이며 모델 요청 실패가 아니다. 출력에 깨진 문자를 실제 기획 원문으로 간주하지 않는다.
- 다음은 사용자 PC의 원본 `.adtf/projects/my-supervisor-20261109-112551/planning/plans/my-supervisor-20261109-112551-plan/v3.json` 파일을 받아 UTF-8 원문·보완 반영·품질을 확인하는 일이다. answer/resume-plan/retry-review를 반복하거나 기획을 자동 승인하지 않는다. 원문은 아직 받지 않았다.
- 이후 로컬 상태 요약은 `Get-Content -Raw -Encoding UTF8`로 저장 JSON을 직접 읽거나 Node 안에서 처리해 PowerShell 네이티브 출력 파싱을 피한다. 사용자에게 긴 JSON 복사를 반복 요청하지 않는다.

## 최신 로컬 관찰 — 수정본 Reviewer 재검토 성공, 기획 v2 피드백 대기

사용자가 Windows 재시도 후 report 원문을 제공했다. [보존 report](acceptance/windows-review-retry-20261109/report.json), [기획 v2](acceptance/windows-review-retry-20261109/plan-v2.md), [판정 요약](acceptance/windows-review-retry-20261109/assessment.json)을 우선한다. 이 로컬 기록을 Cloud의 기존 재고/todo .adtf에 복원하거나 합치지 않는다.

- local project my-supervisor-20261109-112551: Scope v4 approved, Supervisor r6 scope_approved, Plan v2 / iteration2/5 / awaiting_user_input / nextAction collect-feedback. 최종 기획 승인·작업 제안 없음.
- reviewRetry는 v1 출처·시각을 보존한다. 현재 Review v2는 challengeCompleted=true로 응답 형식 검토까지 완료됐으며 이전400은 이번 report에서 재발하지 않았다. 사용자 PC에서 수정본 요청 성공이 관찰됐다. 전체 긴 기획/모델 안정성 보장은 아니다.
- headline pass/issues[]이지만 storageAudit의 present_empty=initialize+허용근거 없음, read_error=unspecified를 코드가 차단한다. 이전과 같은 issue-storage-present_empty가 남았다는 state.reason으로 사용자 입력 대기에 진입했다. 제공된 현재 Review를 코드로 재검증해 [미해결 2항목](acceptance/windows-review-retry-20261109/policy-check.json)을 확인했다. v1 Review는 제공되지 않아 반복 비교 자체를 독립 재현했다고 주장하지 않는다.
- 다음 로컬 행동은 collect-feedback(모델 없음) → 새 질문에 실제 보완 답변 → resume-plan(실호출)이다. 일반 plan/start/retry-review 재실행, 데이터/예약 삭제, 기획 승인으로 우회하지 않는다. 같은 Scope와 남은 총 반복3회를 유지한다. 보완 방향은 기존 비정상 값 원본 유지·변경 작업 차단, 읽기 예외의 명시 처리 및 관찰 가능한 검증 사례다.
- 로컬 usage ledger 전체는 받지 않았으므로 총 호출/토큰을 추정하지 않는다. 이 파일들은 사용자 제공 결과 보존이며 Cloud에서 실제 모델 재실행·승인·로컬 데이터 변경은 하지 않았다. 아래 재검증 대기 문구는 이번 관찰 전 시점 기록이다.

## 최신 수정 — Windows Reviewer challenge 400, 로컬 재검증 대기

사용자 Windows main ZIP 실호출에서 Writer/assessment success 후 challenge HTTP400 INVALID_ARGUMENT가 발생했다. 기획 v1은 비공백150줄이다. [진단·적용·복구 안내](reviewer-request-recovery-20261109.md), [검증 기록](acceptance/reviewer-schema-400-20261109.json)을 먼저 읽는다. 아래 완료 보고는 이전 Cloud/소규모 평가 범위이며 이번 로컬 기획의 실제 검토 완료를 뜻하지 않는다.

- 큰 줄 번호 enum을 긴 기획에서 정수 범위로 줄이고 모델에는 비공백 원문 줄만 전달한다. 줄 번호/원문 검증은 유지한다. 요청 복잡도가 원인 후보이며 실제 사용자 요청의 서비스 재현은 미완료다.
- `supervisor retry-review --reason ...`로 reviewing 상태의 저장 기획을 명시적으로 한 번 재검토할 수 있다. 현재 초안 재작성 없이 Reviewer부터 시작하고 revise면 원래 예산 내 정상 수정한다. 최초 assessment는 별도 저장되지 않아 Reviewer 절차는 처음부터 다시 호출한다.
- 재시도 예약·사유·출처 해시·시각을 모델 호출 전에 Planning reviewRetry에 저장하고 변경/삭제를 막는다. 실패/중단 뒤 자동 재호출 금지, 동시 잠금·현재 Scope/기획·예산·최종 사람 승인 유지. 진행 중 continuation/작업 제안 뒤에는 재시도 불가다.
- typecheck/전체137개 테스트 통과(Linux). Windows 기준 예상135통과/2제외/실패0이며 아직 수정본 Windows 결과를 받지 않았다. 기존 실제 todo20파일·재고17파일 체크포인트 해시 일치.
- **Cloud ADC는 현재 invalid_grant/invalid_rapt로 재인증 필요**. Cloud에서 수정 전후 Gemini 성공을 주장하지 않는다. 사용자 PC는 이미 모델 연결이 됐으며 인증 코드를 요구하거나 자격 증명을 복사하지 않는다.
- 사용자 PC 실제 프로젝트 `my-supervisor-20261109-112551`: 질문6/답변/Scope v4 제안 후 기획 v1 저장·검토 중. Scope 승인 전체/report는 로컬에서 재확인. 기존 `.adtf`와 해당 examples 설정/요청/답변을 백업·보존한 뒤 수정 소스만 적용한다. start/plan/Scope 승인 중복 실행 금지. 로컬 실제 재시도 결과를 받아야 시험을 마칠 수 있다.

## 최신 완료 — 저장 복구 검토·새 사례 평가·사용자 문서

사용자가 요청한 지휘자 품질 보완·단독 검증과 문서를 완료했다. [최신 품질 보고서](reviewer-reliability-20261109.md), [계획 대비 구현 현황](plan-vs-implementation-20261109.md), [소스 다운로드/실행 가이드](local-run-guide.md)를 먼저 읽는다. 아래 단계별 승인 대기 문구는 과거 이력이다.

- storageAudit: JSON 5상태의 실제 동작·원문 줄·허용 Scope 근거. 기존 JSON 초기화/덮어쓰기에 근거가 없으면 pass라도 수정. 명시 승인된 캐시 초기화·일반 텍스트의 정상 빈 값은 구분한다. 의미상 근거 적합성은 여전히 모델/사람 판단이다.
- f95fa75 baseline 비교: 회귀 결함 기존3/3, 최종3/3 차단·정상 양쪽3/3. 새6종×2회는 양쪽 결함6/6 차단·정상6/6 승인 단계 도달·형식 실패0. 이번 표본에서 성능 향상을 주장하지 않는다. 최초 회귀1건 형식 실패는 보존하고 새 사례 평가 전에 ID 스키마를 보완했다. 새 사례 출력 확인 후 코드 조정 없음.
- 전체 모델 요청72개/논리 리뷰42회, 중간 실패 포함. [집계](acceptance/reviewer-reliability-20261109/aggregate.json), [Reviewer 사유](acceptance/reviewer-reliability-20261109/reviewer-history.json). 예전 품질94요청·실제 todo13기록과 구분한다. 세 평가 디렉터리는 완료했으므로 재실행하지 않는다. 다음 변경은 별도 새 검증 세트가 필요하다.
- typecheck/132개 테스트 통과. ADC·.adtf 없는 별도 소스 폴더에서 npm ci(쓰기 가능한 캐시), typecheck,132테스트, Fake Planning·Supervisor 입구 실행 성공. Windows 명령은 문서 검토했으나 실제 PowerShell 실행은 하지 않았다. [설치 시험](acceptance/local-guide-smoke-20261109.json).
- 실제 todo 최신20파일·재고17파일 체크포인트 해시 일치. 현재 todo Scope v6/Plan v4 approved·iteration4/5·Supervisor r20 tasks_proposed/6작업, 재고 v4/v3 approved·3/5·r16/5작업 그대로다. 사용자 결정을 다시 실행하거나 과거 체크포인트를 덮어쓰지 않는다.
- 모델/환경은 iceu-songpa11/global, gemini-3.8-flash 양 역할, ADC, Node24 --use-env-proxy. 인증 파일 내용·토큰은 출력하지 않는다. 제품 코드/제품 브라우저 시험·팀원 설계/연결/실행은 보류한다. 커밋 메시지는 한국어다.

## 최신 상태 — 할 일 주제의 기획·작업 지시 단독 인수 완료

사용자가 확인한 ‘v4 확정 → 작업 지시 시험 → 최종 정리’를 완료했다. [최종 인수 보고서](supervisor-todo-final-acceptance-20261109.md), [쉬운 작업 요약](acceptance/todo-final-20261109/work-orders-easy-summary.md)을 우선한다. **Git 커밋 메시지는 앞으로 한국어로 작성한다**(사용자 요청, AGENTS.md에도 반영).

- 실제 todo 상태: Scope v6 approved / Plan v4 user_approved / 반복4/5 / Supervisor revision20 tasks_proposed / 작업6개 / taskRevisions1개. Plan 승인 ID `approval-a3422782-30f5-4fc9-a7bf-3971193373c5` approved. [실제 승인](acceptance/todo-final-20261109/plan-approval.json).
- source hash `eb90453cab264d16c0fcbee44e200a804415ed656313a75b48ae3793ed06c3e1` 유지. Scope/Plan/Review 본문·과거 버전과 재고 프로젝트는 해시가 그대로다.
- 작업 제안3요청: v1 정상 저장 → 첫 수정은 Unknown dependency로 Controller 거부/기존r19 보존 → 재시험 v2 정상 저장/r20. 최종6개 ID와 DAG, REQ-01~07, 테스트 산출물·고정 origin·실패 경계·복원 시나리오를 대조했다. [상세 지시](acceptance/todo-final-20261109/work-orders-v2.md), [진단](acceptance/todo-final-20261109/rejected-revision-attempt.json), [원응답](acceptance/todo-final-20261109/retry-raw-orders.json).
- 검증은 실제 Gemini 생성+Controller 구조/출처 검증+진행자 내용 대조다. 작업 제안에 Planning Reviewer가 추가 호출된 것으로 기록하지 않는다. 첫 거부 응답 본문은 CLI가 저장하지 않아 없고, 재시험은 검증 전 원문을 보존했다. usage success는 JSON 파싱 성공이며 Controller 수락/실행을 뜻하지 않는다.
- 제품 코드·제품 브라우저 테스트·팀원 실행·작업 수락/초기화 없음. report.nextAction=initialize-tasks는 기술적 안내이며 현재 승인 범위의 다음 자동 작업이 아니다. 여기서 멈춘다.
- [최신 체크포인트](acceptance/todo-final-20261109/runtime-checkpoint.json), [report](acceptance/todo-final-20261109/report.json), [사용량](acceptance/todo-final-20261109/usage-summary.json). 이전 todo-20261108 체크포인트는 승인 전 역사 자료라 현재 데이터 위에 복원하지 않는다. retry receipt는 completed이므로 모델/결정을 재실행하지 않는다.
- 프롬프트의 CLI 가정을 승인 제품 인터페이스 기준으로 일반화하고 수정 작업 ID/참조 일치를 명시했다. 최종 typecheck/128개 테스트 통과. 실제 본 실행 모델 기록13개, 작업 요청만3개. 별도 품질 평가94개 요청과 구분한다.

이번 주제까지 대표 기획·지시 인수는 완료다. 남는 개선은 품질 평가의 의미 미검출·미지의 독립 사례다. 팀원/제품 구현은 사용자 재지시 전까지 보류한다. 아래는 앞선 시점의 품질 보완 및 승인 대기 이력이다.

## 최신 작업 완료 — Writer/Reviewer 품질 절차 보완·실제 비교

사용자 요청에 따라 시스템 프롬프트·검토 형식·코드 통과 조건을 보완했다. [최종 보고서](planning-quality-hardening-20261108.md)를 우선한다. todo 기획 v4 최종 승인은 여전히 pending이며 제품 구현·팀원 Agent 작업은 보류다.

- Writer는 사용자 선택/제안/미정 출처, 쉬운 이용 흐름, 요구별 정상/실패/수락 기준, 수정·회귀 점검을 지시한다.
- 새 Gemini Review는 qualityAssessment v1에 필수 요구 전체와 7개 점검의 상태·근거 위치·이유를 제출한다. 현재 기획의 실제 비어 있지 않은 줄 번호만 응답 스키마에서 선택할 수 있고 코드는 원문을 추출·참조 검증한다. 미해결은 모델 pass보다 우선해 수정/질문으로 보낸다.
- 승인 대상으로 넘어갈 때만 독립 반례 검토를 한 번 더 호출한다(동일 모델, 앞 판정은 전달하지 않음). 실패하면 이전 pass를 반환하지 않는다. 논리적 반복 예산은 유지하며 실제 모델 호출은 reviewer 절차당 최대2, usage의 reviewStage로 구분한다. MEDIUM thinking·단계별 출력8,000 한도를 사용한다.
- typecheck/전체 **128개 테스트 통과**. 기존 qualityAssessment 없는 리뷰/fixture는 호환하며 과거 기록을 새 방식으로 검증된 것으로 바꾸지 않는다.
- [동일 고정 사례 최종 비교](acceptance/planning-quality-bounded-20261108/comparison.json): 결함5개×2회 차단이 기존6/10 → 최종9/10, 정상2개×2회는 양쪽4/4 통과, 최종 형식 오류0. **빈 저장 문자열 자동 초기화 결함은 최종1회 놓쳤으므로 의미 품질을 보장하지 않는다.** 개발에 사용한 소규모 세트이며 일반 정확도/통계 검증이 아니다.
- 최종 고정 후보 14회 검토에서 모델 요청 기록은21개(기존14). 모든 중간 실패·재시험·Writer 표본까지94개를 [ledger](acceptance/planning-quality-bounded-20261108/all-usage.jsonl)에 보존했다. 기록된 입력470,294/출력100,451/reasoning181,079; 지표 없는10행은 추정하지 않는다.
- 새로운 Writer 미승인 표본은 [최종 별도 검토](acceptance/planning-quality-bounded-20261108/writer-sample-final-review.json)에서 승인 대상으로 제시 가능 판정이다. 실제 사용자 승인이 아니며 현재 todo v4와 합치지 않는다.
- 평가 스크립트/후보/원본 baseline은 examples/planning-quality-eval에 있다. baseline은951588b의 원본 어댑터다. initial/references/challenge/bounded의 기존 실행 경로는 모두 완료했으므로 재실행하지 않는다. 모델 호출·승인·Planning 재개를 중복 실행하지 않는다.

기존 todo·재고와 관련 승인 파일은 전후 동일하다. todo는 Scope v6 approved / Plan v4 awaiting_approval / 반복4/5 / Supervisor revision17이다. 강화된 별도 평가의 기존 v4는 두 번 모두 통과했으나 정식 과거 Review를 덮어쓰거나 기획 승인을 대신하지 않았다. 이후에는 사용자 결정에 따라 최종 승인 또는 같은 Scope의 남은 예산 내 수정을 진행한다. 상세 상태는 아래와 원래 체크포인트를 본다.

## 새 주제 시험 — 내 할 일 목록 관리, 기획 v4 최종 승인 대기

재고 인수 완료 이력은 아래에 보존한다. 새 projectId `supervisor-todo-acceptance-20261108`, [진행 기록](supervisor-todo-acceptance-20261108.md), [설정](../examples/supervisor-todo-gemini/config.json), [입력](../examples/supervisor-todo-gemini/request.md)을 따른다. 기존 재고 프로젝트 파일은 해시가 그대로이며 서로 합치지 않는다.

- **현재 실제 상태:** Scope v6 approved, Supervisor revision 17 / scope_approved, Planning currentPlanVersion 4 / awaiting_approval / iterationCount 4/5. Plan 승인 ID `approval-a3422782-30f5-4fc9-a7bf-3971193373c5` pending. 작업 제안·제품 구현·팀원 실행 없음.
- 사용자 질문 7개 답변 + Scope 승인 + 상세 질문 3개 답변을 기록했다. 상세 확정은 제목·마감일시 필수/메모 선택, 날짜+시간, 삭제 확인이다. [결정 출처](acceptance/todo-20261108/user-decisions.md)를 본다.
- [기획 v4 쉬운 요약](acceptance/todo-20261108/plan-v4-user-summary.md), [전체 원문](acceptance/todo-20261108/plan-v4.md), [점검](acceptance/todo-20261108/assessment-v4.md)을 사용자에게 제시한다. 직접 확정하지 않은 과거 마감일 허용·단일 탭·저장 기술은 승인 대기 제안이다.
- Reviewer 검토 4회 모두 pass / 자체 revise 0회. 사용자 추가 답변·진행자 점검으로 3회 수정했고 v1~v4와 Review/이유를 [이력](acceptance/todo-20261108/reviewer-history.md)에 보존했다. pass 이후 사람이 발견한 누락을 숨기지 않는다.
- **다음은 사용자 기획 v4 승인 또는 수정 결정.** 이미 Scope 승인한 것을 다시 묻지 않는다. 실제 최종 승인 후에만 approve-plan → propose-tasks를 진행하며 제품 구현·팀원 연결로 확장하지 않는다. 모델 반복은 1회만 남았다. 단순 모델/승인 재실행은 하지 않는다.
- [체크포인트](acceptance/todo-20261108/runtime-checkpoint.json)는 todo 프로젝트와 관련 승인만 포함한다. 실제 데이터 최신 상태를 먼저 확인하고 더 최신 데이터를 덮어쓰지 않는다. 이전 재고/격리 시험 체크포인트와 혼동하지 않는다.

기존 ADC로 모델 호출 성공, GCP iceu-songpa11/global / gemini-3.8-flash / Node 24.22.1 --use-env-proxy 유지. 인증 파일 본문·토큰을 출력하지 않는다. 전체 typecheck/119개 테스트 통과. 이 주제의 실제 모델 호출 10회 성공, 입력 60,107 / 출력 21,496 / reasoning 10,708 / 228,051ms. [사용량](acceptance/todo-20261108/usage-summary.json). 새 주제는 최종 승인과 지시 품질 시험이 남아 있어 아직 전체 완료로 선언하지 않는다.

## 최신 상태 — 지휘자 단독 대표 인수 완료

- 브랜치 `docs/supervisor-only-acceptance`. 구현 체크포인트 `3fef309`, typecheck 및 **119개 테스트** 통과. [최종 인수 보고서](supervisor-final-acceptance-20261108.md)를 우선한다.
- **primary 실제 상태:** 사용자 승인 Scope v4 / Plan v3, planning user_approved / iterationCount 3/5. Supervisor revision 16 / tasks_proposed, 작업 제안 5개 / taskRevisions 2개. [최종 지시서](acceptance/2026-11-08/primary-work-orders-v3.md). primary 작업 초기화·제품 구현·팀원 실행 없음.
- 질문·Scope 지침, 안전한 실패 분류, 승인 대기 기획 수정과 재개, 미수락 작업 재제안 이력, 확인 stdin EOF 실패를 개선했다. 기존 원문·승인·버전·총 예산을 보존한다.
- [승인 출처 정책 시험](acceptance/2026-11-08/approved-source-policy-fixture.json): 선행 조건/근거 부족 거부, 재작업·한도, 환경 차단·품질 카운터 구분과 사실에 맞는 보고 확인. TEST/STUB 텍스트만 사용했다.
- [독립 실제 모델 재현](acceptance/2026-11-08/approved-scope-replay-20261108/result.json): 새 Writer v1 → Reviewer revise(major 2) → Writer v2 → Reviewer pass, 2/5. 이 후보는 최종 사용자 승인하지 않았고 primary 승인 기획을 대체하지 않는다.
- 사용자가 시험 Scope v5 원문을 검토하고 **두 격리 분기 실행을 승인했으며 시험 완료**했다. [결과](acceptance/2026-11-08/scope-change-test/results.json): 거절은 Scope v4/독립 Plan v2·2/5 유지, 모델 미호출. 승인은 시험 Scope v5/새 Plan v3·Reviewer pass·3/5이며 새 기획 최종 승인 pending. 양 분기에서 과거 스냅샷·총 예산을 보존했고 실제 primary는 그대로다. 시험 요구는 N 생략 시 기본 7일이며 실제 제품 변경으로 채택하지 않았다.
- 실제 Reviewer 검토 **6회 / 수정 요청 1회**. 사유·심각도·관련 요구·수정 방향·원문은 [Reviewer 이력](acceptance/2026-11-08/reviewer-history.md)에 보존했다. primary v1→v2→v3의 수정은 사용자·진행자 요청이므로 Reviewer 자체 요청 횟수와 구분한다.
- 전체 모델 어댑터 호출 21회(성공 20/실패 1), 제공 토큰 입력 137,489 / 출력 38,749 / reasoning 16,901, 호출 시간 410,995ms. [집계](acceptance/2026-11-08/model-usage-summary.json)는 복사 ledger 중복을 제거하며 미제공 지표를 추정하지 않는다.

### 재개 시 경계

현재 사용자 목표인 사람 승인형 CLI 지휘자·기획자 구현과 재고·유통기한 대표 단독 인수는 완료했다. 팀원 Agent 설계·개발·연결·제품 구현은 사용자 재지시 전까지 보류한다. `report.progress.completed=false`는 제품 작업 미완료 의미이며 이번 지휘자 인수 판정과 다르다. 모델 pass는 사람 승인이나 무인 품질 보장이 아니다.

완료한 모델/결정 스크립트를 재실행하지 않는다. 격리 데이터는 `/workspace/scratch/approved-scope-replay-20261108`, `approved-scope-change-reject-20261108`, `approved-scope-change-approve-20261108`에 각각 있다. projectId는 기존 genuine Scope 승인 결합을 유지하기 위해 같지만 물리 메모리 루트와 실행 ID는 다르다. [원본 격리 체크포인트](acceptance/2026-11-08/scope-change-test/runtime-checkpoint.json), [거절 분기](acceptance/2026-11-08/scope-change-test/reject/runtime-checkpoint.json), [승인 분기](acceptance/2026-11-08/scope-change-test/approve/runtime-checkpoint.json)는 각 격리 루트에만 복원하며 primary와 합치지 않는다. 시험 후보의 최종 승인·작업 생성은 하지 않았다.

ADC 파일 `/workspace/.gcloud-adc/application_default_credentials.json`은 마지막 호출에서 유효했고 토큰을 출력하지 않는다. GCP iceu-songpa11/global, Writer/Reviewer gemini-3.8-flash, Node 24.22.1의 --use-env-proxy를 사용했다. [primary 체크포인트](acceptance/2026-11-08/primary-runtime-checkpoint.json)는 실제 프로젝트 데이터다. 최신 상태·해시를 확인하고 더 최신인 데이터를 덮어쓰거나 모델 호출·사용자 결정을 중복 실행하지 않는다. primary에서 start/plan/resume-plan을 다시 실행하지 않는다. 아래는 과거 구현 기록이다.

## 기존 구현 상태 (실제 인수 전 기록)

**사용자 최신 우선순위:** 현재 지휘자 겸 기획자 Agent 하나를 확실히 완성하고 테스트한다. 팀원 Agent 설계·개발·연결은 사용자 재지시 전까지 보류하며, 인수 완료 후에도 자동으로 착수하지 않는다. [현재 Agent 완료 기준](supervisor-acceptance.md)에 따라 부족한 부분을 수정·재시험한다.

STEP 1 / 1.5 / 2A / 2B / 3 / 4 / 5A / 5B의 코드를 구현했다. 현재 브랜치는 `feature/supervisor-continuation`이며 STEP 5A `792cad1`, STEP 4 `24f9d39`, 기반 문서 `f5528e0`, 수동 개발 `d5780ac`, Gemini 연결 `4d78972`를 포함한다. main 병합은 하지 않았다. 다음은 실제 Gemini로 주제별 기획 품질을 검증하는 인수 시험이다.

사용자는 지휘자 겸 기획자 Agent 하나를 먼저 완성하고 이후 팀원 Agent를 하나씩 연결하는 순서를 확인했다. 통합 CLI와 변경 후 재개는 구현했지만 실제 모델을 포함한 지휘자 전체 인수는 아직 완료하지 않았다. [전체 안내서](supervisor-guide.md), [사용법](supervisor-workflow.md), [STEP 5B 보고서](step5b-report.md)를 먼저 읽는다.

- TypeScript 타입 검사 통과, Node 테스트 111개 통과(기존 93개 + STEP 5B 신규 18개). 신규 테스트는 답변·Scope 변경 승인/거절 후 재개·새 작업 출처·총 한도·오래된 출처·중단/동시 실행 중복 호출 방지·승인 부분 저장·CLI·사용량 기록을 검증한다.
- 신규 CLI 통합 테스트에서 기획안 최종 승인 → 작업 생성 → 담당자 지정 → 결과 제출 → 수동 검수 → 후속 작업 준비를 Cloud의 격리된 임시 디렉터리에서 확인했다.
- Gemini 실제 호출은 사용자가 Windows PC에서 ADC로 실행한 화면으로 확인했다. Writer Plan v1 저장, Reviewer 결과, REQUEST_USER_APPROVAL까지 도달했다. 이 기획안의 실제 최종 사용자 승인을 Cloud에서 대신 기록하지 않았다.
- Cloud는 Windows 로컬 ADC 또는 `.adtf` 데이터에 접근하지 않는다. 개발 및 오프라인 검증은 모바일의 Cloud 대화에서 이어갈 수 있다. 컴퓨터 페어링은 필요하지 않다.

## 주요 구현

- `src/supervisor/`: 원문·질문 답변·Scope 제안·승인·기획·작업 분해·지시서·보고 통합. 모델은 제안만 반환한다. 파일 잠금·revision·불변 원문/답변/이력으로 저장한다.
- `src/supervisor/continuation.ts`: 질문 수집, 변경 요청·제안·결정, 명시적 resume-plan. 기준 상태·Scope·Plan/Review 해시를 보존하고 시작 권한을 먼저 저장한다. 총 반복 한도와 새 기획 최종 승인을 유지한다. `continuation-validation.ts`가 상태·기록과 다음 행동을 검증한다.
- `src/cli/supervisor.ts`: `start`, `questions`, `answer`, `propose-scope`, `approve-scope`, `reject-scope`, `plan`, `approve-plan`, `propose-tasks`, `configure-verification`, `initialize-tasks`, `report`. 입력 원문·답변은 파일로 받는다.
- STEP 5B CLI: `collect-feedback`, `request-scope-change --reason`, `propose-scope-change`, `approve-scope-change --reason`, `reject-scope-change --reason`, `resume-plan`. 실제 모델 설정에서도 답변/승인/보고는 API 없이 동작한다.
- `examples/supervisor-gemini/`: 실제 기획 인수용 새 projectId·maxIterations 5·Gemini 3.8 Flash 설정과 원문. 아직 실호출하지 않았다. 기존 프로젝트에 반복 실행하지 않고 새 실험에는 별도 projectId를 쓴다.
- 모델 제안 사용량은 `supervisor/usage.jsonl`, 기존 기획 역할은 `planning/usage.jsonl`에 기록한다. 성공은 JSON 응답 파싱 성공이며 Controller가 Scope나 작업을 승인했다는 뜻이 아니다. 실패 응답이 토큰을 제공하면 기록하고 없으면 추정하지 않는다.
- `examples/supervisor-demo/`: TEST/STUB 오프라인 예제. 질문·Scope·작업 제안은 고정 fixture이며 실제 의미상 품질 평가가 아니다. 실제 제안 어댑터는 Writer 모델을 재사용하고 CLI에서 CALL을 확인한다.
- `src/planning/`: Fake/Gemini Writer·Reviewer, Planning Controller, 검토 정책, JSON 설정과 파일 저장소.
- `src/development/plan-approval.ts`: Plan의 최종 승인 및 상태 갱신, 실제 Scope 승인 확인. 승인 레코드 기록 후 중단되면 동일 명령으로 상태 갱신을 마칠 수 있다.
- `src/development/controller.ts`: 프로젝트별 TaskStateManager와 수동 작업 생성·위임 기록·결과 제출·검수·차단·취소·재작업.
- `src/verification/`: Core VerificationEngine 구현, 운영자 명령 목록, 파일·입력 해시와 실제 제한된 검사 프로세스, 시도에 연결된 근거.
- `src/development/validation.ts`: 외부 JSON, 버전, 프로젝트, DAG, 체크 결과와 완료 조건 검증.
- `src/development/memory-store.ts`: 작업 및 변경 전후 이력을 단일 schemaVersion 1 / revision 스냅샷으로 저장. 잠금, 기대 revision 비교, 임시 파일 교체를 사용한다.
- `src/cli/development.ts`: `plan-approve`, `init`, `list`, `assign`, `submit`, `verify`, `review`, `transition`.
- `examples/development-manual/`: 편집용 작업/결과/검수 예제. 검수 파일 기본값은 미검토(false)다.

## 경계와 정책

- Core는 SDK에 의존하지 않는다. Runtime과 LLM Provider/Model은 별개다.
- 승인 Plan/Scope와 작업 정의는 불변이다. 개발 상태는 출처 버전·승인·해시를 매 변경 시 확인한다. Scope의 DEMO FIXTURE 승인은 실제 개발을 허용하지 않는다.
- 작업은 실제 사용자 승인 기획에 연결해야 한다. 제안 작업은 요구 ID 전체 커버리지·DAG를 검사하지만 의미상 Scope 적합성은 사람이 검토한다. 작업 수락 전 운영자가 검증 프로필·재작업 예산을 지정할 수 있으며 실행 명령 정책은 별도다.
- 선행 작업 검수 승인 전 실행할 수 없고, 제출 결과 또는 모든 완료 조건에 대한 수동 검수 없이 작업을 승인할 수 없다.
- Worker 결과는 보고된 주장이다. 이 단계의 assign은 실제 Worker를 실행하지 않고, submit은 파일 존재나 변경 내용을 자동 확인하지 않는다.
- 프로필 작업은 실제 검증 통과 근거와 모든 완료 조건의 최종 검수가 있어야 승인한다. 검증 후 선언 파일 변경 시 승인하지 않는다. 품질 재작업 예산을 적용하고 환경 차단은 별도로 처리한다. 과거 결과·검수·근거는 이력에 남기며 새 시도에서 재사용하지 않는다. 기존 프로필 없는 수동 기록은 자동 변환하지 않는다.
- `.adtf`의 기존 기록을 삭제하거나 덮어쓰지 않는다. stale lock을 자동 제거하지 않으며 쓰는 프로세스가 없는지 먼저 확인한다.
- 인증 토큰이나 ADC 파일을 채팅, 저장소 또는 프로젝트 메모리에 넣지 않는다.

## 다음 작업

실제 인수 실행 현황은 [환경 확인·실행 기록](gemini-acceptance-status.md)에 남겼다. 코드 `29160fc`로 현재 Cloud의 supervisor-gemini-acceptance intake(revision 1)를 등록했고 다음 명령은 questions다. ADC 부재와 Vertex AI/OAuth CONNECT 403을 직접 확인했으며, 실행 환경 연결 방법을 사용자에게 요청했다. 모델 호출과 사용자 Scope/Plan 승인은 아직 없다. 같은 Cloud에서는 start를 반복하지 않고, 로컬 전환 시에는 그 PC의 상태를 먼저 확인한다.

1. 실제 Gemini로 재고·유통기한 주제의 질문·한국어 기획·작업 지시 품질과 추가 답변/변경 후 흐름을 평가하고 전체 인수 보고서를 작성한다. Cloud에는 ADC와 Vertex AI 접속 설정이 없으며 로컬 자격 증명을 복사하지 않는다. 사용자가 수행한 이전 단독 Planning 실행은 이번 전체 인수로 계산하지 않는다.
2. 실제 기획·질문·변경·지시·판단·보고에서 발견한 현재 Agent의 문제를 수정하고 회귀 및 반복 인수 시험을 진행한다. 팀원과 Runtime 확장은 보류한다. 이미 제안/초기화된 작업의 Scope 변경·이관과 중단된 모델 실행의 자동 복구는 현재 한계로 기록한다.

STEP 4의 사용법과 실제 검증 근거는 [검증 안내서](verification.md), [실행 보고서](step4-report.md)에 기록했다. 이 검증은 Cloud Linux의 fixture 프로젝트에서 수행했으며 Windows 실행·실제 모델 호출·전체 제품 개발의 검증이 아니다.

Supervisor 잠금은 하위 저장소 전체의 트랜잭션이 아니다. 동일 프로젝트에서 다른 기획·개발 CLI를 병행 실행하지 않는다. Scope 결정 및 작업 초기화 직후 중단은 명시적 재시도를 지원하지만 기획 도중의 자동 복구·중복 모델 호출은 허용하지 않는다. 기존 로컬 프로젝트의 지휘자 상태 자동 가져오기는 지원하지 않으므로 새 projectId로 시작한다.

기획 재개는 작업 제안 전으로 제한한다. started continuation에 대응하는 Planning 결과가 terminal이고 ID·Scope·버전이 맞으면 완료 기록만 재시도할 수 있다. drafting/reviewing 중단은 재호출하지 않는다. 이전 schemaVersion 1 파일은 continuations/continuationId가 없어도 읽을 수 있다. 승인된 기획의 user_approved→drafting 전이는 별도 Scope 변경 승인을 거친 새 Plan 생성에서만 사용하고, 기존 승인 기획을 자동 덮어쓰지 않는다.

검증 명령은 `npm run typecheck`, `npm test`다. 새 구현의 재현 명령 및 입력 형식은 README와 docs/supervisor-workflow.md를 따른다.
