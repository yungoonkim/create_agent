import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {materializeAll} from './materialize.mjs';
import {buildShadowContext} from '../../dist/src/supervisor/triage-shadow.js';

export const POLICY_COMMIT='19aeed3f8e7966df88fbc5c8e9af2dfbce63ede0';
const sha=b=>createHash('sha256').update(b).digest('hex');
const approved={
  'umbrella-choice':{question:'같은 이름의 우산을 새로 입력하면 별도 항목으로 저장할까요, 기존 항목의 위치를 갱신할까요?'},
  'plant-repeated-loss':{plan:'수정 화면에서 입력한 날짜를 기존 기록에 먼저 덮어씁니다.\n그다음 날짜 형식을 검사합니다.\n검사에 실패하면 오류를 표시하고 기존 기록을 유지합니다.',review:'날짜를 검사하기 전에 기존 기록을 덮어쓰고 있습니다. 검사 실패 시 기존 값을 복원하는 절차가 제시되지 않아 이전 기록이 손실될 수 있습니다.'},
  'umbrella-limit':{plan:'사용자가 우산 위치를 수정하면 입력한 위치값으로 기존 위치를 갱신한다.',review:'위치 수정 시 입력값이 유효하지 않은 경우 기존 기록을 어떻게 처리할지 설명이 필요하다.'},
  'plant-unrelated-citation':{plan:'식물 이름을 제목으로 표시한다.\n삭제 시 선택한 기록만 제거한다.',review:'삭제 시 다른 기록도 보존된다는 근거로 식물 이름을 제목으로 표시하는 문장을 인용합니다.'}
};
export async function materializeV3(){
  const old=await materializeAll();
  return {sourceCardsSha256:old.sourceCardsSha256,cases:old.cases.map(entry=>{
    const id=entry.gold.caseId,change=approved[id],input=structuredClone(entry.input);
    if(change?.plan)input.currentPlan.content=change.plan;
    if(change?.review)input.review.issues[0].description=change.review;
    if(change?.question)input.review.suggestions=[change.question];
    const context=buildShadowContext(input,entry.userRequest??undefined);
    const {findingId:unusedFindingId,exampleValidRefs:unusedRefs,...priorGold}=entry.gold;
    const gold={...priorGold,inputVersion:3,policyBaselineType:context.baseline.type,
      provisionalFindings:context.findings.map(f=>({findingId:f.id,provisionalCategory:f.origin==='suggestion'?'USER_CLARIFICATION':entry.gold.expectedCategories[0],
        exampleEvidenceRefs:[`finding:${f.id}`,id==='plant-unrelated-citation'?'plan:L2':'plan:L1',
          ...(id==='plant-unrelated-citation'?['plan:L1']:[]),
          ...(id==='plant-repeated-loss'?['previous-plan:L1',`previous-review:issue:${input.review.issues[0].id}`]:[]),
          ...(id==='umbrella-limit'?['iteration:state']:[])]})),
      independentHumanReview:'pending',status:'provisional_agent_authored_expected_answer',
      note:'v3 입력의 잠정 분류 예시. 사용자 선택의 답과 의미상 정답은 확정되지 않았으며 독립 사람 검수가 필요하다.'};
    assert.equal(context.findings.length,id==='umbrella-choice'?2:1);
    return {fixtureKind:'synthetic_v3_pending_human_review',input,userRequest:entry.userRequest,context,gold};
  })};
}
export async function writeV3(output){
  const out=resolve(output),data=await materializeV3();await mkdir(out);
  const files={};
  for(const entry of data.cases){const id=entry.gold.caseId;await mkdir(join(out,id));
    for(const field of ['input','userRequest','context','gold']){const name=`${id}/${field}.json`,bytes=JSON.stringify(entry[field],null,2)+'\n';await writeFile(join(out,name),bytes,{flag:'wx'});files[name]=sha(bytes);}}
  const scorecard={schemaVersion:1,inputVersion:3,status:'unscored_pending_human_review',cases:data.cases.map(e=>({caseId:e.gold.caseId,contextSha256:e.context.contextSha256,score:null}))};
  const scoreBytes=JSON.stringify(scorecard,null,2)+'\n';await writeFile(join(out,'scorecard-blank.json'),scoreBytes,{flag:'wx'});files['scorecard-blank.json']=sha(scoreBytes);
  await writeFile(join(out,'manifest.json'),JSON.stringify({schemaVersion:1,kind:'triage_semantic_synthetic_fixture_manifest',generatorVersion:3,policyCommit:POLICY_COMMIT,sourceCardsSha256:data.sourceCardsSha256,files,caseCount:8,independentHumanReviews:0,modelCalls:0},null,2)+'\n',{flag:'wx'});
  return {output:out,caseCount:8,modelCalls:0};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  assert.equal(process.argv[2],'--output');assert.equal(process.argv.length,4);
  console.log(JSON.stringify(await writeV3(process.argv[3])));
}
