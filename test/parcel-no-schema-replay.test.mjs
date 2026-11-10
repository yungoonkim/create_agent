import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadInputs,completeChallenge} from '../examples/parcel-challenge/run.mjs';
import {challengePromptCandidate} from '../examples/parcel-challenge/prompt-candidate.mjs';

const evidence='docs/acceptance/parcel-no-schema-20261110/challenge-response.json';
test('recorded STOP response with missing required fields remains a failed review offline',async t=>{
 const base=await mkdtemp(join(tmpdir(),'parcel-replay-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const response=JSON.parse(await readFile(evidence,'utf8')),raw=JSON.parse(response.text);
 assert.ok(!('questions' in raw));assert.ok('userQuestions' in raw);
 assert.equal(raw.storageAudit.cases.length,5);
 assert.ok(raw.storageAudit.cases.every(row=>!('state' in row)&&!('verdict' in row)));
 let calls=0;const summary=await completeChallenge({directory:join(base,'run'),inputs:await loadInputs(),mode:'dry',
   api:{models:{generateContent:async()=>{calls++;return response;}}}});
 assert.equal(calls,1);assert.equal(summary.outcome,'failed');assert.equal(summary.stage,'challenge');
 assert.equal(summary.challengeCompleted,false);assert.equal(summary.formalReviewSaved,false);assert.equal(summary.finalApprovalCreated,false);
 assert.ok(challengePromptCandidate.includes('never userQuestions'));
 assert.ok(challengePromptCandidate.includes('Do not drop state or verdict'));
});

test('prompt candidate keeps the pinned transport request and changes only system instruction',async()=>{
 const old=JSON.parse(await readFile('examples/parcel-challenge/candidate-no-schema.json','utf8'));
 const candidate=JSON.parse(await readFile('docs/acceptance/parcel-no-schema-20261110/prompt-candidate-request.json','utf8'));
 assert.equal(candidate.config.systemInstruction,challengePromptCandidate);
 assert.deepEqual({...candidate,config:{...candidate.config,systemInstruction:old.config.systemInstruction}},old);
});
