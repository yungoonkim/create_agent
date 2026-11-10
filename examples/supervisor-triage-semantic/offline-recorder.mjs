// Offline-only recorder for human-pasted proposals. Uses Node built-ins and the
// existing structural validator; it has no provider, SDK, auth, or network port.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rm,lstat,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateShadowProposal} from '../../dist/src/supervisor/triage-shadow.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const idPattern=/^[a-z0-9][a-z0-9-]{0,79}$/;
const BASE_COMMIT='2426ebc70e7406de1da359d332a284052c5b453e';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const inside=(root,path)=>{const r=relative(root,path);return r!==''&&r!=='..'&&!r.startsWith(`..${sep}`)&&!isAbsolute(r);};
async function directory(path){const s=await lstat(path);assert.ok(s.isDirectory()&&!s.isSymbolicLink(),'Path must be a real directory.');return realpath(path);}
async function sourceFile(root,name){
  const path=resolve(root,name);assert.ok(inside(root,path),'Unsafe source manifest path.');
  const stat=await lstat(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Source files must be regular files.');
  const resolved=await realpath(path);assert.ok(inside(root,resolved),'Source file escaped the input directory.');return resolved;
}
async function atomicNew(dir,name,data){await writeFile(resolve(dir,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});}
function metadata(value){
  if(value===undefined)return {source:'not_measured',inputTokens:null,outputTokens:null,cost:null,elapsedMs:null};
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'Metadata must be a JSON object.');
  const keys=['inputTokens','outputTokens','cost','elapsedMs'];
  assert.ok(Object.keys(value).every(k=>keys.includes(k)),'Unknown metadata key.');
  for(const key of Object.keys(value))assert.ok(typeof value[key]==='number'&&Number.isFinite(value[key])&&value[key]>=0,`Invalid metadata value: ${key}`);
  return {source:'user_supplied_unverified',inputTokens:value.inputTokens??null,outputTokens:value.outputTokens??null,cost:value.cost??null,elapsedMs:value.elapsedMs??null};
}
function safeModelInput(value){
  assert.ok(value&&value.kind==='offline_supervisor_triage_input'&&value.context,'Invalid model input.');
  assert.ok(!Object.hasOwn(value,'gold')&&!Object.hasOwn(value,'expectedCategories')&&!Object.hasOwn(value,'scorecard'));
  assert.ok(!Object.hasOwn(value.context,'gold')&&!Object.hasOwn(value.context,'expectedCategories'));
  assert.equal(value.context.kind,'supervisor_triage_shadow');
  assert.ok(value.context.baseline&&Object.hasOwn(value.context.references,'policy:baseline'),'Policy baseline must remain available as input.');
}

export async function prepare({sourceDir,outputDir,caseId}){
  assert.match(caseId,idPattern);const source=await directory(sourceDir),outPath=resolve(outputDir);
  const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
  assert.ok(!inside(repo,outPath),'Result workspace must be outside the repository.');
  assert.notEqual(source,outPath,'Input and output directories must be separate.');
  assert.ok(!inside(source,outPath)&&!inside(outPath,source),'Input and output trees must be disjoint.');
  const manifestPath=await sourceFile(source,'manifest.json'),manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.kind,'triage_semantic_synthetic_fixture_manifest');assert.equal(manifest.generatorVersion,2);
  assert.ok(manifest.files&&typeof manifest.files==='object'&&!Array.isArray(manifest.files),'Invalid source file manifest.');
  for(const [name,expected] of Object.entries(manifest.files)){
    assert.match(expected,/^[a-f0-9]{64}$/,'Invalid source SHA-256.');
    assert.equal(hash(await readFile(await sourceFile(source,name))),expected,`Source hash mismatch: ${name}`);
  }
  const sourceContext=await sourceFile(source,`${caseId}/context.json`),sourceGold=await sourceFile(source,`${caseId}/gold.json`);
  const context=await json(sourceContext),gold=await json(sourceGold);
  assert.ok(Object.hasOwn(manifest.files,`${caseId}/context.json`)&&Object.hasOwn(manifest.files,`${caseId}/gold.json`),'Case files are not covered by the source manifest.');
  const {contextSha256,...contextBody}=context;
  assert.equal(contextSha256,hash(JSON.stringify(contextBody)),'Context digest mismatch.');
  assert.equal(gold.caseId,caseId);assert.equal(context.source.planId,`semantic-${caseId}-plan`);
  const modelInput={schemaVersion:1,kind:'offline_supervisor_triage_input',source:{caseId,baseCommit:BASE_COMMIT,inputVersion:manifest.generatorVersion,
    manifestSha256:hash(manifestBytes),contextSha256:context.contextSha256,contextFileSha256:hash(await readFile(sourceContext))},context};
  safeModelInput(modelInput);
  const output=resolve(outPath);await mkdir(output);let done=false;
  try{
    await mkdir(resolve(output,'model-inputs'));await mkdir(resolve(output,'private-reference'));await mkdir(resolve(output,'responses'));
    await atomicNew(resolve(output,'model-inputs'),`${caseId}.json`,modelInput);
    await atomicNew(resolve(output,'private-reference'),`${caseId}.json`,{caseId,gold,
      source:{manifestSha256:modelInput.source.manifestSha256,contextSha256:context.contextSha256},
      warning:'Do not provide this file or directory to the model being evaluated.'});
    await atomicNew(resolve(output,'responses'),`${caseId}.template.json`,{schemaVersion:1,contextSha256:context.contextSha256,
      author:{kind:'offline_recorded_response',version:'1'},findings:[],summaryForUser:''});
    await atomicNew(output,'manifest.json',{schemaVersion:1,kind:'offline_triage_evaluation_workspace',baseCommit:BASE_COMMIT,caseId,
      caseKind:'synthetic_test_input_not_model_result',inputVersion:manifest.generatorVersion,sourceManifestSha256:modelInput.source.manifestSha256,
      modelInputSha256:hash(await readFile(resolve(output,'model-inputs',`${caseId}.json`))),
      privateReferenceSha256:hash(await readFile(resolve(output,'private-reference',`${caseId}.json`))),modelCalls:0,status:'prepared'});
    done=true;return {output,caseId,modelCalls:0,status:'prepared'};
  }finally{if(!done)await rm(output,{recursive:true,force:true});}
}

export async function record({workspaceDir,caseId,responseFile,metadataFile}){
  assert.match(caseId,idPattern);const workspace=await directory(workspaceDir),manifest=await json(await sourceFile(workspace,'manifest.json'));
  assert.equal(manifest.kind,'offline_triage_evaluation_workspace');assert.equal(manifest.caseId,caseId);assert.equal(manifest.status,'prepared');
  const inputPath=await sourceFile(workspace,`model-inputs/${caseId}.json`),privatePath=await sourceFile(workspace,`private-reference/${caseId}.json`);
  const modelInput=await json(inputPath),reference=await json(privatePath);
  assert.equal(hash(await readFile(inputPath)),manifest.modelInputSha256,'Model input digest mismatch.');
  assert.equal(hash(await readFile(privatePath)),manifest.privateReferenceSha256,'Private reference digest mismatch.');
  assert.equal(modelInput.source.contextSha256,reference.source.contextSha256,'Reference source mismatch.');
  assert.equal(modelInput.source.baseCommit,manifest.baseCommit);assert.equal(modelInput.source.inputVersion,manifest.inputVersion);
  safeModelInput(modelInput);assert.equal(reference.caseId,caseId);assert.equal(reference.gold.caseId,caseId);
  const raw=await readFile(resolve(responseFile));assert.ok(raw.length<=1_000_000,'Response exceeds the 1 MB safety limit.');
  const response=JSON.parse(raw.toString('utf8'));
  assert.ok(response.author&&response.author.kind==='offline_recorded_response'&&typeof response.author.version==='string'&&response.author.version.trim(),
    'Response author must identify a manually recorded offline response.');
  const validatorInput={...response,author:{...response.author,kind:'manual_fixture'}};
  const validation=validateShadowProposal(modelInput.context,validatorInput);
  assert.equal(validation.status,'structurally_valid_for_manual_inspection',`Response rejected: ${validation.errors.join(', ')}`);
  if(metadataFile)assert.ok((await lstat(resolve(metadataFile))).isFile(),'Metadata must be a regular file.');
  const supplied=metadataFile?metadata(await json(resolve(metadataFile))):metadata(undefined);
  const recordId=randomUUID(),policyBytes=Buffer.from(JSON.stringify(modelInput.context.baseline,null,2)+'\n'),proposalBytes=Buffer.from(JSON.stringify(response,null,2)+'\n');
  const result={schemaVersion:1,kind:'offline_manual_response_record',caseId,recordId,recordType:'synthetic_test_input_not_model_result',
    baseCommit:manifest.baseCommit,inputVersion:manifest.inputVersion,sourceContextSha256:modelInput.source.contextSha256,
    modelInputSha256:manifest.modelInputSha256,responseSha256:hash(raw),proposalSha256:hash(proposalBytes),policyBaselineSha256:hash(policyBytes),
    artifacts:{response:'response.raw.json',proposal:'proposal.json',policyBaseline:'policy-baseline.json'},
    structuralValidation:{status:validation.status,errors:validation.errors,semanticCorrectness:'not_evaluated'},metadata:supplied,
    modelCalls:0,apiCall:'none',automaticRetry:false,approvalCreated:false};
  const results=resolve(workspace,'results'),caseDir=resolve(results,caseId);
  await mkdir(results,{recursive:false}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  assert.ok(inside(workspace,await directory(results)),'Results path escaped the workspace.');
  await mkdir(caseDir,{recursive:false}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  assert.ok(inside(workspace,await directory(caseDir)),'Case results path escaped the workspace.');
  const recordDir=resolve(caseDir,result.recordId);await mkdir(recordDir);let complete=false;
  try{
    await writeFile(resolve(recordDir,'response.raw.json'),raw,{flag:'wx'});
    await writeFile(resolve(recordDir,'proposal.json'),proposalBytes,{flag:'wx'});
    await writeFile(resolve(recordDir,'policy-baseline.json'),policyBytes,{flag:'wx'});
    await atomicNew(recordDir,'result.json',result);
    const names=['response.raw.json','proposal.json','policy-baseline.json','result.json'];
    const files={};for(const name of names)files[name]=hash(await readFile(resolve(recordDir,name)));
    await atomicNew(recordDir,'manifest.json',{schemaVersion:1,complete:true,files});
    complete=true;return {recordDir,recordId:result.recordId,validation:validation.status,modelCalls:0};
  }finally{if(!complete)await rm(recordDir,{recursive:true,force:true});}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [mode,...args]=process.argv.slice(2),opts={};
  for(let i=0;i<args.length;i+=2){assert.ok(args[i]?.startsWith('--')&&args[i+1],'Options require values.');const key=args[i].slice(2);assert.ok(!Object.hasOwn(opts,key),'Duplicate option.');opts[key]=args[i+1];}
  let result;
  if(mode==='prepare'){assert.deepEqual(Object.keys(opts).sort(),['case','output','source']);result=await prepare({sourceDir:opts.source,outputDir:opts.output,caseId:opts.case});}
  else if(mode==='record'){
    assert.ok(['case','response','workspace'].every(k=>Object.hasOwn(opts,k))&&Object.keys(opts).every(k=>['case','response','workspace','metadata'].includes(k)), 'Invalid record options.');
    result=await record({workspaceDir:opts.workspace,caseId:opts.case,responseFile:opts.response,metadataFile:opts.metadata});
  }else throw new Error('Use prepare --source V2_DIR --case CASE_ID --output NEW_DIR, or record --workspace DIR --case CASE_ID --response JSON_FILE [--metadata JSON_FILE].');
  console.log(JSON.stringify(result));
}
