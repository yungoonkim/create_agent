import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ApprovalRecord } from "../core/types.js";
import type { PlanningRoleConfig, ScopeApprovalRecord, ScopeContract, ScopeRequirement } from "./contracts.js";

export type FakeReviewScenario =
  | "improve-once"
  | "always-revise"
  | "stale-review"
  | "scope-violation"
  | "pass-with-major"
  | "needs-user-input";

export interface OfflinePlanningConfig {
  readonly projectId: string;
  readonly planning: {
    readonly writer: PlanningRoleConfig;
    readonly reviewer: PlanningRoleConfig;
    readonly maxIterations: number;
    readonly requireUserApproval: true;
    readonly scenario: FakeReviewScenario;
  };
  readonly memory: { readonly type: "file"; readonly directory: string };
}

export interface DemoApprovalFixture {
  readonly approval: ApprovalRecord;
  readonly scopeApproval: ScopeApprovalRecord;
}

const scenarios: readonly FakeReviewScenario[] = [
  "improve-once",
  "always-revise",
  "stale-review",
  "scope-violation",
  "pass-with-major",
  "needs-user-input",
];

export async function loadPlanningConfig(configPath: string, projectRoot: string): Promise<OfflinePlanningConfig> {
  const root = resolve(projectRoot);
  const filePath = resolveProjectPath(root, configPath);
  const raw: unknown = JSON.parse(await readFile(filePath, "utf8"));
  return parsePlanningConfig(raw, root);
}

export function parsePlanningConfig(raw: unknown, projectRoot: string): OfflinePlanningConfig {
  const root = resolve(projectRoot);
  const value = asRecord(raw, "config");
  const projectId = requiredString(value.projectId, "projectId");
  assertSafeProjectId(projectId);

  const planning = asRecord(value.planning, "planning");
  const writer = parseFakeRole(planning.writer, "planning.writer", "planning-writer");
  const reviewer = parseFakeRole(planning.reviewer, "planning.reviewer", "planning-reviewer");
  const maxIterations = planning.maxIterations;
  if (typeof maxIterations !== "number" || !Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error("planning.maxIterations must be an integer greater than or equal to 1.");
  }
  if (planning.requireUserApproval !== true) {
    throw new Error("planning.requireUserApproval must be true; reviewer success cannot replace user approval.");
  }
  const scenarioValue = planning.scenario ?? "improve-once";
  if (typeof scenarioValue !== "string" || !isFakeReviewScenario(scenarioValue)) {
    throw new Error(`Unsupported fake reviewer scenario: ${String(scenarioValue)}.`);
  }

  const memory = asRecord(value.memory, "memory");
  if (memory.type !== "file") throw new Error("Only memory.type = 'file' is supported in STEP 2A.");
  const memoryDirectory = requiredString(memory.directory, "memory.directory");

  return {
    projectId,
    planning: {
      writer,
      reviewer,
      maxIterations,
      requireUserApproval: true,
      scenario: scenarioValue,
    },
    memory: { type: "file", directory: resolveProjectPath(root, memoryDirectory) },
  };
}

export function parseScopeContract(raw: unknown, expectedProjectId: string): ScopeContract {
  const value = asRecord(raw, "scope contract");
  const requiredFeatures = parseRequirements(value.requiredFeatures, "requiredFeatures");
  const excludedFeatures = parseRequirements(value.excludedFeatures, "excludedFeatures");
  const version = value.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error("scope contract version must be a positive integer.");
  }
  const projectId = requiredString(value.projectId, "scope contract projectId");
  assertSafeProjectId(projectId);
  if (projectId !== expectedProjectId) throw new Error("Scope Contract projectId does not match the config.");
  const id = requiredString(value.id, "scope contract id");
  assertSafeStorageId(id, "scope contract id");
  const scheduleConstraint = optionalString(value.scheduleConstraint, "scheduleConstraint");
  const budgetConstraint = optionalString(value.budgetConstraint, "budgetConstraint");
  return {
    id,
    projectId,
    version,
    goal: requiredString(value.goal, "scope contract goal"),
    requiredFeatures,
    excludedFeatures,
    technicalConstraints: parseStringArray(value.technicalConstraints, "technicalConstraints"),
    ...(scheduleConstraint === undefined ? {} : { scheduleConstraint }),
    ...(budgetConstraint === undefined ? {} : { budgetConstraint }),
    createdAt: requiredString(value.createdAt, "scope contract createdAt"),
  };
}

export function parseDemoApprovalFixture(raw: unknown, scope: ScopeContract): DemoApprovalFixture {
  const value = asRecord(raw, "approval fixture");
  const approvalRaw = asRecord(value.approval, "approval fixture approval");
  const linkRaw = asRecord(value.scopeApproval, "approval fixture scopeApproval");
  const approvalId = requiredString(approvalRaw.id, "approval.id");
  assertSafeStorageId(approvalId, "approval.id");
  if (approvalRaw.status !== "approved") throw new Error("Demo Scope approval fixture must have approved status.");
  const approval: ApprovalRecord = {
    id: approvalId,
    projectId: requiredString(approvalRaw.projectId, "approval.projectId"),
    subject: requiredString(approvalRaw.subject, "approval.subject"),
    status: "approved",
    decidedAt: requiredString(approvalRaw.decidedAt, "approval.decidedAt"),
    rationale: requiredString(approvalRaw.rationale, "approval.rationale"),
  };
  if (approval.projectId !== scope.projectId || approval.rationale?.startsWith("DEMO FIXTURE:") !== true) {
    throw new Error("Approval fixture must match the project and be explicitly marked DEMO FIXTURE.");
  }
  const scopeApproval: ScopeApprovalRecord = {
    projectId: requiredString(linkRaw.projectId, "scopeApproval.projectId"),
    scopeContractId: requiredString(linkRaw.scopeContractId, "scopeApproval.scopeContractId"),
    approvalId: requiredString(linkRaw.approvalId, "scopeApproval.approvalId"),
  };
  assertSafeStorageId(scopeApproval.scopeContractId, "scopeApproval.scopeContractId");
  if (
    scopeApproval.projectId !== scope.projectId ||
    scopeApproval.scopeContractId !== scope.id ||
    scopeApproval.approvalId !== approval.id
  ) {
    throw new Error("Approval fixture does not link to the supplied Scope Contract.");
  }
  return { approval, scopeApproval };
}

export function resolveProjectPath(projectRoot: string, pathValue: string): string {
  const root = resolve(projectRoot);
  const result = resolve(root, pathValue);
  const rel = relative(root, result);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Path must stay within the project root: ${pathValue}`);
  }
  return result;
}

export function assertSafeProjectId(projectId: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(projectId)) {
    throw new Error("Project ID must use 1-64 letters, digits, underscores, or hyphens and start alphanumeric.");
  }
}

export function assertSafeStorageId(id: string, field = "ID"): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)) {
    throw new Error(`${field} must use 1-128 letters, digits, underscores, or hyphens and start alphanumeric.`);
  }
}

function parseFakeRole(
  raw: unknown,
  field: string,
  personaId: string,
): OfflinePlanningConfig["planning"]["writer"] {
  const role = asRecord(raw, field);
  const providerId = requiredString(role.providerId, `${field}.providerId`);
  if (providerId !== "fake") {
    throw new Error(`${field}.providerId '${providerId}' is unsupported in STEP 2A; use 'fake'.`);
  }
  return {
    model: { providerId: "fake", modelId: requiredString(role.modelId, `${field}.modelId`) },
    personaId: role.personaId === undefined ? personaId : requiredString(role.personaId, `${field}.personaId`),
  };
}

function parseRequirements(raw: unknown, field: string): readonly ScopeRequirement[] {
  if (!Array.isArray(raw)) throw new Error(`scope contract ${field} must be an array.`);
  const entries: readonly unknown[] = raw;
  return entries.map((item, index) => {
    const requirement = asRecord(item, `${field}[${index}]`);
    return {
      id: requiredString(requirement.id, `${field}[${index}].id`),
      statement: requiredString(requirement.statement, `${field}[${index}].statement`),
    };
  });
}

function parseStringArray(raw: unknown, field: string): readonly string[] {
  if (!Array.isArray(raw)) throw new Error(`${field} must be an array of strings.`);
  const values: unknown[] = raw;
  const result: string[] = [];
  for (const item of values) {
    if (typeof item !== "string") throw new Error(`${field} must be an array of strings.`);
    result.push(item);
  }
  return result;
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${field} must be a JSON object.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFakeReviewScenario(value: string): value is FakeReviewScenario {
  return scenarios.some((scenario) => scenario === value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be a non-empty string.`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field);
}
