// Frozen-label before/after review evaluation. No real approval, Planning continuation, product or Worker writes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {createVertexAiClient,GeminiPlanningReviewer} from '../../dist/src/planning/google-genai.js';
import {decideAfterReview} from '../../dist/src/planning/policy.js';
const phase=process.argv[2];assert.ok(['regression','regression-fixed','holdout'].includes(phase));assert.equal(process.argv[3],'--run-live');
const split=phase==='regression-fixed'?'regression':phase;
const variants=phase==='regression-fixed'?['after']:['before','after'];
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const input=await readFile(new URL('./cases.json',import.meta.url));const data=JSON.parse(input);
const freeze=JSON.parse(await readFile(new URL('./freeze.json',import.meta.url),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');assert.equal(sha(input),freeze.datasetSha256);
for(const c of data.cases)assert.equal(sha(c.content),c.sha256);
const out=join(root,'docs/acceptance/reviewer-reliability-20261109',phase);await mkdir(out,{recursive:false});
await mkdir(join(out,'calls'));
const sourcePaths=['contracts.ts','google-genai.ts','policy.ts','prompts.ts','review-quality.ts','storage-audit.ts'];
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async name=>['src/planning/'+name,sha(await readFile(join(root,'src/planning',name)))])));
const protectedFiles=new Map();async function collect(dir,map){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await collect(p,map);else if(e.isFile())map.set(p,sha(await readFile(p)));}}
await collect(join(root,'.adtf'),protectedFiles);
const runtime=join(root,'dist/reviewer-reliability/baseline');await mkdir(runtime,{recursive:true});
for(const name of sourcePaths.filter(n=>n!=='storage-audit.ts')){
 const original=await readFile(new URL('./baseline/'+name+'.txt',import.meta.url),'utf8');
 assert.equal(sha(original),freeze.baselineSourceHashes[name+'.txt']);
 await writeFile(join(runtime,name.replace(/\.ts$/,'.js')),ts.transpileModule(original,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
}
const old=await import(pathToFileURL(join(runtime,'google-genai.js')).href);const oldPolicy=await import(pathToFileURL(join(runtime,'policy.js')).href);
const manifest={phase,split,label:'TEST/STUB evaluation only',startedAt:new Date().toISOString(),baselineCommit:freeze.baselineCommit,baselineSourceHashes:freeze.baselineSourceHashes,datasetSha256:freeze.datasetSha256,
 sourceHashes,runnerSha256:sha(await readFile(fileURLToPath(import.meta.url))),repetitions:freeze.repetitions[split],model:'gemini-3.8-flash',
 identity:'Neutral project/plan IDs, case labels and expected decisions are not sent to models.',maxCallsPerReview:2,
 holdoutRule:freeze.holdoutRule,primaryProjectWrites:false};
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const client=createVertexAiClient();const records=[];let n=0;
async function run(c,variant,repeat){
 const id=`${variant}-${c.id}-${repeat}`;const path=join(out,'calls',id+'.json');
 await writeFile(path,JSON.stringify({status:'started',id,startedAt:new Date().toISOString()})+'\n',{flag:'wx'});
 const usage=[];const responses=[];const memory={appendTokenUsage:async r=>{const{error:_error,...safe}=r;usage.push(safe);}};
 const wrapped={models:{generateContent:async request=>{const response=await client.models.generateContent(request);responses.push({text:response.text,finishReasons:response.candidates?.map(x=>x.finishReason)});return response;}}};
 const scope={...c.scope,projectId:'reviewer-reliability'};
 const plan={id:'reviewer-reliability-plan',projectId:scope.projectId,version:1,scopeContractId:scope.id,scopeVersion:scope.version,content:c.content,status:'ready_for_review',createdAt:'2026-11-09T00:00:00Z'};
 let result={id,caseId:c.id,split:c.split,expected:c.expected,repeat,variant,inputSha256:c.sha256};
 try{
  const Reviewer=variant==='before'?old.GeminiPlanningReviewer:GeminiPlanningReviewer;
  const review=await new Reviewer(wrapped,memory).review({projectId:scope.projectId,approvedScope:scope,currentPlan:plan,originalRequirements:c.request,settledDecisions:c.answers},
   {model:{providerId:'vertex-ai',modelId:'gemini-3.8-flash'},personaId:'planning-reviewer'});
  const decision=(variant==='before'?oldPolicy.decideAfterReview:decideAfterReview)({review,currentPlan:plan,approvedScope:scope,iterationCount:1,maxIterations:5});
  result={...result,status:'completed',review,decision};
 }catch{result={...result,status:'failed',error:'provider_or_protocol_failure'};}
 result={...result,usage,responses};await writeFile(path,JSON.stringify(result,null,2)+'\n');records.push(result);
 console.log(JSON.stringify({completed:++n,id,status:result.status,outcome:result.review?.outcome,decision:result.decision?.type,modelCalls:usage.length}));
}
const cases=data.cases.filter(c=>c.split===split);const jobs=[];
for(let i=1;i<=freeze.repetitions[split];i++)for(const c of cases)for(const v of i%2?variants:[...variants].reverse())jobs.push({c,v,i});
let next=0;await Promise.all(Array.from({length:3},async()=>{while(next<jobs.length){const j=jobs[next++];await run(j.c,j.v,j.i);}}));
const after=new Map();await collect(join(root,'.adtf'),after);assert.deepEqual(after,protectedFiles);
const summary={};for(const variant of variants){const rs=records.filter(r=>r.variant===variant);const bad=rs.filter(r=>r.expected==='block'),good=rs.filter(r=>r.expected==='adequate');
const valid=r=>r.status==='completed'&&r.decision.type!=='FAILED';summary[variant]={logicalReviews:rs.length,defectiveCandidates:bad.length,blockedDefective:bad.filter(r=>valid(r)&&r.decision.type!=='REQUEST_USER_APPROVAL').length,
 unsafeAdvanced:bad.filter(r=>valid(r)&&r.decision.type==='REQUEST_USER_APPROVAL').length,adequateCandidates:good.length,adequateAdvanced:good.filter(r=>valid(r)&&r.decision.type==='REQUEST_USER_APPROVAL').length,
 adequateBlocked:good.filter(r=>valid(r)&&r.decision.type!=='REQUEST_USER_APPROVAL').length,invalidOrFailed:rs.filter(r=>!valid(r)).length};}
const usage=records.flatMap(r=>r.usage.map(u=>({evaluationId:r.id,...u})));await writeFile(join(out,'usage.jsonl'),usage.map(r=>JSON.stringify(r)).join('\n')+'\n');
const final={phase,summary,requests:usage.length,providedTokens:Object.fromEntries(['inputTokens','outputTokens','reasoningTokens'].map(k=>[k,usage.reduce((s,r)=>s+(r[k]??0),0)])),durationMs:usage.reduce((s,r)=>s+r.durationMs,0),
 protectedProjectAndApprovalFilesUnchanged:true,completedAt:new Date().toISOString(),note:'Small pre-labeled synthetic evaluation; protocol failures are not defect detections. Holdout outcomes must not be used to retune this same run.'};
await writeFile(join(out,'summary.json'),JSON.stringify(final,null,2)+'\n');console.log(JSON.stringify(final));
