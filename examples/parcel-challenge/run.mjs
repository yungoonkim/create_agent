import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {safeProviderFailure} from '../reviewer-diagnostic/run.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
// Original diagnostic applied this transport timeout; prompts/model/schema remain unchanged.
const withTimeout=request=>({...request,config:{...request.config,httpOptions:{...request.config.httpOptions,timeout:200000}}});
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function loadInputs(){
  const source=JSON.parse(await readFile(join(here,'source.json'),'utf8'));
  const data={};for(const [name,digest] of Object.entries(source.files)){
    const bytes=await readFile(join(here,name));assert.equal(hash(bytes),digest,'Recorded input changed');data[name]=JSON.parse(bytes);
  }
  return {source,context:data['context.json'],assessment:data['response.json'],request:data['request.json']};
}
export async function reserveLiveSlot(base){
  const f=await open(join(base,'parcel-v2-challenge.started.json'),'wx');
  try{await f.writeFile(JSON.stringify({startedAt:new Date().toISOString(),newRequestCap:1,priorAttempts:5}));}finally{await f.close();}
}
export async function completeChallenge({directory,inputs,api,mode}){
  const [{FilePlanningMemoryStore,GeminiPlanningReviewer,decideAfterReview,buildUserReviewTable,exportUserReviewBundle},prompts]=await Promise.all([
    import('../../dist/src/planning/index.js'),import('../../dist/src/planning/prompts.js')]);
  await mkdir(directory);
  const save=(name,value)=>writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  const {context:c,source,assessment}=inputs,scope=c.approvedScope,plan=c.currentPlan;
  await save('source.json',source);await save('reused-assessment.json',{...assessment,reused:true,excludedFromNewUsage:true});
  const memory=new FilePlanningMemoryStore(join(directory,'runtime'));
  const fixture={id:'parcel-fixture',projectId:c.projectId,subject:`Scope Contract ${scope.id} v${scope.version}`,status:'approved',rationale:'DEMO FIXTURE: isolated completion of recorded trial; not actual user Scope approval.'};
  await memory.importDemoFixture(scope,{approval:fixture,scopeApproval:{projectId:c.projectId,scopeContractId:scope.id,approvalId:fixture.id}});
  await memory.createPlanDraft(c.previousPlan);await memory.createPlanReview(c.previousReviews[0]);await memory.createPlanDraft(plan);
  let reused=0,newAttempts=0;let stage='reused_assessment';let newUsage=null;
  const wrapped={models:{generateContent:async request=>{
    if(request.config.systemInstruction===prompts.REVIEWER_SYSTEM_INSTRUCTION){
      assert.equal(reused,0,'Assessment may be reused once');
      const wire=withTimeout(request);
      assert.deepEqual(wire,inputs.request,'Generated assessment differs from recorded request');reused++;
      // Do not repeat historical input/output/thinking tokens in the new usage ledger.
      return {text:assessment.text,candidates:assessment.candidates};
    }
    assert.equal(request.config.systemInstruction,prompts.REVIEW_CHALLENGE_SYSTEM_INSTRUCTION);
    assert.equal(reused,1);assert.equal(newAttempts,0,'Only one new challenge request is permitted');
    assert.equal(request.config.httpOptions.retryOptions.attempts,1);stage='challenge';
    const wire=withTimeout(request);
    await save('challenge-request.json',wire);newAttempts++;
    const response=await api.models.generateContent(wire);newUsage=response.usageMetadata??null;
    await save('challenge-response.json',{text:response.text??null,candidates:response.candidates??[],usageMetadata:newUsage,modelVersion:response.modelVersion??null});
    return response;
  }}};
  let summary,formalSaved=false,challengeCompleted=false;
  try{
    const review=await new GeminiPlanningReviewer(wrapped,memory).review(c,source.role);
    challengeCompleted=review.challengeCompleted===true;
    stage='formal_review_save';await memory.createPlanReview(review);formalSaved=true;
    const decision=decideAfterReview({review,currentPlan:plan,approvedScope:scope,previousReview:c.previousReviews[0],iterationCount:2,maxIterations:2});
    const base={projectId:c.projectId,scopeContractId:scope.id,scopeVersion:scope.version,iterationCount:2,maxIterations:2,currentPlanVersion:2};
    let pending;
    const state=decision.type==='REQUEST_USER_APPROVAL'?(pending=await memory.request(c.projectId,`Approve plan ${plan.id} v2`),{...base,status:'awaiting_approval',reviewId:review.id,approvalId:pending.id})
      :decision.type==='REQUEST_USER_INPUT'?{...base,status:'awaiting_user_input',reviewId:review.id,reason:decision.questions.join('\n')||'See recorded decision'}
      :{...base,status:decision.type==='STOP_LIMIT_REACHED'?'limit_reached':'stopped',reason:decision.reason??`Operator action required: ${decision.type}`};
    await memory.savePlanningLoopState(state);await save('decision.json',decision);
    await exportUserReviewBundle(join(directory,'export'),plan,buildUserReviewTable({scope,plan,review,planning:state,scopeApproval:fixture,...(pending?{planApproval:pending}:{})}));
    summary={mode,outcome:'review_recorded_in_isolated_copy',decision:decision.type,planningStatus:state.status,challengeCompleted:review.challengeCompleted===true,formalReviewSaved:true,finalApprovalCreated:false,pendingApprovalCreated:Boolean(pending)};
  }catch(error){
    await save('failure.json',{stage,...safeProviderFailure(error)});
    summary={mode,outcome:'failed',stage,challengeCompleted,formalReviewSaved:formalSaved,finalApprovalCreated:false};
  }
  summary={...summary,reusedAssessmentCount:reused,reusedAssessmentBilledAgain:false,newSdkAttempts:mode==='live'?newAttempts:0,stubAttempts:mode==='dry'?newAttempts:0,newUsage:mode==='live'?newUsage:null,priorAttempts:5,cumulativeTrialAttempts:5+(mode==='live'?newAttempts:0),originalProjectChanged:false};
  await save('summary.json',summary);return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);assert.ok(args.every(a=>['--run-live','--dry-run','--bundle'].includes(a))&&new Set(args).size===args.length);
  assert.ok(args.includes('--run-live')!==args.includes('--dry-run'),'Choose explicit --run-live (one additional paid request) or --dry-run');
  const mode=args.includes('--run-live')?'live':'dry',inputs=await loadInputs();
  const base=join(root,'challenge-results');await mkdir(base,{recursive:true});
  if(mode==='live')await reserveLiveSlot(base);
  const api={models:{generateContent:async request=>{
    if(mode==='dry')return {text:JSON.stringify({issues:[],questions:[],storageAudit:{format:'unclear',evidenceLines:[],rationale:'TEST/STUB transport only: no real semantic storage review was performed; retain a blocking finding.',cases:[],validation:{rationale:'TEST/STUB only',rules:[]}}}),candidates:[{finishReason:'STOP'}]};
    const {GoogleGenAI}=await import('@google/genai');return new GoogleGenAI({vertexai:true,project:'iceu-songpa11',location:'global'}).models.generateContent(request);
  }}};
  const directory=join(base,`challenge-${Date.now()}-${randomUUID().slice(0,8)}`),result=await completeChallenge({directory,inputs,api,mode});console.log(JSON.stringify(result));
  if(args.includes('--bundle')){const archive=directory+'.tar.gz';const tar=spawnSync('tar',['-czf',archive,'-C',dirname(directory),directory.split(/[\\/]/).at(-1)],{encoding:'utf8'});assert.equal(tar.status,0,'Archive failed; preserve original folder');console.log(`RESULT_ARCHIVE=${archive}`);}
  if(result.outcome==='failed'||!result.challengeCompleted)process.exitCode=2;
}
