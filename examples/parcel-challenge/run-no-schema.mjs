import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,open} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {candidateFrom} from './compatibility-candidate.mjs';
import {loadInputs,completeChallenge} from './run.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const oldHash='8571e457784ea18bcd5ecd89bdcd70ae4ca2b439830f93f216d1f6c119fd7a28';
const candidateHash='f1b70c424b287fbb5f3c15c6018280b8010fca70c019654524d62a0c9598c46a';
export async function loadPinnedCandidate(){
  const bytes=await readFile(join(here,'candidate-no-schema.json'));
  assert.equal(sha(bytes),candidateHash,'Candidate changed');return JSON.parse(bytes);
}
export function transformPinnedChallenge(wire,pinned){
  assert.equal(sha(Buffer.from(JSON.stringify(wire,null,2)+'\n')),oldHash,'Recreated original challenge changed');
  const candidate=candidateFrom(wire);
  assert.deepEqual(candidate,pinned,'New request differs beyond the one removed field');
  return candidate;
}
export async function reserveNoSchema(base){
  const marker=await open(join(base,'parcel-v2-no-schema.started.json'),'wx');
  try{await marker.writeFile(JSON.stringify({startedAt:new Date().toISOString(),newRequestCap:1,priorAttempts:6,candidateSha256:candidateHash}));}
  finally{await marker.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);assert.ok(args.every(a=>['--run-live','--dry-run','--bundle'].includes(a))&&new Set(args).size===args.length);
  assert.ok(args.includes('--run-live')!==args.includes('--dry-run'),'Choose --dry-run or explicit one-request --run-live');
  const mode=args.includes('--run-live')?'live':'dry';const inputs=await loadInputs(),pinned=await loadPinnedCandidate();
  const base=join(root,'challenge-no-schema-results');await mkdir(base,{recursive:true});
  if(mode==='live')await reserveNoSchema(base);
  const api={models:{generateContent:async wire=>{
    if(mode==='dry')return {text:JSON.stringify({issues:[],questions:[],storageAudit:{format:'unclear',evidenceLines:[],rationale:'TEST/STUB: no semantic review performed',cases:[],validation:{rationale:'TEST/STUB',rules:[]}}}),candidates:[{finishReason:'STOP'}]};
    const {GoogleGenAI}=await import('@google/genai');return new GoogleGenAI({vertexai:true,project:'iceu-songpa11',location:'global'}).models.generateContent(wire);
  }}};
  const directory=join(base,`no-schema-${Date.now()}-${randomUUID().slice(0,8)}`);
  const result=await completeChallenge({directory,inputs,api,mode,priorAttempts:6,transformChallengeRequest:wire=>transformPinnedChallenge(wire,pinned)});
  console.log(JSON.stringify(result));
  if(args.includes('--bundle')){const archive=directory+'.tar.gz';const t=spawnSync('tar',['-czf',archive,'-C',dirname(directory),directory.split(/[\\/]/).at(-1)],{encoding:'utf8'});assert.equal(t.status,0,'Archive failed; retain folder');console.log(`RESULT_ARCHIVE=${archive}`);}
  if(result.outcome==='failed'||!result.challengeCompleted)process.exitCode=2;
}
