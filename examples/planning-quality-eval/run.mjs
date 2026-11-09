// Explicitly authorized live evaluation. TEST/STUB candidates, isolated ledgers, no project/approval writes.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { createVertexAiClient, GeminiPlanningReviewer, GeminiPlanningWriter } from '../../dist/src/planning/google-genai.js';
import { decideAfterReview } from '../../dist/src/planning/policy.js';
assert.equal(process.argv[2], '--run-live');
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const round = process.argv[3] ?? 'initial';
assert.ok(['initial', 'references', 'challenge', 'bounded'].includes(round));
const variants = round === 'initial' ? ['baseline', 'enhanced'] : ['enhanced'];
const output = join(repository, 'docs/acceptance', round === 'initial' ? 'planning-quality-20261108' : `planning-quality-${round}-20261108`);
const dataset = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8'));
const baselineManifest = JSON.parse(await readFile(new URL('./baseline-manifest.json', import.meta.url), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const baselineSource = await readFile(new URL('./baseline-google-genai.ts.txt', import.meta.url), 'utf8');
assert.equal(sha(baselineSource), baselineManifest.sha256);
for (const c of dataset.cases) assert.equal(sha(c.content), c.contentSha256);
await mkdir(output); // Existing receipts must be inspected; never automatically replay model calls.
await mkdir(join(output, 'calls'));
const protectedFiles = new Map();
async function snapshot(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await snapshot(path); else if (entry.isFile()) protectedFiles.set(path, sha(await readFile(path)));
  }
}
await snapshot(join(repository, '.adtf'));
const runtimeDirectory = join(repository, 'dist/quality-eval'); await mkdir(runtimeDirectory, { recursive: true });
const compiled = ts.transpileModule(baselineSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace('from "./policy.js"', 'from "../src/planning/policy.js"');
await writeFile(join(runtimeDirectory, 'baseline.mjs'), compiled);
const baseline = await import(pathToFileURL(join(runtimeDirectory, 'baseline.mjs')).href);
const client = createVertexAiClient();
const role = (name) => ({ model: { providerId: 'vertex-ai', modelId: 'gemini-3.8-flash' }, personaId: `planning-${name}` });
const manifest = { ...baselineManifest, startedAt: new Date().toISOString(), datasetSha256: sha(JSON.stringify(dataset)),
  note: 'Frozen candidates and model; compare complete pipelines, not an isolated prompt effect. Final pipeline uses MEDIUM thinking and at most two reviewer model calls; baseline uses the original single-call settings. No active project writes or approvals.',
  round, reviewCalls: 7 * 2 * variants.length, writerBeforeAfterSampleCalls: round==='bounded'?0:2 * variants.length,
  runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))),
  logicalReviewerInvocations: 7 * 2 * variants.length,
  maxReviewerModelCallsPerInvocation: ['challenge','bounded'].includes(round) ? 2 : 1,
  enhancedSourceSha256: Object.fromEntries(await Promise.all(['src/planning/contracts.ts','src/planning/google-genai.ts','src/planning/prompts.ts','src/planning/policy.ts','src/planning/review-quality.ts'].map(async path => [path,sha(await readFile(join(repository,path)))]))),
  label: 'isolated review/Writer evaluation; not an approval or active Planning continuation', primaryWrites: false };
await writeFile(join(output,'manifest.json'), JSON.stringify(manifest,null,2)+'\n');
await writeFile(join(output,'cases.json'), JSON.stringify(dataset,null,2)+'\n');
let completed=0;
const results=[];
function contextFor(c) {
  const scope=dataset.sourceScope;
  return { projectId:scope.projectId, approvedScope:scope, originalRequirements:dataset.originalRequirements,
    settledDecisions:dataset.settledDecisions.filter(value=>!c.omitDetail1 || !value.startsWith('DETAIL-1:')),
    currentPlan:{id:scope.projectId+'-plan',projectId:scope.projectId,version:c.version??1,scopeContractId:scope.id,scopeVersion:scope.version,
      content:c.content,status:'ready_for_review',createdAt:'2026-11-08T00:00:00Z'} };
}
async function execute(variant,c,repeat,operation='review',writerContext) {
  const id=`${operation}-${variant}-${c.id}-${repeat}`;
  const file=join(output,'calls',id+'.json');
  await writeFile(file,JSON.stringify({id,status:'started',startedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
  const usage=[];let rawResponse;const rawResponses=[];
  const memory={appendTokenUsage:async record=>{const {error:_error,...safe}=record;usage.push(safe);}};
  const wrapped={models:{generateContent:async input=>{const response=await client.models.generateContent(input);rawResponse=response.text;
    rawResponses.push({text:response.text,finishReasons:response.candidates?.map(c=>c.finishReason),
      stage:String(input.config?.systemInstruction??'').includes('final counterexample')?'challenge':'primary',
      ...(response.usageMetadata?{providedUsage:{inputTokens:response.usageMetadata.promptTokenCount,outputTokens:response.usageMetadata.candidatesTokenCount,reasoningTokens:response.usageMetadata.thoughtsTokenCount}}:{})});
    return response;}}};
  const Reviewer=variant==='baseline'?baseline.GeminiPlanningReviewer:GeminiPlanningReviewer;
  const Writer=variant==='baseline'?baseline.GeminiPlanningWriter:GeminiPlanningWriter;
  const context=contextFor(c);
  let result={id,variant,caseId:c.id,repeat,operation,expected:c.expected,inputContentSha256:c.contentSha256};
  try {
    if(operation==='write') {
      const plan=await new Writer(wrapped,memory).write(writerContext,role('writer'));
      result={...result,status:'completed',plan,usage};
    } else {
      if(c.revisionContext) {
        context.previousReviews=[JSON.parse(await readFile(join(repository,'docs/acceptance/todo-20261108/review-v3.json'),'utf8'))];
        context.settledDecisions.push('User requested plan revision within the unchanged approved Scope:\n'+await readFile(join(repository,'docs/acceptance/todo-20261108/revision-v3-request.md'),'utf8'));
      }
      const review=await new Reviewer(wrapped,memory).review(context,role('reviewer'));
      const decision=decideAfterReview({review,currentPlan:context.currentPlan,approvedScope:context.approvedScope,iterationCount:1,maxIterations:5});
      result={...result,status:'completed',review,decision,usage};
    }
  } catch {result={...result,status:'failed',error:'model_call_or_protocol_validation_failed',usage};}
  if(rawResponse!==undefined) result.rawModelResponse=rawResponse;
  if(rawResponses.length) result.rawModelResponses=rawResponses;
  await writeFile(file,JSON.stringify(result,null,2)+'\n');results.push(result);
  console.log(JSON.stringify({completed:++completed,id,status:result.status,outcome:result.review?.outcome,decision:result.decision?.type}));
  return result;
}
// Alternate variants and repeats; no expected labels/defect names are passed to the models.
const jobs=[];
for(let repeat=1;repeat<=2;repeat++)for(const c of dataset.cases)for(const variant of repeat===1?variants:[...variants].reverse())jobs.push({variant,c,repeat});
let next=0;
await Promise.all(Array.from({length:3},async()=>{while(next<jobs.length){const job=jobs[next++];await execute(job.variant,job.c,job.repeat);}}));
for(const variant of round==='bounded'?[]:variants) {
  const c=dataset.cases[0];const {currentPlan:_currentPlan,...writerContext}=contextFor(c);
  const result=await execute(variant,{...c,id:'fresh-writer-sample'},1,'write',writerContext);
  if(result.plan) {
    await writeFile(join(output,`writer-${variant}.md`),result.plan.content.split('\n').map(line=>line.trimEnd()).join('\n')+'\n');
    await execute(variant,{...c,id:'fresh-writer-sample',expected:'unlabeled generated sample',version:result.plan.version,content:result.plan.content,contentSha256:sha(result.plan.content)},1);
  }
}
for(const [path,hash]of protectedFiles)assert.equal(sha(await readFile(path)),hash,'Active project/approval file changed: '+path);
const afterFiles=new Map(protectedFiles);protectedFiles.clear();await snapshot(join(repository,'.adtf'));assert.equal(protectedFiles.size,afterFiles.size);
const summary={};
for(const variant of variants) {
  const rows=results.filter(r=>r.variant===variant&&r.operation==='review'&&r.caseId!=='fresh-writer-sample');
  const bad=rows.filter(r=>r.expected==='block');const good=rows.filter(r=>r.expected==='adequate');
  const valid=r=>r.status==='completed'&&r.decision.type!=='FAILED';
  summary[variant]={reviewCalls:rows.length,defectiveCandidates:bad.length,
    blockedDefectiveCandidates:bad.filter(r=>valid(r)&&r.decision.type!=='REQUEST_USER_APPROVAL').length,
    unsafeAdvance:bad.filter(r=>valid(r)&&r.decision.type==='REQUEST_USER_APPROVAL').length,
    adequateCandidates:good.length,adequateAdvanced:good.filter(r=>valid(r)&&r.decision.type==='REQUEST_USER_APPROVAL').length,
    adequateBlocked:good.filter(r=>valid(r)&&r.decision.type!=='REQUEST_USER_APPROVAL').length,
    failedOrInvalid:rows.filter(r=>!valid(r)).length};
}
const ledger=results.flatMap(r=>r.usage.map(u=>({evaluationCall:r.id,...u})));
const totals={logicalAdapterInvocations:results.length,modelCallRecords:ledger.length,providedTokens:Object.fromEntries(['inputTokens','outputTokens','reasoningTokens'].map(key=>[key,ledger.reduce((s,r)=>s+(r[key]??0),0)])),durationMs:ledger.reduce((s,r)=>s+r.durationMs,0)};
const final={summary,totals,activeProjectAndApprovalFilesUnchanged:true,completedAt:new Date().toISOString(),
  note:'Two repetitions of seven pre-labeled candidates. Protocol failures are not successful defect detection. Blocking any defect is not proof the injected issue was correctly explained; inspect raw reviews. Generated Writer samples are unlabeled and excluded from rates. Small sample, not a general quality guarantee.'};
await writeFile(join(output,'summary.json'),JSON.stringify(final,null,2)+'\n');
await writeFile(join(output,'usage.jsonl'),ledger.map(r=>JSON.stringify(r)).join('\n')+'\n');
console.log(JSON.stringify(final));
