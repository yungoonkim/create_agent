import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {buildRunBundle,makeZip} from '../scripts/create-run-bundle.mjs';

function entries(zip){
  const result=new Map();let at=0;
  while(zip.readUInt32LE(at)===0x04034b50){
    assert.equal(zip.readUInt16LE(at+8),0);const size=zip.readUInt32LE(at+18),len=zip.readUInt16LE(at+26),extra=zip.readUInt16LE(at+28);
    const name=zip.subarray(at+30,at+30+len).toString();const start=at+30+len+extra;
    assert.ok(!result.has(name));result.set(name,zip.subarray(start,start+size));at=start+size;
  }
  assert.equal(zip.readUInt32LE(at),0x02014b50);assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length-12),result.size);return result;
}
test('runtime ZIP uses standard STORE headers, known CRC and rejects unsafe Windows paths',()=>{
  const zip=makeZip([{path:'adtf-run/check.txt',data:Buffer.from('123456789')}]);
  assert.equal(zip.readUInt32LE(14),0xcbf43926);assert.equal(entries(zip).get('adtf-run/check.txt').toString(),'123456789');
  for(const path of ['adtf-run/../secret','adtf-run/name:bad','adtf-run/'+ 'x'.repeat(150)])assert.throws(()=>makeZip([{path,data:Buffer.from('x')}]));
});
test('runtime bundle is reproducible, source-pinned and contains no deep records or credentials',t=>{
  const git=spawnSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'});
  if(git.status!==0||resolve(git.stdout.trim())!==resolve(process.cwd())){t.skip('Distribution builder requires a full Git checkout');return;}
  const bundle=buildRunBundle(process.cwd());assert.deepEqual(buildRunBundle(process.cwd()).bytes,bundle.bytes);assert.ok(bundle.maxPathLength<=140);
  const files=entries(bundle.bytes),manifest=JSON.parse(files.get('adtf-run/bundle-manifest.json'));
  assert.equal(manifest.sourceCommit,bundle.manifest.sourceCommit);
  assert.ok([...files.keys()].every(p=>!/^adtf-run\/(?:docs|node_modules|dist|\.git|\.adtf)\//.test(p)));
  for(const [p,hash] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(files.get('adtf-run/'+p)).digest('hex'),hash);
  const pkg=JSON.parse(files.get('adtf-run/package.json'));assert.ok(!pkg.scripts.test.includes('planning-comparison.test.mjs'));assert.ok(!pkg.scripts.test.includes('run-bundle.test.mjs'));
  assert.ok(pkg.scripts.test.includes('review-evidence.test.js'));assert.ok(pkg.scripts['eval:review-evidence']);
  const freeze=JSON.parse(files.get('adtf-run/examples/review-evidence-live/freeze.json'));
  // A newer bundle may intentionally contain changed production code; old frozen generators then refuse generation.
  for(const p of Object.keys(freeze.productionSourceHashes))assert.ok(files.has('adtf-run/src/'+p));
  assert.equal(createHash('sha256').update(files.get('adtf-run/package-lock.json')).digest('hex'),freeze.packageLockSha256);
});
test('diagnostic package exposes only the one-shot review command, not fresh paid planning',t=>{
  const git=spawnSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'});
  if(git.status!==0||resolve(git.stdout.trim())!==resolve(process.cwd())){t.skip('Distribution builder requires a full Git checkout');return;}
  const bundle=buildRunBundle(process.cwd(),'HEAD','diagnostic');const files=entries(bundle.bytes);
  const pkg=JSON.parse(files.get('adtf-run/package.json'));
  assert.ok(pkg.scripts['diagnose:review']);assert.equal(pkg.scripts['eval:review-evidence'],undefined);
  assert.ok(files.has('adtf-run/examples/reviewer-diagnostic/request.json'));
  assert.ok(files.get('adtf-run/README.md').toString().includes('최대1회'));
});
test('parking planning package includes the approved Scope and only its live command',t=>{
  const git=spawnSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'});
  if(git.status!==0||resolve(git.stdout.trim())!==resolve(process.cwd())){t.skip('Distribution builder requires a full Git checkout');return;}
  const bundle=buildRunBundle(process.cwd(),'HEAD','parking-planning');const files=entries(bundle.bytes);
  const pkg=JSON.parse(files.get('adtf-run/package.json'));
  assert.ok(pkg.scripts['trial:parking-planning']);
  assert.equal(pkg.scripts['complete:parcel-eight'],undefined);
  assert.ok(files.has('adtf-run/examples/parking-planning/scope-v1.json'));
  assert.ok(files.has('adtf-run/examples/parking-planning/input-manifest.json'));
  assert.ok(files.get('adtf-run/README.md').toString().includes('최대 6회'));
  assert.ok(bundle.maxPathLength<=140);
});
