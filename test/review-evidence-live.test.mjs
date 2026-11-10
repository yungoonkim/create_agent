import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {sha,fileHashes} from '../examples/planning-comparison/lib.mjs';
const entry='examples/review-evidence-live/run.mjs';
const base=resolve('docs/acceptance/review-evidence-live-20261109');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const invoke=(...args)=>spawnSync(process.execPath,[entry,...args],{encoding:'utf8',env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:'missing-TEST-adc',GOOGLE_CLOUD_PROJECT:'',GOOGLE_CLOUD_LOCATION:''}});

test('new parcel input and five-call limit are pinned; live generation requires explicit opt-in',async()=>{
  const f=await read('examples/review-evidence-live/freeze.json');
  assert.equal(sha(await readFile(entry)),f.runnerSha256);
  assert.equal(sha(await readFile('examples/review-evidence-live/cases.json')),f.casesSha256);
  const c=await read('examples/review-evidence-live/cases.json');
  assert.equal(c.cases.length,1);assert.equal(c.cases[0].kind,'seeded_validation_correction');
  assert.ok(c.cases[0].seededExtraLine.includes('received'));assert.equal(f.maxModelCalls,5);assert.equal(f.maxPlanningIterations,2);
  const r=invoke('generate');assert.notEqual(r.status,0);assert.match(r.stderr,/requires --run-live/);assert.ok(!r.stdout.includes('request_started'));
  assert.notEqual(invoke('dry-run','--run-id').status,0);
});

test('parcel dry run exercises real revision sources, common-validation export and archive protection without paid calls',async t=>{
  const id=`test-${randomUUID()}`;const out=join(base,id);
  t.after(async()=>{await rm(out,{recursive:true,force:true});await rm(`${out}.tar.gz`,{force:true});await rm(`${out}.archive.json`,{force:true});});
  const f=await read('examples/review-evidence-live/freeze.json');const r=invoke('dry-run','--run-id',id,'--bundle');
  if(!isDeepStrictEqual(await fileHashes('src'),f.productionSourceHashes)){assert.notEqual(r.status,0);assert.match(r.stderr,/Production code changed/);return;}
  assert.equal(r.status,0,r.stderr);const s=await read(join(out,'summary.json'));
  assert.match(s.label,/TEST\/STUB/);assert.equal(s.liveSdkInvocations,0);assert.equal(s.adapterInvocations,4);assert.equal(s.incompleteCases,0);
  const row=s.results[0];assert.equal(row.currentPlanVersion,2);assert.equal(row.revisionAuditMode,'same_scope');assert.equal(row.preservationRows,9);
  assert.equal(row.previousIssueIds.length,2);assert.equal(row.resolutionRows.length,2);assert.ok(row.resolutionRows.every(x=>x.status==='resolved'));
  assert.equal(row.commonValidationRuleCount,1);assert.equal(row.actualUserApprovalCreated,false);assert.equal(row.scopeVersionUnchanged,true);
  const table=await read(join(out,'exports/parcel/review.json'));assert.equal(table.scopeApproval,'fixture');assert.notEqual(table.finalPlanApproval,'approved');
  const md=await readFile(join(out,'exports/parcel/review.md'),'utf8');assert.match(md,/이전 기획 원문/);assert.match(md,/공통 검증/);
  assert.equal(invoke('verify','--run-id',id).status,0);
  const ar=await read(`${out}.archive.json`);assert.equal(ar.sha256,sha(await readFile(`${out}.tar.gz`)));
  assert.notEqual(invoke('dry-run','--run-id',id).status,0);assert.notEqual(invoke('pack','--run-id',id).status,0);
  await writeFile(join(out,'cases/parcel/result.json'),'{}');assert.notEqual(invoke('verify','--run-id',id).status,0);assert.notEqual(invoke('verify','--run-id',id).status,0);
});

test('parcel live reservation stops duplicate paid execution before any provider access',async t=>{
  const f=await read('examples/review-evidence-live/freeze.json');if(!isDeepStrictEqual(await fileHashes('src'),f.productionSourceHashes))return;
  await mkdir(base,{recursive:true});const marker=join(base,`live-${sha(JSON.stringify(f)).slice(0,16)}.started.json`);let own=false;
  try{await writeFile(marker,JSON.stringify({runId:'TEST-reserved'}),{flag:'wx'});own=true;}catch(e){if(e.code!=='EEXIST')throw e;}
  t.after(async()=>{if(own)await rm(marker);});
  const r=invoke('generate','--run-live','--run-id',`blocked-${randomUUID()}`);assert.notEqual(r.status,0);assert.match(r.stderr,/already started/);assert.ok(!r.stdout.includes('request_started'));
});
