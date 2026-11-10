import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadInputs,completeChallenge} from '../examples/parcel-challenge/run.mjs';
import {loadPinnedPromptCandidate,transformPinnedPromptChallenge,reservePrompt} from '../examples/parcel-challenge/run-prompt.mjs';

test('prompt candidate sends only one pinned challenge and does not bill reused assessment',async t=>{
 const base=await mkdtemp(join(tmpdir(),'parcel-prompt-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const pinned=await loadPinnedPromptCandidate();let calls=0;
 const summary=await completeChallenge({directory:join(base,'run'),inputs:await loadInputs(),mode:'live',priorAttempts:7,
  transformChallengeRequest:wire=>transformPinnedPromptChallenge(wire,pinned),api:{models:{generateContent:async request=>{
   calls++;assert.deepEqual(request,pinned);return {text:JSON.stringify({issues:[],questions:[],storageAudit:{format:'unclear',evidenceLines:[],rationale:'TEST/STUB blocking',cases:[],validation:{rationale:'TEST/STUB',rules:[]}}}),candidates:[{finishReason:'STOP'}]};
  }}}});
 assert.equal(calls,1);assert.equal(summary.reusedAssessmentCount,1);assert.equal(summary.newSdkAttempts,1);
 assert.equal(summary.cumulativeTrialAttempts,8);assert.equal(summary.decision,'STOP_LIMIT_REACHED');assert.equal(summary.finalApprovalCreated,false);
 assert.deepEqual(JSON.parse(await readFile(join(base,'run','challenge-request.json'),'utf8')),pinned);
});
test('prompt mismatch prevents a new call and live reservation is single use',async t=>{
 const base=await mkdtemp(join(tmpdir(),'parcel-prompt-'));t.after(()=>rm(base,{recursive:true,force:true}));
 await reservePrompt(base);await assert.rejects(reservePrompt(base),{code:'EEXIST'});
 const pinned=await loadPinnedPromptCandidate();pinned.model='different';let calls=0;
 const summary=await completeChallenge({directory:join(base,'run'),inputs:await loadInputs(),mode:'live',priorAttempts:7,
  transformChallengeRequest:wire=>transformPinnedPromptChallenge(wire,pinned),api:{models:{generateContent:async()=>{calls++;}}}});
 assert.equal(calls,0);assert.equal(summary.newSdkAttempts,0);assert.equal(summary.formalReviewSaved,false);
});
