import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {sha,fileHashes} from '../examples/planning-comparison/lib.mjs';
const entry='examples/planning-review-live/run.mjs';
const base=resolve('docs/acceptance/planning-review-live-20261109');
const invoke=(...args)=>spawnSync(process.execPath,[entry,...args],{encoding:'utf8',env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:'missing-TEST-adc',GOOGLE_CLOUD_PROJECT:'',GOOGLE_CLOUD_LOCATION:''}});

test('new acceptance cases and budget are frozen and fee-bearing generation requires explicit opt-in',async()=>{
  const f=JSON.parse(await readFile('examples/planning-review-live/freeze.json','utf8'));
  const bytes=await readFile('examples/planning-review-live/cases.json');const data=JSON.parse(bytes);
  assert.equal(sha(bytes),f.casesSha256);assert.equal(sha(await readFile(entry)),f.runnerSha256);
  assert.equal(data.cases.length,2);assert.equal(f.maxPlanningIterations,2);
  assert.equal(f.maxModelCalls,6+5);assert.equal(f.project,'iceu-songpa11');assert.equal(f.location,'global');
  assert.deepEqual(data.cases.map(c=>c.kind),['fresh_writer','seeded_scope_correction']);
  assert.ok(data.cases[1].seededExtraLine.includes('공개 순위 서버'));
  for(const c of data.cases)assert.equal(c.scope.requiredFeatures.length,3);
  const rejected=invoke('generate');assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/requires --run-live/);
  assert.ok(!rejected.stdout.includes('request_started'));
  assert.notEqual(invoke('dry-run','--run-id').status,0);
});

test('dry acceptance exercises production adapters, Scope correction and exports; archives verify and tampering cannot be blessed',async t=>{
  const id=`test-${randomUUID()}`;const out=join(base,id);
  t.after(async()=>{await rm(out,{recursive:true,force:true});await rm(`${out}.tar.gz`,{force:true});await rm(`${out}.archive.json`,{force:true});});
  const f=JSON.parse(await readFile('examples/planning-review-live/freeze.json','utf8'));
  const result=invoke('dry-run','--run-id',id,'--bundle');
  if(!isDeepStrictEqual(await fileHashes('src'),f.productionSourceHashes)) {
    assert.notEqual(result.status,0);assert.match(result.stderr,/Production code changed/);return;
  }
  assert.equal(result.status,0,result.stderr);
  const summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));
  assert.match(summary.label,/TEST\/STUB ONLY/);assert.equal(summary.liveSdkInvocations,0);
  assert.equal(summary.adapterInvocations,7);assert.equal(summary.incompleteCases,0);
  assert.deepEqual(summary.results.map(c=>c.currentPlanVersion),[1,2]);
  assert.ok(summary.results.every(c=>c.scopeVersionUnchanged&&!c.actualUserApprovalCreated&&c.factsOnlyNotQualityPass));
  const table=JSON.parse(await readFile(join(out,'exports/exercise/review.json'),'utf8'));
  assert.equal(table.scopeApproval,'fixture');assert.equal(table.implementationVerification,'not_performed');
  assert.notEqual(table.finalPlanApproval,'approved');
  assert.equal(invoke('verify','--run-id',id).status,0);
  const sidecar=JSON.parse(await readFile(`${out}.archive.json`,'utf8'));
  assert.equal(sidecar.sha256,sha(await readFile(`${out}.tar.gz`)));
  assert.notEqual(invoke('dry-run','--run-id',id).status,0,'An existing run is never overwritten');
  assert.notEqual(invoke('pack','--run-id',id).status,0,'An existing archive is never overwritten');
  await writeFile(join(out,'cases/exercise/result.json'),'{}');
  assert.notEqual(invoke('verify','--run-id',id).status,0);
  assert.notEqual(invoke('verify','--run-id',id).status,0,'Failed verification must not bless changed payload');
});

test('live reservation blocks accidental second paid execution before credentials or provider calls',async t=>{
  const f=JSON.parse(await readFile('examples/planning-review-live/freeze.json','utf8'));
  if(!isDeepStrictEqual(await fileHashes('src'),f.productionSourceHashes))return;
  await mkdir(base,{recursive:true});
  const file=join(base,`live-${sha(JSON.stringify(f)).slice(0,16)}.started.json`);
  let own=false;
  try{await writeFile(file,JSON.stringify({runId:'TEST-reserved'}),{flag:'wx'});own=true;}catch(e){if(e.code!=='EEXIST')throw e;}
  t.after(async()=>{if(own)await rm(file);});
  const result=invoke('generate','--run-live','--run-id',`test-blocked-${randomUUID()}`);
  assert.notEqual(result.status,0);assert.match(result.stderr,/already started/);
  assert.ok(!result.stdout.includes('request_started'));
});
