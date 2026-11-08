import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertSafeProjectId } from "../planning/config.js";
import type { DevelopmentState } from "./contracts.js";
import { parseDevelopmentState } from "./validation.js";

/** One atomic snapshot includes both tasks and history. The lock is never stolen. */
export class FileDevelopmentStore {
  readonly rootDirectory: string;
  constructor(rootDirectory: string) { this.rootDirectory = resolve(rootDirectory); }

  private path(projectId: string): string {
    assertSafeProjectId(projectId);
    return join(this.rootDirectory, "projects", projectId, "development", "state.json");
  }

  async get(projectId: string): Promise<DevelopmentState | undefined> {
    try {
      return parseDevelopmentState(JSON.parse(await readFile(this.path(projectId), "utf8")), projectId);
    } catch (error) {
      if (isCode(error, "ENOENT")) return undefined;
      throw error;
    }
  }

  async save(state: DevelopmentState, expectedRevision: number): Promise<DevelopmentState> {
    return this.update(state.projectId, expectedRevision, async () => state);
  }

  async update(projectId: string, expectedRevision: number, mutate: (current: DevelopmentState | undefined) => Promise<DevelopmentState>): Promise<DevelopmentState> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Invalid development revision.");
    const file = this.path(projectId);
    await mkdir(dirname(file), { recursive: true });
    const lockPath = `${file}.lock`;
    const lock = await open(lockPath, "wx").catch((error: unknown) => {
      if (isCode(error, "EEXIST")) throw new Error("Development state is locked; another command may be writing. State was preserved.");
      throw error;
    });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const current = await this.get(projectId);
      if ((current?.revision ?? 0) !== expectedRevision) throw new Error("Development revision conflict; reload before retrying.");
      const parsed = parseDevelopmentState(await mutate(current), projectId);
      if (parsed.revision !== expectedRevision + 1) throw new Error("Invalid development revision.");
      if (current !== undefined) {
        if (JSON.stringify(current.source) !== JSON.stringify(parsed.source) ||
            JSON.stringify(parsed.events.slice(0, current.events.length)) !== JSON.stringify(current.events) ||
            parsed.events.length <= current.events.length) throw new Error("Source and existing history are immutable.");
        const definitions = (snapshot: DevelopmentState) => snapshot.tasks.map(({ status: _status, assignedAgentId: _agent, result: _result, review: _review, attemptCount: _attempt, reworkCount: _rework, evidence: _evidence, blockReason: _blocked, ...definition }) => definition);
        if (JSON.stringify(definitions(current)) !== JSON.stringify(definitions(parsed))) throw new Error("Task definitions are immutable; initialize a new approved plan separately.");
      }
      await writeFile(temporary, JSON.stringify(parsed, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      await rename(temporary, file);
      return parsed;
    } finally {
      try { await rm(temporary, { force: true }); }
      finally { await lock.close(); await rm(lockPath, { force: true }); }
    }
  }
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
