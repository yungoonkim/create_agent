import type { VerificationResult, VerificationEngine } from "../core/types.js";

export interface VerificationProfile {
  readonly commandIds: readonly string[];
  /** Additional files whose content affects the checks, such as tests and configuration. */
  readonly inputFiles: readonly string[];
}

export interface VerificationCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
}

export interface VerificationPolicy {
  readonly commands: Readonly<Record<string, VerificationCommand>>;
  readonly outputLimitBytes: number;
}

export interface ArtifactEvidence {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface CommandEvidence extends VerificationCommand {
  readonly id: string;
  readonly outcome: "passed" | "failed" | "blocked";
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly reason: string;
}

export interface VerificationEvidence extends VerificationResult {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly taskId: string;
  readonly attempt: number;
  readonly sourceHash: string;
  readonly resultHash: string;
  readonly profileHash: string;
  readonly policyHash: string;
  readonly workspaceRoot: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly outcome: "passed" | "failed" | "blocked";
  readonly artifacts: readonly ArtifactEvidence[];
  readonly commands: readonly CommandEvidence[];
}

export interface EvidenceVerificationEngine extends VerificationEngine {
  verify: (task: Parameters<VerificationEngine["verify"]>[0], result: Parameters<VerificationEngine["verify"]>[1]) => Promise<VerificationEvidence>;
}
