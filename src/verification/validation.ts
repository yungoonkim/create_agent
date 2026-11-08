import { createHash } from "node:crypto";
import { isAbsolute, win32 } from "node:path";
import type { CommandEvidence, VerificationEvidence, VerificationPolicy, VerificationProfile } from "./contracts.js";

export function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function object(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Invalid verification object.");
  return raw as Record<string, unknown>;
}
function string(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "" || raw.includes("\0")) throw new Error("Invalid verification string.");
  return raw;
}
function array(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) throw new Error("Invalid verification array.");
  return raw;
}
export function count(raw: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw > max) throw new Error("Invalid verification counter or limit.");
  return raw;
}
function digest(raw: unknown): string {
  const value = string(raw);
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Invalid verification hash.");
  return value;
}
function identifier(raw: unknown): string {
  const value = string(raw);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) throw new Error("Invalid verification ID.");
  return value;
}
export function artifactPath(raw: unknown): string {
  const value = string(raw);
  if (isAbsolute(value) || win32.isAbsolute(value) || value.includes(":") || value.split(/[\\/]/).some((part) => part === ".." || part === "." || part === "")) {
    throw new Error("Artifact paths must be relative files within the workspace.");
  }
  return value;
}
function unique(values: string[]): string[] {
  if (new Set(values).size !== values.length) throw new Error("Duplicate verification entry.");
  return values;
}

export function parseVerificationProfile(raw: unknown): VerificationProfile {
  const value = object(raw);
  return { commandIds: unique(array(value.commandIds).map(identifier)), inputFiles: unique(array(value.inputFiles).map(artifactPath)) };
}

export function parseVerificationPolicy(raw: unknown): VerificationPolicy {
  const value = object(raw);
  const commands: Record<string, { executable: string; args: string[]; timeoutMs: number }> = Object.create(null) as Record<string, { executable: string; args: string[]; timeoutMs: number }>;
  for (const [id, rawCommand] of Object.entries(object(value.commands))) {
    identifier(id);
    const command = object(rawCommand);
    const executable = string(command.executable);
    if (/\.(cmd|bat)$/i.test(executable)) throw new Error("Shell wrappers are unsupported; configure an executable such as node directly.");
    const timeoutMs = count(command.timeoutMs, 60_000);
    if (timeoutMs === 0) throw new Error("Command timeout must be positive.");
    const args = array(command.args).map((arg) => {
      if (typeof arg !== "string" || arg.includes("\0")) throw new Error("Invalid command argument.");
      return arg;
    });
    commands[id] = { executable, args, timeoutMs };
  }
  const outputLimitBytes = count(value.outputLimitBytes ?? 16_384, 65_536);
  if (outputLimitBytes < 256) throw new Error("Output limit must be at least 256 bytes.");
  return { commands, outputLimitBytes };
}

export function parseVerificationEvidence(raw: unknown): VerificationEvidence {
  const value = object(raw);
  if (value.schemaVersion !== 1 || !["passed", "failed", "blocked"].includes(String(value.outcome))) throw new Error("Unsupported verification evidence.");
  const outcome = value.outcome as VerificationEvidence["outcome"];
  if (value.passed !== (outcome === "passed")) throw new Error("Inconsistent verification verdict.");
  const attempt = count(value.attempt);
  if (attempt === 0) throw new Error("Evidence needs a real assignment attempt.");
  const checks = array(value.checks).map((item) => {
    const check = object(item);
    if (typeof check.passed !== "boolean") throw new Error("Invalid verification check.");
    return { name: string(check.name), passed: check.passed, details: string(check.details) };
  });
  if (checks.length === 0 || (outcome === "passed" && checks.some((check) => !check.passed))) throw new Error("Passing evidence needs successful checks.");
  unique(checks.map((check) => check.name));
  if (outcome !== "passed" && checks.every((check) => check.passed)) throw new Error("Unsuccessful evidence must identify an unsuccessful check.");
  const artifacts = array(value.artifacts).map((item) => {
    const artifact = object(item);
    return { path: artifactPath(artifact.path), size: count(artifact.size), sha256: digest(artifact.sha256) };
  });
  const commands = array(value.commands).map((item): CommandEvidence => {
    const command = object(item);
    const commandOutcome = command.outcome;
    if (commandOutcome !== "passed" && commandOutcome !== "failed" && commandOutcome !== "blocked") throw new Error("Invalid command outcome.");
    const exitCode = command.exitCode === null ? null : count(command.exitCode);
    const signal = command.signal === null ? null : string(command.signal);
    if (commandOutcome === "passed" && (exitCode !== 0 || signal !== null)) throw new Error("Passing command must exit zero.");
    if (typeof command.stdout !== "string" || typeof command.stderr !== "string" || Buffer.byteLength(command.stdout) + Buffer.byteLength(command.stderr) > 140_000) throw new Error("Invalid or excessive command log.");
    const timeoutMs = count(command.timeoutMs, 60_000);
    if (timeoutMs === 0) throw new Error("Recorded command timeout must be positive.");
    return {
      id: identifier(command.id), executable: string(command.executable), args: array(command.args).map((arg) => { if (typeof arg !== "string") throw new Error("Invalid recorded argument."); return arg; }),
      timeoutMs, outcome: commandOutcome,
      exitCode, signal, stdout: command.stdout, stderr: command.stderr,
      durationMs: count(command.durationMs), reason: string(command.reason),
    };
  });
  unique(artifacts.map((item) => item.path));
  unique(commands.map((item) => item.id));
  if (outcome === "passed" && commands.some((item) => item.outcome !== "passed")) throw new Error("Passing report contains an unsuccessful command.");
  const startedAt = string(value.startedAt);
  const finishedAt = string(value.finishedAt);
  if (Number.isNaN(Date.parse(startedAt)) || Number.isNaN(Date.parse(finishedAt)) || Date.parse(finishedAt) < Date.parse(startedAt)) throw new Error("Invalid verification timestamps.");
  const workspaceRoot = string(value.workspaceRoot);
  if (!isAbsolute(workspaceRoot) && !win32.isAbsolute(workspaceRoot)) throw new Error("Evidence workspace must be an absolute path.");
  return {
    schemaVersion: 1, projectId: identifier(value.projectId), taskId: identifier(value.taskId), attempt,
    sourceHash: digest(value.sourceHash), resultHash: digest(value.resultHash), profileHash: digest(value.profileHash), policyHash: digest(value.policyHash),
    workspaceRoot, startedAt, finishedAt, outcome,
    passed: outcome === "passed", summary: string(value.summary), checks, artifacts, commands,
  };
}
