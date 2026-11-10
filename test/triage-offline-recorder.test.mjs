import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,lstat,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {materializeAll} from '../examples/supervisor-triage-semantic/materialize.mjs';
import {prepare,record} from '../examples/supervisor-triage-semantic/offline-recorder.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const writeJson=async(path,value)=>{const bytes=JSON.stringify(value,null,2)+'\n';await writeFile(path,bytes);return bytes;};
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'adtf-triage-recorder-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=join(root,'source-v2');await mkdir(source);const {cases}=await materializeAll(),files={};
  for(const entry of cases){const folder=join(source,entry.gold.caseId);await mkdir(folder);
    for(const field of ['context','gold']){const name=`${entry.gold.caseId}/${field}.json`,bytes=await writeJson(join(folder,`${field}.json`),entry[field]);files[name]=sha(bytes);}}
  await writeJson(join(source,'manifest.json'),{schemaVersion:1,kind:'triage_semantic_synthetic_fixture_manifest',generatorVersion:2,caseCount:cases.length,files});
  const caseId=cases[0].gold.caseId,workspace=join(root,'workspace');
  await prepare({sourceDir:source,outputDir:workspace,caseId});return {root,source,workspace,caseId};
}
async function proposalFor(workspace,caseId){
  const input=JSON.parse(await readFile(join(workspace,'model-inputs',`${caseId}.json`),'utf8'));
  return {schemaVersion:1,contextSha256:input.context.contextSha256,author:{kind:'offline_recorded_response',version:'human-paste-1'},
    findings:input.context.findings.map(f=>({findingId:f.id,category:f.technicalBlocker?'ESCALATE_OR_STOP':'REVIEWER_RECHECK',rationale:'Manual test response.',proposedAction:'Hold for human inspection.',
      evidenceRefs:[`finding:${f.id}`,Object.keys(input.context.references).find(r=>r.startsWith('plan:')||r.startsWith('scope:'))]})),summaryForUser:'Manual offline test response.'};
}
async function putResponse(root,proposal){const file=join(root,'response.json');const bytes=await writeJson(file,proposal);return {file,bytes};}

test('prepare excludes provisional gold and scorecard while retaining source Policy baseline',async t=>{
  const f=await fixture(t),input=JSON.parse(await readFile(join(f.workspace,'model-inputs',`${f.caseId}.json`),'utf8'));
  const privateRef=JSON.parse(await readFile(join(f.workspace,'private-reference',`${f.caseId}.json`),'utf8'));
  assert.equal(input.source.baseCommit,'2426ebc70e7406de1da359d332a284052c5b453e');assert.equal(input.source.inputVersion,2);
  assert.equal(input.context.baseline.type,privateRef.gold.policyBaselineType);
  assert.ok(input.context.references['policy:baseline']);
  assert.ok(!JSON.stringify(input).includes('expectedCategories'));
  assert.ok(!JSON.stringify(input).includes('criticalMiss'));
  assert.equal(privateRef.gold.independentHumanReview,'pending');
  assert.equal(JSON.parse(await readFile(join(f.workspace,'manifest.json'),'utf8')).modelCalls,0);
});

test('records proposal, baseline, raw-response SHA and manual metadata distinctly',async t=>{
  const f=await fixture(t),proposal=await proposalFor(f.workspace,f.caseId),{file,bytes}=await putResponse(f.root,proposal),metadataFile=join(f.root,'metadata.json');
  await writeJson(metadataFile,{inputTokens:123,cost:0.02});
  const saved=await record({workspaceDir:f.workspace,caseId:f.caseId,responseFile:file,metadataFile});
  const result=JSON.parse(await readFile(join(saved.recordDir,'result.json'),'utf8'));
  const input=JSON.parse(await readFile(join(f.workspace,'model-inputs',`${f.caseId}.json`),'utf8'));
  const proposalSaved=JSON.parse(await readFile(join(saved.recordDir,'proposal.json'),'utf8'));
  const baselineSaved=JSON.parse(await readFile(join(saved.recordDir,'policy-baseline.json'),'utf8'));
  const artifactManifest=JSON.parse(await readFile(join(saved.recordDir,'manifest.json'),'utf8'));
  assert.equal(result.structuralValidation.status,'structurally_valid_for_manual_inspection');assert.equal(result.structuralValidation.semanticCorrectness,'not_evaluated');
  assert.equal(result.responseSha256,sha(bytes));assert.equal(await readFile(join(saved.recordDir,'response.raw.json'),'utf8'),bytes);
  assert.equal(result.proposalSha256,sha(Buffer.from(JSON.stringify(proposal,null,2)+'\n')));assert.deepEqual(proposalSaved,proposal);
  assert.equal(result.policyBaselineSha256,sha(Buffer.from(JSON.stringify(input.context.baseline,null,2)+'\n')));assert.deepEqual(baselineSaved,input.context.baseline);
  for(const [name,digest] of Object.entries(artifactManifest.files))assert.equal(digest,sha(await readFile(join(saved.recordDir,name))));
  assert.deepEqual(result.metadata,{source:'user_supplied_unverified',inputTokens:123,outputTokens:null,cost:0.02,elapsedMs:null});
  assert.equal(result.modelCalls,0);assert.equal(result.apiCall,'none');assert.equal(result.automaticRetry,false);assert.equal(result.approvalCreated,false);
  const second=await record({workspaceDir:f.workspace,caseId:f.caseId,responseFile:file});
  assert.notEqual(saved.recordDir,second.recordDir);assert.equal((await readdir(join(f.workspace,'results',f.caseId))).length,2);
  const secondResult=JSON.parse(await readFile(join(second.recordDir,'result.json'),'utf8'));
  assert.deepEqual(secondResult.metadata,{source:'not_measured',inputTokens:null,outputTokens:null,cost:null,elapsedMs:null});
});

test('rejects changed source files, unsafe manifest paths and pre-existing output without modifying it',async t=>{
  const f=await fixture(t),gold=join(f.source,f.caseId,'gold.json');
  const original=await readFile(gold);await writeFile(gold,Buffer.from(original).map((v,i)=>i===0?v^1:v));
  const output=join(f.root,'must-not-exist');await assert.rejects(prepare({sourceDir:f.source,outputDir:output,caseId:f.caseId}),/Source hash mismatch/);
  await assert.rejects(lstat(output));await writeFile(gold,original);
  const manifestPath=join(f.source,'manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  manifest.files['../outside.json']='0'.repeat(64);await writeJson(manifestPath,manifest);
  await assert.rejects(prepare({sourceDir:f.source,outputDir:output,caseId:f.caseId}),/Unsafe source manifest path/);
  const existing=join(f.root,'existing');await mkdir(existing);await writeFile(join(existing,'keep.txt'),'preserve');
  await assert.rejects(prepare({sourceDir:f.source,outputDir:existing,caseId:f.caseId}));
  assert.equal(await readFile(join(existing,'keep.txt'),'utf8'),'preserve');
});

test('rejects response source mismatch and malformed references before creating any result',async t=>{
  const f=await fixture(t),proposal=await proposalFor(f.workspace,f.caseId),badFile=join(f.root,'bad.json');
  const {file:goodFile}=await putResponse(f.root,proposal),saved=await record({workspaceDir:f.workspace,caseId:f.caseId,responseFile:goodFile});
  const priorBytes=await readFile(join(saved.recordDir,'result.json'));
  proposal.contextSha256='0'.repeat(64);await writeJson(badFile,proposal);
  await assert.rejects(record({workspaceDir:f.workspace,caseId:f.caseId,responseFile:badFile}),/rejected/);
  proposal.contextSha256=JSON.parse(await readFile(join(f.workspace,'model-inputs',`${f.caseId}.json`),'utf8')).context.contextSha256;
  proposal.findings[0].evidenceRefs=['plan:L999'];await writeJson(badFile,proposal);
  await assert.rejects(record({workspaceDir:f.workspace,caseId:f.caseId,responseFile:badFile}),/rejected/);
  assert.deepEqual(await readFile(join(saved.recordDir,'result.json')),priorBytes);
  assert.deepEqual(await readdir(join(f.workspace,'results',f.caseId)),[saved.recordId]);
});

test('detects tampered prepared input and rejects workspace symlink escape',async t=>{
  const f=await fixture(t),inputPath=join(f.workspace,'model-inputs',`${f.caseId}.json`),original=await readFile(inputPath);
  await writeFile(inputPath,Buffer.concat([original,Buffer.from(' ')]));
  const response=join(f.root,'response.json');await writeFile(response,'{}');
  await assert.rejects(record({workspaceDir:f.workspace,caseId:f.caseId,responseFile:response}),/Model input digest mismatch/);
  await writeFile(inputPath,original);
  const outside=join(f.root,'outside');await mkdir(outside);await symlink(outside,join(f.workspace,'results'));
  const valid=await proposalFor(f.workspace,f.caseId),{file}=await putResponse(f.root,valid);
  await assert.rejects(record({workspaceDir:f.workspace,caseId:f.caseId,responseFile:file}),/real directory/);
  assert.deepEqual(await readdir(outside),[]);
});

test('has no provider SDK, auth, fetch, or other network execution path',async()=>{
  const source=await readFile(new URL('../examples/supervisor-triage-semantic/offline-recorder.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/@google\/genai|google-auth-library|application_default_credentials|\bfetch\s*\(|https?:\/\//);
});
