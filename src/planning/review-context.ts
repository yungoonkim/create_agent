import { createHash } from "node:crypto";
import type { PlanReview } from "./contracts.js";
import { revisionIssueSources } from "./revision-audit.js";

export interface CompactReviewContext {
  readonly id: string;
  readonly projectId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly scopeContractId: string;
  readonly scopeVersion: number;
  readonly outcome: PlanReview["outcome"];
  readonly issues: PlanReview["issues"];
  readonly suggestions: readonly string[];
  readonly scopeViolation: boolean;
  readonly userJudgmentRequired: boolean;
  readonly sourceReviewSha256: string;
  readonly requiredCorrections?: Readonly<Record<string, string>>;
}
/** The stored review remains complete. Actual Plan lines and source-bound checks are sent separately. */
export function compactReviewContext(review: PlanReview, includeCorrections = false): CompactReviewContext {
  return { id: review.id, projectId: review.projectId, planId: review.planId, planVersion: review.planVersion,
    scopeContractId: review.scopeContractId, scopeVersion: review.scopeVersion, outcome: review.outcome,
    issues: review.issues, suggestions: review.suggestions, scopeViolation: review.scopeViolation,
    userJudgmentRequired: review.userJudgmentRequired,
    sourceReviewSha256: createHash("sha256").update(JSON.stringify(review)).digest("hex"),
    ...(includeCorrections ? { requiredCorrections: revisionIssueSources(review) } : {}) };
}
