import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildShadowContext,validateShadowProposal} from '../../dist/src/supervisor/triage-shadow.js';

const casesPath=fileURLToPath(new URL('../../docs/acceptance/triage-semantic-evaluation-20261110/cases.json',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const date='2026-11-10T00:00:00.000Z';
const scenario={
  'plant-invalid-input':{kind:'implementation_risk',severity:'critical'},
  'umbrella-choice':{kind:'omission',severity:'minor',question:true},
  'plant-reviewer-overreach':{kind:'scope_violation',severity:'major',disposition:'revise_plan'},
  'plant-explicit-sms-request':{kind:'scope_violation',severity:'major',disposition:'change_scope'},
  'umbrella-false-review':{kind:'unverifiable',severity:'major'},
  'plant-repeated-loss':{kind:'contradiction',severity:'critical',previous:true},
  'umbrella-limit':{kind:'omission',severity:'major',limit:true},
  'plant-unrelated-citation':{kind:'unverifiable',severity:'major'}
};
export function materializeCase(card) {
  const setting=scenario[card.id];assert.ok(setting,`Unknown case ${card.id}`);
  const projectId=`semantic-${card.id}`,scopeId=`${projectId}-scope`,planId=`${projectId}-plan`,version=setting.previous?2:1;
  const scope={id:scopeId,projectId,version:1,goal:card.topic,requiredFeatures:[{id:'R1',statement:card.approvedScope}],
    excludedFeatures:card.approvedScope.includes('문자 발송은 제외')?[{id:'EX-SMS',statement:'외부 문자 발송은 제외한다.'}]:[],
    technicalConstraints:[],createdAt:date};
  const content=card.id==='plant-unrelated-citation'?'식물 이름을 제목으로 표시한다.\n삭제 시 선택한 기록만 제거한다.':card.planExcerpt;
  const currentPlan={id:planId,projectId,version,scopeContractId:scopeId,scopeVersion:1,content,status:'ready_for_review',createdAt:date};
  const issue={id:`issue-${card.id}`,kind:setting.kind,severity:setting.severity,description:card.reviewFinding,
    suggestedDirection:"Review 지적의 근거와 승인 범위 안에서 해결 방향을 확인한다.",
    ...(setting.disposition?{scopeDisposition:setting.disposition,dispositionReason:setting.disposition==='change_scope'?'별도 사용자 요청이 기존 승인 범위 밖이다.':setting.disposition==='clarify'?'사용자 제품 선택이 비어 있다.':'Reviewer가 승인 범위 밖 기능을 요구했다.'}: {})};
  const review={id:`review-${card.id}-v${version}`,projectId,planId,planVersion:version,scopeContractId:scopeId,scopeVersion:1,
    outcome:setting.question?'needs_user_input':'revise',issues:[issue],suggestions:[],
    scopeViolation:setting.kind==='scope_violation',userJudgmentRequired:!!setting.question,reviewedAt:date};
  const previousReview=setting.previous?{...review,id:`review-${card.id}-v1`,planVersion:1}:undefined;
  const input={approvedScope:scope,currentPlan,review,iterationCount:setting.limit?1:setting.previous?2:1,maxIterations:setting.limit?1:setting.previous?3:2,
    ...(previousReview?{previousReview}:{})};
  const context=buildShadowContext(input,card.userRequest??undefined);
  const primaryRef=card.id==='plant-unrelated-citation'?'plan:L2':'plan:L1';
  assert.ok(Object.hasOwn(context.references,primaryRef));
  const refs=[`finding:review:${issue.id}`,primaryRef,'scope:requirement:R1'];
  if(card.userRequest)refs.push('user:request');
  const gold={caseId:card.id,status:'provisional_human_expected_answer',findingId:`review:${issue.id}`,expectedCategories:card.expectedCategories,
    forbiddenCategories:card.forbiddenCategories,requiredEvidence:card.requiredEvidence,exampleValidRefs:refs,
    expectedAction:card.expectedAction,criticalMiss:card.criticalMiss,policyBaselineType:context.baseline.type,
    note:'사람의 잠정 기대 결과. 모델 출력으로 작성하거나 수정하지 않았다.'};
  const example={schemaVersion:1,contextSha256:context.contextSha256,author:{kind:'manual_fixture',version:'semantic-card-v1'},
    findings:[{findingId:gold.findingId,category:gold.expectedCategories[0],rationale:'평가 카드의 잠정 기대 분류 예시',proposedAction:gold.expectedAction,evidenceRefs:refs}],summaryForUser:'평가 입력과 별도 보관하는 수동 정답 예시'};
  assert.equal(validateShadowProposal(context,example).status,'structurally_valid_for_manual_inspection',card.id);
  return {fixtureKind:'synthetic_offline_review_legacy_compatible',input,userRequest:card.userRequest,context,gold};
}
export async function materializeAll() {
  const source=await readFile(casesPath),cards=JSON.parse(source).cases;
  assert.equal(cards.length,8);assert.deepEqual(new Set(cards.map(c=>c.id)),new Set(Object.keys(scenario)));
  return {sourceCardsSha256:sha(source),cases:cards.map(materializeCase)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length,4,'Use --output NEW_DIRECTORY');assert.equal(process.argv[2],'--output');
  const out=resolve(process.argv[3]),data=await materializeAll();await mkdir(out);
  const hashes={};for(const entry of data.cases){
    const directory=join(out,entry.gold.caseId);await mkdir(directory);
    for(const [name,value] of Object.entries(entry)){
      if(name==='fixtureKind')continue;
      const bytes=JSON.stringify(value,null,2)+'\n',file=`${entry.gold.caseId}/${name}.json`;
      await writeFile(join(out,file),bytes,{flag:'wx'});hashes[file]=sha(bytes);
    }
  }
  const scorecard={schemaVersion:1,kind:'human_triage_scorecard_blank',status:'unscored',
    criteria:['classification','evidence_relevance','action_feasibility','user_explanation'],
    scoreRange:[0,2],errorFlags:['critical_miss','unnecessary_user_question','unsupported_scope_change','wrong_writer_rework','irrelevant_or_invented_reference','approval_bypass'],
    cases:data.cases.map(entry=>({caseId:entry.gold.caseId,contextSha256:entry.context.contextSha256,
      assessor:null,assessedAt:null,proposalSha256:null,scores:{classification:null,evidence_relevance:null,action_feasibility:null,user_explanation:null},
      errorFlags:[],rationale:null,uncertainty:null}))};
  const scoreBytes=JSON.stringify(scorecard,null,2)+'\n';await writeFile(join(out,'scorecard-blank.json'),scoreBytes,{flag:'wx'});hashes['scorecard-blank.json']=sha(scoreBytes);
  await writeFile(join(out,'manifest.json'),JSON.stringify({schemaVersion:1,kind:'triage_semantic_synthetic_fixture_manifest',sourceCardsSha256:data.sourceCardsSha256,
    fixtureKind:'synthetic_offline_review_legacy_compatible',caseCount:data.cases.length,files:hashes,newModelCalls:0,semanticAccuracy:null},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output:out,caseCount:data.cases.length,newModelCalls:0,semanticAccuracy:null}));
}
