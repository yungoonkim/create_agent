import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {safeProviderFailure,runDiagnostic} from '../examples/reviewer-diagnostic/run.mjs';
test('provider diagnostics retain allowlisted status/code without arbitrary secrets',()=>{
  const e={status:400,message:JSON.stringify({error:{code:400,status:'INVALID_ARGUMENT',message:'schema invalid Bearer SECRET refresh_token=SECRET'}}),headers:{authorization:'SECRET'}};
  const r=safeProviderFailure(e);assert.equal(r.httpStatus,400);assert.equal(r.providerCode,'INVALID_ARGUMENT');assert.ok(r.messageTags.includes('schema'));assert.ok(!JSON.stringify(r).includes('SECRET'));
  assert.equal(safeProviderFailure({code:'ECONNRESET',message:'secret arbitrary text'}).providerCode,'ECONNRESET');
});
test('diagnostic calls once, preserves failure and never approves or overwrites the output',async t=>{
  const root=await mkdtemp(join(tmpdir(),'adtf-diagnostic-'));t.after(()=>rm(root,{recursive:true,force:true}));let calls=0;
  const options={directory:join(root,'run'),request:{model:'test'},source:{label:'TEST'},mode:'dry',client:{models:{generateContent:async()=>{calls++;throw {status:503,message:'UNAVAILABLE secret'};}}}};
  const r=await runDiagnostic(options);assert.equal(calls,1);assert.equal(r.httpStatus,503);assert.equal(r.formalReviewSaved,false);assert.equal(r.originalPlanChanged,false);
  assert.ok(!(await readFile(join(options.directory,'failure.json'),'utf8')).includes('secret'));await assert.rejects(runDiagnostic(options));assert.equal(calls,1);
});
