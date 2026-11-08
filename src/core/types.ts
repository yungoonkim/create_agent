/** Stable identifiers are strings at persistence and adapter boundaries. */
export type ProjectId = string;
export type TaskId = string;
export type AgentId = string;
export type ApprovalId = string;

export type TaskStatus =
  | "pending"
  | "ready"
  | "in_progress"
  | "awaiting_review"
  | "blocked"
  | "approved"
  | "rework"
  | "cancelled";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "changes_requested";

export interface ProjectGoal {
  readonly id: string;
  readonly statement: string;
  readonly approvedAt?: string;
}

export interface ProjectRecord {
  readonly id: ProjectId;
  readonly name: string;
  readonly goals: readonly ProjectGoal[];
  readonly createdAt: string;
}

export interface TaskRecord {
  readonly id: TaskId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly dependsOn: readonly TaskId[];
  readonly assignedAgentId?: AgentId;
}

export interface ApprovalRecord {
  readonly id: ApprovalId;
  readonly projectId: ProjectId;
  readonly subject: string;
  readonly status: ApprovalStatus;
  readonly decidedAt?: string;
  readonly rationale?: string;
}

export interface LoopPolicy {
  /** Maximum number of self-review/rework cycles; must be validated by implementation. */
  readonly maxIterations: number;
  readonly stopOnUserRejection: boolean;
}

export interface PersonaDefinition {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly instructions: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}

export interface RuntimeTarget {
  readonly runtimeId: string;
  readonly model?: LlmModelConfig;
}

/** Provider/model selection is configured independently from the agent runtime. */
export interface LlmModelConfig {
  readonly providerId: string;
  readonly modelId: string;
}

/** Declarative compatibility data; absence of an entry means compatibility is unknown. */
export interface RuntimeModelCompatibility {
  readonly runtimeId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly status: "supported" | "unsupported" | "unknown";
  readonly source?: string;
}

export interface TaskStateManager {
  get(taskId: TaskId): Promise<TaskRecord | undefined>;
  transition(taskId: TaskId, nextStatus: TaskStatus, rationale: string): Promise<TaskRecord>;
}

export interface AgentRequest {
  readonly agentId: AgentId;
  readonly instruction: string;
  readonly projectId: ProjectId;
  readonly taskId?: TaskId;
}

export interface AgentResult {
  readonly summary: string;
  readonly artifacts: readonly string[];
  readonly runtimeSessionId?: string;
}

export interface AgentRuntimeAdapter {
  readonly runtimeId: string;
  run(request: AgentRequest, target: RuntimeTarget): Promise<AgentResult>;
}

export interface MemoryStore {
  getProject(projectId: ProjectId): Promise<ProjectRecord | undefined>;
  saveProject(project: ProjectRecord): Promise<void>;
  listTasks(projectId: ProjectId): Promise<readonly TaskRecord[]>;
  saveTask(task: TaskRecord): Promise<void>;
  appendEvent(projectId: ProjectId, event: MemoryEvent): Promise<void>;
}

export interface MemoryEvent {
  readonly type: string;
  readonly occurredAt: string;
  readonly actorId?: AgentId;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface VerificationEngine {
  verify(task: TaskRecord, result: AgentResult): Promise<VerificationResult>;
}

export interface VerificationResult {
  readonly passed: boolean;
  readonly summary: string;
  readonly checks: readonly VerificationCheck[];
}

export interface VerificationCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly details?: string;
}

export interface ApprovalManager {
  request(projectId: ProjectId, subject: string): Promise<ApprovalRecord>;
  get(approvalId: ApprovalId): Promise<ApprovalRecord | undefined>;
  recordDecision(
    approvalId: ApprovalId,
    decision: Exclude<ApprovalStatus, "pending">,
    rationale: string,
  ): Promise<ApprovalRecord>;
}
