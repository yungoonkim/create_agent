// TEST/STUB new book-list scenario, not the completed comparison dataset or real Gemini evidence.
export const scope = {
  id: 'book-scope', projectId: 'book-review-demo', version: 1,
  goal: '혼자 읽을 책을 기록하는 작은 도구의 기획을 확인한다.',
  requiredFeatures: [
    {id: 'BOOK-1', statement: '제목을 적어 책을 추가한다. 빈 제목은 거부하고 같은 제목도 별개 책으로 둔다.'},
    {id: 'BOOK-2', statement: '선택한 책 한 권만 읽음으로 표시하고 취소할 수 있다. 확인 후 한 권만 삭제한다.'},
    {id: 'BOOK-3', statement: '다시 열어도 목록을 보존한다. 저장소 읽기/쓰기 실패 시 기존 기록과 입력을 보존하고 변경을 차단한다.'},
  ],
  excludedFeatures: [{id: 'BOOK-X', statement: '로그인·공유·자동 추천·실제 제품 구현·팀원 실행은 하지 않는다.'}],
  technicalConstraints: ['TEST/STUB. 사용자 승인이 아닌 격리 fixture다. 고정 localhost와 같은 브라우저 프로필에서 JSON 한 키에 저장한다.'],
  createdAt: '2026-11-09T00:00:00.000Z',
};
export const content = [
  '# 내 독서 목록 기획',
  'BOOK-1: 제목을 입력하고 추가를 누르면 고유 ID를 가진 한 권이 목록 끝에 추가된다. 같은 제목도 별도 항목이다.',
  '제목의 앞뒤 공백을 제거한 뒤 빈 값이면 “제목을 적어 주세요”를 표시하고 입력·목록·저장값을 유지한다.',
  '확인 사례: “ 어린 왕자 ”를 두 번 추가하면 “어린 왕자” 두 권이 보인다. 공백 제목 추가는 목록 수를 바꾸지 않는다.',
  'BOOK-2: 고유 ID로 선택한 한 권의 읽음/미읽음만 바꾸고 삭제 전에는 “정말 삭제할까요?”로 확인한다.',
  '삭제 확인 취소는 아무 저장도 하지 않는다. 쓰기 실패 시 읽음 상태나 삭제 결과를 화면에 미리 반영하지 않는다.',
  '확인 사례: 같은 제목 두 권 중 첫 권만 읽음으로 바꾼다. 첫 권의 삭제를 취소하면 두 권이 모두 남는다.',
  'BOOK-3: 같은 http://localhost:4173와 브라우저 프로필에서 books 한 키에 schemaVersion:1과 items 배열을 저장한다.',
  '로드/쓰기 후보의 루트·필드 타입·비공백 제목·불리언 읽음 값·고유 ID를 검증한다. null만 최초 실행이며 빈/손상 JSON은 원본을 보존하고 변경을 차단한다.',
  'localStorage.getItem 자체가 SecurityError 예외를 던지면 “저장소를 읽을 수 없습니다” 안내, 원본 보존, 모든 변경 차단을 수행한다.',
  '후보 검증·JSON 직렬화 → setItem 성공 → 메모리/화면 확정 순서다. 쓰기 실패는 입력·목록·기존 저장값을 유지한다.',
  '저장 후 UI 갱신만 실패하면 저장 취소라고 안내하지 않고 새로고침을 요청한다. 전원 장애까지 영구 보장하지 않는다.',
  '확인 사례: 세 권 등록 뒤 다시 열면 세 권이 보인다. getItem에 SecurityError를 주입하면 저장 시도 없이 변경이 차단된다. setItem 실패를 주입하면 작성한 제목·기존 목록이 유지된다.',
  '동시에 한 탭만 Web Locks 배타 잠금을 편집 수명 동안 유지한다. 획득 후 최신 로드, 비소유/미지원 차단, 소유 탭 종료 후 새로고침한다.',
  '로그인·공유·추천 기능은 제외한다. 이 문서는 구현이나 실제 사용자 승인을 주장하지 않는다.',
  '공통 검증 확인 사례: 저장 JSON의 제목을 공백으로 바꾸거나 읽음 값을 문자열로 바꾸고 로드하면 원본을 유지하고 변경을 차단한다. 같은 잘못된 후보도 쓰기 전에 거부한다.',
].join('\n');
const at = n => ({evidenceLines: [n]});
export const assessment = {
  outcome: 'pass', issues: [], suggestions: [], scopeViolation: false, userJudgmentRequired: false,
  qualityAssessment: {version: 1,
    requirements: [[2,3,4],[5,6,7],[8,10,13]].map(([normal,failure,acceptance],i) => ({
      requirementId: `BOOK-${i+1}`, status: 'satisfied', evidenceLines: [normal, failure, acceptance],
      rationale: 'TEST/STUB: 정상·실패·확인 사례의 지정 원문을 대조했다. 실제 구현 시험은 아니다.',
      behaviorEvidence: {normal: at(normal), failure: at(failure), acceptance: at(acceptance), failureNotApplicableReason: ''},
    })),
    checks: ['decision_provenance','scope_compliance','behavior_and_errors','data_integrity','acceptance_criteria','revision_resolution','clarity']
      .map(id => ({id,status:'satisfied',evidenceLines:[2,10,13],rationale:'TEST/STUB: 지정된 문서 근거, 의미상 정답/실행 보증 아님.'})),
  },
};
export const challenge = {issues: [],questions: [],storageAudit: {
  format: 'json',evidenceLines:[8,9],rationale:'TEST/STUB: 로컬 JSON 저장.',
  validation: {rationale:'TEST/STUB: 공통 로드/후보 검증 선언과 확인 사례.',rules:[{
    rule:'루트/필드 타입·제목·읽음 값·ID',status:'supported',load:at(9),candidate:at(9),acceptance:at(16),rationale:'TEST/STUB: 의미상 품질 인증 아님.',
  }]},
  cases: ['absent','present_empty','invalid','valid','read_error'].map(state => ({
    state,action: state==='absent'?'initialize':state==='valid'?'load':'preserve_and_block',verdict:'consistent',
    trigger: at(state==='read_error'?10:9),evidenceLines:[state==='read_error'?10:9],authorizationScopeIds:[],rationale:'TEST/STUB: 지정 원문에 선언된 동작.',
  })),
}};
