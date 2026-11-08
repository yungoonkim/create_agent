import type { AgentResult, TaskRecord, VerificationResult } from "../core/types.js";
import type { VerificationEvidence, VerificationProfile } from "../verification/contracts.js";

export interface DevelopmentTask extends TaskRecord {
  readonly expectedArtifacts: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly verificationMethod: string;
  /** Worker-reported output, not independently verified evidence. */
  readonly result?: AgentResult;
  readonly review?: VerificationResult;
  readonly verificationProfile?: VerificationProfile;
  readonly maxReworkAttempts?: number;
  /** Assignment attempts; no claim that an Agent Runtime was executed. */
  readonly attemptCount?: number;
  readonly reworkCount?: number;
  readonly evidence?: VerificationEvidence;
  readonly blockReason?: "environment" | "verification_limit" | "manual";
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
