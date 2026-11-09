// Read-only historical verification. Does not import current production code, SDK, or generation runner.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha,readJson,fileHashes} from './lib.mjs';
export async function verifyArchive(root) {
  const saved=await readJson(join(root,'artifact-manifest.json'));
  const actual=await fileHashes(root);delete actual['artifact-manifest.json'];
  assert.deepEqual(actual,saved.hashes,'Recorded comparison artifacts changed');
  const manifest=await readJson(join(root,'manifest.json'));
  const here=dirname(fileURLToPath(import.meta.url));
  assert.equal(manifest.freezeSha256,sha(await readFile(join(here,'freeze.json'))),'Frozen configuration changed');
  assert.equal(manifest.runnerSha256,sha(await readFile(join(here,'run.mjs'))),'Historical generation runner changed');
  assert.equal(manifest.libSha256,sha(await readFile(join(here,'lib.mjs'))),'Historical evaluation library changed');
  // Deliberately do not compare today's src/ with the historical source map.
  return {verified:true,mode:manifest.mode,fileCount:Object.keys(actual).length,productionSourceReexecuted:false,modelCalls:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [flag,id,...rest]=process.argv.slice(2);
  assert.ok(flag==='--run-id'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id??'')&&rest.length===0,'Use --run-id SAFE_ID');
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../docs/acceptance/planning-comparison-20261109',id);
  console.log(JSON.stringify(await verifyArchive(root)));
}
