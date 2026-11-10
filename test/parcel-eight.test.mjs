import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadInputs,completeChallenge} from '../examples/parcel-challenge/run.mjs';
import {loadPinnedEightCandidate,transformPinnedEightChallenge,reserveEight} from '../examples/parcel-challenge/run-eight.mjs';
import {challengePromptEight} from '../examples/parcel-challenge/prompt-candidate-eight.mjs';

test('eight-line prompt candidate only changes the pinned system instruction',async()=>{
 const previous=JSON.parse(await readFile('examples/parcel-challenge/prompt-candidate-request.json','utf8'));
 const candidate=await loadPinnedEightCandidate();assert.equal(candidate.config.systemInstruction,challengePromptEight);
 assert.deepEqual({...candidate,config:{...candidate.config,systemInstruction:previous.config.systemInstruction}},previous);
 assert.match(challengePromptEight,/at most 8 distinct line numbers/);
});
test('one new challenge reuses assessment and counts the new ninth related attempt separately',async t=>{
 const base=await mkdtemp(join(tmpdir(),'parcel-eight-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const pinned=await loadPinnedEightCandidate();let calls=0;
 const summary=await completeChallenge({directory:join(base,'run'),inputs:await loadInputs(),mode:'live',priorAttempts:8,
  transformChallengeRequest:wire=>transformPinnedEightChallenge(wire,pinned),api:{models:{generateContent:async request=>{
   calls++;assert.deepEqual(request,pinned);return {text:JSON.stringify({issues:[],questions:[],storageAudit:{format:'unclear',evidenceLines:[],rationale:'TEST/STUB blocking',cases:[],validation:{rationale:'TEST/STUB',rules:[]}}}),candidates:[{finishReason:'STOP'}]};
  }}}});
 assert.equal(calls,1);assert.equal(summary.reusedAssessmentCount,1);assert.equal(summary.newSdkAttempts,1);
 assert.equal(summary.cumulativeTrialAttempts,9);assert.equal(summary.decision,'STOP_LIMIT_REACHED');assert.equal(summary.finalApprovalCreated,false);
});
test('tampered candidate cannot call model and reservation cannot be reused',async t=>{
 const base=await mkdtemp(join(tmpdir(),'parcel-eight-'));t.after(()=>rm(base,{recursive:true,force:true}));
 await reserveEight(base);await assert.rejects(reserveEight(base),{code:'EEXIST'});
 const pinned=await loadPinnedEightCandidate();pinned.model='different';let calls=0;
 const summary=await completeChallenge({directory:join(base,'run'),inputs:await loadInputs(),mode:'live',priorAttempts:8,
  transformChallengeRequest:wire=>transformPinnedEightChallenge(wire,pinned),api:{models:{generateContent:async()=>{calls++;}}}});
 assert.equal(calls,0);assert.equal(summary.newSdkAttempts,0);assert.equal(summary.formalReviewSaved,false);
});
