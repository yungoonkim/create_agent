import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {FilePlanningMemoryStore} from '../dist/src/planning/memory-store.js';
import {decideAfterReview} from '../dist/src/planning/policy.js';
import {buildUserReviewTable,renderUserReviewTable} from '../dist/src/planning/user-review.js';
import {compactReviewContext} from '../dist/src/planning/review-context.js';
import {revisionIssueSources} from '../dist/src/planning/revision-audit.js';
import {sessionFileHashes,planningSessionStatus} from '../dist/src/planning/session.js';

test('actual parking v2 replay displays group evidence and model/local conflicts without approving or changing history',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'review-consistency-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const archive='docs/acceptance/parking-v2-20261110/parking-export-c7572906.tar.gz';
 assert.equal(createHash('sha256').update(await readFile(archive)).digest('hex'),'a7d7aea9d3fac4b70f7b9a1265465b3bbe31ca09e9c21082512dacc1921c6385');
 assert.equal(spawnSync('tar',['-xzf',archive,'-C',dir],{encoding:'utf8'}).status,0);
 const root=join(dir,'parking-export-c7572906'),before=await sessionFileHashes(root);
 const memory=new FilePlanningMemoryStore(join(root,'session/memory')),id='parking-planning-trial',planId=id+'-plan';
 const scope=await memory.getScopeContract(id,1),plan=await memory.getPlanDraft(id,planId,2),review=await memory.getPlanReview(id,planId,2),previous=await memory.getPlanReview(id,planId,1),planning=await memory.getPlanningLoopState(id);
 const link=await memory.getScopeApprovalRecord(id,scope.id),scopeApproval=await memory.get(link.approvalId);
 const decision=decideAfterReview({review,previousReview:previous,currentPlan:plan,approvedScope:scope,iterationCount:2,maxIterations:2});
 assert.equal(decision.type,'STOP_REPEATED_REVIEW_ISSUES');assert.match(decision.reason,/createdAt/);
 const table=buildUserReviewTable({scope,plan,review,planning,scopeApproval}),md=renderUserReviewTable(table);
 assert.equal(table.questions.length,0);assert.ok(table.technicalStop);assert.equal(table.finalPlanApproval,'unconfirmed');
 assert.match(md,/검토 근거 보완 필요\(기술적 중단\)/);
 const created=md.split('\n').find(row=>row.startsWith('| createdAt:'));
 assert.match(created,/차단:/);assert.match(created,/개별·공유 확인 근거 없음/);
 const memo=md.split('\n').find(row=>row.startsWith('| memo:'));assert.match(memo,/공유 사례 1 참조/);
 assert.match(md,/### 공유 사례 1/);assert.match(md,/12345/);
 const resolution=md.split('\n').find(row=>row.startsWith('| issue-storage-validation-6 |'));
 assert.match(resolution,/해결 주장/);assert.match(resolution,/연결 근거 없음/);
 assert.equal(planning.status,'awaiting_user_input');assert.equal(review.outcome,'pass');
 const status=await planningSessionStatus(join(root,'session'));assert.equal(status.nextAction,'review_correction');
 assert.equal(status.budget.usedCalls,7);assert.equal(status.budget.maxCalls,7);
 assert.deepEqual(await sessionFileHashes(root),before);
 for(const number of ['0001','0002']){
  const request=JSON.parse(await readFile(join(root,`session/ledger/calls/${number}.request.json`),'utf8'));
  const marker='DATA:\n\n',at=request.contents.lastIndexOf(marker)+marker.length;
  const original=JSON.parse(request.contents.slice(at)),compact=structuredClone(original);
  if(number==='0001'){
   compact.reviewFeedback=compactReviewContext(original.reviewFeedback,true);
   assert.deepEqual(Object.keys(compact.reviewFeedback.requiredCorrections).sort(),Object.keys(revisionIssueSources(original.reviewFeedback)).sort());
   assert.deepEqual(compact.currentDraft,original.currentDraft);
  }else{
   compact.previousReviews=original.previousReviews.map(r=>compactReviewContext(r));
   assert.deepEqual(compact.previousPlanLines,original.previousPlanLines);assert.deepEqual(compact.currentPlanLines,original.currentPlanLines);
   assert.deepEqual(compact.previousIssueSources,original.previousIssueSources);
  }
  assert.deepEqual(compact.approvedScope,original.approvedScope);assert.equal(compact.originalRequirements,original.originalRequirements);
  assert.ok(Buffer.byteLength(JSON.stringify(compact))<Buffer.byteLength(JSON.stringify(original)), 'history compaction must reduce actual payload bytes');
 }
});
