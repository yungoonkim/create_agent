import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,open} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const hash=b=>createHash('sha256').update(b).digest('hex');
// Deliberately omit raw error messages, headers, stacks and arbitrary provider details.
export function safeProviderFailure(error){
  const message=String(error?.message??'');let parsed;
  try{parsed=JSON.parse(message);}catch{}
  const body=parsed?.error??error?.response?.data?.error;
  const numeric=[error?.status,error?.response?.status,body?.code].find(n=>Number.isInteger(n)&&n>=400&&n<=599);
  const allowed=['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','RESOURCE_EXHAUSTED','UNAVAILABLE','INTERNAL','DEADLINE_EXCEEDED','NOT_FOUND','ETIMEDOUT','ECONNRESET','ENOTFOUND','ECONNREFUSED'];
  const code=[body?.status,error?.code,...allowed.filter(s=>message.includes(s))].find(s=>allowed.includes(s))??null;
  const tags=[];
  if(/schema|complexity|nesting/i.test(message))tags.push('schema');
  if(/invalid argument|INVALID_ARGUMENT/i.test(message))tags.push('invalid_argument');
  if(/credential|invalid_grant|invalid_rapt|reauth|UNAUTHENTICATED/i.test(message))tags.push('authentication');
  if(/permission|PERMISSION_DENIED/i.test(message))tags.push('permission');
  if(/timeout|timed out/i.test(message))tags.push('timeout');
  return {httpStatus:numeric??null,providerCode:code,messageTags:tags,rawMessageOmitted:true};
}
export async function runDiagnostic({directory,client,request,source,mode}){
  await mkdir(directory);const startedAt=new Date().toISOString();
  const save=(name,value)=>writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  await save('request.json',request);await save('source.json',source);
  let summary;
  try{
    const r=await client.models.generateContent(request);
    await save('response.json',{text:r.text??null,candidates:r.candidates??[],usageMetadata:r.usageMetadata??null,modelVersion:r.modelVersion??null});
    summary={mode,startedAt,outcome:'response_received',sdkAttempts:1,finishReasons:r.candidates?.map(c=>c.finishReason)??[],formalReviewSaved:false,originalPlanChanged:false,finalApprovalCreated:false};
  }catch(error){
    const failure=safeProviderFailure(error);await save('failure.json',failure);
    summary={mode,startedAt,outcome:'request_failed',sdkAttempts:1,...failure,formalReviewSaved:false,originalPlanChanged:false,finalApprovalCreated:false};
  }
  await save('summary.json',summary);return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);assert.ok(args.every(a=>['--run-live','--dry-run','--bundle','--schema-candidate'].includes(a))&&new Set(args).size===args.length,'Unknown/duplicate argument');
  assert.ok(args.includes('--run-live')!==args.includes('--dry-run'),'Choose --dry-run or explicit paid --run-live (maximum ONE SDK request)');
  const mode=args.includes('--run-live')?'live':'dry';
  const bytes=await readFile(join(here,'request.json')),source=JSON.parse(await readFile(join(here,'source.json'),'utf8'));
  assert.equal(hash(bytes),source.requestSha256,'Original failed request changed');
  const request=JSON.parse(bytes);assert.equal(request.model,'gemini-3.8-flash');assert.equal(request.config.httpOptions.retryOptions.attempts,1);
  if(args.includes('--schema-candidate')){
    const {compactReviewSchema}=await import('../../dist/src/planning/wire-schema.js');
    request.config.responseJsonSchema=compactReviewSchema(request.config.responseJsonSchema);
    source.variant='compacted_schema_candidate_not_proven_fix';source.candidateRequestSha256=hash(JSON.stringify(request,null,2)+'\n');
  }
  const base=join(root,'diagnostics');await mkdir(base,{recursive:true});
  if(mode==='live'){const marker=await open(join(base,args.includes('--schema-candidate')?'parcel-v2-schema-candidate.started.json':'parcel-v2-diagnostic.started.json'),'wx');await marker.writeFile(JSON.stringify({startedAt:new Date().toISOString(),maxSdkAttempts:1}));await marker.close();}
  const directory=join(base,`review-${Date.now()}-${randomUUID().slice(0,8)}`);
  const api=mode==='live'?{models:{generateContent:async wire=>{
    const {GoogleGenAI}=await import('@google/genai');return new GoogleGenAI({vertexai:true,project:'iceu-songpa11',location:'global'}).models.generateContent(wire);
  }}}:{models:{generateContent:async()=>({text:'TEST/STUB diagnostic response',candidates:[{finishReason:'STOP'}]})}};
  const result=await runDiagnostic({directory,client:api,request,source,mode});
  console.log(JSON.stringify(result));
  if(args.includes('--bundle')){
    const archive=directory+'.tar.gz';const tar=spawnSync('tar',['-czf',archive,'-C',dirname(directory),directory.split(/[\\/]/).at(-1)],{encoding:'utf8'});
    assert.equal(tar.status,0,'Archive creation failed; preserve original diagnostic folder');console.log(`RESULT_ARCHIVE=${archive}`);
  }
  if(result.outcome==='request_failed')process.exitCode=2;
}
