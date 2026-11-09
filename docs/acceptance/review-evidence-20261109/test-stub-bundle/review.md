# 사용자 기획 검토표

기획: trial-parcel-release-evidence-ready-20261109-plan v2 / Scope: parcel-scope v1
상태: 최종 기획 승인 대기 / Scope: 시험용 승인 / 최종 기획: 확인되지 않음
실제 구현·실행 검증: 수행하지 않음. ‘반영됨’은 모델의 문서 판단이며 사용자 승인이나 실제 테스트 통과가 아닙니다.

- 이 표는 기획 문서의 모델 판단과 원문 근거입니다. 실제 구현·실행 검증은 하지 않았으며 정확성을 보증하지 않습니다.
- TEST/STUB: 이 Scope 승인은 시험 fixture이며 실제 사용자 승인이 아닙니다.

| 승인된 조건 | 판단 | 정상 동작의 원문 | 실패/무변경 동작의 원문 | 확인 사례의 원문 | 이유·남은 문제 |
| --- | --- | --- | --- | --- | --- |
| PARCEL-1: 내용 이름(앞뒤 공백 제외 필수), 실제 YYYY-MM-DD 예정 날짜(필수), 선택 메모를 등록한다. 같은 내용도 독립 기록이고 최초 등록 순서로 표시하며 새 기록의 received는 false다. | 반영됨 | L2: PARCEL-1 정상: 비공백 내용 이름, 실제 YYYY-MM-DD 예정 날짜, 선택 메모를 고유 ID/seq와 received=false로 등록한다. 같은 내용도 독립 기록이며 과거·오늘·미래 날짜를 모두 허용한다. | L3: PARCEL-1 실패: 공백 이름·존재하지 않는 날짜는 안내하고 입력·목록·저장값을 바꾸지 않는다. | L4: PARCEL-1 확인: 책/2026-11-10을 두 번 추가하면 미수령 기록 두 건이다. 공백 이름과 2026-02-30은 추가되지 않고 입력은 남는다. | TEST/STUB fixed evidence, not real quality. |
| PARCEL-2: 선택한 한 기록만 받음/미수령으로 전환하고 취소할 수 있다. 이름·날짜·메모 수정은 같은 규칙으로 검증하며 ID/seq는 유지한다. 삭제는 확인 후 한 건이며 취소하면 저장·목록 무변경이다. | 반영됨 | L5: PARCEL-2 정상: 선택 ID 한 건의 received 불리언만 받음/미수령으로 전환한다. 이름/날짜/메모 수정은 등록과 같은 규칙이며 ID/seq 불변이다. 삭제는 확인 후 한 건이다. | L6: PARCEL-2 실패: 잘못된 수정·삭제 확인 취소는 입력·목록·저장값을 보존하고 쓰지 않는다. | L7: PARCEL-2 확인: 같은 책 두 건 중 첫 건만 받음으로 바꾸고 미수령으로 되돌린다. 둘째 삭제를 취소하면 두 건 모두 남는다. | TEST/STUB fixed evidence, not real quality. |
| PARCEL-3: 재접속 후 정상 목록과 수령 상태를 보존하고, 저장/읽기 오류·무결성·커밋·다중 탭 처리는 기술 제약을 따른다. | 반영됨 | L8: PARCEL-3 정상: 같은 origin/프로필로 다시 열면 정상 목록·received·seq 순서가 유지된다. | L9: PARCEL-3 실패: getItem 자체 읽기 예외는 안내·무쓰기·변경 차단이며 쓰기 실패는 입력·목록·저장값 보존이다. | L10: PARCEL-3 확인: 두 건 등록하고 첫 건을 받음 처리한 뒤 다시 열면 그대로다. getItem SecurityError면 무쓰기 차단, setItem 실패면 이전 화면과 새 입력을 유지한다. | TEST/STUB fixed evidence, not real quality. |

## 수정 전후 및 이전 지적 확인

비교 문맥과 인용 출처를 검사한 모델 판단입니다. 의미상 동일성이나 실제 구현을 증명하지 않습니다.

비교 기준: 이전 기획 v1 / 본문 SHA-256 8f8776795d3e6292b315e5b75382be97611460ec7d5fe0055e07315266f0eb03

| 요구/제약 출처 | 모델 판단 | 이전 기획 원문 | 현재 기획 원문 | 이유 |
| --- | --- | --- | --- | --- |
| requirement:PARCEL-1 | 유지됨 | L2: PARCEL-1 정상: 비공백 내용 이름, 실제 YYYY-MM-DD 예정 날짜, 선택 메모를 고유 ID/seq와 received=false로 등록한다. 같은 내용도 독립 기록이며 과거·오늘·미래 날짜를 모두 허용한다.<br>L3: PARCEL-1 실패: 공백 이름·존재하지 않는 날짜는 안내하고 입력·목록·저장값을 바꾸지 않는다.<br>L4: PARCEL-1 확인: 책/2026-11-10을 두 번 추가하면 미수령 기록 두 건이다. 공백 이름과 2026-02-30은 추가되지 않고 입력은 남는다. | L2: PARCEL-1 정상: 비공백 내용 이름, 실제 YYYY-MM-DD 예정 날짜, 선택 메모를 고유 ID/seq와 received=false로 등록한다. 같은 내용도 독립 기록이며 과거·오늘·미래 날짜를 모두 허용한다.<br>L3: PARCEL-1 실패: 공백 이름·존재하지 않는 날짜는 안내하고 입력·목록·저장값을 바꾸지 않는다.<br>L4: PARCEL-1 확인: 책/2026-11-10을 두 번 추가하면 미수령 기록 두 건이다. 공백 이름과 2026-02-30은 추가되지 않고 입력은 남는다. | TEST/STUB source comparison; not a semantic certificate. |
| requirement:PARCEL-2 | 유지됨 | L5: PARCEL-2 정상: 선택 ID 한 건의 received 불리언만 받음/미수령으로 전환한다. 이름/날짜/메모 수정은 등록과 같은 규칙이며 ID/seq 불변이다. 삭제는 확인 후 한 건이다.<br>L6: PARCEL-2 실패: 잘못된 수정·삭제 확인 취소는 입력·목록·저장값을 보존하고 쓰지 않는다.<br>L7: PARCEL-2 확인: 같은 책 두 건 중 첫 건만 받음으로 바꾸고 미수령으로 되돌린다. 둘째 삭제를 취소하면 두 건 모두 남는다. | L5: PARCEL-2 정상: 선택 ID 한 건의 received 불리언만 받음/미수령으로 전환한다. 이름/날짜/메모 수정은 등록과 같은 규칙이며 ID/seq 불변이다. 삭제는 확인 후 한 건이다.<br>L6: PARCEL-2 실패: 잘못된 수정·삭제 확인 취소는 입력·목록·저장값을 보존하고 쓰지 않는다.<br>L7: PARCEL-2 확인: 같은 책 두 건 중 첫 건만 받음으로 바꾸고 미수령으로 되돌린다. 둘째 삭제를 취소하면 두 건 모두 남는다. | TEST/STUB source comparison; not a semantic certificate. |
| requirement:PARCEL-3 | 유지됨 | L8: PARCEL-3 정상: 같은 origin/프로필로 다시 열면 정상 목록·received·seq 순서가 유지된다.<br>L9: PARCEL-3 실패: getItem 자체 읽기 예외는 안내·무쓰기·변경 차단이며 쓰기 실패는 입력·목록·저장값 보존이다.<br>L10: PARCEL-3 확인: 두 건 등록하고 첫 건을 받음 처리한 뒤 다시 열면 그대로다. getItem SecurityError면 무쓰기 차단, setItem 실패면 이전 화면과 새 입력을 유지한다. | L8: PARCEL-3 정상: 같은 origin/프로필로 다시 열면 정상 목록·received·seq 순서가 유지된다.<br>L9: PARCEL-3 실패: getItem 자체 읽기 예외는 안내·무쓰기·변경 차단이며 쓰기 실패는 입력·목록·저장값 보존이다.<br>L10: PARCEL-3 확인: 두 건 등록하고 첫 건을 받음 처리한 뒤 다시 열면 그대로다. getItem SecurityError면 무쓰기 차단, setItem 실패면 이전 화면과 새 입력을 유지한다. | TEST/STUB source comparison; not a semantic certificate. |
| constraint:1 | 유지됨 | L18: http://localhost:4173/같은 프로필에서 Web Locks를 편집 탭 수명 동안 유지하고 획득 후 최신 로드한다. 비소유/미지원 변경 차단, 소유 탭 종료 후 새로고침한다. | L18: http://localhost:4173/같은 프로필에서 Web Locks를 편집 탭 수명 동안 유지하고 획득 후 최신 로드한다. 비소유/미지원 변경 차단, 소유 탭 종료 후 새로고침한다. | TEST/STUB source comparison; not a semantic certificate. |
| constraint:2 | 교정됨 | L11: 공통 검증표: 단일 키 parcel\_data에 schemaVersion:1,nextSeq,items\[{id,seq,name,date,memo,received}\]이다. 로드와 전체 후보 모두 루트/필드 타입·고유 ID/seq·양의 안전 정수 seq·nextSeq &gt; max(seq)·비공백 name·실제 date·문자열 memo·불리언 received를 검증한다.<br>L14: 유효 데이터 조건은 공통 검증표의 모든 필드·값 검증에 통과한 JSON이며, 그 경우에만 로드하여 목록을 표시한다.<br>L16: 전체 변경 후보에 공통 검증표를 적용하고 직렬화한 뒤 setItem 성공 시에만 메모리/화면을 확정한다. 실패는 입력·목록·기존 저장값 보존이다.<br>L20: 공통 검증 확인: 저장 JSON의 received를 문자열 "받음"으로 바꾸거나 name을 공백으로 바꾸고 로드하면 원본 보존·무쓰기·변경 차단이다. 같은 잘못된 후보도 쓰기 전에 거부한다.<br>L21: 추가 예외: 이미 저장된 received 값은 타입 검증을 건너뛰고 그대로 화면에 적용한다. | L11: 공통 검증표: 단일 키 parcel\_data에 schemaVersion:1,nextSeq,items\[{id,seq,name,date,memo,received}\]이다. 로드와 전체 후보 모두 루트/필드 타입·고유 ID/seq·양의 안전 정수 seq·nextSeq &gt; max(seq)·비공백 name·실제 date·문자열 memo·불리언 received를 검증한다.<br>L14: 유효 데이터 조건은 공통 검증표의 모든 필드·값 검증에 통과한 JSON이며, 그 경우에만 로드하여 목록을 표시한다.<br>L16: 전체 변경 후보에 공통 검증표를 적용하고 직렬화한 뒤 setItem 성공 시에만 메모리/화면을 확정한다. 실패는 입력·목록·기존 저장값 보존이다.<br>L20: 공통 검증 확인: 저장 JSON의 received를 문자열 "받음"으로 바꾸거나 name을 공백으로 바꾸고 로드하면 원본 보존·무쓰기·변경 차단이다. 같은 잘못된 후보도 쓰기 전에 거부한다. | TEST/STUB source comparison; not a semantic certificate. |
| constraint:3 | 유지됨 | L12: getItem이 정확히 null인 경우만 최초 실행으로 빈 메모리를 구성하며 첫 변경 전 빈 쓰기는 하지 않는다.<br>L13: 기존 빈/공백·깨진 JSON·미지원 버전·필드/값 위반은 원본 그대로 보존·무쓰기·변경 차단이며 자동 초기화나 백업 이동은 하지 않는다.<br>L15: getItem 자체 SecurityError 예외는 원본 보존·무쓰기·읽기 실패 안내·모든 변경 차단이다. | L12: getItem이 정확히 null인 경우만 최초 실행으로 빈 메모리를 구성하며 첫 변경 전 빈 쓰기는 하지 않는다.<br>L13: 기존 빈/공백·깨진 JSON·미지원 버전·필드/값 위반은 원본 그대로 보존·무쓰기·변경 차단이며 자동 초기화나 백업 이동은 하지 않는다.<br>L15: getItem 자체 SecurityError 예외는 원본 보존·무쓰기·읽기 실패 안내·모든 변경 차단이다. | TEST/STUB source comparison; not a semantic certificate. |
| constraint:4 | 유지됨 | L16: 전체 변경 후보에 공통 검증표를 적용하고 직렬화한 뒤 setItem 성공 시에만 메모리/화면을 확정한다. 실패는 입력·목록·기존 저장값 보존이다.<br>L17: 저장 후 UI만 실패하면 저장 취소라고 하지 않고 새로고침을 안내한다. OS/전원 장애까지 영구 보장하지 않는다. | L16: 전체 변경 후보에 공통 검증표를 적용하고 직렬화한 뒤 setItem 성공 시에만 메모리/화면을 확정한다. 실패는 입력·목록·기존 저장값 보존이다.<br>L17: 저장 후 UI만 실패하면 저장 취소라고 하지 않고 새로고침을 안내한다. OS/전원 장애까지 영구 보장하지 않는다. | TEST/STUB source comparison; not a semantic certificate. |
| constraint:5 | 유지됨 | L18: http://localhost:4173/같은 프로필에서 Web Locks를 편집 탭 수명 동안 유지하고 획득 후 최신 로드한다. 비소유/미지원 변경 차단, 소유 탭 종료 후 새로고침한다. | L18: http://localhost:4173/같은 프로필에서 Web Locks를 편집 탭 수명 동안 유지하고 획득 후 최신 로드한다. 비소유/미지원 변경 차단, 소유 탭 종료 후 새로고침한다. | TEST/STUB source comparison; not a semantic certificate. |
| constraint:6 | 유지됨 | L19: 로그인·외부 서버·운송장 조회·알림·공유·공개 순위·실제 제품/팀원 실행·실제 사용자 승인은 제외한다. 이 문서는 미승인 시험 후보다. | L19: 로그인·외부 서버·운송장 조회·알림·공유·공개 순위·실제 제품/팀원 실행·실제 사용자 승인은 제외한다. 이 문서는 미승인 시험 후보다. | TEST/STUB source comparison; not a semantic certificate. |

| 이전 지적 ID | 해결 판단 | 현재 규칙·확인 사례 | 이유 |
| --- | --- | --- | --- |
| issue-024477071cefce31 | 해결됨 | L11: 공통 검증표: 단일 키 parcel\_data에 schemaVersion:1,nextSeq,items\[{id,seq,name,date,memo,received}\]이다. 로드와 전체 후보 모두 루트/필드 타입·고유 ID/seq·양의 안전 정수 seq·nextSeq &gt; max(seq)·비공백 name·실제 date·문자열 memo·불리언 received를 검증한다.<br>L14: 유효 데이터 조건은 공통 검증표의 모든 필드·값 검증에 통과한 JSON이며, 그 경우에만 로드하여 목록을 표시한다.<br>L20: 공통 검증 확인: 저장 JSON의 received를 문자열 "받음"으로 바꾸거나 name을 공백으로 바꾸고 로드하면 원본 보존·무쓰기·변경 차단이다. 같은 잘못된 후보도 쓰기 전에 거부한다. | TEST/STUB current rules and case. |
| quality:check:data\_integrity | 해결됨 | L11: 공통 검증표: 단일 키 parcel\_data에 schemaVersion:1,nextSeq,items\[{id,seq,name,date,memo,received}\]이다. 로드와 전체 후보 모두 루트/필드 타입·고유 ID/seq·양의 안전 정수 seq·nextSeq &gt; max(seq)·비공백 name·실제 date·문자열 memo·불리언 received를 검증한다.<br>L14: 유효 데이터 조건은 공통 검증표의 모든 필드·값 검증에 통과한 JSON이며, 그 경우에만 로드하여 목록을 표시한다.<br>L20: 공통 검증 확인: 저장 JSON의 received를 문자열 "받음"으로 바꾸거나 name을 공백으로 바꾸고 로드하면 원본 보존·무쓰기·변경 차단이다. 같은 잘못된 후보도 쓰기 전에 거부한다. | TEST/STUB current rules and case. |

## 저장값·변경 후보의 공통 검증

TEST/STUB common validation evidence.

| 검증 규칙 | 모델 판단 | 불러올 때 | 저장하기 전 후보 | 구체적인 확인 사례 | 이유 |
| --- | --- | --- | --- | --- | --- |
| 루트/필드·이름·날짜·수령 상태·ID/seq | 근거 있음 | L11: 공통 검증표: 단일 키 parcel\_data에 schemaVersion:1,nextSeq,items\[{id,seq,name,date,memo,received}\]이다. 로드와 전체 후보 모두 루트/필드 타입·고유 ID/seq·양의 안전 정수 seq·nextSeq &gt; max(seq)·비공백 name·실제 date·문자열 memo·불리언 received를 검증한다.<br>L14: 유효 데이터 조건은 공통 검증표의 모든 필드·값 검증에 통과한 JSON이며, 그 경우에만 로드하여 목록을 표시한다. | L11: 공통 검증표: 단일 키 parcel\_data에 schemaVersion:1,nextSeq,items\[{id,seq,name,date,memo,received}\]이다. 로드와 전체 후보 모두 루트/필드 타입·고유 ID/seq·양의 안전 정수 seq·nextSeq &gt; max(seq)·비공백 name·실제 date·문자열 memo·불리언 received를 검증한다.<br>L16: 전체 변경 후보에 공통 검증표를 적용하고 직렬화한 뒤 setItem 성공 시에만 메모리/화면을 확정한다. 실패는 입력·목록·기존 저장값 보존이다. | L20: 공통 검증 확인: 저장 JSON의 received를 문자열 "받음"으로 바꾸거나 name을 공백으로 바꾸고 로드하면 원본 보존·무쓰기·변경 차단이다. 같은 잘못된 후보도 쓰기 전에 거부한다. | TEST/STUB fixed load/candidate/example roles. |

## 사용자 확인이 필요한 질문

- 기록된 질문 없음. 미해결 경고가 없다는 뜻은 아닙니다.

## Reviewer의 별도 제안

- 없음

## 같은 기획 버전에 기록된 중단/오류

- 기록된 오류 없음. 새 검증을 실행했다는 뜻은 아닙니다.
