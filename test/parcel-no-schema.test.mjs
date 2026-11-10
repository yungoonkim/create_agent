import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadInputs,completeChallenge} from '../examples/parcel-challenge/run.mjs';
import {loadPinnedCandidate,transformPinnedChallenge,reserveNoSchema} from '../examples/parcel-challenge/run-no-schema.mjs';

test('one isolated no-schema request reuses old assessment and counts only the new attempt',async t=>{
 const base=await mkdtemp(join(tmpdir(),'parcel-no-schema-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const pinned=await loadPinnedCandidate();let calls=0;
 const summary=await completeChallenge({directory:join(base,'run'),inputs:await loadInputs(),mode:'live',priorAttempts:6,
  transformChallengeRequest:wire=>transformPinnedChallenge(wire,pinned),api:{models:{generateContent:async request=>{
   calls++;assert.deepEqual(request,pinned);return {text:JSON.stringify({issues:[],questions:[],storageAudit:{format:'unclear',evidenceLines:[],rationale:'TEST/STUB blocking',cases:[],validation:{rationale:'TEST/STUB',rules:[]}}}),candidates:[{finishReason:'STOP'}]};
  }}}});
 assert.equal(calls,1);assert.equal(summary.reusedAssessmentCount,1);assert.equal(summary.newSdkAttempts,1);
 assert.equal(summary.cumulativeTrialAttempts,7);assert.equal(summary.decision,'STOP_LIMIT_REACHED');assert.equal(summary.finalApprovalCreated,false);
 assert.deepEqual(JSON.parse(await readFile(join(base,'run','challenge-request.json'),'utf8')),pinned);
});
test('candidate mismatch stops before API and separate live reservation is single use',async t=>{
 const base=await mkdtemp(join(tmpdir(),'parcel-no-schema-'));t.after(()=>rm(base,{recursive:true,force:true}));
 await reserveNoSchema(base);await assert.rejects(reserveNoSchema(base),{code:'EEXIST'});
 const pinned=await loadPinnedCandidate();pinned.model='different';let calls=0;
 const summary=await completeChallenge({directory:join(base,'run'),inputs:await loadInputs(),mode:'live',priorAttempts:6,
  transformChallengeRequest:wire=>transformPinnedChallenge(wire,pinned),api:{models:{generateContent:async()=>{calls++;}}}});
 assert.equal(calls,0);assert.equal(summary.formalReviewSaved,false);assert.equal(summary.newSdkAttempts,0);
});
