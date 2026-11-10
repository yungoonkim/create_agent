import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const evidence=resolve(here,'../../docs/acceptance/parcel-challenge-20261110');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Offline compatibility hypothesis only. The rejected field was not observed.
export function candidateFrom(original){
  const candidate=structuredClone(original);
  assert.equal(candidate.config.responseMimeType,'application/json');
  assert.ok(candidate.config.responseJsonSchema);
  assert.equal(candidate.config.httpOptions.retryOptions.attempts,1);
  delete candidate.config.responseJsonSchema;
  return candidate;
}

export async function loadPinnedRejectedRequest(){
  const manifest=JSON.parse(await readFile(resolve(evidence,'manifest.json'),'utf8'));
  const bytes=await readFile(resolve(evidence,'challenge-request.json'));
  assert.equal(sha(bytes),manifest.files['challenge-request.json'],'Recorded request changed');
  return {original:JSON.parse(bytes),sourceSha256:sha(bytes)};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,2,'This command has no live-call mode or arguments');
  const {original,sourceSha256}=await loadPinnedRejectedRequest();
  const candidate=candidateFrom(original);
  const bytes=Buffer.from(JSON.stringify(candidate,null,2)+'\n');
  const output=resolve(evidence,'candidate-no-schema.json');
  await writeFile(output,bytes,{flag:'wx'});
  console.log(JSON.stringify({kind:'offline_only',sourceSha256,candidateSha256:sha(bytes),removedField:'config.responseJsonSchema',modelCalls:0,file:output}));
}
