// Review an existing unapproved Writer sample with the final protocol; no fresh Writer call or primary writes.
import assert from 'node:assert/strict';
import{readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{createVertexAiClient,GeminiPlanningReviewer}from'../../dist/src/planning/google-genai.js';
import{decideAfterReview}from'../../dist/src/planning/policy.js';
assert.equal(process.argv[2],'--run-live');
const root='docs/acceptance/planning-quality-bounded-20261108';
const output=root+'/writer-sample-final-review.json';
await writeFile(output,JSON.stringify({status:'started',startedAt:new Date().toISOString()})+'\n',{flag:'wx'});
const ds=JSON.parse(await readFile('examples/planning-quality-eval/cases.json','utf8'));
const original=JSON.parse(await readFile('docs/acceptance/planning-quality-challenge-20261108/calls/write-enhanced-fresh-writer-sample-1.json','utf8'));
const plan=original.plan; const usage=[];const responses=[];
const client=createVertexAiClient();
const wrapped={models:{generateContent:async input=>{const r=await client.models.generateContent(input);responses.push({text:r.text,finishReasons:r.candidates?.map(x=>x.finishReason)});return r;}}};
const memory={appendTokenUsage:async value=>{const{error:_error,...record}=value;usage.push(record);}};
let result;
try{
const review=await new GeminiPlanningReviewer(wrapped,memory).review({projectId:ds.sourceScope.projectId,currentPlan:plan,approvedScope:ds.sourceScope,
 originalRequirements:ds.originalRequirements,settledDecisions:ds.settledDecisions},
 {model:{providerId:'vertex-ai',modelId:'gemini-3.8-flash'},personaId:'planning-reviewer'});
const decision=decideAfterReview({review,currentPlan:plan,approvedScope:ds.sourceScope,iterationCount:1,maxIterations:5});
result={status:'completed',review,decision};
}catch{result={status:'failed',error:'model_call_or_protocol_validation_failed'};}
result={...result,label:'unlabeled generated Writer sample, excluded from fixed-case rates; not user-approved',
 source:'../planning-quality-challenge-20261108/calls/write-enhanced-fresh-writer-sample-1.json',
 planSha256:createHash('sha256').update(plan.content).digest('hex'),usage,rawModelResponses:responses};
await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,decision:result.decision?.type,modelCalls:usage.length}));
