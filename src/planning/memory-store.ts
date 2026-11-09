import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ApprovalId, ApprovalManager, ApprovalRecord, ApprovalStatus, MemoryEvent, ProjectId } from "../core/types.js";
import { assertSafeProjectId, assertSafeStorageId, parseScopeContract } from "./config.js";
import type {
  PlanningErrorRecord,
  PlanDraft,
  PlanReview,
  PlanningLoopState,
  PlanningMemoryStore,
  ScopeApprovalRecord,
  ScopeChangeRequest,
  ScopeContract,
  TokenUsageRecord,
} from "./contracts.js";
import type { DemoApprovalFixture } from "./config.js";
import { parsePlanReview, ReviewValidationError, validatePlanReview } from "./policy.js";

export type { PlanningErrorRecord } from "./contracts.js";

/** Local JSON store. It persists contracts only; orchestration belongs to the Controller. */
export class FilePlanningMemoryStore implements PlanningMemoryStore, ApprovalManager {
  readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    this.rootDirectory = resolve(rootDirectory);
  }

  async importDemoFixture(scope: ScopeContract, fixture: DemoApprovalFixture): Promise<void> {
    if (
      fixture.approval.status !== "approved" ||
      fixture.approval.subject !== `Scope Contract ${scope.id} v${scope.version}` ||
      fixture.approval.rationale?.startsWith("DEMO FIXTURE:") !== true
    ) {
      throw new Error("Scope fixture must contain an explicitly marked approved demo record.");
    }
    if (fixture.approval.projectId !== scope.projectId || fixture.scopeApproval.projectId !== scope.projectId) {
      throw new Error("Demo approval fixture belongs to a different project.");
    }
    if (fixture.scopeApproval.scopeContractId !== scope.id || fixture.scopeApproval.approvalId !== fixture.approval.id) {
      throw new Error("Demo approval fixture does not match the Scope Contract.");
    }

    const existingScope = await this.getScopeContract(scope.projectId, scope.version);
    if (existingScope === undefined) await this.createScopeContract(scope);
    else if (JSON.stringify(existingScope) !== JSON.stringify(scope)) throw new Error("Stored Scope Contract differs from the fixture.");

    const existingApproval = await this.get(fixture.approval.id);
    if (existingApproval === undefined) await this.writeGlobalJson(this.approvalPath(fixture.approval.id), fixture.approval, true);
    else if (JSON.stringify(existingApproval) !== JSON.stringify(fixture.approval)) throw new Error("Stored approval differs from the fixture.");

    const existingLink = await this.getScopeApprovalRecord(scope.projectId, scope.id);
    if (existingLink === undefined) await this.createScopeApprovalRecord(fixture.scopeApproval);
    else if (JSON.stringify(existingLink) !== JSON.stringify(fixture.scopeApproval)) throw new Error("Stored Scope approval link differs from the fixture.");
  }

  async getRequirements(projectId: ProjectId): Promise<string | undefined> {
    assertSafeProjectId(projectId);
    return this.readTextOptional(this.projectFile(projectId, "requirements.md"));
  }

  async createRequirements(projectId: ProjectId, requirements: string): Promise<void> {
    assertSafeProjectId(projectId);
    const content = requiredString(requirements, "Original requirements");
    const file = this.projectFile(projectId, "requirements.md");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, { encoding: "utf8", flag: "wx" });
  }

  async getSettledDecisions(projectId: ProjectId): Promise<readonly string[]> {
    assertSafeProjectId(projectId);
    const content = await this.readTextOptional(this.projectFile(projectId, "decisions.md"));
    if (content === undefined) return [];
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  }

  async getScopeContract(projectId: ProjectId, scopeVersion: number): Promise<ScopeContract | undefined> {
    this.assertVersion(scopeVersion, "Scope Contract version");
    const raw = await this.readJsonOptional(this.projectFile(projectId, "scope", `v${scopeVersion}.json`));
    if (raw === undefined) return undefined;
    return parseScopeContract(raw, projectId);
  }

  async createScopeContract(contract: ScopeContract): Promise<void> {
    assertSafeProjectId(contract.projectId);
    assertSafeStorageId(contract.id, "scope contract id");
    this.assertVersion(contract.version, "Scope Contract version");
    await this.writeProjectJson(
      contract.projectId,
      ["scope", `v${contract.version}.json`],
      contract,
      true,
    );
  }

  async createScopeApprovalRecord(record: ScopeApprovalRecord): Promise<void> {
    assertSafeProjectId(record.projectId);
    assertSafeStorageId(record.scopeContractId, "scope contract id");
    assertSafeStorageId(record.approvalId, "approval id");
    await this.writeProjectJson(
      record.projectId,
      ["scope", "approval-links", `${record.scopeContractId}.json`],
      record,
      true,
    );
  }

  async getScopeApprovalRecord(projectId: ProjectId, scopeContractId: string): Promise<ScopeApprovalRecord | undefined> {
    assertSafeProjectId(projectId);
    assertSafeStorageId(scopeContractId, "scope contract id");
    const raw = await this.readJsonOptional(this.projectFile(projectId, "scope", "approval-links", `${scopeContractId}.json`));
    if (raw === undefined) return undefined;
    const value = asRecord(raw, "Scope approval record");
    const result: ScopeApprovalRecord = {
      projectId: requiredString(value.projectId, "Scope approval projectId"),
      scopeContractId: requiredString(value.scopeContractId, "Scope approval scopeContractId"),
      approvalId: requiredString(value.approvalId, "Scope approval approvalId"),
    };
    if (result.projectId !== projectId || result.scopeContractId !== scopeContractId) {
      throw new Error("Stored Scope approval record does not match its project path.");
    }
    assertSafeStorageId(result.approvalId, "Scope approval ID");
    return result;
  }

  async createScopeChangeRequest(request: ScopeChangeRequest): Promise<void> {
    assertSafeProjectId(request.projectId);
    assertSafeStorageId(request.id, "Scope change request id");
    assertSafeStorageId(request.baseScopeContractId, "scope contract id");
    assertSafeStorageId(request.approvalId, "approval id");
    this.assertVersion(request.baseScopeVersion, "Base Scope version");
    await this.writeProjectJson(request.projectId, ["planning", "scope-changes", `${request.id}.json`], request, true);
  }

  async getScopeChangeRequest(projectId: ProjectId, requestId: string): Promise<ScopeChangeRequest | undefined> {
    assertSafeProjectId(projectId);
    assertSafeStorageId(requestId, "Scope change request id");
    const raw = await this.readJsonOptional(this.projectFile(projectId, "planning", "scope-changes", `${requestId}.json`));
    if (raw === undefined) return undefined;
    const value = asRecord(raw, "Scope change request");
    const result: ScopeChangeRequest = {
      id: requiredString(value.id, "Scope change request id"),
      projectId: requiredString(value.projectId, "Scope change projectId"),
      baseScopeContractId: requiredString(value.baseScopeContractId, "Scope change base Scope ID"),
      baseScopeVersion: positiveInteger(value.baseScopeVersion, "Scope change base Scope version"),
      rationale: requiredString(value.rationale, "Scope change rationale"),
      proposedChanges: stringArray(value.proposedChanges, "Scope change proposedChanges"),
      approvalId: requiredString(value.approvalId, "Scope change approvalId"),
    };
    if (result.id !== requestId || result.projectId !== projectId) throw new Error("Stored Scope change request path mismatch.");
    return result;
  }

  async createPlanDraft(draft: PlanDraft): Promise<void> {
    assertSafeProjectId(draft.projectId);
    assertSafeStorageId(draft.id, "Plan ID");
    assertSafeStorageId(draft.scopeContractId, "scope contract id");
    this.assertVersion(draft.version, "Plan version");
    this.assertVersion(draft.scopeVersion, "Plan Scope version");
    await this.writeProjectJson(
      draft.projectId,
      ["planning", "plans", draft.id, `v${draft.version}.json`],
      draft,
      true,
    );
  }

  async getPlanDraft(projectId: ProjectId, planId: string, version: number): Promise<PlanDraft | undefined> {
    assertSafeProjectId(projectId);
    assertSafeStorageId(planId, "Plan ID");
    this.assertVersion(version, "Plan version");
    const raw = await this.readJsonOptional(this.projectFile(projectId, "planning", "plans", planId, `v${version}.json`));
    if (raw === undefined) return undefined;
    const value = asRecord(raw, "Plan Draft");
    const result: PlanDraft = {
      id: requiredString(value.id, "Plan ID"),
      projectId: requiredString(value.projectId, "Plan projectId"),
      version: positiveInteger(value.version, "Plan version"),
      scopeContractId: requiredString(value.scopeContractId, "Plan Scope ID"),
      scopeVersion: positiveInteger(value.scopeVersion, "Plan Scope version"),
      content: requiredString(value.content, "Plan content"),
      status: oneOf(value.status, ["draft", "ready_for_review", "superseded"], "Plan status"),
      createdAt: requiredString(value.createdAt, "Plan createdAt"),
    };
    if (result.projectId !== projectId || result.id !== planId || result.version !== version) {
      throw new Error("Stored Plan Draft does not match its project path.");
    }
    return result;
  }

  async createPlanReview(review: PlanReview): Promise<void> {
    const parsed = parsePlanReview(review);
    const plan = await this.getPlanDraft(parsed.projectId, parsed.planId, parsed.planVersion);
    if (plan === undefined) {
      throw new ReviewValidationError("REVIEW_PLAN_NOT_FOUND", "Referenced Plan version does not exist.");
    }
    const scope = await this.getScopeContract(plan.projectId, plan.scopeVersion);
    if (scope === undefined) throw new ReviewValidationError("REVIEW_SCOPE_MISMATCH", "Referenced Scope does not exist.");
    const validated = validatePlanReview(parsed, plan, scope);
    const link = await this.getScopeApprovalRecord(plan.projectId, scope.id);
    const approval = link === undefined ? undefined : await this.get(link.approvalId);
    if (
      approval === undefined || approval.projectId !== plan.projectId || approval.status !== "approved" ||
      approval.subject !== `Scope Contract ${scope.id} v${scope.version}`
    ) {
      throw new ReviewValidationError("REVIEW_SCOPE_MISMATCH", "Review Scope does not have a matching approved record.");
    }
    try {
      await this.writeProjectJson(
        validated.projectId,
        ["planning", "reviews", validated.planId, `v${validated.planVersion}.json`],
        validated,
        true,
      );
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        throw new ReviewValidationError("REVIEW_DUPLICATE", "A Review already exists for this Plan version.");
      }
      throw error;
    }
  }

  async getPlanReview(projectId: ProjectId, planId: string, version: number): Promise<PlanReview | undefined> {
    assertSafeProjectId(projectId);
    assertSafeStorageId(planId, "Plan ID");
    this.assertVersion(version, "Review Plan version");
    const raw = await this.readJsonOptional(this.projectFile(projectId, "planning", "reviews", planId, `v${version}.json`));
    if (raw === undefined) return undefined;
    const result = parsePlanReview(raw);
    if (result.projectId !== projectId || result.planId !== planId || result.planVersion !== version) {
      throw new Error("Stored Plan Review does not match its project path.");
    }
    return result;
  }

  async getPlanningLoopState(projectId: ProjectId): Promise<PlanningLoopState | undefined> {
    assertSafeProjectId(projectId);
    const raw = await this.readJsonOptional(this.projectFile(projectId, "planning", "state.json"));
    if (raw === undefined) return undefined;
    const state = parsePlanningLoopState(raw);
    if (state.projectId !== projectId) throw new Error("Stored Planning Loop state belongs to a different project.");
    return state;
  }

  async savePlanningLoopState(state: PlanningLoopState): Promise<void> {
    assertSafeProjectId(state.projectId);
    assertSafeStorageId(state.scopeContractId, "scope contract id");
    this.assertVersion(state.scopeVersion, "State Scope version");
    const previous = await this.getPlanningLoopState(state.projectId);
    if (previous?.reviewRetry !== undefined && JSON.stringify(previous.reviewRetry) !== JSON.stringify(state.reviewRetry)) {
      throw new Error("Review retry receipt is immutable and cannot be reset.");
    }
    await this.writeProjectJson(state.projectId, ["planning", "state.json"], state, false);
  }

  async appendTokenUsage(record: TokenUsageRecord): Promise<void> {
    assertSafeProjectId(record.projectId);
    assertSafeStorageId(record.planId, "Plan ID");
    const file = this.projectFile(record.projectId, "planning", "usage.jsonl");
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
  }

  async appendEvent(projectId: ProjectId, event: MemoryEvent): Promise<void> {
    assertSafeProjectId(projectId);
    const file = this.projectFile(projectId, "events.jsonl");
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(event)}\n`, "utf8");
  }

  async appendError(record: PlanningErrorRecord): Promise<void> {
    assertSafeProjectId(record.projectId);
    const file = this.projectFile(record.projectId, "planning", "errors", `${randomUUID()}.json`);
    await this.writeJson(file, record, true);
  }

  async request(projectId: ProjectId, subject: string): Promise<ApprovalRecord> {
    assertSafeProjectId(projectId);
    const record: ApprovalRecord = {
      id: `approval-${randomUUID()}`,
      projectId,
      subject: requiredString(subject, "Approval subject"),
      status: "pending",
    };
    await this.writeGlobalJson(this.approvalPath(record.id), record, true);
    return record;
  }

  async get(approvalId: ApprovalId): Promise<ApprovalRecord | undefined> {
    assertSafeStorageId(approvalId, "Approval ID");
    const raw = await this.readJsonOptional(this.approvalPath(approvalId));
    if (raw === undefined) return undefined;
    const record = parseApprovalRecord(raw);
    if (record.id !== approvalId) throw new Error("Stored Approval ID does not match its file path.");
    return record;
  }

  async recordDecision(
    approvalId: ApprovalId,
    decision: Exclude<ApprovalStatus, "pending">,
    rationale: string,
  ): Promise<ApprovalRecord> {
    const record = await this.get(approvalId);
    if (record === undefined) throw new Error(`Approval '${approvalId}' does not exist.`);
    if (record.status !== "pending") throw new Error(`Approval '${approvalId}' already has a final decision.`);
    const updated: ApprovalRecord = {
      ...record,
      status: decision,
      decidedAt: new Date().toISOString(),
      rationale: requiredString(rationale, "Approval rationale"),
    };
    await this.writeGlobalJson(this.approvalPath(approvalId), updated, false);
    return updated;
  }

  async getLatestState(projectId: ProjectId): Promise<PlanningLoopState | undefined> {
    return this.getPlanningLoopState(projectId);
  }

  private approvalPath(approvalId: string): string {
    assertSafeStorageId(approvalId, "Approval ID");
    return this.globalFile("approvals", `${approvalId}.json`);
  }

  private projectDirectory(projectId: ProjectId): string {
    assertSafeProjectId(projectId);
    return this.globalFile("projects", projectId);
  }

  private projectFile(projectId: ProjectId, ...parts: string[]): string {
    const root = this.projectDirectory(projectId);
    const file = resolve(root, ...parts);
    this.assertWithin(root, file);
    return file;
  }

  private globalFile(...parts: string[]): string {
    const file = resolve(this.rootDirectory, ...parts);
    this.assertWithin(this.rootDirectory, file);
    return file;
  }

  private assertWithin(root: string, target: string): void {
    const rel = relative(root, target);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Resolved storage path escaped its root.");
  }

  private async readJsonOptional(file: string): Promise<unknown | undefined> {
    try {
      const text = await readFile(file, "utf8");
      const parsed: unknown = JSON.parse(text);
      return parsed;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async readTextOptional(file: string): Promise<string | undefined> {
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async writeProjectJson(
    projectId: ProjectId,
    parts: readonly string[],
    value: unknown,
    exclusive: boolean,
  ): Promise<void> {
    const file = this.projectFile(projectId, ...parts);
    await this.writeJson(file, value, exclusive);
  }

  private async writeGlobalJson(file: string, value: unknown, exclusive: boolean): Promise<void> {
    await this.writeJson(file, value, exclusive);
  }

  private async writeJson(file: string, value: unknown, exclusive: boolean): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    if (exclusive) {
      await writeFile(file, serialized, { encoding: "utf8", flag: "wx" });
      return;
    }
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: "utf8", flag: "wx" });
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private assertVersion(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${field} must be a positive integer.`);
  }
}

export function parsePlanningLoopState(raw: unknown): PlanningLoopState {
  const value = asRecord(raw, "Planning Loop state");
  const base = {
    projectId: requiredString(value.projectId, "State projectId"),
    scopeContractId: requiredString(value.scopeContractId, "State scopeContractId"),
    scopeVersion: positiveInteger(value.scopeVersion, "State scopeVersion"),
    iterationCount: nonNegativeInteger(value.iterationCount, "State iterationCount"),
    maxIterations: positiveInteger(value.maxIterations, "State maxIterations"),
    ...(value.continuationId === undefined ? {} : { continuationId: requiredString(value.continuationId, "State continuationId") }),
    ...(value.reviewRetry === undefined ? {} : { reviewRetry: parseReviewRetry(value.reviewRetry) }),
  };
  assertSafeProjectId(base.projectId);
  assertSafeStorageId(base.scopeContractId, "State scopeContractId");
  if (base.continuationId !== undefined) assertSafeStorageId(base.continuationId, "State continuationId");
  if (base.iterationCount > base.maxIterations) throw new Error("Stored state exceeds its iteration limit.");
  const currentPlanVersion = () => positiveInteger(value.currentPlanVersion, "State currentPlanVersion");
  switch (value.status) {
    case "drafting":
      return value.currentPlanVersion === undefined
        ? { ...base, status: "drafting" }
        : { ...base, status: "drafting", currentPlanVersion: currentPlanVersion() };
    case "reviewing":
      return { ...base, status: "reviewing", currentPlanVersion: currentPlanVersion() };
    case "revising":
      return {
        ...base,
        status: "revising",
        currentPlanVersion: currentPlanVersion(),
        previousReviewId: requiredString(value.previousReviewId, "State previousReviewId"),
      };
    case "awaiting_user_input":
      return {
        ...base,
        status: "awaiting_user_input",
        currentPlanVersion: currentPlanVersion(),
        reviewId: requiredString(value.reviewId, "State reviewId"),
        reason: requiredString(value.reason, "State reason"),
      };
    case "awaiting_scope_change_approval":
      return {
        ...base,
        status: "awaiting_scope_change_approval",
        currentPlanVersion: currentPlanVersion(),
        changeRequestId: requiredString(value.changeRequestId, "State changeRequestId"),
      };
    case "awaiting_approval":
      return {
        ...base,
        status: "awaiting_approval",
        currentPlanVersion: currentPlanVersion(),
        reviewId: requiredString(value.reviewId, "State reviewId"),
        approvalId: requiredString(value.approvalId, "State approvalId"),
      };
    case "user_approved":
      return {
        ...base,
        status: "user_approved",
        currentPlanVersion: currentPlanVersion(),
        approvalId: requiredString(value.approvalId, "State approvalId"),
      };
    case "limit_reached":
      return {
        ...base,
        status: "limit_reached",
        currentPlanVersion: currentPlanVersion(),
        reason: requiredString(value.reason, "State reason"),
      };
    case "failed":
    case "stopped":
      return value.currentPlanVersion === undefined
        ? { ...base, status: value.status, reason: requiredString(value.reason, "State reason") }
        : {
            ...base,
            status: value.status,
            currentPlanVersion: currentPlanVersion(),
            reason: requiredString(value.reason, "State reason"),
          };
    default:
      throw new Error("Stored Planning Loop state has an unknown status.");
  }
}

function parseReviewRetry(raw: unknown): NonNullable<PlanningLoopState["reviewRetry"]> {
  const value = asRecord(raw, "Review retry");
  const planId = requiredString(value.planId, "Retry planId");
  assertSafeStorageId(planId, "Retry planId");
  const sourceHash = requiredString(value.sourceHash, "Retry sourceHash");
  const startedAt = requiredString(value.startedAt, "Retry startedAt");
  if (!/^[a-f0-9]{64}$/.test(sourceHash) || !Number.isFinite(Date.parse(startedAt))) throw new Error("Invalid review retry receipt.");
  return { planId, planVersion: positiveInteger(value.planVersion, "Retry planVersion"), sourceHash,
    reason: requiredString(value.reason, "Retry reason"), startedAt };
}

function parseApprovalRecord(raw: unknown): ApprovalRecord {
  const value = asRecord(raw, "Approval record");
  return {
    id: requiredString(value.id, "Approval ID"),
    projectId: requiredString(value.projectId, "Approval projectId"),
    subject: requiredString(value.subject, "Approval subject"),
    status: oneOf(value.status, ["pending", "approved", "rejected", "changes_requested"], "Approval status"),
    ...(value.decidedAt === undefined ? {} : { decidedAt: requiredString(value.decidedAt, "Approval decidedAt") }),
    ...(value.rationale === undefined ? {} : { rationale: requiredString(value.rationale, "Approval rationale") }),
  };
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be a non-empty string.`);
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error(`${field} must be a positive integer.`);
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer.`);
  return value;
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be strings.`);
  const entries: readonly unknown[] = value;
  const strings: string[] = [];
  for (const item of entries) {
    if (typeof item !== "string") throw new Error(`${field} must be strings.`);
    strings.push(item);
  }
  return strings;
}

function oneOf<const T extends readonly string[]>(value: unknown, choices: T, field: string): T[number] {
  if (!isOneOf(value, choices)) throw new Error(`${field} is invalid.`);
  return value;
}

function isOneOf<const T extends readonly string[]>(value: unknown, choices: T): value is T[number] {
  return typeof value === "string" && choices.some((choice) => choice === value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
