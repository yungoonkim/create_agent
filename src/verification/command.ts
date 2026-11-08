import { spawn } from "node:child_process";
import { join } from "node:path";
import type { CommandEvidence, VerificationCommand } from "./contracts.js";

export function redactLog(value: string): string {
  return value.replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/((?:access_token|refresh_token|client_secret|api_key|password)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[redacted]");
}

export async function runVerificationCommand(id: string, command: VerificationCommand, workspace: string, limit: number): Promise<CommandEvidence> {
  const executable = command.executable === "node" ? process.execPath : command.executable;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "PATHEXT"].includes(key.toUpperCase())));
  const started = Date.now();
  return new Promise((resolveResult) => {
    const child = spawn(executable, [...command.args], { cwd: workspace, env, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let captured = 0;
    let blockedReason: string | undefined;
    let settled = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const finish = (exitCode: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (fallback !== undefined) clearTimeout(fallback);
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
      const outcome = blockedReason !== undefined ? "blocked" : exitCode === 0 && signal === null ? "passed" : "failed";
      resolveResult({
        id, executable, args: [...command.args], timeoutMs: command.timeoutMs, outcome, exitCode, signal,
        stdout: redactLog(Buffer.concat(stdout).toString("utf8")), stderr: redactLog(Buffer.concat(stderr).toString("utf8")),
        durationMs: Date.now() - started, reason: blockedReason ?? (outcome === "passed" ? "Command exited zero." : "Command failed."),
      });
    };
    const stop = (reason: string) => {
      if (blockedReason !== undefined || settled) return;
      blockedReason = reason;
      if (child.pid !== undefined) {
        if (process.platform === "win32") {
          const killer = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"), ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
          killer.on("error", () => { child.kill("SIGKILL"); }); killer.unref();
        } else {
          try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
        }
      }
      fallback = setTimeout(() => finish(null, "SIGKILL"), 1000);
    };
    const capture = (destination: Buffer[], buffer: Buffer) => {
      const remaining = Math.max(0, limit - captured);
      destination.push(buffer.subarray(0, remaining));
      captured += Math.min(remaining, buffer.length);
      if (buffer.length > remaining) stop("COMMAND_OUTPUT_LIMIT");
    };
    const timer = setTimeout(() => stop("COMMAND_TIMEOUT"), command.timeoutMs);
    child.stdout.on("data", (buffer: Buffer) => capture(stdout, buffer));
    child.stderr.on("data", (buffer: Buffer) => capture(stderr, buffer));
    child.on("error", (error: NodeJS.ErrnoException) => { blockedReason ??= `COMMAND_START_FAILED:${error.code ?? "UNKNOWN"}`; finish(null, null); });
    child.on("close", (code, signal) => {
      if (process.platform !== "win32" && child.pid !== undefined) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* The command group has already exited. */ }
      }
      finish(code, signal);
    });
  });
}
