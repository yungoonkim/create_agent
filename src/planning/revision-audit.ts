import { createHash } from "node:crypto";
import type { PlanDraft, PlanReview, PlanningReviewerContext, RevisionAudit, ScopeContract } from "./contracts.js";
import { evidenceFromLines, parsePlanEvidence, validatePlanEvidence } from "./review-quality.js";
import { storageAuditFindings, onlyHeadings } from "./storage-audit.js";

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid revision audit object.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid revision audit text.");
  return value;
}
function rows(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("Missing revision audit rows.");
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new Error("Invalid revision audit status.");
  return value as T;
}
function version(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("Invalid revision baseline version.");
  return value;
}
function baseline(plan: PlanDraft): NonNullable<RevisionAudit["baseline"]> {
  return { planId: plan.id, planVersion: plan.version, scopeContractId: plan.scopeContractId,
    scopeVersion: plan.scopeVersion, content: plan.content, contentSha256: digest(plan.content) };
}
export function preservationSources(scope: ScopeContract): Readonly<Record<string, string>> {
  return Object.fromEntries([...scope.requiredFeatures.map(r => [`requirement:${r.id}`, r.statement]),
    ...scope.technicalConstraints.map((c, i) => [`constraint:${i + 1}`, c])]);
}
/** Covers structured model issues and blocking quality/storage feedback, including a misleading headline pass. */
export function revisionIssueSources(review: PlanReview | undefined): Readonly<Record<string, string>> {
  if (!review) return {};
  const result: Record<string, string> = Object.fromEntries(review.issues.map(i => [i.id, `${i.description} / ${i.suggestedDirection}`]));
  for (const r of review.qualityAssessment?.requirements ?? []) {
    const b = r.behaviorEvidence;
    if (r.status === "missing" || r.status === "needs_user_input" || b &&
      (!b.normal.evidence.length || !b.acceptance.evidence.length || !b.failure.evidence.length && !b.failureNotApplicableReason.trim())) {
      result[`quality:requirement:${r.requirementId}`] = r.rationale;
    }
  }
  for (const c of review.qualityAssessment?.checks ?? []) if (c.status === "missing" || c.status === "needs_user_input") result[`quality:check:${c.id}`] = c.rationale;
  for (const i of storageAuditFindings(review.storageAudit).issues) result[i.id] = `${i.description} / ${i.suggestedDirection}`;
  for (const r of review.revisionAudit?.preservation ?? []) if (r.status === "missing" || r.status === "unclear" || onlyHeadings(r.before.evidence) || onlyHeadings(r.after.evidence)) result[`preservation:${r.sourceId}`] = r.rationale;
  for (const r of review.revisionAudit?.resolutions ?? []) if (r.status !== "resolved" || onlyHeadings(r.current.evidence)) result[r.issueId] = r.rationale;
  return result;
}
export function revisionMode(plan: PlanDraft, previous: PlanDraft | undefined): RevisionAudit["mode"] {
  return !previous ? "initial" : previous.scopeContractId === plan.scopeContractId && previous.scopeVersion === plan.scopeVersion ? "same_scope" : "scope_changed";
}
export function assertRevisionContext(context: PlanningReviewerContext): void {
  const p = context.previousPlan, c = context.currentPlan;
  if (c.version > 1 && !p) throw new Error("Revision review needs the previous Plan snapshot; do not infer preservation from review summaries.");
  if (p && (p.projectId !== c.projectId || p.id !== c.id || p.version !== c.version - 1 || !p.content.trim())) throw new Error("Revision baseline does not match the preceding Plan version.");
  for (const r of context.previousReviews ?? []) if (r.projectId !== c.projectId || r.planId !== c.id || r.planVersion >= c.version ||
    r.planVersion === p?.version && (r.scopeContractId !== p.scopeContractId || r.scopeVersion !== p.scopeVersion)) throw new Error("Previous review does not match revision sources.");
}
export function bindRevisionAudit(raw: unknown, context: PlanningReviewerContext): RevisionAudit {
  assertRevisionContext(context);
  const mode = revisionMode(context.currentPlan, context.previousPlan);
  const earlier = context.previousReviews?.find(r => r.planVersion === context.previousPlan?.version);
  const base = { version: 1 as const, mode, baseline: context.previousPlan ? baseline(context.previousPlan) : null,
    previousIssueIds: mode === "same_scope" ? Object.keys(revisionIssueSources(earlier)) : [] };
  if (mode !== "same_scope") return { ...base, preservation: [], resolutions: [] };
  const audit = object(raw);
  const located = (value: unknown, plan: PlanDraft): unknown => {
    const item = object(value);
    return { ...item, evidence: evidenceFromLines(item.evidenceLines, plan) };
  };
  return parseRevisionAudit({ ...base,
    preservation: rows(audit.preservation).map(value => { const r = object(value); return { ...r,
      before: located(r.before, context.previousPlan!), after: located(r.after, context.currentPlan) }; }),
    resolutions: rows(audit.resolutions).map(value => { const r = object(value); return { ...r, current: located(r.current, context.currentPlan) }; }),
  });
}
export function parseRevisionAudit(raw: unknown): RevisionAudit {
  const a = object(raw);
  if (a.version !== 1) throw new Error("Unknown revision audit version.");
  const b = a.baseline === null ? null : object(a.baseline);
  const previousIssueIds = rows(a.previousIssueIds).map(text);
  if (new Set(previousIssueIds).size !== previousIssueIds.length) throw new Error("Duplicate previous issue IDs.");
  return { version: 1, mode: choice(a.mode, ["initial", "same_scope", "scope_changed"]),
    baseline: b === null ? null : { planId: text(b.planId), planVersion: version(b.planVersion), scopeContractId: text(b.scopeContractId),
      scopeVersion: version(b.scopeVersion), content: text(b.content), contentSha256: text(b.contentSha256) }, previousIssueIds,
    preservation: rows(a.preservation).map(value => { const r = object(value); return {
      sourceId: text(r.sourceId), status: choice(r.status, ["preserved", "corrected", "added", "missing", "unclear"] as const),
      before: parsePlanEvidence(r.before), after: parsePlanEvidence(r.after), rationale: text(r.rationale) }; }),
    resolutions: rows(a.resolutions).map(value => { const r = object(value); return {
      issueId: text(r.issueId), status: choice(r.status, ["resolved", "unresolved", "unclear"] as const),
      current: parsePlanEvidence(r.current), rationale: text(r.rationale) }; }),
  };
}
export function validateRevisionAudit(a: RevisionAudit, plan: PlanDraft, scope: ScopeContract): void {
  if (a.mode === "initial") {
    if (a.baseline !== null || plan.version !== 1 || a.previousIssueIds.length || a.preservation.length || a.resolutions.length) throw new Error("Initial review cannot claim prior resolution or preservation.");
    return;
  }
  const b = a.baseline;
  if (!b || b.planId !== plan.id || b.planVersion !== plan.version - 1 || digest(b.content) !== b.contentSha256) throw new Error("Revision baseline/hash is invalid.");
  const same = b.scopeContractId === plan.scopeContractId && b.scopeVersion === plan.scopeVersion;
  if ((a.mode === "same_scope") !== same) throw new Error("Revision mode disagrees with Scope versions.");
  if (!same) {
    if (a.preservation.length || a.resolutions.length || a.previousIssueIds.length) throw new Error("Changed Scope cannot silently certify old requirements as preserved.");
    return;
  }
  const expected = Object.keys(preservationSources(scope));
  const ids = a.preservation.map(r => r.sourceId);
  if (ids.length !== expected.length || new Set(ids).size !== ids.length || ids.some(id => !expected.includes(id))) throw new Error("Revision audit must cover every requirement and constraint exactly once.");
  const issueIds = a.resolutions.map(r => r.issueId);
  if (issueIds.length !== a.previousIssueIds.length || new Set(issueIds).size !== issueIds.length || issueIds.some(id => !a.previousIssueIds.includes(id))) throw new Error("Revision audit must cover every previous issue exactly once.");
  const previous = { ...plan, content: b.content };
  for (const r of a.preservation) {
    validatePlanEvidence(r.before, previous); validatePlanEvidence(r.after, plan);
    if ((r.status === "preserved" || r.status === "corrected") && (!r.before.evidence.length || !r.after.evidence.length) || r.status === "added" && (r.before.evidence.length || !r.after.evidence.length)) throw new Error("Preserved/corrected/added claim lacks the correct before/after evidence.");
  }
  for (const r of a.resolutions) {
    validatePlanEvidence(r.current, plan);
    if (r.status === "resolved" && !r.current.evidence.length) throw new Error("Resolved issue needs current specification evidence.");
  }
}
/** Compare claimed history with actual stored/context history, not only the embedded copy. */
export function validateRevisionSource(a: RevisionAudit, previous: PlanDraft | undefined, review: PlanReview | undefined): void {
  if (JSON.stringify(a.baseline) !== JSON.stringify(previous ? baseline(previous) : null)) throw new Error("Revision audit differs from stored preceding Plan.");
  const expected = a.mode === "same_scope" ? Object.keys(revisionIssueSources(review)) : [];
  if (JSON.stringify([...a.previousIssueIds].sort()) !== JSON.stringify(expected.sort())) throw new Error("Revision audit discarded or invented previous feedback.");
}
export function revisionFindings(a: RevisionAudit | undefined): readonly { readonly status: "missing"; readonly message: string }[] {
  if (!a) return [];
  return [...a.preservation.filter(r => r.status === "missing" || r.status === "unclear" || onlyHeadings(r.before.evidence) || onlyHeadings(r.after.evidence)).map(r => ({ status: "missing" as const,
    message: `수정 전후 ${r.sourceId}: ${r.rationale} — 같은 승인 Scope의 규칙과 확인 사례를 명확히 하십시오.` })),
    ...a.resolutions.filter(r => r.status !== "resolved" || onlyHeadings(r.current.evidence)).map(r => ({ status: "missing" as const,
      message: `이전 지적 ${r.issueId} 미해결/확인 필요: ${r.rationale}` }))];
}

export function reviewAssuranceFindings(review: PlanReview): readonly { readonly status: "missing"; readonly message: string }[] {
  if (!review.revisionAudit) return []; // Immutable legacy reviews keep their original policy.
  const roles = (review.qualityAssessment?.requirements ?? []).flatMap(r => {
    const b = r.behaviorEvidence;
    return b && [b.normal, b.failure, b.acceptance].some(e => onlyHeadings(e.evidence)) ? [{ status: "missing" as const,
      message: `${r.requirementId}: 제목만으로 동작·실패·확인 사례를 입증할 수 없습니다. 실제 규칙/입력/예상 결과를 인용하십시오.` }] : [];
  });
  return [...revisionFindings(review.revisionAudit), ...roles];
}
