import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentResult, TaskRecord } from "../core/types.js";
import { parseTask } from "../development/validation.js";
import type { ArtifactEvidence, CommandEvidence, EvidenceVerificationEngine, VerificationEvidence, VerificationPolicy } from "./contracts.js";
import { ArtifactInspectionError, inspectFile } from "./files.js";
import { runVerificationCommand } from "./command.js";
import { hash, parseVerificationEvidence, parseVerificationPolicy } from "./validation.js";

export class LocalVerificationEngine implements EvidenceVerificationEngine {
  private readonly policy: VerificationPolicy;
  constructor(private readonly workspaceRoot: string, rawPolicy: unknown, private readonly sourceHash: string) {
    this.policy = parseVerificationPolicy(rawPolicy);
  }

  async verify(rawTask: TaskRecord, result: AgentResult): Promise<VerificationEvidence> {
    const task = parseTask(rawTask, rawTask.projectId);
    const profile = task.verificationProfile;
    if (profile === undefined || task.attemptCount === undefined || task.attemptCount < 1 || hash(task.result) !== hash(result)) {
      throw new Error("Verification needs a profiled task and its current submitted result.");
    }
    const startedAt = new Date().toISOString();
    const artifacts: ArtifactEvidence[] = [];
    const commands: CommandEvidence[] = [];
    const checks: { name: string; passed: boolean; details: string }[] = [];
    let outcome: VerificationEvidence["outcome"] = "passed";
    let workspace = resolve(this.workspaceRoot);
    try {
      workspace = await realpath(workspace);
      if (!(await stat(workspace)).isDirectory()) throw new Error("Not a directory.");
    } catch {
      outcome = "blocked";
      checks.push({ name: "workspace", passed: false, details: "WORKSPACE_UNAVAILABLE" });
    }
    if (outcome === "passed") {
      for (const id of profile.commandIds) {
        if (!Object.hasOwn(this.policy.commands, id)) {
          outcome = "blocked";
          checks.push({ name: `command:${id}`, passed: false, details: "COMMAND_NOT_ALLOWED" });
        }
      }
    }
    const paths = [...new Set([...task.expectedArtifacts, ...profile.inputFiles])];
    if (outcome === "passed") {
      for (const path of paths) {
        try {
          artifacts.push(await inspectFile(workspace, path));
          checks.push({ name: `file:${path}`, passed: true, details: "Regular file fingerprint collected; this alone does not establish semantic correctness." });
        } catch (error) {
          const blocked = !(error instanceof ArtifactInspectionError) || error.outcome === "blocked";
          if (blocked || outcome === "passed") outcome = blocked ? "blocked" : "failed";
          checks.push({ name: `file:${path}`, passed: false, details: error instanceof ArtifactInspectionError ? error.message : "Artifact inspection failed." });
        }
      }
    }
    if (outcome === "passed") {
      for (const id of profile.commandIds) {
        const definition = this.policy.commands[id];
        if (definition === undefined) throw new Error("Verification policy changed unexpectedly.");
        const command = await runVerificationCommand(id, definition, workspace, this.policy.outputLimitBytes);
        commands.push(command);
        checks.push({ name: `command:${id}`, passed: command.outcome === "passed", details: command.reason });
        if (command.outcome !== "passed") { outcome = command.outcome; break; }
      }
      // Also recheck after failed commands: tests that changed inputs invalidate the attempt's evidence.
      for (const artifact of artifacts) {
        try {
          const after = await inspectFile(workspace, artifact.path);
          if (after.sha256 !== artifact.sha256 || after.size !== artifact.size) throw new Error("Changed");
        } catch {
          outcome = "blocked";
          checks.push({ name: `unchanged:${artifact.path}`, passed: false, details: "VERIFICATION_INPUT_CHANGED" });
        }
      }
    }
    return parseVerificationEvidence({
      schemaVersion: 1, projectId: task.projectId, taskId: task.id, attempt: task.attemptCount,
      sourceHash: this.sourceHash, resultHash: hash(result), profileHash: hash(profile), policyHash: hash(this.policy),
      workspaceRoot: workspace, startedAt, finishedAt: new Date().toISOString(), outcome,
      passed: outcome === "passed", summary: outcome === "passed" ? "Objective checks passed; acceptance still requires review." : `Verification ${outcome}.`,
      checks, artifacts, commands,
    });
  }
}
