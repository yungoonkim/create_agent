import { REVIEW_CHECK_IDS, type PlanDraft, type PlanReview, type ReviewQualityAssessment,
  type ReviewQualityItem, type ScopeContract, type PlanEvidence, type RequirementBehaviorEvidence } from "./contracts.js";

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid quality assessment object.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Invalid quality assessment text.");
  return value;
}
function item(value: unknown): ReviewQualityItem {
  const row = record(value);
  if (!["satisfied", "missing", "needs_user_input", "not_applicable"].includes(String(row.status))) throw new Error("Invalid quality status.");
  if (!Array.isArray(row.evidence)) throw new Error("Invalid quality evidence list.");
  const evidence = row.evidence.map(text);
  if (row.status === "satisfied" && evidence.length === 0) throw new Error("Satisfied quality item needs Plan evidence.");
  const evidenceLines = row.evidenceLines;
  if (evidenceLines !== undefined && (!Array.isArray(evidenceLines) || evidenceLines.length !== evidence.length ||
      evidenceLines.some((line) => !Number.isSafeInteger(line) || line < 1) || new Set(evidenceLines).size !== evidenceLines.length)) {
    throw new Error("Invalid quality evidence line numbers.");
  }
  return { status: row.status as ReviewQualityItem["status"], evidence, rationale: text(row.rationale),
    ...(evidenceLines === undefined ? {} : { evidenceLines: evidenceLines as number[] }) };
}
export function evidenceFromLines(value: unknown, plan: PlanDraft): readonly string[] {
  if (!Array.isArray(value) || value.length > 8 || new Set(value).size !== value.length) throw new Error("Invalid evidence line references.");
  const lines = plan.content.split("\n");
  return value.map((line: unknown) => {
    if (typeof line !== "number" || !Number.isSafeInteger(line) || line < 1 || line > lines.length) throw new Error("Evidence line is outside the current Plan.");
    return text(lines[line - 1]);
  });
}
/** The model selects source locations; only the adapter supplies literal Plan excerpts. */
export function bindReviewEvidence(raw: unknown, plan: PlanDraft): unknown {
  const quality = record(raw);
  function bind(entries: unknown): unknown[] {
    if (!Array.isArray(entries)) throw new Error("Missing evidence assessment rows.");
    return entries.map((entry: unknown) => {
      const row = record(entry);
      const evidence = evidenceFromLines(row.evidenceLines, plan);
      const behavior = row.behaviorEvidence === undefined ? undefined : record(row.behaviorEvidence);
      return { ...row, evidence, ...(behavior === undefined ? {} : { behaviorEvidence: {
        ...behavior, ...Object.fromEntries(["normal", "failure", "acceptance"].map(key => {
          const source = record(behavior[key]);
          return [key, { ...source, evidence: evidenceFromLines(source.evidenceLines, plan) }];
        })),
      } }) };
    });
  }
  return { ...quality, requirements: bind(quality.requirements), checks: bind(quality.checks) };
}
export function parseReviewQuality(raw: unknown): ReviewQualityAssessment {
  const value = record(raw);
  if (value.version !== 1 || !Array.isArray(value.requirements) || !Array.isArray(value.checks)) throw new Error("Invalid quality assessment version or lists.");
  return { version: 1,
    requirements: value.requirements.map((rawRow) => {
      const row = record(rawRow);
      const parsed = item(row);
      if (parsed.status === "not_applicable") throw new Error("Required Scope features cannot be not_applicable.");
      return { ...parsed, requirementId: text(row.requirementId),
        ...(row.behaviorEvidence === undefined ? {} : { behaviorEvidence: parseBehaviorEvidence(row.behaviorEvidence) }) };
    }),
    checks: value.checks.map((rawRow) => {
      const row = record(rawRow);
      if (!REVIEW_CHECK_IDS.some((id) => id === row.id)) throw new Error("Unknown quality check ID.");
      const parsed = item(row);
      if (parsed.status === "not_applicable" && row.id !== "data_integrity" && row.id !== "revision_resolution") {
        throw new Error("This quality check cannot be not_applicable.");
      }
      return { ...parsed, id: row.id as typeof REVIEW_CHECK_IDS[number] };
    }),
  };
}
const normalized = (value: string): string => value.replace(/\s+/g, " ").trim();

export function parsePlanEvidence(raw: unknown): PlanEvidence {
  const row = record(raw);
  if (!Array.isArray(row.evidenceLines) || !Array.isArray(row.evidence) || row.evidenceLines.length !== row.evidence.length ||
    row.evidenceLines.length > 8 || new Set(row.evidenceLines).size !== row.evidenceLines.length ||
    row.evidenceLines.some(n => !Number.isSafeInteger(n) || n < 1)) throw new Error("Invalid behavioral evidence.");
  return { evidenceLines: row.evidenceLines as number[], evidence: row.evidence.map(text) };
}
function parseBehaviorEvidence(raw: unknown): RequirementBehaviorEvidence {
  const row = record(raw);
  if (typeof row.failureNotApplicableReason !== "string") throw new Error("Invalid failure applicability rationale.");
  const result = { normal: parsePlanEvidence(row.normal), failure: parsePlanEvidence(row.failure),
    acceptance: parsePlanEvidence(row.acceptance), failureNotApplicableReason: row.failureNotApplicableReason };
  if (result.failure.evidenceLines.length > 0 && result.failureNotApplicableReason.trim()) throw new Error("Failure evidence cannot also be not applicable.");
  return result;
}
export function validatePlanEvidence(value: PlanEvidence, plan: PlanDraft): void {
  if (JSON.stringify(evidenceFromLines(value.evidenceLines, plan)) !== JSON.stringify(value.evidence)) throw new Error("Evidence differs from current Plan lines.");
}

/** Checks coverage and literal evidence existence, never the semantic truth of the assessment. */
export function validateReviewQuality(quality: ReviewQualityAssessment, plan: PlanDraft, scope: ScopeContract): void {
  const expected = scope.requiredFeatures.map((feature) => feature.id);
  const actual = quality.requirements.map((entry) => entry.requirementId);
  if (actual.length !== expected.length || new Set(actual).size !== actual.length || actual.some((id) => !expected.includes(id))) {
    throw new Error("Quality assessment must cover every required Scope ID exactly once.");
  }
  const checks = quality.checks.map((entry) => entry.id);
  if (checks.length !== REVIEW_CHECK_IDS.length || new Set(checks).size !== checks.length) throw new Error("Quality assessment must cover every mandatory check exactly once.");
  const content = normalized(plan.content);
  for (const entry of [...quality.requirements, ...quality.checks]) {
    for (const quote of entry.evidence) if (!content.includes(normalized(quote))) throw new Error("Quality evidence is not present in the current Plan.");
    if (entry.evidenceLines !== undefined) {
      const lines = plan.content.split("\n");
      entry.evidenceLines.forEach((line, index) => {
        if (normalized(lines[line - 1] ?? "") !== normalized(entry.evidence[index]!)) throw new Error("Quality evidence does not match its Plan line.");
      });
    }
  }
  for (const entry of quality.requirements) if (entry.behaviorEvidence !== undefined) {
    for (const part of [entry.behaviorEvidence.normal, entry.behaviorEvidence.failure, entry.behaviorEvidence.acceptance]) validatePlanEvidence(part, plan);
  }
}

export function qualityFindings(review: PlanReview): readonly { readonly status: "missing" | "needs_user_input"; readonly message: string }[] {
  if (review.qualityAssessment === undefined) return [];
  const gaps = review.qualityAssessment.requirements.flatMap(entry => {
    const b = entry.behaviorEvidence;
    return b !== undefined && (b.normal.evidenceLines.length === 0 || b.acceptance.evidenceLines.length === 0 ||
      b.failure.evidenceLines.length === 0 && !b.failureNotApplicableReason.trim())
      ? [{ status: "missing" as const, message: `${entry.requirementId}: 정상 동작·실패 동작·확인 사례의 근거가 불충분하여 확인이 필요합니다. 누락을 보완하거나 중요한 제품 선택만 질문하십시오.` }] : [];
  });
  return [...gaps, ...[...review.qualityAssessment.requirements.map((entry) => ({ ...entry, key: entry.requirementId })),
    ...review.qualityAssessment.checks.map((entry) => ({ ...entry, key: entry.id }))]
    .flatMap((entry) => entry.status === "missing" || entry.status === "needs_user_input"
      ? [{ status: entry.status, message: `${entry.key}: ${entry.rationale}` }] : [])];
}
