import type { PlanReview, PlanningReviewer, PlanningReviewerContext, PlanningRoleConfig } from "./contracts.js";
import type { FakeReviewScenario } from "./config.js";

export class FakePlanningReviewer implements PlanningReviewer {
  private reviewCount = 0;

  constructor(
    private readonly scenario: FakeReviewScenario,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async review(context: PlanningReviewerContext, role: PlanningRoleConfig): Promise<PlanReview> {
    if (role.model.providerId !== "fake") throw new Error("FakePlanningReviewer only accepts providerId 'fake'.");
    if (context.projectId !== context.currentPlan.projectId || context.projectId !== context.approvedScope.projectId) {
      throw new Error("Reviewer context mixes project identifiers.");
    }
    this.reviewCount += 1;
    const plan = context.currentPlan;
    const base: PlanReview = {
      id: `review-${plan.version}`,
      projectId: context.projectId,
      planId: plan.id,
      planVersion: plan.version,
      scopeContractId: context.approvedScope.id,
      scopeVersion: context.approvedScope.version,
      outcome: "pass",
      issues: [],
      suggestions: [],
      scopeViolation: false,
      userJudgmentRequired: false,
      reviewedAt: this.now(),
    };

    switch (this.scenario) {
      case "improve-once":
        return this.reviewCount === 1 ? this.withRevisionIssue(base, "ISSUE-001") : base;
      case "always-revise":
        return this.withRevisionIssue(base, `ISSUE-${String(plan.version).padStart(3, "0")}`);
      case "stale-review":
        return { ...base, planVersion: plan.version + 1 };
      case "scope-violation":
        return {
          ...base,
          outcome: "pass",
          scopeViolation: true,
          issues: [{
            id: "ISSUE-SCOPE",
            kind: "scope_violation",
            severity: "critical",
            description: "A proposed item is outside the approved Scope.",
            suggestedDirection: "Request explicit Scope change approval.",
          }],
        };
      case "pass-with-major":
        return {
          ...base,
          issues: [{
            id: "ISSUE-MAJOR",
            kind: "omission",
            severity: "major",
            description: "A required acceptance condition is missing.",
            suggestedDirection: "Add a verifiable acceptance condition.",
          }],
        };
      case "needs-user-input":
        return {
          ...base,
          outcome: "needs_user_input",
          userJudgmentRequired: true,
          suggestions: ["Clarify which of the two user constraints takes priority."],
        };
      default:
        throw new Error("Unsupported fake reviewer scenario.");
    }
  }

  private withRevisionIssue(base: PlanReview, id: string): PlanReview {
    return {
      ...base,
      outcome: "revise",
      issues: [{
        id,
        kind: "omission",
        severity: "major",
        description: "A required feature needs a clearer acceptance criterion.",
        suggestedDirection: "State one observable acceptance criterion for the scoped feature.",
      }],
    };
  }
}
