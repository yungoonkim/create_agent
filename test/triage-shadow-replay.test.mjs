import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateParkingShadow} from '../examples/supervisor-triage-shadow/run.mjs';
import {buildShadowContext,validateShadowProposal} from '../dist/src/supervisor/triage-shadow.js';
import {materializeAll} from '../examples/supervisor-triage-semantic/materialize.mjs';

test('actual parking shadow retains local blocker, original policy and all seven paid receipts',async()=>{
  const {input,context,proposal,report}=await evaluateParkingShadow();
  assert.equal(report.contractCasesPassed,7);assert.equal(report.originalFilesUnchanged,true);
  assert.equal(report.newModelCalls,0);assert.equal(report.usedCalls,7);assert.equal(report.semanticAccuracy,null);
  assert.equal(context.baseline.type,'STOP_REPEATED_REVIEW_ISSUES');
  const modified=structuredClone(input);
  modified.review.qualityAssessment.requirements[0].status='missing';
  modified.review.revisionAudit.preservation[0].status='unclear';
  const expanded=buildShadowContext(modified);
  assert.ok(expanded.findings.some(f=>f.origin==='quality'));
  assert.ok(expanded.findings.some(f=>f.origin==='assurance'));
  const incomplete={...proposal,contextSha256:expanded.contextSha256};
  assert.ok(validateShadowProposal(expanded,incomplete).errors.some(e=>e.startsWith('OMITTED_FINDING:quality:')));
  assert.ok(validateShadowProposal(expanded,incomplete).errors.some(e=>e.startsWith('OMITTED_FINDING:assurance:')));
});
test('semantic fixtures expose history and limits while leaving gold and human review status outside model inputs',async()=>{
  const data=await materializeAll();assert.equal(data.cases.length,8);
  const expected=['REVISE','REQUEST_USER_INPUT','REVISE','REQUEST_SCOPE_CHANGE_APPROVAL','REVISE','STOP_REPEATED_REVIEW_ISSUES','STOP_LIMIT_REACHED','REVISE'];
  assert.deepEqual(data.cases.map(c=>c.context.baseline.type),expected);
  for(const c of data.cases){
    const input=JSON.stringify(c.context);
    assert.ok(!input.includes(c.gold.expectedAction));
    assert.ok(!input.includes('expectedCategories'));
    assert.equal(c.gold.independentHumanReview,'pending');
    assert.equal(c.gold.status,'provisional_agent_authored_expected_answer');
    assert.ok(c.context.references['iteration:state']);
  }
  const repeated=data.cases.find(c=>c.gold.caseId==='plant-repeated-loss');
  assert.ok(repeated.input.previousPlan);
  assert.notEqual(repeated.input.previousReview.issues[0].description,repeated.input.review.issues[0].description);
  assert.ok(repeated.gold.exampleValidRefs.includes('previous-plan:L1'));
  const wrongCitation=data.cases.find(c=>c.gold.caseId==='plant-unrelated-citation');
  assert.ok(wrongCitation.gold.exampleValidRefs.includes('plan:L1'));
  assert.ok(wrongCitation.gold.exampleValidRefs.includes('plan:L2'));
  const overreach=data.cases.find(c=>c.gold.caseId==='plant-reviewer-overreach');
  assert.equal(overreach.input.review.issues[0].dispositionReason,'기획·Scope·별도 사용자 요청을 원문으로 대조해야 한다.');
});
