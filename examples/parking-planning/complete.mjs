import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {fileHashes} from '../planning-comparison/lib.mjs';
import {safeProviderFailure} from '../reviewer-diagnostic/run.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function loadRecoveryInput(){
  const bytes=await readFile(join(here,'recovery-input.json'));
  assert.equal(sha(bytes),(await readFile(join(here,'recovery-input.sha256'),'utf8')).trim(),'Recovery input changed');
  return JSON.parse(bytes);
}
export async function reserveRecovery(directory){
  await mkdir(directory,{recursive:true});
  const f=await open(join(directory,'started.json'),'wx');
  try{await f.writeFile(JSON.stringify({newSdkCap:1,priorSdkInvocations:3,originalCap:6}));}finally{await f.close();}
}
export async function completeParkingChallenge({directory,inputs,api}){
  const core=await import('../../dist/src/planning/index.js');
  const prompts=await import('../../dist/src/planning/prompts.js');
  await mkdir(directory,{recursive:false});
  const save=(n,v)=>writeFile(join(directory,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
  await save('input.json',inputs);
  const c=inputs.context,scope=c.approvedScope,plan=c.currentPlan;
  const memory=new core.FilePlanningMemoryStore(join(directory,'memory'));
  await memory.createScopeContract(scope);
  const pendingScope=await memory.request(c.projectId,`Scope Contract ${scope.id} v${scope.version}`);
  const scopeApproval=await memory.recordDecision(pendingScope.id,'approved','Scope v1 approved in Codex chat on 2026-11-10; source archive is preserved in input.json. Not final plan approval.');
  await memory.createScopeApprovalRecord({projectId:c.projectId,scopeContractId:scope.id,approvalId:scopeApproval.id});
  await memory.createPlanDraft(plan);
  let reused=0,calls=0,result,decision=null,failure=null,usage=null;
  const client={models:{generateContent:async request=>{
    if(request.config.systemInstruction===prompts.REVIEWER_SYSTEM_INSTRUCTION){
      assert.equal(reused,0);assert.deepEqual(request,inputs.assessmentRequest,'Assessment source drifted');reused++;
      return {text:inputs.assessmentResponse.text,candidates:inputs.assessmentResponse.candidates};
    }
    assert.equal(reused,1);assert.equal(calls,0,'Only one new request is permitted');
    const expected=structuredClone(inputs.rejectedChallenge);
    delete expected.config.responseJsonSchema;
    expected.config.systemInstruction=prompts.REVIEW_CHALLENGE_JSON_SYSTEM_INSTRUCTION;
    assert.deepEqual(request,expected,'Challenge changed beyond the approved transport fix');
    assert.equal(request.config.httpOptions.retryOptions.attempts,1);
    await save('challenge-request.json',request);calls++;
    console.log(JSON.stringify({event:'challenge_request_started',newRequest:1,maximum:1,priorRequests:3}));
    const response=await api.models.generateContent(request);usage=response.usageMetadata??null;
    await save('challenge-response.json',{text:response.text??null,candidates:response.candidates??[],usageMetadata:usage});
    return response;
  }}};
  try{
    result=await new core.GeminiPlanningReviewer(client,memory).review(c,
      {model:{providerId:'vertex-ai',modelId:inputs.assessmentRequest.model},personaId:'planning-reviewer'});
    await memory.createPlanReview(result);
    decision=core.decideAfterReview({review:result,currentPlan:plan,approvedScope:scope,iterationCount:1,maxIterations:2});
    await save('decision.json',decision);
    const base={projectId:c.projectId,scopeContractId:scope.id,scopeVersion:scope.version,iterationCount:1,maxIterations:2,currentPlanVersion:1};
    const pending=decision.type==='REQUEST_USER_APPROVAL'?await memory.request(c.projectId,`Approve plan ${plan.id} v1`):undefined;
    const state=pending?{...base,status:'awaiting_approval',reviewId:result.id,approvalId:pending.id}:
      { ...base,status:'stopped',reason:`Explicit follow-up required: ${decision.type}. No Writer call or final approval was made.`};
    await memory.savePlanningLoopState(state);
    await core.exportUserReviewBundle(join(directory,'review'),plan,core.buildUserReviewTable({scope,plan,review:result,planning:state,
      scopeApproval,...(pending?{planApproval:pending}:{})}));
  }catch(error){failure=safeProviderFailure(error);await save('failure.json',failure);}
  const summary={outcome:failure?'failed':'review_recorded',failure,decision:decision?.type??null,
    reusedAssessmentCount:reused,reusedAssessmentBilledAgain:false,newSdkAttempts:calls,priorSdkAttempts:3,
    cumulativeSdkAttempts:3+calls,originalCap:6,newUsage:usage,challengeCompleted:result?.challengeCompleted===true,
    finalPlanApproved:false,writerCalled:false,originalFilesChanged:false};
  await save('summary.json',summary);await save('artifact-manifest.json',{sha256:await fileHashes(directory)});
  return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.deepEqual(process.argv.slice(2),['--run-live'],'Use --run-live for exactly one new paid challenge request');
  assert.ok(process.env.GOOGLE_CLOUD_PROJECT?.trim(),'Set GOOGLE_CLOUD_PROJECT');
  const inputs=await loadRecoveryInput();
  const base=join(root,'parking-review-recovery');await reserveRecovery(base);
  const {createVertexAiClient}=await import('../../dist/src/planning/index.js');
  const result=await completeParkingChallenge({directory:join(base,'result'),inputs,api:createVertexAiClient()});
  console.log(JSON.stringify(result));
  const archive=join(root,'parking-review-recovery.tar.gz');
  const packed=spawnSync('tar',['-czf',archive,'-C',root,'parking-review-recovery'],{encoding:'utf8'});
  assert.equal(packed.status,0,'Archive failed; retain the result directory');
  console.log(`RESULT_ARCHIVE=${archive}`);console.log(`RESULT_SHA256=${sha(await readFile(archive))}`);
  if(result.outcome==='failed')process.exitCode=1;
}
