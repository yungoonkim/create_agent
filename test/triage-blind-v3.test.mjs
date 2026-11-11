import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,readdir,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {materializeV3,writeV3} from '../examples/supervisor-triage-semantic/materialize-v3.mjs';
import {prepareBlind,recordBlind,referenceMap} from '../examples/supervisor-triage-semantic/blind-recorder.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t,id='umbrella-choice'){
  const root=await mkdtemp(join(tmpdir(),'adtf-blind-v3-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=join(root,'v3'),pub=join(root,'public'),priv=join(root,'private');await writeV3(source);
  await prepareBlind({sourceDir:source,publicDir:pub,privateDir:priv,caseId:id});
  const model=JSON.parse(await readFile(join(pub,'model-inputs/input.json'),'utf8'));
  return {root,source,pub,priv,model};
}
function response(model){return {schemaVersion:1,contextSha256:model.context.contextSha256,author:{kind:'offline_recorded_response',version:'offline-test'},
  findings:[...model.context.findings].reverse().map(f=>({findingId:f.id,category:'REVIEWER_RECHECK',rationale:'원문 재확인',proposedAction:'검수',
    evidenceRefs:[`finding:${f.id}`,'plan:L1']})),summaryForUser:'오프라인 구조 검사'};}
test('v3 cases retain intended Policy outcomes and v2 source bytes',async()=>{
  const before=await readFile('docs/acceptance/triage-semantic-audit-20261110/manifest.json');
  const cases=(await materializeV3()).cases;
  assert.deepEqual(cases.map(c=>c.context.baseline.type),['REVISE','REQUEST_USER_INPUT','REVISE','REQUEST_SCOPE_CHANGE_APPROVAL','REVISE','STOP_REPEATED_REVIEW_ISSUES','STOP_LIMIT_REACHED','REVISE']);
  assert.equal(cases[1].context.findings.length,2);assert.deepEqual(cases[1].context.baseline.questions,[cases[1].input.review.suggestions[0]]);
  assert.equal(cases[1].gold.provisionalFindings.length,2);assert.equal(cases[1].gold.independentHumanReview,'pending');
  const repeated=cases[5];assert.equal(repeated.input.previousReview.issues[0].id,repeated.input.review.issues[0].id);
  assert.doesNotMatch(repeated.input.review.issues[0].description,/직전|반복/);
  const citation=cases[7];assert.match(citation.context.references['plan:L1'],/제목/);assert.match(citation.context.references['plan:L2'],/제거/);
  assert.equal(sha(await readFile('docs/acceptance/triage-semantic-audit-20261110/manifest.json')),sha(before));
  assert.equal(sha(await readFile('docs/acceptance/triage-semantic-audit-20261110/synthetic-snapshots-v2.tar.gz')),
    JSON.parse(before).archiveSha256);
});
test('blind input hides original identifiers and reversed response restores both findings',async t=>{
  const f=await fixture(t),raw=await readFile(join(f.pub,'model-inputs/input.json'),'utf8');
  assert.ok(!raw.includes('umbrella-choice'));assert.ok(!raw.includes('issue-umbrella-choice'));assert.ok(!raw.includes('expectedCategories'));
  assert.equal(f.model.context.findings.length,2);
  const r=response(f.model),path=join(f.root,'response.json');await writeFile(path,JSON.stringify(r));
  const saved=await recordBlind({publicDir:f.pub,privateDir:f.priv,responseFile:path});
  const restored=JSON.parse(await readFile(join(saved.recordDir,'proposal.restored.json'),'utf8'));
  assert.deepEqual(restored.findings.map(x=>x.findingId),['suggestion:1','review:issue-umbrella-choice']);
  const result=JSON.parse(await readFile(join(saved.recordDir,'result.json'),'utf8'));
  assert.equal(result.blindValidation,'structurally_valid_for_manual_inspection');assert.equal(result.originalValidation,'structurally_valid_for_manual_inspection');
  assert.equal(result.responseSha256,sha(await readFile(path)));
  assert.equal(result.restoredProposalSha256,sha(await readFile(join(saved.recordDir,'proposal.restored.json'))));
  assert.equal(result.semanticCorrectness,'not_evaluated');
});
test('cross-case replay and forged IDs fail before touching existing results',async t=>{
  const f=await fixture(t),r=response(f.model),path=join(f.root,'response.json');await writeFile(path,JSON.stringify(r));
  const saved=await recordBlind({publicDir:f.pub,privateDir:f.priv,responseFile:path});
  const old=await readFile(join(saved.recordDir,'result.json'));
  r.findings[0].findingId='review:issue-forged';await writeFile(path,JSON.stringify(r));
  await assert.rejects(recordBlind({publicDir:f.pub,privateDir:f.priv,responseFile:path}));
  r.findings[0].findingId=f.model.context.findings.at(-1).id;r.contextSha256='f'.repeat(64);await writeFile(path,JSON.stringify(r));
  await assert.rejects(recordBlind({publicDir:f.pub,privateDir:f.priv,responseFile:path}),/source mismatch/i);
  assert.equal((await readdir(join(f.priv,'results'))).length,1);assert.deepEqual(await readFile(join(saved.recordDir,'result.json')),old);
});
test('the same issue keeps one blind ID across review history and another case cannot replay its response',async t=>{
  const a=await fixture(t,'plant-repeated-loss');
  const mapping=JSON.parse(await readFile(join(a.priv,'private-reference.json'),'utf8')).mapping;
  assert.ok(mapping.ids['issue:issue-plant-repeated-loss']);
  assert.ok(a.model.context.references[`previous-review:issue:${mapping.ids['issue:issue-plant-repeated-loss']}`]);
  const b=await fixture(t,'plant-invalid-input');
  assert.notEqual(a.model.context.contextSha256,b.model.context.contextSha256);
  const path=join(a.root,'response-repeated.json');await writeFile(path,JSON.stringify(response(a.model)));
  await assert.rejects(recordBlind({publicDir:b.pub,privateDir:b.priv,responseFile:path}),/source mismatch/i);
  await assert.rejects(lstat(join(b.priv,'results')));
});
test('reference map uses entity IDs across reordered previous issues and multi-item Scope lists',async()=>{
  const [sample]=(await materializeV3()).cases;const original=structuredClone(sample.context),blind=structuredClone(sample.context);
  original.findings=[{id:'review:issue-a',origin:'review'},{id:'review:issue-b',origin:'review'}];
  blind.findings=[{id:'review:blind-b',origin:'review'},{id:'review:blind-a',origin:'review'}];
  original.references={
    'finding:review:issue-a':'A','finding:review:issue-b':'B',
    'previous-review:issue:issue-a':'A','previous-review:issue:issue-b':'B',
    'scope:requirement:R1':'one','scope:requirement:R2':'two',
    'scope:excluded:1':'x1','scope:excluded:2':'x2','plan:L1':'line'
  };
  blind.references={
    'finding:review:blind-b':'B','finding:review:blind-a':'A',
    'previous-review:issue:blind-b':'B','previous-review:issue:blind-a':'A',
    'scope:requirement:q2':'two','scope:requirement:q1':'one',
    'scope:excluded:1':'x1','scope:excluded:2':'x2','plan:L1':'line'
  };
  const ids={'issue:issue-a':'blind-a','issue:issue-b':'blind-b','requirement:R1':'q1','requirement:R2':'q2'};
  const map=referenceMap(original,blind,ids);
  assert.equal(map.forward['previous-review:issue:issue-a'],'previous-review:issue:blind-a');
  assert.equal(map.forward['previous-review:issue:issue-b'],'previous-review:issue:blind-b');
  assert.equal(map.forward['scope:requirement:R1'],'scope:requirement:q1');
  assert.equal(map.forward['scope:excluded:2'],'scope:excluded:2');
  assert.throws(()=>referenceMap(original,blind,{'issue:issue-a':'blind-a','requirement:R1':'q1','requirement:R2':'q2'}),/Unmapped review issue/);
  assert.throws(()=>referenceMap(original,{...blind,references:{...blind.references,'scope:requirement:q1':'collision'}},ids),/Requirement evidence was linked/);
});
