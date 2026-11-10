import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateFrom,loadPinnedRejectedRequest} from '../examples/parcel-challenge/compatibility-candidate.mjs';

test('compatibility hypothesis removes only structured response schema from pinned failed request',async()=>{
  const {original,sourceSha256}=await loadPinnedRejectedRequest();
  assert.equal(sourceSha256,'8571e457784ea18bcd5ecd89bdcd70ae4ca2b439830f93f216d1f6c119fd7a28');
  const before=structuredClone(original),candidate=candidateFrom(original);
  assert.deepEqual(original,before);
  assert.equal(candidate.config.responseJsonSchema,undefined);
  assert.equal(candidate.config.responseMimeType,'application/json');
  assert.deepEqual({...candidate,config:{...candidate.config,responseJsonSchema:original.config.responseJsonSchema}},original);
});
