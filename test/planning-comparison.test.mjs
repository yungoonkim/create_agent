import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {anonymize, blindPair, validateGrade, tariff, sha, references, fileHashes} from '../examples/planning-comparison/lib.mjs';
import {verifyArchive} from '../examples/planning-comparison/verify-archive.mjs';

test('comparison blinding removes provenance while keeping business rules and calendar values', () => {
  const input = '# [기획안 초안 v4] 장보기\nProject: comparison-pair-001\n## 0. 변경 요약\nADTF Reviewer pass\nchanged old rule\n## 1. 기능\n수량은 1~99이고 schemaVersion: 1이다.\n2026-02-30은 거부한다.';
  const masked = anonymize(input);
  assert.ok(!/v4|ADTF|Reviewer|comparison-pair|changed old/.test(masked.content));
  assert.match(masked.content, /수량은 1~99/); assert.match(masked.content, /schemaVersion: 1/); assert.match(masked.content, /2026-02-30/);
  const scenario = {title: '장보기', request: '요구', scope: {projectId: 'internal'}, settledDecisions: [], rubric: []};
  const pair = blindPair('pair-001', scenario, {version: 1, content: input}, {version: 4, content: input}, () => 1);
  assert.deepEqual(pair.mapping.candidates.map(c => c.arm), ['adtf', 'single']);
  assert.ok(pair.packet.candidates.every(c => !('arm' in c) && !('version' in c) && !('sourceSha256' in c)));
});

test('blind grades reject fabricated evidence, omitted rubrics, duplicate candidates and invalid scores', () => {
  const packet = {id: 'blind-test', rubric: [{id: 'C-1'}], candidates: [{id: 'a', content: '실제 규칙\n\n검증 예시'}, {id: 'b', content: '다른 실제 규칙'}]};
  const grade = {packetId: packet.id, candidates: packet.candidates.map(c => ({id: c.id, criteria: [{id: 'C-1', score: 2, lines: [1], reason: '규칙을 확인함'}], findings: []}))};
  assert.equal(validateGrade(grade, packet).candidates[0].total, 2);
  for (const change of [g => g.candidates[0].criteria[0].lines = [2], g => g.candidates[0].criteria = [],
    g => g.candidates[1].id = 'a', g => g.candidates[0].criteria[0].score = 3]) {
    const broken = structuredClone(grade); change(broken); assert.throws(() => validateGrade(broken, packet));
  }
  assert.throws(() => references([1, 1], packet.candidates[0].content));
});

test('tariff estimates price cached input and thinking separately and expose absent metrics', () => {
  const price = {perMillionTokens: {uncachedInput: .75, cachedInput: .075, outputIncludingReasoning: 3.75}};
  const full = tariff({promptTokenCount: 1000000, cachedContentTokenCount: 100000, candidatesTokenCount: 100000, thoughtsTokenCount: 100000}, price);
  assert.ok(Math.abs(full.knownTokenTariffSubtotalUsd - 1.4325) < 1e-10); assert.deepEqual(full.missingMetrics, []);
  const partial = tariff({promptTokenCount: 100}, price);
  assert.deepEqual(partial.missingMetrics, ['candidatesTokenCount', 'thoughtsTokenCount']); assert.equal(partial.actualInvoice, false);
});

test('frozen comparison inputs contain three new daily topics and exact checks before generation', async () => {
  const bytes = await readFile('examples/planning-comparison/cases.json');
  const data = JSON.parse(bytes); const freeze = JSON.parse(await readFile('examples/planning-comparison/freeze.json', 'utf8'));
  assert.equal(sha(bytes), freeze.datasetSha256); assert.equal(data.cases.length, 3); assert.equal(freeze.repetitions, 2);
  for (const c of data.cases) {assert.equal(c.scope.requiredFeatures.length, 6); assert.equal(c.rubric.length, 9); assert.equal(new Set(c.rubric.map(r => r.id)).size, 9);}
  assert.equal(freeze.maxProviderCalls, Object.values(freeze.maxCallsBreakdown).reduce((a, b) => a + b, 0));
});

test('archived comparison remains verifiable after production changes and copied-data tampering is detected', async t => {
  const original = resolve('docs/acceptance/planning-comparison-20261109/local-20261109-162415');
  assert.equal((await verifyArchive(original)).modelCalls, 0);
  const temp = await mkdtemp(join(tmpdir(), 'adtf-archive-verify-'));
  t.after(() => rm(temp, {recursive:true,force:true}));
  const copy = join(temp,'copy'); await cp(original,copy,{recursive:true});
  await writeFile(join(copy,'private/pairs/pair-001/initial.json'),'tampered');
  await assert.rejects(verifyArchive(copy), /artifacts changed/);
  assert.equal((await verifyArchive(original)).verified, true);
});

test('frozen comparison blocks changed production code; pinned code exercises sealing and tamper protection', async t => {
  const runId = `test-${randomUUID()}`;
  const out = resolve('docs/acceptance/planning-comparison-20261109', runId);
  const temp = await mkdtemp(join(tmpdir(), 'adtf-comparison-'));
  t.after(async () => {await rm(out, {recursive: true, force: true}); await rm(`${out}.tar.gz`, {force: true}); await rm(`${out}.archive.json`, {force: true}); await rm(temp, {recursive: true, force: true});});
  const run = (...args) => spawnSync(process.execPath, ['examples/planning-comparison/run.mjs', ...args, '--run-id', runId], {encoding: 'utf8', env: {...process.env, GOOGLE_APPLICATION_CREDENTIALS: '', GOOGLE_CLOUD_PROJECT: '', GOOGLE_CLOUD_LOCATION: ''}});
  const freeze = JSON.parse(await readFile('examples/planning-comparison/freeze.json', 'utf8'));
  const dry = run('dry-run');
  if (JSON.stringify(await fileHashes(resolve('src'))) !== JSON.stringify(freeze.productionSourceHashes)) {
    assert.notEqual(dry.status, 0, 'An observed frozen dataset must not run with tuned production code');
    assert.match(dry.stderr, /Production code changed after freeze/);
    assert.notEqual(run('generate', '--run-live').status, 0, 'Even an opt-in paid stage is blocked before any model call');
    return;
  }
  assert.equal(dry.status, 0, dry.stderr);
  const index = JSON.parse(await readFile(join(out, 'blind/index.json'), 'utf8')); assert.equal(index.packets.length, 6);
  assert.notEqual(run('dry-run').status, 0, 'A started output directory cannot be reused');
  assert.notEqual(run('unblind').status, 0, 'No provenance exposure before scoring');
  const packets = await Promise.all(index.packets.map(id => readFile(join(out, 'blind', `${id}.json`), 'utf8').then(JSON.parse)));
  const grades = {evaluator: 'TEST/STUB automated fixture, not quality evidence', grades: packets.map(p => ({packetId: p.id, candidates: p.candidates.map(c => ({id: c.id,
    criteria: p.rubric.map(r => ({id: r.id, score: 2, lines: [1], reason: 'TEST/STUB structural grade'})), findings: []}))}))};
  const input = join(temp, 'scores.json'); await writeFile(input, JSON.stringify(grades));
  const seal = run('seal-manual', '--file', input); assert.equal(seal.status, 0, seal.stderr);
  const pairs = JSON.parse(await readFile(join(out, 'private/pairs.json'), 'utf8'));
  const audits = {evaluator: 'TEST/STUB only', pairs: []};
  for (const pair of pairs) {
    const transitions = JSON.parse(await readFile(join(out, 'private/pairs', pair.pairId, 'feedback.json'), 'utf8'));
    audits.pairs.push({pairId: pair.pairId, claims: transitions.flatMap(t => t.claims.map(c => ({id: c.id, validity: 'unclear', repair: t.after ? 'unclear' : 'not_attempted', beforeLines: [], afterLines: [], reason: 'TEST/STUB structural audit'})))});
  }
  const auditFile = join(temp, 'audits.json'); await writeFile(auditFile, JSON.stringify(audits));
  const auditResult = run('seal-feedback', '--file', auditFile); assert.equal(auditResult.status, 0, auditResult.stderr);
  const reveal = run('unblind'); assert.equal(reveal.status, 0, reveal.stderr);
  const summary = JSON.parse(await readFile(join(out, 'summary.json'), 'utf8'));
  assert.match(summary.label, /TEST\/STUB ONLY/); assert.equal(summary.pairs.length, 6); assert.equal(summary.physicalProviderCalls, 0);
  assert.equal(summary.adtfApprovalReady, 6); assert.equal(summary.protectedPrimaryFilesUnchanged, true);
  assert.ok(summary.pairs.every(p => p.qualityWinEligible));
  assert.equal(summary.improvementPairs + summary.higherScoreWithoutQualityWin + summary.tiePairs + summary.regressionPairs, 6);
  assert.equal(run('verify').status, 0);
  const packed = run('pack'); assert.equal(packed.status, 0, packed.stderr);
  const archive = await readFile(`${out}.tar.gz`); assert.equal(archive[0], 0x1f); assert.equal(archive[1], 0x8b);
  assert.equal(JSON.parse(await readFile(`${out}.archive.json`, 'utf8')).sha256, sha(archive));
  const target = join(out, 'private/pairs/pair-001/initial.json'); await writeFile(target, '{"tampered":true}');
  assert.notEqual(run('verify').status, 0, 'Mutated originals must fail integrity verification');
  assert.notEqual(run('verify').status, 0, 'A failed verification must not bless tampered artifacts');
});
