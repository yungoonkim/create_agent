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
    ...(setting.disposition?{scopeDisposition:setting.disposition,dispositionReason:'기획·Scope·별도 사용자 요청을 원문으로 대조해야 한다.'}: {})};
  const review={id:`review-${card.id}-v${version}`,projectId,planId,planVersion:version,scopeContractId:scopeId,scopeVersion:1,
    outcome:setting.question?'needs_user_input':'revise',issues:[issue],suggestions:[],
    scopeViolation:setting.kind==='scope_violation',userJudgmentRequired:!!setting.question,reviewedAt:date};
  const previousReview=setting.previous?{...review,id:`review-${card.id}-v1`,planVersion:1,
    issues:[{...issue,description:'수정 내용을 먼저 덮어쓴 뒤 검증하므로 실패하면 이전 물주기 기록을 잃는다.'}]}:undefined;
  const previousPlan=setting.previous?{...currentPlan,version:1,content:'수정 내용을 기존 기록에 덮어쓴다.\n그 뒤 입력 날짜를 검사한다. 검사 실패 시 오류를 표시한다.'}:undefined;
  const input={approvedScope:scope,currentPlan,review,iterationCount:setting.limit?1:setting.previous?2:1,maxIterations:setting.limit?1:setting.previous?3:2,
    ...(previousReview?{previousReview}:{}),...(previousPlan?{previousPlan}:{})};
  const context=buildShadowContext(input,card.userRequest??undefined);
  const primaryRef=card.id==='plant-unrelated-citation'?'plan:L2':'plan:L1';
  assert.ok(Object.hasOwn(context.references,primaryRef));
  const refs=[`finding:review:${issue.id}`,primaryRef,'scope:requirement:R1'];
  if(card.userRequest)refs.push('user:request');
  if(setting.previous)refs.push('previous-plan:L1',`previous-review:issue:${issue.id}`);
  if(setting.limit)refs.push('iteration:state');
  if(card.id==='plant-unrelated-citation')refs.push('plan:L1');
  const gold={caseId:card.id,status:'provisional_agent_authored_expected_answer',independentHumanReview:'pending',findingId:`review:${issue.id}`,expectedCategories:card.expectedCategories,
    forbiddenCategories:card.forbiddenCategories,requiredEvidence:card.requiredEvidence,exampleValidRefs:refs,
    expectedAction:card.expectedAction,criticalMiss:card.criticalMiss,policyBaselineType:context.baseline.type,
    note:'Codex가 사례 작성과 자료 점검 과정에서 제안한 기대 답이다. 실제 피평가 모델 응답은 없으며 독립 사람 검수는 아직 없다.'};
  const example={schemaVersion:1,contextSha256:context.contextSha256,author:{kind:'manual_fixture',version:'semantic-card-v2'},
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
      errorFlags:null,rationale:null,uncertainty:null}))};
  const scoreBytes=JSON.stringify(scorecard,null,2)+'\n';await writeFile(join(out,'scorecard-blank.json'),scoreBytes,{flag:'wx'});hashes['scorecard-blank.json']=sha(scoreBytes);
  await writeFile(join(out,'manifest.json'),JSON.stringify({schemaVersion:1,kind:'triage_semantic_synthetic_fixture_manifest',sourceCardsSha256:data.sourceCardsSha256,
    fixtureKind:'synthetic_offline_review_legacy_compatible',generatorVersion:2,caseCount:data.cases.length,files:hashes,newModelCalls:0,independentHumanReviews:0,semanticAccuracy:null},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output:out,caseCount:data.cases.length,newModelCalls:0,semanticAccuracy:null}));
}
