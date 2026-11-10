import { createHash } from "node:crypto";
import type { PlanDraft, PlanningDecision, PlanningDecisionInput } from "../planning/contracts.js";
import { parseScopeContract } from "../planning/config.js";
import { decideAfterReview, parsePlanReview, validatePlanReview } from "../planning/policy.js";
import { qualityFindings } from "../planning/review-quality.js";
import { reviewAssuranceFindings } from "../planning/revision-audit.js";
import { storageAuditFindings } from "../planning/storage-audit.js";

export const TRIAGE_CATEGORIES = ["WRITER_REWORK", "USER_CLARIFICATION", "SCOPE_CHANGE_REQUIRED", "REVIEWER_RECHECK", "ESCALATE_OR_STOP"] as const;
export type TriageCategory = typeof TRIAGE_CATEGORIES[number];
export interface ShadowContextInput extends PlanningDecisionInput {
  /** Optional same-Scope history. Legacy callers may provide only a previous Review. */
  readonly previousPlan?: PlanDraft;
}
export interface ShadowFinding {
  readonly id: string;
  readonly origin: "review" | "storage" | "quality" | "assurance" | "suggestion";
  readonly description: string;
  readonly technicalBlocker: boolean;
}
export interface ShadowContext {
  readonly schemaVersion: 1;
  readonly kind: "supervisor_triage_shadow";
  readonly source: {
    readonly projectId: string; readonly planId: string; readonly planVersion: number;
    readonly scopeContractId: string; readonly scopeVersion: number; readonly reviewId: string;
    readonly inputSha256: string;
  };
  readonly baseline: PlanningDecision;
  readonly findings: readonly ShadowFinding[];
  /** Exact input excerpts. The context digest binds every reference to its source snapshot. */
  readonly references: Readonly<Record<string, string>>;
  readonly contextSha256: string;
}
export interface ShadowProposal {
  readonly schemaVersion: 1;
  readonly contextSha256: string;
  readonly author: { readonly kind: "manual_fixture"; readonly version: string };
  readonly findings: readonly {
    readonly findingId: string; readonly category: TriageCategory;
    readonly rationale: string; readonly proposedAction: string; readonly evidenceRefs: readonly string[];
  }[];
  readonly summaryForUser: string;
}
export interface ShadowValidation {
  readonly status: "structurally_valid_for_manual_inspection" | "rejected";
  readonly errors: readonly string[];
  readonly baseline: PlanningDecision;
  readonly proposalSha256: string;
  readonly semanticCorrectness: "not_evaluated";
  readonly executed: false;
  readonly newModelCalls: 0;
}
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Offline only: no Controller, store, SDK or execution port. Approval is an input precondition, not inferred here. */
export function buildShadowContext(input: ShadowContextInput, userRequest?: string): ShadowContext {
  const { currentPlan: plan, approvedScope: scope, review } = input;
  parseScopeContract(scope, scope.projectId);
  validatePlanReview(review, plan, scope);
  if (input.previousReview) {
    const r = parsePlanReview(input.previousReview);
    if (r.projectId !== plan.projectId || r.planId !== plan.id || r.planVersion >= plan.version || r.planVersion < 1) throw new Error("Invalid shadow previous-review source.");
  }
  if (input.previousPlan) {
    const p = input.previousPlan;
    if (!input.previousReview || p.projectId !== plan.projectId || p.id !== plan.id || p.version !== plan.version - 1 ||
      !p.content.trim() || p.scopeContractId !== scope.id || p.scopeVersion !== scope.version) throw new Error("Invalid shadow previous-plan source.");
    validatePlanReview(input.previousReview, p, scope);
  }
  if (!Number.isSafeInteger(input.iterationCount) || !Number.isSafeInteger(input.maxIterations) || input.iterationCount < 0 || input.maxIterations < 1 || input.iterationCount > input.maxIterations) throw new Error("Invalid shadow iteration limits.");
  if (userRequest !== undefined && !userRequest.trim()) throw new Error("Empty shadow user request.");
  const baseline = decideAfterReview(input), findings: ShadowFinding[] = [];
  const references: Record<string, string> = Object.create(null) as Record<string, string>;
  plan.content.split("\n").forEach((line, i) => { references[`plan:L${i + 1}`] = line; });
  for (const r of scope.requiredFeatures) references[`scope:requirement:${r.id}`] = r.statement;
  scope.technicalConstraints.forEach((s, i) => { references[`scope:constraint:${i + 1}`] = s; });
  scope.excludedFeatures.forEach((r, i) => { references[`scope:excluded:${i + 1}`] = r.statement; });
  references["scope:goal"] = scope.goal;
  references["policy:baseline"] = JSON.stringify(baseline);
  references["iteration:state"] = JSON.stringify({ iterationCount: input.iterationCount, maxIterations: input.maxIterations });
  references["history:availability"] = input.previousPlan ? "previous_plan_and_review" : input.previousReview ? "previous_review_only" : "none";
  if (input.previousReview) {
    references["previous-review:source"] = JSON.stringify({ id: input.previousReview.id, planId: input.previousReview.planId, planVersion: input.previousReview.planVersion });
    for (const i of input.previousReview.issues) references[`previous-review:issue:${i.id}`] = `${i.description} — ${i.suggestedDirection}`;
  }
  if (input.previousPlan) input.previousPlan.content.split("\n").forEach((line, i) => { references[`previous-plan:L${i + 1}`] = line; });
  if (userRequest !== undefined) references["user:request"] = userRequest;
  const add = (origin: ShadowFinding["origin"], key: string, description: string, technicalBlocker: boolean): void => {
    const id = `${origin}:${key}`;
    if (findings.some(f => f.id === id)) throw new Error("Duplicate shadow finding source.");
    findings.push({ id, origin, description, technicalBlocker }); references[`finding:${id}`] = description;
  };
  for (const i of review.issues) add("review", i.id, `${i.description} — ${i.suggestedDirection}`,
    i.kind === "scope_violation"
      ? i.scopeDisposition === "revise_plan"
      : (i.severity === "major" || i.severity === "critical"));
  if (review.scopeViolation && !review.issues.some(i => i.kind === "scope_violation")) {
    let key = "scope-violation-flag";
    while (findings.some(f => f.id === `review:${key}`)) key += "-flag";
    add("review", key, "Reviewer flagged a scope violation but did not provide a structured scope issue.", false);
  }
  const storage = storageAuditFindings(review.storageAudit);
  for (const i of storage.issues) add("storage", i.id, `${i.description} — ${i.suggestedDirection}`, i.severity === "major" || i.severity === "critical");
  storage.questions.forEach((s, i) => add("storage", `question-${i + 1}`, s, false));
  qualityFindings(review).forEach((f, i) => add("quality", String(i + 1), f.message, f.status === "missing"));
  reviewAssuranceFindings(review).forEach((f, i) => add("assurance", String(i + 1), f.message, true));
  review.suggestions.forEach((s, i) => add("suggestion", String(i + 1), s, false));
  const body = { schemaVersion: 1 as const, kind: "supervisor_triage_shadow" as const, source: {
    projectId: plan.projectId, planId: plan.id, planVersion: plan.version, scopeContractId: scope.id, scopeVersion: scope.version,
    reviewId: review.id, inputSha256: hash({ input, userRequest: userRequest ?? null }) }, baseline, findings, references };
  return { ...body, contextSha256: hash(body) };
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const exact = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));

/** Valid references do not establish relevance or semantic correctness. This never maps a proposal to an executable decision. */
export function validateShadowProposal(context: ShadowContext, raw: unknown): ShadowValidation {
  const { contextSha256, ...body } = context;
  if (hash(body) !== contextSha256) throw new Error("Shadow context digest mismatch.");
  const errors: string[] = [];
  if (!object(raw) || !exact(raw, ["schemaVersion", "contextSha256", "author", "findings", "summaryForUser"]) || raw.schemaVersion !== 1 ||
    !text(raw.summaryForUser) || !object(raw.author) || !exact(raw.author, ["kind", "version"]) || raw.author.kind !== "manual_fixture" || !text(raw.author.version) || !Array.isArray(raw.findings)) errors.push("INVALID_STRUCTURE");
  else {
    if (raw.contextSha256 !== context.contextSha256) errors.push("SOURCE_MISMATCH");
    const seen = new Set<string>();
    for (const row of raw.findings) {
      if (!object(row) || !exact(row, ["findingId", "category", "rationale", "proposedAction", "evidenceRefs"]) || !text(row.findingId) || !text(row.rationale) || !text(row.proposedAction) ||
        !TRIAGE_CATEGORIES.includes(row.category as TriageCategory) || !Array.isArray(row.evidenceRefs) || !row.evidenceRefs.length || row.evidenceRefs.length > 8 || row.evidenceRefs.some(r => !text(r))) { errors.push("INVALID_FINDING"); continue; }
      if (seen.has(row.findingId)) errors.push(`DUPLICATE_FINDING:${row.findingId}`);
      seen.add(row.findingId);
      const finding = context.findings.find(f => f.id === row.findingId);
      if (!finding) { errors.push(`UNKNOWN_FINDING:${row.findingId}`); continue; }
      const refs = row.evidenceRefs as string[];
      if (new Set(refs).size !== refs.length || refs.some(r => !Object.hasOwn(context.references, r))) errors.push(`INVALID_REFERENCE:${row.findingId}`);
      if (!refs.includes(`finding:${row.findingId}`)) errors.push(`MISSING_FINDING_REFERENCE:${row.findingId}`);
      if (!refs.some(r => r.startsWith("plan:") || r.startsWith("scope:"))) errors.push(`MISSING_PRIMARY_REFERENCE:${row.findingId}`);
      if (finding.technicalBlocker && (row.category === "USER_CLARIFICATION" || row.category === "SCOPE_CHANGE_REQUIRED")) errors.push(`BLOCKER_DOWNGRADED:${row.findingId}`);
      if (row.category === "SCOPE_CHANGE_REQUIRED" && (!Object.hasOwn(context.references, "user:request") || !refs.includes("user:request"))) errors.push(`USER_REQUEST_REQUIRED:${row.findingId}`);
    }
    for (const f of context.findings) if (!seen.has(f.id)) errors.push(`OMITTED_FINDING:${f.id}`);
  }
  return { status: errors.length ? "rejected" : "structurally_valid_for_manual_inspection", errors, baseline: structuredClone(context.baseline), proposalSha256: hash(raw ?? null), semanticCorrectness: "not_evaluated", executed: false, newModelCalls: 0 };
}
