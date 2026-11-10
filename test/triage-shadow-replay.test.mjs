import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateParkingShadow} from '../examples/supervisor-triage-shadow/run.mjs';
import {buildShadowContext,validateShadowProposal} from '../dist/src/supervisor/triage-shadow.js';

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
