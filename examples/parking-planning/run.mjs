// One bounded live planning run. The user's Scope v1 approval was given in the Codex conversation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,open,appendFile,access} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {fileHashes} from '../planning-comparison/lib.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const here=join(root,'examples/parking-planning');
const args=process.argv.slice(2);
assert.deepEqual(args,['--run-live'],'Only one explicit live planning run is supported: --run-live');
const project=process.env.GOOGLE_CLOUD_PROJECT;
assert.ok(project?.trim(),'Set GOOGLE_CLOUD_PROJECT before the live run');
const location=process.env.GOOGLE_CLOUD_LOCATION||'global';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async(file,value)=>{await mkdir(dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});};
const manifest=JSON.parse(await readFile(join(here,'input-manifest.json'),'utf8'));
const inputs={};
for(const [name,expected] of Object.entries(manifest.files)) {
  const bytes=await readFile(join(here,name));
  assert.equal(sha(bytes),expected,`Frozen input changed: ${name}`);
  inputs[name]=bytes;
}
const {loadLivePlanningConfig,parseScopeContract}=await import('../../dist/src/planning/config.js');
const {FilePlanningMemoryStore,PlanningLoopController,GeminiPlanningWriter,GeminiPlanningReviewer,createVertexAiClient}=await import('../../dist/src/planning/index.js');
const {buildUserReviewTable}=await import('../../dist/src/planning/user-review.js');
const {exportUserReviewBundle}=await import('../../dist/src/planning/review-export.js');
const prompts=await import('../../dist/src/planning/prompts.js');
const config=await loadLivePlanningConfig(join(here,'config.json'),root);
const scope=parseScopeContract(JSON.parse(inputs['scope-v1.json']),config.projectId);
const requirements=inputs['request.md'].toString('utf8');
const live=createVertexAiClient({project,location});
assert.equal(config.planning.maxIterations,2);
assert.equal(config.projectId,'parking-planning-trial');
assert.ok(requirements.trim());
const output=join(root,'parking-planning-result');
await assert.rejects(access(output),'An earlier result directory already exists; preserve it and use a fresh package');
const marker=join(root,'.adtf','parking-planning-started.json');
await mkdir(dirname(marker),{recursive:true});
const reservation=await open(marker,'wx');
await reservation.writeFile(JSON.stringify({startedAt:new Date().toISOString(),scopeId:scope.id,scopeVersion:scope.version,
  note:'One live run reserved. Do not retry from this directory.'},null,2)+'\n');
await reservation.close();
await mkdir(output,{recursive:false});
for(const [name,bytes] of Object.entries(inputs))await writeFile(join(output,name),bytes,{flag:'wx'});
await json(join(output,'input-manifest.json'),manifest);
await json(join(output,'run.json'),{kind:'parking_planning_live',startedAt:new Date().toISOString(),project,location,
  scopeApprovalSource:'User approved Scope v1 in the Codex conversation on 2026-11-10',
  maxSdkInvocations:6,automaticRetry:false,finalPlanApproval:false,productImplementation:false});
const runConfig={...config,memory:{...config.memory,directory:join(output,'memory')}};
const memory=new FilePlanningMemoryStore(runConfig.memory.directory);
let count=0;
const ledger=[];
const client={models:{generateContent:async request=>{
  assert.ok(count<6,'Six-request ceiling reached');
  assert.equal(request.config?.httpOptions?.retryOptions?.attempts,1,'SDK retries must be disabled');
  const id=`call-${String(++count).padStart(2,'0')}`;
  const stage=request.config.systemInstruction===prompts.WRITER_SYSTEM_INSTRUCTION?'writer':
    request.config.systemInstruction===prompts.REVIEW_CHALLENGE_SYSTEM_INSTRUCTION?'challenge':'assessment';
  const label={id,stage,startedAt:new Date().toISOString()};
  await json(join(output,'provider',`${id}.request.json`),{...label,request});
  console.log(JSON.stringify({event:'request_started',stage,request:count,maximum:6}));
  try {
    const response=await live.models.generateContent(request);
    const row={...label,status:'response_received',finishedAt:new Date().toISOString(),
      finishReasons:response.candidates?.map(c=>c.finishReason??'unknown')??[],usage:response.usageMetadata??null};
    await json(join(output,'provider',`${id}.response.json`),{...row,text:response.text??null,
      candidates:response.candidates??[],modelVersion:response.modelVersion??null,responseId:response.responseId??null,
      promptFeedback:response.promptFeedback??null});
    ledger.push(row);await appendFile(join(output,'usage.jsonl'),JSON.stringify(row)+'\n');
    return response;
  } catch(error) {
    const row={...label,status:'request_failed',finishedAt:new Date().toISOString(),errorClass:error?.constructor?.name??'unknown'};
    await json(join(output,'provider',`${id}.failure.json`),row);
    ledger.push(row);await appendFile(join(output,'usage.jsonl'),JSON.stringify(row)+'\n');
    throw error;
  }
}}};
let decision=null;
let failure=null;
try {
  await memory.createScopeContract(scope);
  const approval=await memory.request(scope.projectId,`Scope Contract ${scope.id} v${scope.version}`);
  await memory.recordDecision(approval.id,'approved','User approved this exact Scope v1 in the Codex conversation on 2026-11-10.');
  await memory.createScopeApprovalRecord({projectId:scope.projectId,scopeContractId:scope.id,approvalId:approval.id});
  const controller=new PlanningLoopController({config:runConfig,memory,writer:new GeminiPlanningWriter(client,memory),
    reviewer:new GeminiPlanningReviewer(client,memory),onLog:message=>console.log(message)});
  decision=(await controller.run({requirements,scopeContract:scope})).decision;
} catch(error) {
  failure=String(error?.message??error).slice(0,1000);
} finally {
  const state=await memory.getPlanningLoopState(scope.projectId);
  const errors=await memory.getPlanningErrors(scope.projectId);
  let exportCreated=false;
  try { if(state?.currentPlanVersion) {
    const plan=await memory.getPlanDraft(scope.projectId,`${scope.projectId}-plan`,state.currentPlanVersion);
    if(plan) {
      const review=await memory.getPlanReview(scope.projectId,plan.id,plan.version);
      const link=await memory.getScopeApprovalRecord(scope.projectId,scope.id);
      const scopeApproval=link?await memory.get(link.approvalId):undefined;
      const planApproval=state.status==='awaiting_approval'?await memory.get(state.approvalId):undefined;
      const table=buildUserReviewTable({scope,plan,...(state?{planning:state}:{}),...(review?{review}:{}),
        ...(scopeApproval?{scopeApproval}:{}),...(planApproval?{planApproval}:{}),errors});
      await exportUserReviewBundle(join(output,'review'),plan,table);
      exportCreated=true;
    }
  } } catch(error) {await json(join(output,'review-export-error.json'),{message:String(error?.message??error).slice(0,1000)});}
  await json(join(output,'summary.json'),{decision,status:state?.status??'before_planning',failure,
    sdkInvocations:count,maxSdkInvocations:6,ledger,exportCreated,finalPlanApproved:false,
    completedAt:new Date().toISOString()});
  await json(join(output,'artifact-manifest.json'),{sha256:await fileHashes(output)});
  const archive=`${output}.tar.gz`;
  const packed=spawnSync('tar',['-czf',archive,'-C',root,'parking-planning-result'],{encoding:'utf8'});
  assert.equal(packed.status,0,`Archive failed: ${packed.stderr||packed.error?.message}`);
  console.log(`RESULT_ARCHIVE=${archive}`);
  console.log(`RESULT_SHA256=${sha(await readFile(archive))}`);
  if(failure)process.exitCode=1;
}
