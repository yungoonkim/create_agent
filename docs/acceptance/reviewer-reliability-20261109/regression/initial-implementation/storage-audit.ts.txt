import { STORAGE_AUDIT_STATES, type PlanDraft, type ReviewIssue, type ScopeContract, type StorageAudit } from "./contracts.js";
import { evidenceFromLines } from "./review-quality.js";

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid storage audit object.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Invalid storage audit text.");
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new Error("Invalid storage audit choice.");
  return value as T;
}
function refs(value: unknown): readonly number[] {
  if (!Array.isArray(value) || value.length > 8 || value.some((n) => !Number.isSafeInteger(n) || n < 1) || new Set(value).size !== value.length) throw new Error("Invalid storage audit evidence references.");
  return value as number[];
}
function evidence(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error("Invalid storage audit evidence.");
  return value.map(text);
}
export function scopeAuthorizationSources(scope: ScopeContract): Readonly<Record<string, string>> {
  return Object.fromEntries([["goal", scope.goal], ...scope.requiredFeatures.map((r) => [`requirement:${r.id}`, r.statement]),
    ...scope.technicalConstraints.map((c, i) => [`constraint:${i + 1}`, c])]);
}
export function bindStorageAudit(raw: unknown, plan: PlanDraft): unknown {
  const audit = object(raw);
  if (!Array.isArray(audit.cases)) throw new Error("Missing storage audit cases.");
  return { ...audit, evidence: evidenceFromLines(audit.evidenceLines, plan), cases: audit.cases.map((rawCase) => {
    const item = object(rawCase);
    return { ...item, evidence: evidenceFromLines(item.evidenceLines, plan) };
  }) };
}
export function parseStorageAudit(raw: unknown): StorageAudit {
  const audit = object(raw);
  if (!Array.isArray(audit.cases)) throw new Error("Missing storage audit cases.");
  const format = choice(audit.format, ["json", "other", "none", "unclear"] as const);
  const cases = audit.cases.map((rawCase): StorageAudit["cases"][number] => {
    const item = object(rawCase);
    if (!Array.isArray(item.authorizationScopeIds) || new Set(item.authorizationScopeIds).size !== item.authorizationScopeIds.length) throw new Error("Invalid storage audit authorization sources.");
    return { state: choice(item.state, STORAGE_AUDIT_STATES),
      action: choice(item.action, ["initialize", "load", "preserve_and_block", "reset_or_overwrite", "unspecified"] as const),
      verdict: choice(item.verdict, ["consistent", "unsafe", "needs_user_input"] as const),
      evidenceLines: refs(item.evidenceLines), evidence: evidence(item.evidence),
      authorizationScopeIds: item.authorizationScopeIds.map(text), rationale: text(item.rationale) };
  });
  if (format === "json" ? cases.length !== STORAGE_AUDIT_STATES.length || new Set(cases.map((c) => c.state)).size !== cases.length : cases.length !== 0) {
    throw new Error("JSON storage audit needs each input state exactly once; non-JSON formats use an empty case table.");
  }
  return { format, evidenceLines: refs(audit.evidenceLines), evidence: evidence(audit.evidence), rationale: text(audit.rationale), cases };
}
export function validateStorageAudit(audit: StorageAudit, plan: PlanDraft, scope: ScopeContract): void {
  const sources = scopeAuthorizationSources(scope);
  for (const row of [audit, ...audit.cases]) {
    const exact = evidenceFromLines(row.evidenceLines, plan);
    if (JSON.stringify(exact) !== JSON.stringify(row.evidence)) throw new Error("Storage audit evidence differs from current Plan lines.");
  }
  if ((audit.format === "json" || audit.format === "other") && audit.evidence.length === 0) throw new Error("Declared storage format needs Plan evidence.");
  for (const row of audit.cases) {
    if (row.action !== "unspecified" && row.evidence.length === 0) throw new Error("Declared storage action needs Plan evidence.");
    if (row.authorizationScopeIds.some((id) => sources[id] === undefined)) throw new Error("Storage recovery authorization references an unknown approved Scope source.");
  }
}
export function storageAuditFindings(audit: StorageAudit | undefined): { readonly issues: readonly ReviewIssue[]; readonly questions: readonly string[] } {
  const issues: ReviewIssue[] = []; const questions: string[] = [];
  if (audit === undefined) return { issues, questions };
  if (audit.format === "unclear") issues.push({ id: "issue-storage-format", kind: "omission", severity: "major",
    description: `저장 형식과 복구 동작을 검토할 수 없습니다: ${audit.rationale}`, suggestedDirection: "위임된 저장 설계를 기획에서 구체화하고 초기 상태와 손상을 구분하십시오." });
  for (const row of audit.cases) {
    const destructiveWithoutSource = row.state !== "absent" && (row.action === "initialize" || row.action === "reset_or_overwrite") && row.authorizationScopeIds.length === 0;
    if (row.verdict === "unsafe" || row.action === "unspecified" || destructiveWithoutSource) {
      issues.push({ id: `issue-storage-${row.state}`, kind: "implementation_risk", severity: "major",
        description: `${row.state}: ${row.rationale}${destructiveWithoutSource ? " 기존 JSON 값을 초기화/덮어쓰는 복구에 대한 승인 Scope 근거가 없습니다." : ""}`,
        suggestedDirection: "원본 보존·쓰기 차단으로 보완하거나, 명시적으로 허용된 복구 정책의 승인 Scope 근거를 확인하십시오." });
    } else if (row.verdict === "needs_user_input") questions.push(`${row.state}: ${row.rationale}`);
  }
  return { issues, questions };
}
