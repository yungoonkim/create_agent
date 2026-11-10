import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { REVIEW_CHECK_IDS, STORAGE_AUDIT_STATES, type PlanDraft, type PlanEvidence, type PlanReview, type ScopeContract } from "../src/planning/contracts.js";
import { buildChangeImpactTable, diffPlanText, renderChangeImpactTable, type PlanTextChange } from "../src/planning/change-impact.js";
import { buildUserReviewTable } from "../src/planning/user-review.js";
import { exportUserReviewBundle } from "../src/planning/review-export.js";

const scope: ScopeContract = { id: "s", projectId: "p", version: 1, goal: "TEST/STUB", requiredFeatures: [{ id: "R1", statement: "Name registration" }],
  excludedFeatures: [], technicalConstraints: ["Preserve stored data"], createdAt: "2026-11-10T00:00:00Z" };
const before = "normal keep\nfailure keep\nacceptance old\nload old\ncandidate keep\nshared old\nunreferenced old";
const after = "normal keep\nfailure keep\nacceptance new\nload new\ncandidate keep\nshared new\nunreferenced new";
const plan = (version: number, content = version === 1 ? before : after): PlanDraft => ({ id: "p-plan", projectId: "p", version, scopeContractId: "s", scopeVersion: 1, content, status: "ready_for_review", createdAt: scope.createdAt });
const proof = (p: PlanDraft, ...evidenceLines: number[]): PlanEvidence => ({ evidenceLines, evidence: evidenceLines.map(n => p.content.split("\n")[n - 1]!) });
function review(p: PlanDraft): PlanReview {
  return { id: `r${p.version}`, projectId: "p", planId: p.id, planVersion: p.version, scopeContractId: "s", scopeVersion: 1,
    outcome: "pass", issues: [], suggestions: [], scopeViolation: false, userJudgmentRequired: false, reviewedAt: scope.createdAt,
    qualityAssessment: { version: 1, requirements: [{ requirementId: "R1", status: "satisfied", ...proof(p, 1), rationale: "TEST/STUB",
      behaviorEvidence: { normal: proof(p, 1), failure: proof(p, 2), acceptance: proof(p, 3), failureNotApplicableReason: "" } }],
      checks: REVIEW_CHECK_IDS.map(id => ({ id, status: id === "revision_resolution" ? "not_applicable" : "satisfied", ...proof(p, ...(id === "revision_resolution" ? [] : [1])), rationale: "TEST/STUB" })) },
    storageAudit: { format: "json", ...proof(p, 4), rationale: "TEST/STUB",
      cases: STORAGE_AUDIT_STATES.map(state => ({ state, action: state === "absent" ? "initialize" : state === "valid" ? "load" : "preserve_and_block",
        verdict: "consistent", ...proof(p, 4), authorizationScopeIds: [], rationale: "TEST/STUB" })),
      validation: { version: 2, rationale: "TEST/STUB", rules: ["stored-name", "createdAt"].map(rule => ({ rule, status: "supported", load: proof(p, 4), candidate: proof(p, 5), acceptance: proof(p), rationale: "TEST/STUB" })),
        acceptanceGroups: [{ ruleIndexes: [1], acceptance: proof(p, 6), rationale: "TEST/STUB group only covers first rule" }] } } };
}
function applyChanges(original: string, changes: readonly PlanTextChange[]): string {
  const lines = original.split("\n"), output: string[] = []; let cursor = 0, delta = 0;
  for (const c of changes) {
    const start = c.before ? c.before.firstLine - 1 : c.after!.firstLine - 1 - delta;
    output.push(...lines.slice(cursor, start));
    if (c.after) output.push(...c.after.text.split("\n"));
    cursor = c.before?.lastLine ?? start;
    delta += (c.after ? c.after.lastLine - c.after.firstLine + 1 : 0) - (c.before ? c.before.lastLine - c.before.firstLine + 1 : 0);
  }
  return [...output, ...lines.slice(cursor)].join("\n");
}
test("line changes reconstruct insertions, deletions, replacements and repeated/blank lines without renumbering evidence", () => {
  const cases: [string, string][] = [["a\nb", "a\nx\nb"], ["a\nx\nb", "a\nb"], ["a\nb", "a\nc"], ["a\n\nb\n", "\na\nb\nc\n"], ["a\na\nb", "a\nb\na"], ["a", "a"]];
  let seed = 42;
  for (let k = 0; k < 50; k++) {
    const value = (): string => Array.from({ length: 7 }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return ["a", "b", "", "x"][seed % 4]!; }).join("\n");
    cases.push([value(), value()]);
  }
  for (const [old, current] of cases) {
    const diff = diffPlanText(old, current); assert.equal(applyChanges(old, diff.changes), current);
    for (const c of diff.changes) for (const [content, part] of [[old, c.before], [current, c.after]] as const) if (part) {
      assert.equal(part.text, content.split("\n").slice(part.firstLine - 1, part.lastLine).join("\n"));
    }
  }
  const old = "prefix\n" + Array.from({ length: 1100 }, (_, i) => `old-${i}`).join("\n") + "\nsuffix";
  const current = old.replaceAll("old-", "new-"); const large = diffPlanText(old, current);
  assert.equal(large.method, "coarse_window"); assert.equal(applyChanges(old, large.changes), current);
});
test("impact candidates distinguish behavior from acceptance, retain group links and expose partially uncited edits", () => {
  const p1 = plan(1), p2 = plan(2), r1 = review(p1), r2 = review(p2);
  const snapshots = JSON.stringify({ p1, p2, r1, r2, scope });
  const table = buildChangeImpactTable({ plan: p2, scope, previousPlan: p1, previousScope: scope, review: r2, previousReview: r1 });
  assert.equal(table.mode, "same_scope"); assert.equal(table.effectsOnPolicy, "none");
  assert.equal(table.rows.find(r => r.sourceId === "requirement:R1")?.status, "no_cited_change");
  assert.equal(table.rows.find(r => r.sourceId === "acceptance:R1")?.status, "candidate");
  assert.equal(table.rows.find(r => r.sourceId === "constraint:1")?.status, "unassessed");
  const stored = table.rows.find(r => r.label === "stored-name")!;
  assert.ok(stored.after.some(a => a.role === "공유 사례 1"));
  assert.equal(table.rows.find(r => r.label === "createdAt")?.localWarning?.includes("연결 근거 없음"), true);
  assert.ok(table.unmappedChanges.some(c => c.beforeLines.includes(7) && c.afterLines.includes(7)));
  assert.ok(table.blockers.some(i => i.id === "issue-storage-validation-2"));
  assert.equal(JSON.stringify({ p1, p2, r1, r2, scope }), snapshots);
  assert.match(renderChangeImpactTable(table), /영향 없음 판정 아님/);
});
test("missing baselines and different Scopes do not manufacture impact links; invalid sources are rejected", () => {
  assert.equal(buildChangeImpactTable({ plan: plan(1), scope }).mode, "initial");
  const missing = buildChangeImpactTable({ plan: plan(2), scope }); assert.equal(missing.mode, "baseline_missing"); assert.equal(missing.diffMethod, "not_compared");
  const newScope = { ...scope, id: "s2", version: 2, technicalConstraints: ["A changed requirement"] };
  const changed = buildChangeImpactTable({ plan: { ...plan(2), scopeContractId: "s2", scopeVersion: 2 }, scope: newScope, previousPlan: plan(1), previousScope: scope });
  assert.equal(changed.mode, "scope_changed"); assert.equal(changed.rows.length, 0); assert.ok(changed.changes.length);
  assert.throws(() => buildChangeImpactTable({ plan: plan(3), scope, previousPlan: plan(1), previousScope: scope }), /직전 버전/);
  assert.throws(() => buildChangeImpactTable({ plan: plan(2), scope, previousPlan: { ...plan(1), projectId: "foreign" }, previousScope: scope }));
  assert.throws(() => buildChangeImpactTable({ plan: plan(2), scope: { ...scope, goal: "mutated same version" }, previousPlan: plan(1), previousScope: scope }), /스냅샷 내용/);
  assert.throws(() => buildChangeImpactTable({ plan: plan(2), scope, previousPlan: plan(1) }), /이전 Scope/);
  const forged = review(plan(2));
  const wrong = { ...forged, qualityAssessment: { ...forged.qualityAssessment!, requirements: forged.qualityAssessment!.requirements.map(r => ({ ...r, evidence: ["fabricated"] })) } };
  assert.throws(() => buildChangeImpactTable({ plan: plan(2), scope, previousPlan: plan(1), previousScope: scope, review: wrong }), /검토의 버전 또는 인용/);
});
test("export binds impact sources and includes both formats in its hash manifest without replacing existing data", async t => {
  const root = await mkdtemp(join(tmpdir(), "impact-export-")); t.after(() => rm(root, { recursive: true, force: true }));
  const table = buildUserReviewTable({ scope, plan: plan(2), review: review(plan(2)), includeChangeImpact: true, previousPlan: plan(1), previousScope: scope, previousReview: review(plan(1)) });
  assert.ok(table.changeImpact);
  const target = join(root, "report"); await exportUserReviewBundle(target, plan(2), table);
  const manifest = JSON.parse(await readFile(join(target, "bundle.json"), "utf8"));
  for (const file of ["change-impact.md", "change-impact.json"]) assert.equal(createHash("sha256").update(await readFile(join(target, file))).digest("hex"), manifest.hashes[file]);
  await assert.rejects(exportUserReviewBundle(target, plan(2), table), { code: "EEXIST" });
  const bad = { ...table, changeImpact: { ...table.changeImpact!, source: { ...table.changeImpact!.source, currentPlanSha256: "wrong" } } };
  await assert.rejects(exportUserReviewBundle(join(root, "bad"), plan(2), bad), /change impact differs/);
  await assert.rejects(access(join(root, "bad")), { code: "ENOENT" });
  const invalid = buildUserReviewTable({ scope, plan: plan(2), includeChangeImpact: true, previousPlan: plan(1), previousScope: { ...scope, goal: "tampered" } });
  assert.equal(invalid.changeImpact, undefined); assert.match(invalid.changeImpactWarning!, /스냅샷/);
  const hostile = { ...table.changeImpact!, rows: table.changeImpact!.rows.map(r => ({ ...r, label: "<script>alert(1)</script>|cell" })) };
  assert.ok(!renderChangeImpactTable(hostile).includes("<script>"));
});
