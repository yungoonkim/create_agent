import { STORAGE_AUDIT_STATES, type PlanDraft, type PlanEvidence, type ReviewIssue, type ScopeContract, type StorageAudit, type StorageValidation } from "./contracts.js";
import { evidenceFromLines, parsePlanEvidence, validatePlanEvidence } from "./review-quality.js";

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
  const validation = audit.validation === undefined ? undefined : object(audit.validation);
  if (validation !== undefined && !Array.isArray(validation.rules)) throw new Error("Missing common validation rules.");
  return { ...audit, evidence: evidenceFromLines(audit.evidenceLines, plan),
    ...(validation === undefined ? {} : { validation: { ...validation,
      ...(validation.acceptanceGroups === undefined ? {} : { acceptanceGroups: (validation.acceptanceGroups as unknown[]).map(value => {
        const g = object(value); const e = object(g.acceptance);
        return { ...g, acceptance: { ...e, evidence: evidenceFromLines(e.evidenceLines, plan) } };
      }) }), rules: (validation.rules as unknown[]).map(value => {
      const r = object(value);
      return { ...r, ...Object.fromEntries(["load", "candidate", "acceptance"].map(key => {
        const e = object(r[key]); return [key, { ...e, evidence: evidenceFromLines(e.evidenceLines, plan) }];
      })) };
    }) } }), cases: audit.cases.map((rawCase) => {
    const item = object(rawCase);
    const trigger = item.trigger === undefined ? undefined : object(item.trigger);
    return { ...item, evidence: evidenceFromLines(item.evidenceLines, plan),
      ...(trigger === undefined ? {} : { trigger: { ...trigger, evidence: evidenceFromLines(trigger.evidenceLines, plan) } }) };
  }) };
}
function parseValidation(raw: unknown): StorageValidation {
  const v = object(raw);
  if (!Array.isArray(v.rules) || v.rules.length > 16) throw new Error("Invalid common validation rule list.");
  const rules = v.rules.map(value => {
    const r = object(value);
    return { rule: text(r.rule), status: choice(r.status, ["supported", "missing", "unclear"] as const),
      load: parsePlanEvidence(r.load), candidate: parsePlanEvidence(r.candidate), acceptance: parsePlanEvidence(r.acceptance), rationale: text(r.rationale) };
  });
  if (new Set(rules.map(r => r.rule)).size !== rules.length) throw new Error("Duplicate common validation rules.");
  if (v.version !== undefined && v.version !== 2) throw new Error("Unsupported storage validation version.");
  if (v.acceptanceGroups !== undefined && (v.version !== 2 || !Array.isArray(v.acceptanceGroups) || v.acceptanceGroups.length > 16)) throw new Error("Invalid grouped acceptance evidence.");
  const groups = (v.acceptanceGroups as unknown[] | undefined)?.map(value => {
    const g = object(value);
    if (!Array.isArray(g.ruleIndexes) || !g.ruleIndexes.length || new Set(g.ruleIndexes).size !== g.ruleIndexes.length ||
      g.ruleIndexes.some(n => !Number.isSafeInteger(n) || n < 1 || n > rules.length)) throw new Error("Invalid acceptance group rule indexes.");
    return { ruleIndexes: g.ruleIndexes as number[], acceptance: parsePlanEvidence(g.acceptance), rationale: text(g.rationale) };
  });
  return { rationale: text(v.rationale), rules, ...(v.version === 2 ? { version: 2 as const } : {}),
    ...(groups === undefined ? {} : { acceptanceGroups: groups }) };
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
      authorizationScopeIds: item.authorizationScopeIds.map(text), rationale: text(item.rationale),
      ...(item.trigger === undefined ? {} : { trigger: parsePlanEvidence(item.trigger) }) };
  });
  if (format === "json" ? cases.length !== STORAGE_AUDIT_STATES.length || new Set(cases.map((c) => c.state)).size !== cases.length : cases.length !== 0) {
    throw new Error("JSON storage audit needs each input state exactly once; non-JSON formats use an empty case table.");
  }
  const validation = audit.validation === undefined ? undefined : parseValidation(audit.validation);
  if (format !== "json" && validation?.rules.length) throw new Error("Non-JSON audit cannot invent JSON validation rules.");
  return { format, evidenceLines: refs(audit.evidenceLines), evidence: evidence(audit.evidence), rationale: text(audit.rationale), cases,
    ...(validation === undefined ? {} : { validation }) };
}
export function validateStorageAudit(audit: StorageAudit, plan: PlanDraft, scope: ScopeContract): void {
  const sources = scopeAuthorizationSources(scope);
  for (const row of [audit, ...audit.cases]) {
    const exact = evidenceFromLines(row.evidenceLines, plan);
    if (JSON.stringify(exact) !== JSON.stringify(row.evidence)) throw new Error("Storage audit evidence differs from current Plan lines.");
  }
  if ((audit.format === "json" || audit.format === "other") && audit.evidence.length === 0) throw new Error("Declared storage format needs Plan evidence.");
  for (const row of audit.cases) {
    if (row.trigger !== undefined) validatePlanEvidence(row.trigger, plan);
    if (row.action !== "unspecified" && row.evidence.length === 0) throw new Error("Declared storage action needs Plan evidence.");
    if (row.authorizationScopeIds.some((id) => sources[id] === undefined)) throw new Error("Storage recovery authorization references an unknown approved Scope source.");
  }
  for (const r of audit.validation?.rules ?? []) for (const e of [r.load, r.candidate, r.acceptance]) validatePlanEvidence(e, plan);
  for (const g of audit.validation?.acceptanceGroups ?? []) validatePlanEvidence(g.acceptance, plan);
}
export interface StorageRuleCheck {
  readonly ruleIndex: number;
  readonly rule: string;
  readonly modelStatus: StorageValidation["rules"][number]["status"];
  readonly blocked: boolean;
  readonly modelConflict: boolean;
  readonly problems: readonly string[];
  readonly acceptanceSources: readonly { readonly label: string; readonly proof: PlanEvidence; readonly rationale: string }[];
}
/** Shared by policy and rendering: source presence is structural evidence, never semantic certification. */
export function storageValidationChecks(validation: StorageValidation): readonly StorageRuleCheck[] {
  const present = (proof: PlanEvidence): boolean => proof.evidence.length > 0 && !onlyHeadings(proof.evidence);
  return validation.rules.map((r, index) => {
    const acceptanceSources: { label: string; proof: PlanEvidence; rationale: string }[] = [];
    if (present(r.acceptance)) acceptanceSources.push({ label: "개별 확인 사례", proof: r.acceptance, rationale: r.rationale });
    if (validation.version === 2) validation.acceptanceGroups?.forEach((group, groupIndex) => {
      if (group.ruleIndexes.includes(index + 1) && present(group.acceptance)) acceptanceSources.push({
        label: `공유 사례 ${groupIndex + 1}`, proof: group.acceptance, rationale: group.rationale,
      });
    });
    const gaps = [!present(r.load) ? "불러오기 검증 근거 없음" : "", !present(r.candidate) ? "저장 후보 검증 근거 없음" : "",
      !acceptanceSources.length ? "개별·공유 확인 사례에 이 규칙을 뒷받침하는 연결 근거 없음" : ""].filter(Boolean);
    const problems = [...(r.status !== "supported" ? ["모델이 누락 또는 불명확으로 판단함"] : []), ...gaps];
    return { ruleIndex: index + 1, rule: r.rule, modelStatus: r.status, blocked: problems.length > 0,
      modelConflict: r.status === "supported" && gaps.length > 0, problems, acceptanceSources };
  });
}
export function storageAuditFindings(audit: StorageAudit | undefined): { readonly issues: readonly ReviewIssue[]; readonly questions: readonly string[] } {
  const issues: ReviewIssue[] = []; const questions: string[] = [];
  if (audit === undefined) return { issues, questions };
  if (audit.format === "unclear") issues.push({ id: "issue-storage-format", kind: "omission", severity: "major",
    description: `저장 형식과 복구 동작을 검토할 수 없습니다: ${audit.rationale}`, suggestedDirection: "위임된 저장 설계를 기획에서 구체화하고 초기 상태와 손상을 구분하십시오." });
  for (const row of audit.cases) {
    const destructiveWithoutSource = row.state !== "absent" && (row.action === "initialize" || row.action === "reset_or_overwrite") && row.authorizationScopeIds.length === 0;
    const triggerGap = row.trigger !== undefined && (row.trigger.evidence.length === 0 ||
      row.state === "read_error" && !hasExplicitReadFailure(row.trigger.evidence) ||
      row.state === "valid" && audit.validation !== undefined && !audit.validation.rules.some(r =>
        r.load.evidenceLines.some(n => row.trigger!.evidenceLines.includes(n))));
    if (row.verdict === "unsafe" || row.action === "unspecified" || destructiveWithoutSource || triggerGap) {
      issues.push({ id: `issue-storage-${row.state}`, kind: "implementation_risk", severity: "major",
        description: `${row.state}: ${row.rationale}${destructiveWithoutSource ? " 기존 JSON 값을 초기화/덮어쓰는 복구에 대한 승인 Scope 근거가 없습니다." : ""}${triggerGap ? " 해당 상황 자체의 조건 근거가 불충분합니다. 읽기 예외 및 유효값 검증 조건을 실제 원문과 연결하십시오." : ""}`,
        suggestedDirection: row.state === "valid" ? "필드·값 공통 검증 통과 조건과 로드 동작의 원문 근거를 연결하십시오."
          : "원본 보존·쓰기 차단으로 보완하거나, 명시적으로 허용된 복구 정책의 승인 Scope 근거를 확인하십시오." });
    } else if (row.verdict === "needs_user_input") questions.push(`${row.state}: ${row.rationale}`);
  }
  if (audit.format === "json" && audit.validation !== undefined) {
    if (!audit.validation.rules.length) issues.push({ id: "issue-storage-validation-empty", kind: "omission", severity: "major",
      description: "저장값과 변경 후보에 적용하는 공통 필드·값 검증 근거가 없습니다.", suggestedDirection: "위임된 저장 설계를 구체화하고 로드/후보에 같은 규칙과 잘못된 값 확인 사례를 명시하십시오." });
    storageValidationChecks(audit.validation).forEach(check => {
      const r = audit.validation!.rules[check.ruleIndex - 1]!;
      if (check.blocked) issues.push({
        id: `issue-storage-validation-${check.ruleIndex}`, kind: "omission", severity: "major",
        // Immutable legacy trials retain their exact feedback text for replay/source binding.
        description: `공통 검증 ${r.rule}: ${audit.validation!.version === 2 ? `${check.problems.join("; ")}${check.modelConflict ? " (모델의 supported 주장과 근거가 일치하지 않음)" : ""}. 모델 설명: ` : ""}${r.rationale}`,
        suggestedDirection: "불러오기와 저장 후보 모두의 실제 검증 규칙 및 구체적인 잘못된 저장값/입력의 예상 결과를 보완하십시오." });
    });
  }
  return { issues, questions };
}

/** Structural check only: headings are labels, not evidence of behavior. No semantic verdict is inferred. */
export function onlyHeadings(quotes: readonly string[]): boolean {
  return quotes.length > 0 && quotes.every(q => /^\s{0,3}#{1,6}\s/.test(q));
}

/** Conservative evidence gate, not semantic certification. Unrecognized phrasing stays unconfirmed. */
export function hasExplicitReadFailure(quotes: readonly string[]): boolean {
  return quotes.some(quote => {
    const read = /getItem|readFile|읽기\s*(?:작업|자체|도중|중)|읽(?:을|지)\s*(?:수\s*)?없|read\s*(?:operation|access|error|failure|exception)/i.test(quote);
    const failure = /SecurityError|EACCES|ENOENT|예외|접근\s*(?:거부|오류|차단)|권한\s*(?:거부|오류)|읽기\s*(?:실패|오류)|실패|throw|exception|denied|fail|error/i.test(quote);
    return read && failure && !/예외.*(?:다루지|처리하지|고려하지|없다)|does\s+not\s+(?:handle|cover)/i.test(quote);
  });
}
