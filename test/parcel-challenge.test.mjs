import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadInputs,completeChallenge,reserveLiveSlot} from '../examples/parcel-challenge/run.mjs';

// Explicit TEST/STUB: checks transport, citation binding and controller branches, not model quality.
function response({blocked=false,finishReason='STOP'}={}){
  const evidence=n=>({evidenceLines:n,rationale:'TEST/STUB source-bound evidence'});
  const storageAudit=blocked?{format:'unclear',...evidence([]),cases:[],validation:{rationale:'TEST/STUB blocking case',rules:[]}}
    :{format:'json',...evidence([57,86]),cases:[
      ['absent','initialize',[73],[73]],['present_empty','preserve_and_block',[75,76],[75]],
      ['invalid','preserve_and_block',[75,76],[75]],['valid','load',[43,58,70],[58,70]],
      ['read_error','preserve_and_block',[45,50],[45]],
    ].map(([state,action,lines,trigger])=>({state,action,verdict:'consistent',...evidence(lines),authorizationScopeIds:[],trigger:evidence(trigger)})),
    validation:{rationale:'TEST/STUB one illustrative rule; not a complete semantic review',rules:[{
      rule:'received boolean',status:'supported',load:evidence([58,70]),candidate:evidence([70,85]),acceptance:evidence([78]),rationale:'TEST/STUB',
    }]}};
  return {text:JSON.stringify({issues:[],questions:[],storageAudit}),candidates:[{finishReason}],usageMetadata:{promptTokenCount:17,candidatesTokenCount:9}};
}
async function run(t,{mutate,reply=response(),error}={}){
  const base=await mkdtemp(join(tmpdir(),'parcel-challenge-'));t.after(()=>rm(base,{recursive:true,force:true}));
  const inputs=await loadInputs(),before=JSON.stringify(inputs);mutate?.(inputs);let calls=0,request;
  const directory=join(base,'output');
  const summary=await completeChallenge({directory,inputs,mode:'live',api:{models:{generateContent:async r=>{
    calls++;request=r;if(error)throw error;return reply;
  }}}});
  if(!mutate)assert.equal(JSON.stringify(inputs),before,'Recorded inputs must stay immutable');
  return {summary,calls,request,directory};
}
test('one challenge reuses pinned assessment without double-counting usage; isolated approval stays pending',async t=>{
  const {summary:s,calls,request,directory}=await run(t);
  assert.equal(calls,1);assert.equal(s.reusedAssessmentCount,1);assert.equal(s.reusedAssessmentBilledAgain,false);
  assert.equal(s.formalReviewSaved,true);assert.equal(s.challengeCompleted,true);assert.equal(s.pendingApprovalCreated,true);
  assert.equal(s.finalApprovalCreated,false);assert.equal(s.originalProjectChanged,false);assert.equal(s.cumulativeTrialAttempts,6);
  assert.equal(request.config.httpOptions.retryOptions.attempts,1);assert.equal(request.config.httpOptions.timeout,200000);
  assert.deepEqual(s.newUsage,{promptTokenCount:17,candidatesTokenCount:9});
  assert.equal(s.decision,'REQUEST_USER_APPROVAL');
  assert.match(await readFile(join(directory,'export','review.md'),'utf8'),/TEST\/STUB/);
});
test('assessment mismatch prevents any new request and formal review',async t=>{
  const {summary:s,calls}=await run(t,{mutate:i=>{i.request.model='different';}});
  assert.equal(calls,0);assert.equal(s.formalReviewSaved,false);assert.equal(s.stage,'reused_assessment');
});
test('challenge HTTP failure and incomplete output preserve failure without retries or approval',async t=>{
  for(const option of [{error:Object.assign(new Error('secret must not leak'),{status:400})},{reply:response({finishReason:'MAX_TOKENS'})}]){
    const {summary:s,calls,directory}=await run(t,option);
    assert.equal(calls,1);assert.equal(s.formalReviewSaved,false);assert.equal(s.finalApprovalCreated,false);
    assert.ok(!s.pendingApprovalCreated);assert.equal(s.outcome,'failed');
    assert.ok(!(await readFile(join(directory,'failure.json'),'utf8')).includes('secret must not leak'));
  }
});
test('a completed challenge with a blocking finding cannot enter approval or restart Writer',async t=>{
  const {summary:s,calls}=await run(t,{reply:response({blocked:true})});
  assert.equal(calls,1);assert.equal(s.formalReviewSaved,true);assert.equal(s.challengeCompleted,true);
  assert.equal(s.decision,'STOP_LIMIT_REACHED');assert.equal(s.pendingApprovalCreated,false);assert.equal(s.finalApprovalCreated,false);
});

test('single live reservation refuses a second start without deleting prior evidence',async t=>{
  const base=await mkdtemp(join(tmpdir(),'parcel-slot-'));t.after(()=>rm(base,{recursive:true,force:true}));
  await reserveLiveSlot(base);
  const file=join(base,'parcel-v2-challenge.started.json'),before=await readFile(file,'utf8');
  await assert.rejects(reserveLiveSlot(base),{code:'EEXIST'});
  assert.equal(await readFile(file,'utf8'),before);
});
