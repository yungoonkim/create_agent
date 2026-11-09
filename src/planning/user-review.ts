import { createHash } from "node:crypto";
import type { ApprovalRecord } from "../core/types.js";
import type { PlanDraft, PlanReview, PlanningLoopState, PlanningErrorRecord, PlanEvidence, ScopeContract } from "./contracts.js";
import { validatePlanReview } from "./policy.js";
import { qualityFindings } from "./review-quality.js";
import { storageAuditFindings } from "./storage-audit.js";

export type UserReviewStatus = "reflected" | "missing" | "conflicting" | "needs_check";
export const USER_REVIEW_LABELS: Readonly<Record<UserReviewStatus, string>> = {
  reflected: "반영됨", missing: "누락", conflicting: "서로 모순됨", needs_check: "확인 필요",
};
export interface UserReviewRow {
  readonly requirementId: string;
  readonly approvedCondition: string;
  readonly status: UserReviewStatus;
  readonly normal: PlanEvidence;
  readonly failure: PlanEvidence;
  readonly acceptance: PlanEvidence;
  readonly failureNotApplicableReason: string;
  readonly reason: string;
  readonly issues: readonly string[];
}
export interface UserReviewTable {
  readonly schemaVersion: 1;
  readonly kind: "planning_document_review";
  readonly source: { readonly projectId: string; readonly scopeId: string; readonly scopeVersion: number; readonly scopeSha256: string;
    readonly planId: string; readonly planVersion: number; readonly planSha256: string; readonly reviewSha256: string | null };
  readonly planningStatus: PlanningLoopState["status"] | "unknown";
  readonly scopeApproval: "approved" | "fixture" | "unconfirmed";
  readonly finalPlanApproval: "approved" | "pending" | "unconfirmed";
  readonly implementationVerification: "not_performed";
  readonly evidenceAuthority: "model_reported_source_references";
  readonly rows: readonly UserReviewRow[];
  readonly warnings: readonly string[];
  readonly questions: readonly string[];
  readonly suggestions: readonly string[];
  readonly failures: readonly PlanningErrorRecord[];
}
export interface UserReviewInput {
  readonly scope: ScopeContract;
  readonly plan: PlanDraft;
  readonly planning?: PlanningLoopState;
  readonly review?: PlanReview;
  readonly scopeApproval?: ApprovalRecord;
  readonly planApproval?: ApprovalRecord;
  readonly errors?: readonly PlanningErrorRecord[];
  readonly sourceCurrent?: boolean;
}
const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const empty = (): PlanEvidence => ({ evidenceLines: [], evidence: [] });

/** Read-only projection. A model's source-backed assessment is not proof of implementation or semantic truth. */
export function buildUserReviewTable(input: UserReviewInput): UserReviewTable {
  const { scope, plan, planning } = input;
  if (plan.projectId !== scope.projectId || plan.scopeContractId !== scope.id || plan.scopeVersion !== scope.version) throw new Error("User review needs a Plan bound to the supplied Scope.");
  const warnings = ["이 표는 기획 문서의 모델 판단과 원문 근거입니다. 실제 구현·실행 검증은 하지 않았으며 정확성을 보증하지 않습니다."];
  const stateMatches = input.sourceCurrent !== false && planning !== undefined && planning.projectId === plan.projectId && planning.scopeContractId === scope.id &&
    planning.scopeVersion === scope.version && planning.currentPlanVersion === plan.version;
  if (!stateMatches) warnings.push("현재 Planning 상태와 출처를 확인할 수 없어 확정 판단을 표시하지 않습니다.");
  let review: PlanReview | undefined;
  if (input.review !== undefined) {
    try { review = validatePlanReview(input.review, plan, scope); }
    catch { warnings.push("검토 출처/버전/근거가 현재 기획과 맞지 않아 해당 검토를 사용하지 않았습니다."); }
  }
  if (review === undefined) warnings.push("현재 기획의 완료된 검토가 없습니다. 이전 버전의 pass를 재사용하지 않습니다.");
  const findings = review === undefined ? [] : qualityFindings(review);
  const storage = storageAuditFindings(review?.storageAudit);
  warnings.push(...findings.map(f => f.message), ...storage.issues.map(i => i.description));
  const unfinished = !stateMatches || planning === undefined || ["drafting", "reviewing", "revising", "failed", "stopped"].includes(planning.status);
  if (unfinished) warnings.push("기획/검토가 진행 중이거나 중단됐습니다. 저장된 후보를 완성본으로 취급하지 않습니다.");
  const scopeRecord = input.scopeApproval;
  const scopeBound = scopeRecord?.projectId === scope.projectId && scopeRecord.subject === `Scope Contract ${scope.id} v${scope.version}` && scopeRecord.status === "approved";
  const scopeApproval = scopeBound ? scopeRecord.rationale?.startsWith("DEMO FIXTURE:") ? "fixture" : "approved" : "unconfirmed";
  if (scopeApproval === "fixture") warnings.push("TEST/STUB: 이 Scope 승인은 시험 fixture이며 실제 사용자 승인이 아닙니다.");
  if (scopeApproval === "unconfirmed") warnings.push("승인된 Scope의 승인 기록을 확인하지 못했습니다.");
  const p = input.planApproval;
  const approvalBound = stateMatches && planning !== undefined && "approvalId" in planning && planning.approvalId === p?.id &&
    p.projectId === plan.projectId && p.subject === `Approve plan ${plan.id} v${plan.version}`;
  const finalPlanApproval = approvalBound && scopeApproval === "approved" ? p.status === "approved" && planning.status === "user_approved" ? "approved" : p.status === "pending" ? "pending" : "unconfirmed" : "unconfirmed";
  const unboundIssues = review?.issues.filter(i => i.relatedRequirementId === undefined || !scope.requiredFeatures.some(r => r.id === i.relatedRequirementId)) ?? [];
  const hasGlobalIssues = unboundIssues.length > 0;
  warnings.push(...unboundIssues.map(i => `특정 요구에 연결되지 않은 지적: ${i.description}`));
  const globalUncertainty = unfinished || scopeApproval === "unconfirmed" || review === undefined || review.outcome === "failed" ||
    findings.length > 0 || storage.issues.length > 0 || storage.questions.length > 0 || hasGlobalIssues;
  const rows = scope.requiredFeatures.map((requirement): UserReviewRow => {
    const assessment = review?.qualityAssessment?.requirements.find(r => r.requirementId === requirement.id);
    const behavior = assessment?.behaviorEvidence;
    const issues = review?.issues.filter(i => i.relatedRequirementId === requirement.id) ?? [];
    const hasEvidence = behavior !== undefined && behavior.normal.evidence.length > 0 && behavior.acceptance.evidence.length > 0 &&
      (behavior.failure.evidence.length > 0 || Boolean(behavior.failureNotApplicableReason.trim()));
    const status: UserReviewStatus = issues.some(i => i.kind === "contradiction" || i.kind === "scope_violation") ? "conflicting"
      : issues.some(i => i.kind === "omission") || assessment?.status === "missing" ? "missing"
      : assessment?.status === "satisfied" && hasEvidence && !globalUncertainty && issues.length === 0 ? "reflected" : "needs_check";
    return { requirementId: requirement.id, approvedCondition: requirement.statement, status,
      normal: behavior?.normal ?? empty(), failure: behavior?.failure ?? empty(), acceptance: behavior?.acceptance ?? empty(),
      failureNotApplicableReason: behavior?.failureNotApplicableReason ?? "",
      reason: `${assessment?.rationale ?? "요구별 검토 근거가 없습니다."}${!hasEvidence ? " 정상·실패·확인 사례를 분리한 근거가 부족합니다." : ""}${globalUncertainty ? " 전체 경고와 미해결 사항을 함께 확인하세요." : ""}`,
      issues: issues.map(i => `${i.description} / ${i.suggestedDirection}${i.dispositionReason ? ` / ${i.scopeDisposition}: ${i.dispositionReason}` : ""}`) };
  });
  const failures = (input.errors ?? []).filter(e => e.projectId === plan.projectId && e.lastState?.scopeContractId === scope.id &&
    e.lastState.scopeVersion === scope.version && e.lastState.currentPlanVersion === plan.version);
  return { schemaVersion: 1, kind: "planning_document_review", source: { projectId: plan.projectId, scopeId: scope.id, scopeVersion: scope.version,
    scopeSha256: digest(scope), planId: plan.id, planVersion: plan.version, planSha256: digest(plan), reviewSha256: review === undefined ? null : digest(review) },
    planningStatus: planning?.status ?? "unknown", scopeApproval, finalPlanApproval, implementationVerification: "not_performed",
    evidenceAuthority: "model_reported_source_references", rows, warnings,
    questions: [...findings.filter(f => f.status === "needs_user_input").map(f => f.message), ...storage.questions,
      ...(review?.outcome === "needs_user_input" || review?.userJudgmentRequired ? review.suggestions : [])],
    suggestions: review?.suggestions ?? [], failures };
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\`*_[\]|])/g, "\\$1").replace(/\r?\n/g, "<br>");
}
function cite(evidence: PlanEvidence): string {
  return evidence.evidence.map((text, i) => `L${evidence.evidenceLines[i]}: ${escape(text)}`).join("<br>") || "근거 없음";
}
export function renderUserReviewTable(table: UserReviewTable): string {
  const planningLabels: Readonly<Record<UserReviewTable["planningStatus"], string>> = {
    drafting: "기획 작성 중", reviewing: "검토 중 또는 검토 중단", revising: "기획 수정 중", awaiting_user_input: "추가 답변 대기",
    awaiting_scope_change_approval: "Scope 변경 판단 대기", awaiting_approval: "최종 기획 승인 대기", user_approved: "최종 기획 승인 기록 있음",
    limit_reached: "반복 한도 도달", failed: "실패", stopped: "중단", unknown: "상태 확인 필요",
  };
  const scopeLabels = { approved: "사용자 승인 기록 있음", fixture: "시험용 승인", unconfirmed: "확인되지 않음" };
  const approvalLabels = { approved: "사용자 승인 기록 있음", pending: "승인 대기", unconfirmed: "확인되지 않음" };
  return ["# 사용자 기획 검토표", "", `기획: ${escape(table.source.planId)} v${table.source.planVersion} / Scope: ${escape(table.source.scopeId)} v${table.source.scopeVersion}`,
    `상태: ${planningLabels[table.planningStatus]} / Scope: ${scopeLabels[table.scopeApproval]} / 최종 기획: ${approvalLabels[table.finalPlanApproval]}`,
    "실제 구현·실행 검증: 수행하지 않음. ‘반영됨’은 모델의 문서 판단이며 사용자 승인이나 실제 테스트 통과가 아닙니다.", "",
    ...table.warnings.map(w => `- ${escape(w)}`), "",
    "| 승인된 조건 | 판단 | 정상 동작의 원문 | 실패/무변경 동작의 원문 | 확인 사례의 원문 | 이유·남은 문제 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...table.rows.map(r => `| ${escape(r.requirementId)}: ${escape(r.approvedCondition)} | ${USER_REVIEW_LABELS[r.status]} | ${cite(r.normal)} | ${cite(r.failure)}${r.failureNotApplicableReason ? `<br>해당 없음: ${escape(r.failureNotApplicableReason)}` : ""} | ${cite(r.acceptance)} | ${escape([r.reason, ...r.issues].join("\n"))} |`),
    "", "## 사용자 확인이 필요한 질문", "", ...(table.questions.length ? table.questions.map(q => `- ${escape(q)}`) : ["- 기록된 질문 없음. 미해결 경고가 없다는 뜻은 아닙니다."]),
    "", "## Reviewer의 별도 제안", "", ...(table.suggestions.length ? table.suggestions.map(q => `- ${escape(q)}`) : ["- 없음"]),
    "", "## 같은 기획 버전에 기록된 중단/오류", "", ...(table.failures.length ? table.failures.map(f => `- ${escape(f.operation)}: ${escape(f.message)}${f.modelOutputFailure ? ` — ${escape(f.modelOutputFailure.nextAction)}` : ""}`) : ["- 기록된 오류 없음. 새 검증을 실행했다는 뜻은 아닙니다."]), "",
  ].join("\n");
}
