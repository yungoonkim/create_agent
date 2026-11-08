import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertSafeProjectId } from "../planning/config.js";
import type { SupervisorState } from "./contracts.js";
import { parseSupervisorState, same } from "./validation.js";

/** One supervisor command per project. Lock covers model calls and downstream writes. */
export class FileSupervisorStore {
  readonly rootDirectory: string;
  constructor(rootDirectory: string) { this.rootDirectory = resolve(rootDirectory); }
  private path(projectId: string): string {
    assertSafeProjectId(projectId);
    return join(this.rootDirectory, "projects", projectId, "supervisor", "state.json");
  }
  async get(projectId: string): Promise<SupervisorState | undefined> {
    try { return parseSupervisorState(JSON.parse(await readFile(this.path(projectId), "utf8")), projectId); }
    catch (error) { if (isCode(error, "ENOENT")) return undefined; throw error; }
  }
  async update(projectId: string, mutate: (state: SupervisorState | undefined) => Promise<SupervisorState>): Promise<SupervisorState> {
    const file = this.path(projectId);
    await mkdir(dirname(file), { recursive: true });
    const lock = await open(`${file}.lock`, "wx").catch((error: unknown) => {
      if (isCode(error, "EEXIST")) throw new Error("Supervisor is locked; state was preserved.");
      throw error;
    });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const current = await this.get(projectId);
      const next = parseSupervisorState(await mutate(current), projectId);
      if (next.revision !== (current?.revision ?? 0) + 1) throw new Error("Invalid supervisor revision.");
      if (current !== undefined && (current.originalRequest !== next.originalRequest ||
          !same(next.events.slice(0, current.events.length), current.events) || next.events.length <= current.events.length ||
          current.clarifications.some((item, index) => {
            const after = next.clarifications[index];
            return after?.id !== item.id || after.question !== item.question || (item.answer !== undefined && after.answer !== item.answer);
          }))) throw new Error("Original request, answers and history are immutable.");
      await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
      await rename(temporary, file);
      return next;
    } finally {
      try { await rm(temporary, { force: true }); }
      finally { try { await lock.close(); } finally { await rm(`${file}.lock`, { force: true }); } }
    }
  }
}
function isCode(error: unknown, code: string): boolean { return error instanceof Error && "code" in error && error.code === code; }
