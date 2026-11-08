import type { PlanDraft, PlanningRoleConfig, PlanningWriter, PlanningWriterContext } from "./contracts.js";

export class FakePlanningWriter implements PlanningWriter {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async write(context: PlanningWriterContext, role: PlanningRoleConfig): Promise<PlanDraft> {
    if (role.model.providerId !== "fake") throw new Error("FakePlanningWriter only accepts providerId 'fake'.");
    if (context.projectId !== context.approvedScope.projectId) {
      throw new Error("Writer context and approved Scope belong to different projects.");
    }
    const current = context.currentDraft;
    if (current !== undefined && current.projectId !== context.projectId) {
      throw new Error("Current draft belongs to a different project.");
    }
    const version = (current?.version ?? 0) + 1;
    const features = context.approvedScope.requiredFeatures.map((feature) => `- ${feature.id}: ${feature.statement}`);
    const exclusions = context.approvedScope.excludedFeatures.map((feature) => `- ${feature.id}: ${feature.statement}`);
    const constraints = context.approvedScope.technicalConstraints.map((constraint) => `- ${constraint}`);
    const decisions = context.settledDecisions.map((decision) => `- ${decision}`);
    const boundedConstraints = [
      ...(context.approvedScope.scheduleConstraint === undefined ? [] : [`- Schedule: ${context.approvedScope.scheduleConstraint}`]),
      ...(context.approvedScope.budgetConstraint === undefined ? [] : [`- Budget: ${context.approvedScope.budgetConstraint}`]),
    ];
    const feedback = context.reviewFeedback === undefined
      ? []
      : [
          ...context.reviewFeedback.issues.map((item) => `- ${item.id}: ${item.suggestedDirection}`),
          ...context.reviewFeedback.suggestions.map((suggestion) => `- ${suggestion}`),
        ];
    const content = [
      `# Planning Draft v${version}`,
      "",
      `Project: ${context.projectId}`,
      `Scope: ${context.approvedScope.id} v${context.approvedScope.version}`,
      "",
      "## Goal",
      context.approvedScope.goal,
      "",
      "## Required features",
      ...features,
      "",
      "## Excluded features",
      ...exclusions,
      "",
      "## Technical constraints",
      ...constraints,
      ...boundedConstraints,
      "",
      "## Source requirements",
      context.originalRequirements.trim(),
      "",
      "## Settled decisions",
      ...decisions,
      ...(feedback.length === 0 ? [] : ["", "## Feedback addressed", ...feedback]),
    ].join("\n");

    return {
      id: current?.id ?? `${context.projectId}-plan`,
      projectId: context.projectId,
      version,
      scopeContractId: context.approvedScope.id,
      scopeVersion: context.approvedScope.version,
      content,
      status: "ready_for_review",
      createdAt: this.now(),
    };
  }
}
