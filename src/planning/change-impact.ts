import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { PlanDraft, PlanEvidence, PlanReview, ScopeContract, StorageValidation } from "./contracts.js";
import { parseScopeContract } from "./config.js";
import { validatePlanReview } from "./policy.js";
import { validateRevisionSource, reviewAssuranceFindings } from "./revision-audit.js";
import { qualityFindings } from "./review-quality.js";
import { storageAuditFindings, storageValidationChecks } from "./storage-audit.js";

export interface ChangedLineRange { readonly firstLine: number; readonly lastLine: number; readonly text: string }
export interface PlanTextChange {
  readonly id: string;
  readonly before: ChangedLineRange | null;
  readonly after: ChangedLineRange | null;
}
export interface ImpactAnchor { readonly role: string; readonly proof: PlanEvidence }
export interface ChangeImpactRow {
  readonly sourceId: string;
  readonly category: "requirement" | "constraint" | "acceptance" | "storage_rule";
  readonly label: string;
  readonly before: readonly ImpactAnchor[];
  readonly after: readonly ImpactAnchor[];
  readonly changeIds: readonly string[];
  readonly status: "candidate" | "no_cited_change" | "unassessed";
  readonly modelAssessment: string | null;
  readonly localWarning: string | null;
  readonly check: string;
}
export interface ChangeImpactTable {
  readonly schemaVersion: 1;
  readonly kind: "planning_change_impact";
  readonly mode: "initial" | "baseline_missing" | "same_scope" | "scope_changed";
  readonly source: {
    readonly projectId: string; readonly planId: string; readonly currentPlanVersion: number;
    readonly currentPlanSha256: string; readonly previousPlanVersion: number | null; readonly previousPlanSha256: string | null;
    readonly currentScopeSha256: string; readonly previousScopeSha256: string | null;
    readonly currentScopeId: string; readonly currentScopeVersion: number; readonly previousScopeId: string | null; readonly previousScopeVersion: number | null;
    readonly currentReviewSha256: string | null; readonly previousReviewSha256: string | null;
  };
  readonly diffMethod: "exact_lcs" | "coarse_window" | "not_compared";
  readonly changes: readonly PlanTextChange[];
  readonly rows: readonly ChangeImpactRow[];
  readonly unmappedChangeIds: readonly string[];
  readonly unmappedChanges: readonly { readonly changeId: string; readonly beforeLines: readonly number[]; readonly afterLines: readonly number[] }[];
  readonly blockers: readonly { readonly id: string; readonly description: string }[];
  readonly warnings: readonly string[];
  readonly effectsOnPolicy: "none";
  readonly implementationVerification: "not_performed";
}
export interface ChangeImpactInput {
  readonly plan: PlanDraft; readonly scope: ScopeContract; readonly review?: PlanReview;
  readonly previousPlan?: PlanDraft; readonly previousScope?: ScopeContract; readonly previousReview?: PlanReview;
}
export class ChangeImpactSourceError extends Error {
  constructor(message: string) { super(message); this.name = "ChangeImpactSourceError"; }
}
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bodyHash = (value: string): string => createHash("sha256").update(value).digest("hex");
const range = (lines: readonly string[], first: number, end: number): ChangedLineRange | null =>
  first === end ? null : { firstLine: first + 1, lastLine: end, text: lines.slice(first, end).join("\n") };

/** Literal line edits only. Coarse fallback retains the whole changed window instead of truncating it. */
export function diffPlanText(before: string, after: string): { method: "exact_lcs" | "coarse_window"; changes: readonly PlanTextChange[] } {
  if (before === after) return { method: "exact_lcs", changes: [] };
  const a = before.split("\n"), b = after.split("\n");
  const changes: PlanTextChange[] = [];
  const add = (i: number, endI: number, j: number, endJ: number): void => {
    changes.push({ id: `change-${String(changes.length + 1).padStart(3, "0")}`, before: range(a, i, endI), after: range(b, j, endJ) });
  };
  if ((a.length + 1) * (b.length + 1) > 1_000_000) {
    let start = 0, endI = a.length, endJ = b.length;
    while (start < endI && start < endJ && a[start] === b[start]) start++;
    while (endI > start && endJ > start && a[endI - 1] === b[endJ - 1]) { endI--; endJ--; }
    add(start, endI, start, endJ); return { method: "coarse_window", changes };
  }
  const stride = b.length + 1, dp = new Uint32Array((a.length + 1) * stride);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    dp[i * stride + j] = a[i] === b[j] ? 1 + dp[(i + 1) * stride + j + 1]! : Math.max(dp[(i + 1) * stride + j]!, dp[i * stride + j + 1]!);
  }
  let i = 0, j = 0, firstI = 0, firstJ = 0, pending = false;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      if (pending) { add(firstI, i, firstJ, j); pending = false; } i++; j++;
    } else {
      if (!pending) { firstI = i; firstJ = j; pending = true; }
      if (i < a.length && (j === b.length || dp[(i + 1) * stride + j]! >= dp[i * stride + j + 1]!)) i++; else j++;
    }
  }
  if (pending) add(firstI, i, firstJ, j);
  return { method: "exact_lcs", changes };
}
function validatePlan(plan: PlanDraft, scope: ScopeContract): void {
  parseScopeContract(scope, scope.projectId);
  if (plan.projectId !== scope.projectId || plan.scopeContractId !== scope.id || plan.scopeVersion !== scope.version ||
    !Number.isSafeInteger(plan.version) || plan.version < 1 || !plan.id.trim() || !plan.content.trim()) throw new ChangeImpactSourceError("기획과 Scope의 출처·버전이 일치하지 않습니다.");
}
function checkedReview(review: PlanReview | undefined, plan: PlanDraft, scope: ScopeContract): PlanReview | undefined {
  if (!review) return undefined;
  try { return validatePlanReview(review, plan, scope); }
  catch { throw new ChangeImpactSourceError("검토의 버전 또는 인용 근거가 비교 대상 기획과 일치하지 않습니다."); }
}
const anchor = (role: string, proof: PlanEvidence | undefined): ImpactAnchor[] => proof?.evidenceLines.length ? [{ role, proof }] : [];
function ruleAnchors(v: StorageValidation | undefined, name: string): ImpactAnchor[] {
  const index = v?.rules.findIndex(r => r.rule === name) ?? -1;
  if (!v || index < 0) return [];
  const r = v.rules[index]!;
  return [...anchor("불러오기", r.load), ...anchor("저장 후보", r.candidate), ...anchor("개별 확인 사례", r.acceptance),
    ...(v.version === 2 ? v.acceptanceGroups?.flatMap((g, i) => g.ruleIndexes.includes(index + 1) ? anchor(`공유 사례 ${i + 1}`, g.acceptance) : []) ?? [] : [])];
}
function touches(proofs: readonly ImpactAnchor[], part: ChangedLineRange | null): boolean {
  return part !== null && proofs.some(a => a.proof.evidenceLines.some(n => n >= part.firstLine && n <= part.lastLine));
}

/** Source-bound impact candidates. No causal inference, model call, approval or mutation is performed. */
export function buildChangeImpactTable(input: ChangeImpactInput): ChangeImpactTable {
  const { plan, scope, previousPlan, previousScope } = input;
  validatePlan(plan, scope);
  const review = checkedReview(input.review, plan, scope);
  if (!previousPlan && (previousScope || input.previousReview)) throw new ChangeImpactSourceError("이전 기획 없이 이전 Scope나 검토를 연결할 수 없습니다.");
  let previous: PlanReview | undefined;
  if (previousPlan) {
    if (!previousScope) throw new ChangeImpactSourceError("이전 Scope 스냅샷이 없어 비교 출처를 확인할 수 없습니다.");
    validatePlan(previousPlan, previousScope);
    if (previousPlan.projectId !== plan.projectId || previousPlan.id !== plan.id || previousPlan.version !== plan.version - 1) throw new ChangeImpactSourceError("비교 기준은 같은 프로젝트·기획의 직전 버전이어야 합니다.");
    if (previousScope.id === scope.id && previousScope.version === scope.version && !isDeepStrictEqual(previousScope, scope)) throw new ChangeImpactSourceError("같은 Scope 버전의 스냅샷 내용이 다릅니다.");
    previous = checkedReview(input.previousReview, previousPlan, previousScope);
    if (review?.revisionAudit) {
      const b = review.revisionAudit.baseline;
      if (!b || b.planId !== previousPlan.id || b.planVersion !== previousPlan.version || b.scopeContractId !== previousPlan.scopeContractId ||
        b.scopeVersion !== previousPlan.scopeVersion || b.content !== previousPlan.content || b.contentSha256 !== bodyHash(previousPlan.content)) throw new ChangeImpactSourceError("수정 검토의 기준 원문이 실제 직전 기획과 다릅니다.");
      if (previous) try { validateRevisionSource(review.revisionAudit, previousPlan, previous); }
      catch { throw new ChangeImpactSourceError("수정 검토가 실제 이전 검토의 지적과 일치하지 않습니다."); }
    }
  }
  const mode: ChangeImpactTable["mode"] = !previousPlan ? plan.version === 1 ? "initial" : "baseline_missing" :
    previousPlan.scopeContractId === plan.scopeContractId && previousPlan.scopeVersion === plan.scopeVersion ? "same_scope" : "scope_changed";
  const warnings = ["원문의 문자 변경과 검토 인용의 연결만 보여주는 영향 후보입니다. 실제 기능 변경·의미 동등성·안전성·제품 구현을 증명하지 않습니다.",
    "인용 범위에서 변경이 보이지 않아도 영향이 없다는 뜻은 아닙니다. 표 밖의 간접 영향은 별도로 확인해야 합니다."];
  if (!review || !previous) warnings.push("현재 또는 이전 검토가 없어 일부 영향 연결이 미평가 상태입니다. 누락된 근거를 추정하지 않았습니다.");
  if (mode === "initial") warnings.push("첫 기획이므로 수정 전후 비교 대상이 없습니다.");
  if (mode === "baseline_missing") warnings.push("직전 기획 스냅샷이 없어 변경이나 영향 범위를 비교하지 못했습니다.");
  if (mode === "scope_changed") warnings.push("서로 다른 Scope 사이의 파급 관계는 자동 연결하지 않았습니다. Scope 변경 승인과 영향 검토는 별도입니다.");
  const diff = previousPlan ? diffPlanText(previousPlan.content, plan.content) : undefined;
  if (diff?.method === "coarse_window") warnings.push("큰 문서의 비교는 변경된 전체 구간을 보수적으로 표시합니다. 해당 구간에 변화 없는 줄도 포함될 수 있습니다.");
  const changes = diff?.changes ?? [], rows: ChangeImpactRow[] = [];
  const add = (sourceId: string, category: ChangeImpactRow["category"], label: string, before: ImpactAnchor[], after: ImpactAnchor[], modelAssessment: string | null, localWarning: string | null, check: string): void => {
    const changeIds = changes.filter(c => touches(before, c.before) || touches(after, c.after)).map(c => c.id);
    rows.push({ sourceId, category, label, before, after, changeIds, status: changeIds.length ? "candidate" : before.length && after.length ? "no_cited_change" : "unassessed", modelAssessment, localWarning, check });
  };
  if (mode === "same_scope") {
    for (const feature of scope.requiredFeatures) {
      const old = previous?.qualityAssessment?.requirements.find(r => r.requirementId === feature.id);
      const current = review?.qualityAssessment?.requirements.find(r => r.requirementId === feature.id);
      const preservation = review?.revisionAudit?.preservation.find(r => r.sourceId === `requirement:${feature.id}`);
      const behavior = (r: typeof old): ImpactAnchor[] => [...anchor("정상", r?.behaviorEvidence?.normal), ...anchor("실패·무변경", r?.behaviorEvidence?.failure)];
      add(`requirement:${feature.id}`, "requirement", `${feature.id}: ${feature.statement}`,
        [...behavior(old), ...anchor("수정 전 보존 근거", preservation?.before)], [...behavior(current), ...anchor("수정 후 보존 근거", preservation?.after)],
        preservation ? `모델의 보존 판단: ${preservation.status}` : null, null, "변경된 정상·실패 흐름이 승인 조건을 유지하는지 확인");
      add(`acceptance:${feature.id}`, "acceptance", `${feature.id} 확인 사례`, anchor("이전 확인 사례", old?.behaviorEvidence?.acceptance), anchor("현재 확인 사례", current?.behaviorEvidence?.acceptance),
        current ? `모델의 요구 판단: ${current.status}` : null, null, "사례의 입력·행동·예상 결과가 변경 규칙을 실제로 검증하는지 확인");
    }
    scope.technicalConstraints.forEach((constraint, i) => {
      const id = `constraint:${i + 1}`, p = review?.revisionAudit?.preservation.find(r => r.sourceId === id);
      add(id, "constraint", constraint, anchor("수정 전 제약 근거", p?.before), anchor("수정 후 제약 근거", p?.after),
        p ? `모델의 보존 판단: ${p.status}` : null, null, "원래 제약과 수정 후 한계·예외 동작이 충돌하지 않는지 확인");
    });
    const old = previous?.storageAudit?.validation, current = review?.storageAudit?.validation;
    const checks = current ? storageValidationChecks(current) : [];
    for (const name of new Set([...(old?.rules.map(r => r.rule) ?? []), ...(current?.rules.map(r => r.rule) ?? [])])) {
      const c = checks.find(r => r.rule === name);
      add(`storage-rule:${bodyHash(name).slice(0, 16)}`, "storage_rule", name, ruleAnchors(old, name), ruleAnchors(current, name),
        c ? `모델 판단: ${c.modelStatus}` : "현재 검토에 동일한 규칙명이 없음(동일 의미 여부 미평가)",
        c?.blocked ? c.problems.join("; ") : null, "불러오기·저장 후보의 규칙과 연결된 실패 사례를 재확인");
    }
  }
  const beforeCited = new Set(rows.flatMap(r => r.before.flatMap(a => a.proof.evidenceLines)));
  const afterCited = new Set(rows.flatMap(r => r.after.flatMap(a => a.proof.evidenceLines)));
  const uncited = (part: ChangedLineRange | null, cited: ReadonlySet<number>): number[] => part === null ? [] :
    part.text.split("\n").flatMap((text, i) => text.trim() && !cited.has(part.firstLine + i) ? [part.firstLine + i] : []);
  const unmappedChanges = changes.map(c => ({ changeId: c.id, beforeLines: uncited(c.before, beforeCited), afterLines: uncited(c.after, afterCited) }))
    .filter(c => c.beforeLines.length || c.afterLines.length);
  const blockers = [...(review?.issues ?? []), ...storageAuditFindings(review?.storageAudit).issues].filter(i => i.severity === "major" || i.severity === "critical").map(i => ({ id: i.id, description: i.description }));
  if (review) blockers.push(...[...qualityFindings(review), ...reviewAssuranceFindings(review)].map((f, i) => ({ id: `review-evidence-${i + 1}`, description: f.message })));
  return { schemaVersion: 1, kind: "planning_change_impact", mode, source: { projectId: plan.projectId, planId: plan.id, currentPlanVersion: plan.version,
    currentPlanSha256: hash(plan), previousPlanVersion: previousPlan?.version ?? null, previousPlanSha256: previousPlan ? hash(previousPlan) : null,
    currentScopeSha256: hash(scope), previousScopeSha256: previousScope ? hash(previousScope) : null,
    currentScopeId: scope.id, currentScopeVersion: scope.version, previousScopeId: previousScope?.id ?? null, previousScopeVersion: previousScope?.version ?? null,
    currentReviewSha256: review ? hash(review) : null, previousReviewSha256: previous ? hash(previous) : null },
    diffMethod: diff?.method ?? "not_compared", changes, rows, unmappedChangeIds: unmappedChanges.map(c => c.changeId), unmappedChanges, blockers, warnings,
    effectsOnPolicy: "none", implementationVerification: "not_performed" };
}

const escape = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\`*_[\]|])/g, "\\$1").replace(/\r?\n/g, "<br>");
const refs = (anchors: readonly ImpactAnchor[]): string => anchors.map(a => `${escape(a.role)}: ${a.proof.evidenceLines.map(n => `L${n}`).join(", ")}`).join("<br>") || "연결 근거 없음";
export function renderChangeImpactTable(table: ChangeImpactTable): string {
  const status = { candidate: "변경 연결 있음 · 영향 확인 필요", no_cited_change: "인용 범위 내 변경 미검출 · 영향 없음 판정 아님", unassessed: "근거 없어 미평가" };
  const category = { requirement: "요구사항", constraint: "제약", acceptance: "확인 사례", storage_rule: "저장 규칙" };
  const lines = ["# 기획 변경 영향표", "", `기획: ${escape(table.source.planId)} v${table.source.previousPlanVersion ?? "없음"} → v${table.source.currentPlanVersion}`,
    `Scope: ${escape(table.source.previousScopeId ?? "없음")} v${table.source.previousScopeVersion ?? "—"} → ${escape(table.source.currentScopeId)} v${table.source.currentScopeVersion}`,
    `비교: ${table.mode} / 원문 비교 방식: ${table.diffMethod}`, "", ...table.warnings.map(w => `- ${escape(w)}`), "",
    `원문 변경 ${table.changes.length}개 / 연결하지 못한 변경 ${table.unmappedChangeIds.length}개 / 현재 차단 지적 ${table.blockers.length}개`, "",
    "## 현재 남은 차단 지적", "", ...(table.blockers.length ? table.blockers.map(i => `- ${escape(i.id)}: ${escape(i.description)}`) : ["- 기록된 차단 지적 없음. 합격이나 안전성 인증은 아닙니다."]), "",
    "## 영향 확인 후보", "", "| 영역 | 연결된 조건·규칙 | 변경 원문 | 이전 인용 | 현재 인용 | 근거 연결 판정 | 모델 주장·현재 문제 | 다시 확인할 것 |", "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...table.rows.map(r => `| ${category[r.category]} | ${escape(r.label)} | ${r.changeIds.map(id => `[${id}](#${id})`).join(", ") || "—"} | ${refs(r.before)} | ${refs(r.after)} | ${status[r.status]} | ${escape([r.modelAssessment, r.localWarning].filter(Boolean).join(" / ")) || "—"} | ${escape(r.check)} |`), "",
    "## 전체·부분 미연결 변경 확인", "", "비어 있지 않은 변경 줄 중 인용 연결이 없는 범위입니다. 같은 변경 구간의 일부가 연결돼도 나머지는 표시합니다.", "",
    ...(table.unmappedChanges.length ? table.unmappedChanges.map(c => `- [${c.changeId}](#${c.changeId}): 이전 ${c.beforeLines.map(n => `L${n}`).join(", ") || "—"} / 현재 ${c.afterLines.map(n => `L${n}`).join(", ") || "—"}`) : ["별도 미연결 변경 없음. 표가 모든 간접 영향을 찾았다는 뜻은 아닙니다."]), "",
    "## 변경 원문", ""];
  for (const change of table.changes) {
    lines.push(`### ${change.id}`, "");
    for (const [label, part] of [["이전", change.before], ["현재", change.after]] as const) {
      lines.push(`${label}: ${part ? `L${part.firstLine}–L${part.lastLine}` : "해당 줄 없음"}`, "");
      if (part) lines.push(...part.text.split("\n").map(s => s.length ? `    ${s}` : ""), "");
    }
  }
  return lines.join("\n");
}
