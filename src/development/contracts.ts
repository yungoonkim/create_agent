import type { AgentResult, TaskRecord, VerificationResult } from "../core/types.js";

export interface DevelopmentTask extends TaskRecord {
  readonly expectedArtifacts: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly verificationMethod: string;
  /** Worker-reported output, not independently verified evidence. */
  readonly result?: AgentResult;
  readonly review?: VerificationResult;
}

export interface ApprovedPlanReference {
  readonly planId: string;
  readonly planVersion: number;
  readonly scopeContractId: string;
  readonly scopeVersion: number;
  readonly approvalId: string;
  readonly contentHash: string;
}

export interface DevelopmentState {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly revision: number;
  readonly source: ApprovedPlanReference;
  readonly tasks: readonly DevelopmentTask[];
  readonly events: readonly {
    readonly at: string;
    readonly taskId?: string;
    readonly action: string;
    readonly rationale: string;
    readonly before?: DevelopmentTask;
    readonly after?: DevelopmentTask;
  }[];
}
