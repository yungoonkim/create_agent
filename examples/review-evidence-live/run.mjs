// Bounded, immutable acceptance run. No user approval, worker/product execution, or paid retry.
import assert from 'node:assert/strict';
import {readFile,mkdir,appendFile,open} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {sha,json,readJson,fileHashes,tariff} from '../planning-comparison/lib.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const [stage,...args]=process.argv.slice(2);
assert.ok(['generate','dry-run','pack','verify'].includes(stage),'Choose generate, dry-run, pack or verify');
const options={};
for(let i=0;i<args.length;i++) {
  const key=args[i];assert.ok(['--run-live','--bundle','--run-id'].includes(key)&&!(key in options),'Unknown/duplicate option');
  if(key==='--run-id')assert.ok(args[i+1]&&!args[i+1].startsWith('--'),'Missing --run-id value');
  options[key]=key==='--run-id'?args[++i]:true;
}
if(stage==='generate')assert.ok(options['--run-live'],'Paid generation requires --run-live');
else assert.ok(!options['--run-live'],'--run-live is only valid for generate');
if(['verify','pack'].includes(stage))assert.ok(options['--run-id'],'Use the existing --run-id for read-only stages');
const runId=options['--run-id']??`local-${Date.now()}-${randomUUID().slice(0,8)}`;
assert.match(runId,/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/,'Use a safe unique run ID');
const out=join(root,'docs/acceptance/review-evidence-live-20261109',runId);
const freeze=await readJson(join(here,'freeze.json'));
const cases=await readJson(join(here,'cases.json'));
const price=await readJson(join(root,'examples/planning-comparison/pricing.json'));
assert.equal(sha(await readFile(join(here,'cases.json'))),freeze.casesSha256,'Frozen cases changed');
assert.equal(sha(await readFile(join(root,'package-lock.json'))),freeze.packageLockSha256,'Dependency lock changed');
assert.equal(sha(await readFile(join(root,'examples/planning-comparison/pricing.json'))),freeze.pricingSha256,'Rate snapshot changed');
const ownHash=sha(await readFile(fileURLToPath(import.meta.url)));
assert.equal(ownHash,freeze.runnerSha256,'Acceptance runner changed after preregistration');
const primaryBefore=await fileHashes(join(root,'.adtf'));

async function verify() {
  const manifest=await readJson(join(out,'manifest.json'));
  assert.equal(manifest.runnerSha256,ownHash,'Acceptance runner changed after generation');
  assert.equal(manifest.freezeSha256,sha(await readFile(join(here,'freeze.json'))),'Frozen setup changed');
  const saved=await readJson(join(out,'artifact-manifest.json'));
  const actual=await fileHashes(out);delete actual['artifact-manifest.json'];
  assert.deepEqual(actual,saved.hashes,'Recorded acceptance artifacts changed');
  return {verified:true,mode:manifest.mode,files:Object.keys(actual).length,modelCallsDuringVerification:0};
}
async function pack() {
  await verify();
  const file=`${out}.tar.gz`;const reservation=await open(file,'wx');await reservation.close();
  const result=spawnSync('tar',['-czf',file,'-C',dirname(out),runId],{encoding:'utf8'});
  assert.equal(result.status,0,`Archive failed; original data remains: ${result.error?.message??result.stderr}`);
  await json(`${out}.archive.json`,{file:`${runId}.tar.gz`,sha256:sha(await readFile(file)),credentialsIncluded:false});
  console.log(`RESULT_ARCHIVE=${file}`);
}
async function saveHashes() {
  const hashes=await fileHashes(out);delete hashes['artifact-manifest.json'];
  await json(join(out,'artifact-manifest.json'),{recordedAt:new Date().toISOString(),hashes});
}
function stageOf(request,prompts) {
  return request.config.systemInstruction===prompts.WRITER_SYSTEM_INSTRUCTION?'writer':request.config.systemInstruction===prompts.REVIEW_CHALLENGE_SYSTEM_INSTRUCTION?'challenge':'assessment';
}
function cannedClient(scenario,prompts) {
  return {models:{generateContent:async request=>{
    const phase=stageOf(request,prompts);
    if(phase==='writer')return {text:scenario.referencePlanForDryRun,candidates:[{finishReason:'STOP'}]};
    const marker='DATA:\n\n';
    const data=phase==='assessment'?JSON.parse(request.contents.slice(request.contents.lastIndexOf(marker)+marker.length)):JSON.parse(request.contents);
    const bad=data.currentPlanLines.some(x=>x.text===scenario.seededExtraLine);
    const at=(...evidenceLines)=>({evidenceLines});
    const issues=bad?[{kind:'contradiction',severity:'major',description:'TEST/STUB: the seeded exception bypasses loaded received validation',suggestedDirection:'Remove the exception; apply the common rules to loaded and candidate values.',relatedRequirementId:'PARCEL-3',scopeDisposition:'not_applicable',dispositionReason:'TEST/STUB: repair within the same approved Scope.'}]:[];
    const located={
      'requirement:PARCEL-1':[2,3,4], 'requirement:PARCEL-2':[5,6,7], 'requirement:PARCEL-3':[8,9,10],
      'constraint:1':[18], 'constraint:2':[11,14,16,20], 'constraint:3':[12,13,15], 'constraint:4':[16,17], 'constraint:5':[18], 'constraint:6':[19],
    };
    const value=phase==='assessment'?{outcome:bad?'revise':'pass',issues,suggestions:[],scopeViolation:false,userJudgmentRequired:false,qualityAssessment:{version:1,
      requirements:scenario.scope.requiredFeatures.map((r,i)=>({requirementId:r.id,status:'satisfied',evidenceLines:[2+3*i,3+3*i,4+3*i],rationale:'TEST/STUB fixed evidence, not real quality.',behaviorEvidence:{normal:at(2+3*i),failure:at(3+3*i),acceptance:at(4+3*i),failureNotApplicableReason:''}})),
      checks:['decision_provenance','scope_compliance','behavior_and_errors','data_integrity','acceptance_criteria','revision_resolution','clarity'].map(id=>({id,status:bad&&id==='data_integrity'?'missing':'satisfied',evidenceLines:[bad?21:11],rationale:'TEST/STUB fixed check.'})),
    },...(data.revisionMode!=='same_scope'?{}:{revisionAudit:{
      preservation:Object.keys(data.preservationSources).map(sourceId=>({sourceId,status:sourceId==='constraint:2'?'corrected':'preserved',before:{evidenceLines:sourceId==='constraint:2'?[...located[sourceId],21]:located[sourceId]},after:{evidenceLines:located[sourceId]},rationale:'TEST/STUB source comparison; not a semantic certificate.'})),
      resolutions:Object.keys(data.previousIssueSources).map(issueId=>({issueId,status:'resolved',current:at(11,14,20),rationale:'TEST/STUB current rules and case.'})),
    }})}:{issues:[],questions:[],storageAudit:{format:'json',evidenceLines:[11],rationale:'TEST/STUB JSON design.',
      validation:{rationale:'TEST/STUB common validation evidence.',rules:[{rule:'루트/필드·이름·날짜·수령 상태·ID/seq',status:'supported',load:at(11,14),candidate:at(11,16),acceptance:at(20),rationale:'TEST/STUB fixed load/candidate/example roles.'}]},
      cases:['absent','present_empty','invalid','valid','read_error'].map(state=>{const line={absent:12,present_empty:13,invalid:13,valid:14,read_error:15}[state];
        return {state,action:state==='absent'?'initialize':state==='valid'?'load':'preserve_and_block',verdict:'consistent',trigger:at(line),evidenceLines:[line],authorizationScopeIds:[],rationale:'TEST/STUB declared action.'};}),
    }};
    return {text:JSON.stringify(value),candidates:[{finishReason:'STOP'}]};
  }}};
}

async function generate(mode) {
  assert.deepEqual(await fileHashes(join(root,'src')),freeze.productionSourceHashes,'Production code changed after preregistration');
  await mkdir(dirname(out),{recursive:true});
  if(mode==='live') {
    const reservation=join(dirname(out),`live-${sha(JSON.stringify(freeze)).slice(0,16)}.started.json`);
    try { await json(reservation,{runId,startedAt:new Date().toISOString(),noReplay:true}); }
    catch(error) { if(error.code==='EEXIST')throw new Error('A live run for this frozen trial already started. Preserve it; do not delete the reservation or replay paid calls.'); throw error; }
  }
  await mkdir(out);
  for(const dir of ['provider','cases','runtime','exports'])await mkdir(join(out,dir));
  const manifest={schemaVersion:1,runId,mode,startedAt:new Date().toISOString(),label:'TEST/STUB Scope approval fixtures only; actual model outputs are labeled by mode',
    runnerSha256:ownHash,freezeSha256:sha(await readFile(join(here,'freeze.json'))),sourceHashes:freeze.productionSourceHashes,
    primaryBefore,nodeVersion:process.version,platform:process.platform,project:freeze.project,location:freeze.location,model:freeze.model,maxModelCalls:freeze.maxModelCalls};
  await json(join(out,'manifest.json'),manifest);
  await json(join(out,'generation.started.json'),{startedAt:manifest.startedAt,noReplay:true});
  let invocationCount=0;let fatalAuthentication=false;const ledger=[];const results=[];
  try {
    const [{FilePlanningMemoryStore,PlanningLoopController,GeminiPlanningWriter,GeminiPlanningReviewer,createVertexAiClient},
      {buildUserReviewTable},{exportUserReviewBundle},prompts]=await Promise.all([
      import('../../dist/src/planning/index.js'),import('../../dist/src/planning/user-review.js'),import('../../dist/src/planning/review-export.js'),import('../../dist/src/planning/prompts.js')]);
    const liveClient=mode==='live'?createVertexAiClient({project:freeze.project,location:freeze.location}):null;
    for(const scenario of cases.cases) {
      const caseDir=join(out,'cases',scenario.id);await mkdir(caseDir);
      if(fatalAuthentication){const row={caseId:scenario.id,status:'skipped_after_authentication_failure'};await json(join(caseDir,'result.json'),row);results.push(row);continue;}
      const client=liveClient??cannedClient(scenario,prompts);
      const wrapped={models:{generateContent:async request=>{
        assert.ok(invocationCount<freeze.maxModelCalls,'Hard model-call budget exhausted; no retry');
        const callId=`call-${String(++invocationCount).padStart(3,'0')}`;const phase=stageOf(request,prompts);
        assert.equal(request.config.httpOptions?.retryOptions?.attempts,1,'Production SDK requests must use one attempt');
        const wire={...request,config:{...request.config,httpOptions:{...request.config.httpOptions,timeout:200000}}};
        const start=Date.now();const startedAt=new Date().toISOString();
        const label={callId,caseId:scenario.id,stage:phase,mode,startedAt};
        await json(join(out,'provider',`${callId}.started.json`),label);await json(join(out,'provider',`${callId}.request.json`),wire);
        console.log(JSON.stringify({case:scenario.title,request:invocationCount,maximum:freeze.maxModelCalls,stage:phase,event:'request_started'}));
        try {
          const response=await client.models.generateContent(wire);
          const row={...label,status:'response_received',durationMs:Date.now()-start,finishReasons:response.candidates?.map(c=>c.finishReason??'unknown')??[],
            usage:response.usageMetadata??null,modelVersion:response.modelVersion??null,responseId:response.responseId??null,
            tariff:mode==='live'?tariff(response.usageMetadata,price):null};
          await json(join(out,'provider',`${callId}.response.json`),{...row,text:response.text??null,
            rawModelResponse:{candidates:response.candidates??[],usageMetadata:response.usageMetadata??null,modelVersion:response.modelVersion??null,responseId:response.responseId??null,promptFeedback:response.promptFeedback??null}});
          ledger.push(row);await appendFile(join(out,'usage.jsonl'),JSON.stringify(row)+'\n');return response;
        } catch(error) {
          const message=String(error);const authentication=/invalid_grant|invalid_rapt|UNAUTHENTICATED|PERMISSION_DENIED|default credentials|application.default.credentials|credential.*(?:not found|missing|invalid)|reauth|\b401\b|\b403\b/i.test(message);
          fatalAuthentication ||= authentication;
          const row={...label,status:'request_failed',durationMs:Date.now()-start,reason:authentication?'authentication_or_permission':/429|RESOURCE_EXHAUSTED/.test(message)?'rate_limit':'provider_or_network_failure'};
          await json(join(out,'provider',`${callId}.failure.json`),row);ledger.push(row);await appendFile(join(out,'usage.jsonl'),JSON.stringify(row)+'\n');
          throw new Error(`Recorded ${row.reason}; no automatic replay.`);
        }
      }}};
      const projectId=`trial-${scenario.id}-${runId}`;
      const scope={...scenario.scope,projectId};const memory=new FilePlanningMemoryStore(join(out,'runtime',scenario.id));
      const approval={id:`${scenario.id}-fixture-approval`,projectId,subject:`Scope Contract ${scope.id} v1`,status:'approved',rationale:'DEMO FIXTURE: isolated acceptance input, not an actual user Scope approval.'};
      await memory.importDemoFixture(scope,{approval,scopeApproval:{projectId,scopeContractId:scope.id,approvalId:approval.id}});
      await json(join(caseDir,'input.json'),{scope,request:scenario.request,settledDecisions:scenario.settledDecisions,kind:scenario.kind,
        initialSource:scenario.kind==='seeded_validation_correction'?'deliberately faulty fixed draft, not model-generated':'live Writer (or canned Writer in dry mode)'});
      const role={model:{providerId:'vertex-ai',modelId:freeze.model},personaId:'planning'};
      const config={projectId,planning:{writer:role,reviewer:role,maxIterations:freeze.maxPlanningIterations,requireUserApproval:true},memory:{type:'file',directory:memory.rootDirectory}};
      const modelWriter=new GeminiPlanningWriter(wrapped,memory);let seeded=false;
      const writer={write:async(context,selected)=>{
        if(scenario.kind==='seeded_validation_correction'&&!seeded){seeded=true;return {id:`${projectId}-plan`,projectId,version:1,scopeContractId:scope.id,scopeVersion:1,
          content:scenario.referencePlanForDryRun+'\n'+scenario.seededExtraLine,status:'ready_for_review',createdAt:new Date().toISOString()};}
        return modelWriter.write(context,selected);
      }};
      let failure=null;let loop=null;
      try {loop=await new PlanningLoopController({config,memory,writer,reviewer:new GeminiPlanningReviewer(wrapped,memory)}).run({requirements:scenario.request,scopeContract:scope,clarificationDecisions:scenario.settledDecisions});}
      catch {failure='See immutable provider responses and runtime/errors; no paid retry.';}
      const state=await memory.getPlanningLoopState(projectId);const errors=await memory.getPlanningErrors(projectId);
      const plan=state?.currentPlanVersion?await memory.getPlanDraft(projectId,`${projectId}-plan`,state.currentPlanVersion):undefined;
      const review=plan?await memory.getPlanReview(projectId,plan.id,plan.version):undefined;
      let table=null;
      if(plan) {
        const pending=state&&'approvalId' in state?await memory.get(state.approvalId):undefined;
        table=buildUserReviewTable({scope,plan,...(state?{planning:state}:{}),...(review?{review}:{}),scopeApproval:approval,...(pending?{planApproval:pending}:{}),errors});
        await exportUserReviewBundle(join(out,'exports',scenario.id),plan,table);
      }
      assert.deepEqual(await memory.getScopeContract(projectId,1),scope,'Scope changed during acceptance');
      const row={caseId:scenario.id,title:scenario.title,status:state?.status??'failed_before_draft',failure,decision:loop?.decision??null,
        currentPlanVersion:state?.currentPlanVersion??null,iterationCount:state?.iterationCount??null,scopeVersionUnchanged:true,
        exportCreated:Boolean(table),rowStatuses:table?.rows.map(r=>({requirementId:r.requirementId,status:r.status}))??[],
        actualUserApprovalCreated:false,implementationVerified:false,
        revisionAuditMode:review?.revisionAudit?.mode??null,preservationRows:review?.revisionAudit?.preservation.length??0,previousIssueIds:review?.revisionAudit?.previousIssueIds??[],resolutionRows:review?.revisionAudit?.resolutions??[],commonValidationRuleCount:review?.storageAudit?.validation?.rules.length??0,
        factsOnlyNotQualityPass:true,manualChecks:scenario.checks};
      await json(join(caseDir,'result.json'),row);results.push(row);
      console.log(JSON.stringify({recordedCases:results.length,totalCases:cases.cases.length,case:scenario.title,status:row.status}));
    }
    assert.deepEqual(await fileHashes(join(root,'.adtf')),primaryBefore,'Primary .adtf changed during acceptance');
    assert.deepEqual(await fileHashes(join(root,'src')),freeze.productionSourceHashes,'Production changed during acceptance');
    const summary={schemaVersion:1,mode,runId,label:mode==='dry'?'TEST/STUB ONLY; not actual model quality':'Functional acceptance candidates, manual source/semantic audit still required',
      results,adapterInvocations:invocationCount,liveSdkInvocations:mode==='live'?invocationCount:0,maxModelCalls:freeze.maxModelCalls,
      incompleteCases:results.filter(r=>r.status!=='awaiting_approval'||r.failure).length,
      maxTokensResponses:ledger.filter(r=>r.finishReasons?.includes('MAX_TOKENS')).length,
      knownProvidedTokenTariffSubtotalUsd:mode==='live'?ledger.reduce((n,r)=>n+(r.tariff?.knownTokenTariffSubtotalUsd??0),0):null,
      responsesWithUsage:ledger.filter(r=>r.usage).length,requestsWithoutUsage:ledger.filter(r=>!r.usage).length,transportFailures:ledger.filter(r=>r.status==='request_failed').length,
      invoiceClaim:false,additionalJudgeCalls:0,primaryFilesUnchanged:true,manualAcceptance:'pending',completedAt:new Date().toISOString()};
    await json(join(out,'summary.json'),summary);
    await json(join(out,'generation.completed.json'),{completedAt:summary.completedAt,primaryFilesUnchanged:true,incompleteCases:summary.incompleteCases});
    if(summary.incompleteCases)process.exitCode=2;
  } catch(error) {
    await json(join(out,'generation.failed.json'),{reason:String(error.message).slice(0,600),noReplay:true});throw error;
  } finally {await saveHashes();}
}
try {
  if(stage==='generate'||stage==='dry-run'){await generate(stage==='generate'?'live':'dry');if(options['--bundle'])await pack();}
  else if(stage==='pack')await pack();else console.log(JSON.stringify(await verify()));
} catch(error){console.error(`Acceptance stopped: ${String(error.message).slice(0,600)}. Existing data was not replayed or overwritten.`);process.exitCode=1;}
