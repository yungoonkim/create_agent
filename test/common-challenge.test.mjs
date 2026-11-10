import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GeminiPlanningReviewer,FilePlanningMemoryStore} from '../dist/src/planning/index.js';
import {REVIEW_CHALLENGE_JSON_SYSTEM_INSTRUCTION} from '../dist/src/planning/prompts.js';
import {loadInputs} from '../examples/parcel-challenge/run.mjs';
import {loadRecoveryInput,completeParkingChallenge,reserveRecovery} from '../examples/parking-planning/complete.mjs';

test('common Reviewer replays actual successful parcel challenge in JSON mode and rejects excess citations',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'common-challenge-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const input=await loadInputs();
 const response=JSON.parse(await readFile('docs/acceptance/parcel-eight-20261110/challenge-response.json','utf8'));
 for(const malformed of [false,true]){
  let calls=0;
  const raw=JSON.parse(response.text);
  if(malformed)raw.storageAudit.cases.find(r=>r.state==='valid').trigger.evidenceLines=[1,2,3,4,5,6,7,8,9];
  const api={models:{generateContent:async request=>{
   if(++calls===1)return {text:input.assessment.text};
   assert.equal(request.config.responseJsonSchema,undefined);
   assert.equal(request.config.responseMimeType,'application/json');
   assert.equal(request.config.systemInstruction,REVIEW_CHALLENGE_JSON_SYSTEM_INSTRUCTION);
   assert.match(request.config.systemInstruction,/at most 8 distinct/);
   assert.equal(request.config.httpOptions.retryOptions.attempts,1);
   return {text:JSON.stringify(raw),candidates:[{finishReason:'STOP'}]};
  }}};
  const pending=new GeminiPlanningReviewer(api,new FilePlanningMemoryStore(join(dir,String(malformed)))).review(input.context,input.source.role);
  if(malformed)await assert.rejects(pending,/Invalid evidence line references/);
  else assert.equal((await pending).challengeCompleted,true);
  assert.equal(calls,2);
 }
});
test('parking continuation reuses exact assessment, calls only challenge once and preserves failed output',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'parking-recovery-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const inputs=await loadRecoveryInput();let calls=0;
 const result=await completeParkingChallenge({directory:join(dir,'result'),inputs,api:{models:{generateContent:async request=>{
  calls++;assert.equal(request.config.responseJsonSchema,undefined);
  return {text:'{"issues":[],"questions":[]}',candidates:[{finishReason:'STOP'}]};
 }}}});
 assert.equal(calls,1);assert.equal(result.newSdkAttempts,1);assert.equal(result.cumulativeSdkAttempts,4);
 assert.equal(result.reusedAssessmentCount,1);assert.equal(result.outcome,'failed');
 assert.equal(result.finalPlanApproved,false);assert.equal(result.writerCalled,false);
 assert.match(await readFile(join(dir,'result/challenge-response.json'),'utf8'),/questions/);
 await reserveRecovery(join(dir,'reserved'));await assert.rejects(reserveRecovery(join(dir,'reserved')),{code:'EEXIST'});
});

test('parking completed blocking challenge records a Review without Writer or final approval',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'parking-block-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const result=await completeParkingChallenge({directory:join(dir,'result'),inputs:await loadRecoveryInput(),api:{models:{generateContent:async()=>({
  text:JSON.stringify({issues:[],questions:[],storageAudit:{format:'unclear',evidenceLines:[],rationale:'TEST/STUB blocking ambiguity',cases:[],validation:{rationale:'TEST/STUB',rules:[]}}}),candidates:[{finishReason:'STOP'}]
 })}}});
 assert.equal(result.outcome,'review_recorded');assert.equal(result.challengeCompleted,true);
 assert.equal(result.decision,'REVISE');assert.equal(result.writerCalled,false);assert.equal(result.finalPlanApproved,false);
 assert.equal(result.cumulativeSdkAttempts,4);
});
