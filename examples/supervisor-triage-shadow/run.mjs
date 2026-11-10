// Fixed offline experiment. No model/client, live flag, Controller or approval write path.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {FilePlanningMemoryStore} from '../../dist/src/planning/memory-store.js';
import {sessionFileHashes,planningSessionStatus} from '../../dist/src/planning/session.js';
import {buildShadowContext,validateShadowProposal} from '../../dist/src/supervisor/triage-shadow.js';

const sha = b => createHash('sha256').update(b).digest('hex');
const archive = fileURLToPath(new URL('../../docs/acceptance/parking-v2-20261110/parking-export-c7572906.tar.gz',import.meta.url));
export async function evaluateParkingShadow() {
  const archiveSha256=sha(await readFile(archive));
  assert.equal(archiveSha256,'a7d7aea9d3fac4b70f7b9a1265465b3bbe31ca09e9c21082512dacc1921c6385');
  const temp=await mkdtemp(join(tmpdir(),'triage-shadow-'));
  try {
    assert.equal(spawnSync('tar',['-xzf',archive,'-C',temp],{encoding:'utf8'}).status,0);
    const root=join(temp,'parking-export-c7572906'),before=await sessionFileHashes(root),session=join(root,'session');
    const memory=new FilePlanningMemoryStore(join(session,'memory')),id='parking-planning-trial',pid=id+'-plan';
    const input={approvedScope:await memory.getScopeContract(id,1),currentPlan:await memory.getPlanDraft(id,pid,2),review:await memory.getPlanReview(id,pid,2),
      previousReview:await memory.getPlanReview(id,pid,1),iterationCount:2,maxIterations:2};
    const context=buildShadowContext(input);
    assert.equal(input.review.issues.length,0);
    assert.ok(context.findings.some(f=>f.id==='storage:issue-storage-validation-6'));
    const line=Object.keys(context.references).find(k=>k.startsWith('plan:')&&context.references[k].includes('createdAt'));
    assert.ok(line);
    // Authored example for contract testing, not a model prediction or independent quality verdict.
    const proposal={schemaVersion:1,contextSha256:context.contextSha256,author:{kind:'manual_fixture',version:'parking-recheck-v1'},
      findings:context.findings.map(f=>({findingId:f.id,category:'REVIEWER_RECHECK',
        rationale:'모델의 supported 주장과 로컬 연결 검사가 다릅니다. 관련 원문과 공유 사례의 실제 ruleIndexes를 사람이 대조해야 합니다.',
        proposedAction:'createdAt의 개별·공유 실패 사례 연결을 재검토할 초안입니다. 기존 Review를 덮어쓰거나 현재 차단을 해제하지 않습니다.',
        evidenceRefs:[`finding:${f.id}`,line,'scope:goal']})),summaryForUser:'기존 차단을 유지하며 createdAt 확인 사례 연결을 재확인합니다.'};
    const row=proposal.findings[0];assert.ok(row);
    const cases=[
      {id:'manual-recheck',proposal,expected:'structurally_valid_for_manual_inspection'},
      {id:'omit-local-blocker',proposal:{...proposal,findings:[]},expected:'rejected'},
      {id:'stale-context',proposal:{...proposal,contextSha256:'stale'},expected:'rejected'},
      {id:'invent-line',proposal:{...proposal,findings:[{...row,evidenceRefs:[`finding:${row.findingId}`,'plan:L999999']}]},expected:'rejected'},
      {id:'turn-blocker-into-preference',proposal:{...proposal,findings:[{...row,category:'USER_CLARIFICATION'}]},expected:'rejected'},
      {id:'add-approval-authority',proposal:{...proposal,finalApprovalCreated:true},expected:'rejected'},
      {id:'invent-scope-demand',proposal:{...proposal,findings:[{...row,category:'SCOPE_CHANGE_REQUIRED'}]},expected:'rejected'},
    ];
    const results=cases.map(c=>({...c,validation:validateShadowProposal(context,c.proposal)}));
    for(const c of results) {assert.equal(c.validation.status,c.expected);assert.deepEqual(c.validation.baseline,context.baseline);}
    const status=await planningSessionStatus(session);
    assert.equal(status.budget.usedCalls,7);assert.deepEqual(await sessionFileHashes(root),before);
    const report={schemaVersion:1,kind:'offline_triage_contract_evaluation',fixtureAuthor:'repository-maintainer',
      sourceArchiveSha256:archiveSha256,sourceFileHashes:before,baseline:context.baseline,rawReviewIssueCount:0,localFindingCount:context.findings.length,
      cases:results.map(c=>({id:c.id,expected:c.expected,validation:c.validation})),
      contractCasesPassed:results.length,totalContractCases:results.length,originalFilesUnchanged:true,usedCalls:7,newModelCalls:0,
      semanticAccuracy:null,qualityImprovement:null,costBenefit:null,elapsedModelTime:null,
      limitation:'사람이 작성한 공개 고정 사례의 계약 검사입니다. 중재 모델의 의미 판단 정확도·품질 향상·비용 이득은 측정하지 않았습니다.'};
    return {input,context,proposal,cases:results,report};
  } finally {await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length,4,'Use --output NEW_DIRECTORY (offline only)');assert.equal(process.argv[2],'--output');
  const data=await evaluateParkingShadow(),out=resolve(process.argv[3]);await mkdir(out);
  const files={};for(const [key,value] of Object.entries(data)) {const bytes=JSON.stringify(value,null,2)+'\n';await writeFile(join(out,key+'.json'),bytes,{flag:'wx'});files[key+'.json']=sha(bytes);}
  await writeFile(join(out,'manifest.json'),JSON.stringify({schemaVersion:1,complete:true,files},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output:out,passed:data.report.contractCasesPassed,total:data.report.totalContractCases,newModelCalls:0,semanticAccuracy:null}));
}
