import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rm,lstat,realpath} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildShadowContext,validateShadowProposal} from '../../dist/src/supervisor/triage-shadow.js';
import {POLICY_COMMIT} from './materialize-v3.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
const inside=(root,p)=>{const r=relative(root,p);return r!==''&&r!=='..'&&!r.startsWith(`..${sep}`)&&!isAbsolute(r);};
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
async function directory(p){const s=await lstat(p);assert.ok(s.isDirectory()&&!s.isSymbolicLink(),'Directory must not be a symlink.');return realpath(p);}
async function file(root,name){const p=resolve(root,name);assert.ok(inside(root,p),'Unsafe path.');const s=await lstat(p);assert.ok(s.isFile()&&!s.isSymbolicLink(),'File must be regular.');const real=await realpath(p);assert.ok(inside(root,real),'File escaped root.');return real;}
async function save(root,name,value){await writeFile(resolve(root,name),bytes(value),{flag:'wx'});}
function mapInput(original){
  const token=randomBytes(16).toString('hex'),input=structuredClone(original),forward={},reverse={};
  function id(kind,old){if(old===undefined)return old;const key=`${kind}:${old}`;if(forward[key])return forward[key];
    const value=`${kind}-${token}-${Object.keys(forward).filter(k=>k.startsWith(`${kind}:`)).length+1}`;
    assert.ok(!reverse[value],'ID collision.');forward[key]=value;reverse[value]=old;return value;}
  const scope=input.approvedScope,plan=input.currentPlan,review=input.review;
  scope.projectId=id('project',scope.projectId);scope.id=id('scope',scope.id);
  for(const r of [...scope.requiredFeatures,...scope.excludedFeatures])r.id=id('requirement',r.id);
  plan.projectId=id('project',plan.projectId);plan.id=id('plan',plan.id);plan.scopeContractId=id('scope',plan.scopeContractId);
  for(const r of [review,input.previousReview].filter(Boolean)){
    r.projectId=id('project',r.projectId);r.planId=id('plan',r.planId);r.scopeContractId=id('scope',r.scopeContractId);r.id=id('review',r.id);
    for(const issue of r.issues){issue.id=id('issue',issue.id);if(issue.relatedRequirementId)issue.relatedRequirementId=id('requirement',issue.relatedRequirementId);}
    // v3 uses legacy Review fields only. Unknown nested audits require an explicit typed mapping first.
    assert.ok(r.qualityAssessment===undefined&&r.storageAudit===undefined&&r.revisionAudit===undefined,'Unsupported audit ID field.');
  }
  if(input.previousPlan){const p=input.previousPlan;p.projectId=id('project',p.projectId);p.id=id('plan',p.id);p.scopeContractId=id('scope',p.scopeContractId);}
  return {input,token,forward,reverse};
}
export function referenceMap(original,blind,idForward){
  const forward={},reverse={};const add=(a,b)=>{assert.ok(Object.hasOwn(original.references,a)&&Object.hasOwn(blind.references,b),'Missing mapped reference.');assert.ok(!forward[a]&&!reverse[b],'Reference collision.');forward[a]=b;reverse[b]=a;};
  const blindFindingIds=new Set(blind.findings.map(f=>f.id));
  const findingIds={};
  assert.equal(original.findings.length,blind.findings.length);
  for(const f of original.findings){
    let target;
    if(f.origin==='review'){
      assert.ok(f.id.startsWith('review:'));const issueId=f.id.slice('review:'.length),mapped=idForward['issue:'+issueId];
      assert.ok(mapped,'Unmapped review issue: '+issueId);target='review:'+mapped;
    }else target=f.id;
    assert.ok(blindFindingIds.has(target),'Finding mapping mismatch: '+f.id);blindFindingIds.delete(target);findingIds[f.id]=target;
  }
  assert.equal(blindFindingIds.size,0,'Unexpected blinded finding.');
  for(const k of Object.keys(original.references)){
    let target=k;
    if(k.startsWith('finding:')){
      const id=k.slice('finding:'.length),mapped=findingIds[id];assert.ok(mapped,'Unmapped finding reference: '+id);target='finding:'+mapped;
    }else if(k.startsWith('previous-review:issue:')){
      const id=k.slice('previous-review:issue:'.length),mapped=idForward['issue:'+id];assert.ok(mapped,'Unmapped previous issue ID: '+id);target='previous-review:issue:'+mapped;
    }else if(k.startsWith('scope:requirement:')){
      const id=k.slice('scope:requirement:'.length),mapped=idForward['requirement:'+id];assert.ok(mapped,'Unmapped requirement ID: '+id);target='scope:requirement:'+mapped;
      assert.equal(original.references[k],blind.references[target],'Requirement evidence was linked to a different reference.');
    }else if(k.startsWith('scope:excluded:')){
      assert.match(k,/^scope:excluded:[1-9]\d*$/);target=k;
      assert.equal(original.references[k],blind.references[target],'Exclusion evidence was linked to a different reference.');
    }
    add(k,target);
  }
  assert.equal(Object.keys(blind.references).length,Object.keys(forward).length,'Unexpected blinded reference.');
  assert.deepEqual(new Set(Object.values(forward)),new Set(Object.keys(blind.references)),'Unmapped blinded reference.');
  return {forward,reverse};
}
function equivalent(original,blind){
  assert.equal(original.baseline.type,blind.baseline.type,'Policy baseline drift.');
  assert.equal(original.findings.length,blind.findings.length);
  original.findings.forEach((f,i)=>{const b=blind.findings[i];assert.equal(f.description,b.description);assert.equal(f.technicalBlocker,b.technicalBlocker);assert.equal(f.origin,b.origin);});
  for(const k of Object.keys(original.references).filter(k=>/^(plan:L|previous-plan:L|scope:goal|scope:constraint:|user:request|iteration:state|history:availability)/.test(k)))assert.equal(original.references[k],blind.references[k]);
}
export async function prepareBlind({sourceDir,publicDir,privateDir,caseId}){
  assert.match(caseId,/^[a-z0-9][a-z0-9-]{0,79}$/);
  const source=await directory(sourceDir),pub=resolve(publicDir),priv=resolve(privateDir),repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
  for(const p of [pub,priv])assert.ok(!inside(repo,p)&&!inside(source,p)&&!inside(p,source),'Output must be outside source and repository.');
  assert.ok(pub!==priv&&!inside(pub,priv)&&!inside(priv,pub),'Output roots overlap.');
  const manifestBytes=await readFile(await file(source,'manifest.json')),manifest=JSON.parse(manifestBytes);
  assert.equal(manifest.generatorVersion,3);assert.equal(manifest.kind,'triage_semantic_synthetic_fixture_manifest');assert.equal(manifest.policyCommit,POLICY_COMMIT);
  for(const name of ['input','userRequest','context','gold'])assert.ok(Object.hasOwn(manifest.files,`${caseId}/${name}.json`),'Unmanifested case file.');
  for(const [name,digest] of Object.entries(manifest.files)){assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(sha(await readFile(await file(source,name))),digest,`Source mismatch: ${name}`);}
  const input=await readJson(await file(source,`${caseId}/input.json`)),context=await readJson(await file(source,`${caseId}/context.json`)),gold=await readJson(await file(source,`${caseId}/gold.json`));
  const userRequest=await readJson(await file(source,`${caseId}/userRequest.json`));
  assert.equal(gold.caseId,caseId);assert.equal(gold.independentHumanReview,'pending');
  assert.equal(JSON.stringify(buildShadowContext(input,userRequest??undefined)),JSON.stringify(context),'Original input/context mismatch.');
  const mapped=mapInput(input),blind=buildShadowContext(mapped.input,userRequest??undefined);equivalent(context,blind);
  const refs=referenceMap(context,blind,mapped.forward),findingForward={},findingReverse={};
  for(const f of context.findings){const target=f.origin==='review'?'review:'+mapped.forward['issue:'+f.id.slice('review:'.length)]:f.id;
    assert.ok(!findingForward[f.id]&&!findingReverse[target],'Finding ID collision.');findingForward[f.id]=target;findingReverse[target]=f.id;}
  const publicInput={schemaVersion:1,kind:'offline_supervisor_triage_blind_input',inputVersion:3,context:blind};
  const publicBytes=bytes(publicInput),originalBytes=bytes(context);
  for(const secret of [caseId,context.contextSha256,sha(originalBytes),...Object.keys(mapped.forward).map(k=>k.slice(k.indexOf(':')+1))].filter(s=>s.length>3))
    assert.ok(!publicBytes.includes(secret),`Identifier leak: ${secret}`);
  const privateRecord={schemaVersion:1,kind:'offline_triage_blind_private',caseId,policyCommit:manifest.policyCommit,inputVersion:3,
    sourceManifestSha256:sha(manifestBytes),originalInputFileSha256:sha(await readFile(await file(source,`${caseId}/input.json`))),
    originalContextSha256:context.contextSha256,originalContextFileSha256:sha(await readFile(await file(source,`${caseId}/context.json`))),
    mapping:{ids:mapped.forward,reverseIds:mapped.reverse,findings:findingForward,reverseFindings:findingReverse,refs:refs.forward,reverseRefs:refs.reverse},originalContext:context,gold,
    blindedContextSha256:blind.contextSha256,modelInputSha256:sha(publicBytes)};
  await mkdir(pub);let pubMade=true,privMade=false,done=false;
  try{await mkdir(priv);privMade=true;await mkdir(join(pub,'model-inputs'));await mkdir(join(pub,'responses'));
    await save(pub,'model-inputs/input.json',publicInput);
    await save(pub,'responses/template.json',{schemaVersion:1,contextSha256:blind.contextSha256,author:{kind:'offline_recorded_response',version:'1'},findings:[],summaryForUser:''});
    await save(priv,'private-reference.json',privateRecord);
    await save(priv,'manifest.json',{schemaVersion:1,kind:'offline_triage_blind_workspace',inputVersion:3,policyCommit:manifest.policyCommit,
      sourceManifestSha256:sha(manifestBytes),originalInputFileSha256:privateRecord.originalInputFileSha256,
      originalContextSha256:context.contextSha256,originalContextFileSha256:privateRecord.originalContextFileSha256,
      mappingSha256:sha(bytes(privateRecord.mapping)),blindedContextSha256:blind.contextSha256,modelInputSha256:sha(publicBytes),privateReferenceSha256:sha(bytes(privateRecord)),status:'prepared',modelCalls:0});
    done=true;return {publicDir:pub,privateDir:priv,status:'prepared',modelCalls:0};
  }finally{if(!done){if(privMade)await rm(priv,{recursive:true,force:true});if(pubMade)await rm(pub,{recursive:true,force:true});}}
}
export async function recordBlind({publicDir,privateDir,responseFile}){
  const pub=await directory(publicDir),priv=await directory(privateDir),manifest=await readJson(await file(priv,'manifest.json'));
  assert.equal(manifest.kind,'offline_triage_blind_workspace');assert.equal(manifest.inputVersion,3);
  const privateBytes=await readFile(await file(priv,'private-reference.json')),record=JSON.parse(privateBytes);
  const inputBytes=await readFile(await file(pub,'model-inputs/input.json')),model=JSON.parse(inputBytes);
  assert.equal(sha(privateBytes),manifest.privateReferenceSha256);assert.equal(sha(bytes(record.mapping)),manifest.mappingSha256);
  assert.equal(sha(inputBytes),manifest.modelInputSha256);assert.equal(record.modelInputSha256,manifest.modelInputSha256);
  assert.equal(record.policyCommit,manifest.policyCommit);assert.equal(record.sourceManifestSha256,manifest.sourceManifestSha256);
  assert.equal(record.originalInputFileSha256,manifest.originalInputFileSha256);
  assert.equal(record.originalContextSha256,manifest.originalContextSha256);assert.equal(record.originalContextFileSha256,manifest.originalContextFileSha256);
  assert.equal(record.blindedContextSha256,manifest.blindedContextSha256);assert.equal(model.context.contextSha256,manifest.blindedContextSha256);
  const responseBytes=await readFile(responseFile);assert.ok(responseBytes.length<=1_000_000);const response=JSON.parse(responseBytes);
  assert.equal(response.contextSha256,model.context.contextSha256,'Blinded source mismatch.');
  assert.equal(response.author?.kind,'offline_recorded_response');
  const validator={...response,author:{...response.author,kind:'manual_fixture'}};
  const blindResult=validateShadowProposal(model.context,validator);assert.equal(blindResult.status,'structurally_valid_for_manual_inspection',blindResult.errors.join(','));
  const restored={...response,contextSha256:record.originalContext.contextSha256,findings:response.findings.map(row=>{
    const findingId=record.mapping.reverseFindings[row.findingId];
    assert.ok(findingId,'Unmapped finding ID.');return {...row,findingId,
      evidenceRefs:row.evidenceRefs.map(ref=>{const original=record.mapping.reverseRefs[ref];assert.ok(original,'Unmapped reference.');return original;})};})};
  const originalValidator={...restored,author:{...restored.author,kind:'manual_fixture'}};
  const originalResult=validateShadowProposal(record.originalContext,originalValidator);assert.equal(originalResult.status,'structurally_valid_for_manual_inspection',originalResult.errors.join(','));
  const results=join(priv,'results');await mkdir(results,{recursive:true});assert.ok(inside(priv,await directory(results)));
  const out=join(results,randomUUID());await mkdir(out);let done=false;
  try{await writeFile(join(out,'response.raw.json'),responseBytes,{flag:'wx'});await save(out,'proposal.restored.json',restored);
    await save(out,'policy-baseline.json',record.originalContext.baseline);
    await save(out,'result.json',{schemaVersion:1,kind:'offline_triage_blind_record',inputVersion:3,policyCommit:manifest.policyCommit,
      sourceManifestSha256:manifest.sourceManifestSha256,originalInputFileSha256:manifest.originalInputFileSha256,
      originalContextSha256:manifest.originalContextSha256,originalContextFileSha256:manifest.originalContextFileSha256,
      mappingSha256:manifest.mappingSha256,blindedContextSha256:manifest.blindedContextSha256,modelInputSha256:manifest.modelInputSha256,
      responseSha256:sha(responseBytes),restoredProposalSha256:sha(bytes(restored)),blindValidation:blindResult.status,originalValidation:originalResult.status,
      semanticCorrectness:'not_evaluated',humanReview:'pending',modelCalls:0,apiCall:'none',approvalCreated:false});
    const files={};for(const name of ['response.raw.json','proposal.restored.json','policy-baseline.json','result.json'])files[name]=sha(await readFile(join(out,name)));
    await save(out,'manifest.json',{schemaVersion:1,complete:true,files});done=true;return {recordDir:out,status:'recorded',modelCalls:0};
  }finally{if(!done)await rm(out,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [mode,...args]=process.argv.slice(2),opts={};for(let i=0;i<args.length;i+=2){assert.ok(args[i]?.startsWith('--')&&args[i+1]);opts[args[i].slice(2)]=args[i+1];}
  if(mode==='prepare-blind'){assert.deepEqual(Object.keys(opts).sort(),['case','private','public','source']);console.log(JSON.stringify(await prepareBlind({sourceDir:opts.source,publicDir:opts.public,privateDir:opts.private,caseId:opts.case})));}
  else if(mode==='record-blind'){assert.deepEqual(Object.keys(opts).sort(),['private','public','response']);console.log(JSON.stringify(await recordBlind({publicDir:opts.public,privateDir:opts.private,responseFile:opts.response})));}
  else throw new Error('Use prepare-blind or record-blind.');
}
