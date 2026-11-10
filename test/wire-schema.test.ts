import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compactReviewSchema } from "../src/planning/wire-schema.js";
import { evidenceFromLines } from "../src/planning/review-quality.js";
test("compact wire schema preserves structure/domain statuses and does not mutate the original failed request", async () => {
  const request=JSON.parse(await readFile("examples/reviewer-diagnostic/request.json","utf8"));
  const original=JSON.stringify(request.config.responseJsonSchema);
  const schema=compactReviewSchema(request.config.responseJsonSchema);
  assert.equal(JSON.stringify(request.config.responseJsonSchema),original);
  assert.ok(JSON.stringify(schema).length<original.length);
  const revision=(schema as typeof request.config.responseJsonSchema).properties.revisionAudit;
  assert.equal(revision.properties.preservation.items.properties.sourceId.enum,undefined);
  assert.equal(revision.properties.resolutions.items.properties.issueId.enum,undefined);
  assert.deepEqual(revision.required,["preservation","resolutions"]);
  assert.deepEqual(revision.properties.preservation.items.properties.status.enum,["preserved","corrected","added","missing","unclear"]);
});
test("numeric line bounds do not weaken exact local evidence validation", () => {
  const input={type:"object",properties:{evidenceLines:{type:"array",maxItems:8,items:{type:"integer",enum:[1,3]}}}};
  const result=compactReviewSchema(input) as typeof input;
  assert.deepEqual(result.properties.evidenceLines.items,{type:"integer",minimum:1,maximum:3});
  const plan={id:"p",projectId:"p",version:1,scopeContractId:"s",scopeVersion:1,content:"rule\n\nexample",status:"ready_for_review" as const,createdAt:"2026-11-10T00:00:00Z"};
  for(const refs of [[2],[4],[1,1]])assert.throws(()=>evidenceFromLines(refs,plan));
  assert.deepEqual(evidenceFromLines([1,3],plan),["rule","example"]);
});
