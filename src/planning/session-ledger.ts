import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { GenerateContentResponse, type GenerateContentParameters } from "@google/genai";
import { WRITER_SYSTEM_INSTRUCTION } from "./prompts.js";

export interface SessionBudget { readonly maxCalls: number; readonly priorCalls: number }
export interface SessionTransport {
  generateContent(request: GenerateContentParameters): Promise<GenerateContentResponse>;
}
export function requestFingerprint(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) :
    v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, item]) => [k, sort(item)])) : v;
  return createHash("sha256").update(JSON.stringify(sort(JSON.parse(JSON.stringify(value))))).digest("hex");
}

/** Reservations count even if credentials/network fail. Unknown outcomes never replay automatically. */
export class FileSessionLedger {
  constructor(readonly directory: string) {}
  async initialize(budget: SessionBudget): Promise<void> {
    if (!Number.isSafeInteger(budget.maxCalls) || !Number.isSafeInteger(budget.priorCalls) || budget.priorCalls < 0 || budget.maxCalls < budget.priorCalls) throw new Error("Invalid session request budget.");
    await mkdir(join(this.directory, "calls"), { recursive: true });
    await writeFile(join(this.directory, "budget.json"), JSON.stringify(budget), { flag: "wx" });
    await writeFile(join(this.directory, "budget.sha256"), requestFingerprint(budget), { flag: "wx" });
    await mkdir(join(this.directory, "budget-changes"));
  }
  async status(): Promise<SessionBudget & { originalMaxCalls: number; usedCalls: number; remainingCalls: number; unknownOutcomes: number; knownTokens: number; priorUsageIncluded: false; responsesWithoutUsage: number }> {
    const budget = JSON.parse(await readFile(join(this.directory, "budget.json"), "utf8")) as SessionBudget;
    if (!Number.isSafeInteger(budget.maxCalls) || !Number.isSafeInteger(budget.priorCalls) || budget.priorCalls < 0 || budget.maxCalls < budget.priorCalls) throw new Error("Invalid persisted session budget.");
    if (requestFingerprint(budget) !== await readFile(join(this.directory, "budget.sha256"), "utf8")) throw new Error("Original request budget was modified.");
    let maxCalls = budget.maxCalls;
    for (const [index, file] of (await readdir(join(this.directory, "budget-changes"))).sort().entries()) {
      if (file !== `${String(index + 1).padStart(4, "0")}.json`) throw new Error("Budget change history is incomplete.");
      const change = JSON.parse(await readFile(join(this.directory, "budget-changes", file), "utf8"));
      if (change.from !== maxCalls || !Number.isSafeInteger(change.to) || change.to <= maxCalls || typeof change.reason !== "string" || !change.reason.trim()) throw new Error("Invalid budget change receipt.");
      maxCalls = change.to;
    }
    const rows = await this.rows(); let unknownOutcomes = 0; let knownTokens = 0; let responsesWithoutUsage = 0;
    for (const row of rows) {
      const receipt = await this.optional(`${row}.response.json`);
      if (receipt !== undefined) {
        const usage = (receipt as { usageMetadata?: { totalTokenCount?: number } }).usageMetadata;
        if (usage?.totalTokenCount === undefined) responsesWithoutUsage++; else knownTokens += usage.totalTokenCount;
      } else if (await this.optional(`${row}.failure.json`) === undefined) unknownOutcomes++;
    }
    const usedCalls = budget.priorCalls + rows.length;
    if (usedCalls > maxCalls) throw new Error("Persisted session exceeds its request budget.");
    return { ...budget, originalMaxCalls: budget.maxCalls, maxCalls, usedCalls, remainingCalls: maxCalls - usedCalls, unknownOutcomes, knownTokens, priorUsageIncluded: false, responsesWithoutUsage };
  }
  async increaseBudget(maxCalls: number, reason: string): Promise<void> {
    const lock = await open(join(this.directory, "provider.lock"), "wx");
    try {
      const status = await this.status();
      if (status.unknownOutcomes || !Number.isSafeInteger(maxCalls) || maxCalls <= status.maxCalls || !reason.trim()) throw new Error("A budget increase requires a larger explicit total, a reason and no unknown requests.");
      const number = (await readdir(join(this.directory, "budget-changes"))).length + 1;
      await writeFile(join(this.directory, "budget-changes", `${String(number).padStart(4, "0")}.json`),
        JSON.stringify({ from: status.maxCalls, to: maxCalls, reason, approvedAt: new Date().toISOString() }), { flag: "wx" });
    } finally { await lock.close(); await unlink(join(this.directory, "provider.lock")); }
  }
  async assertAvailable(required: number): Promise<void> {
    const status = await this.status();
    if (status.unknownOutcomes) throw new Error("An earlier request has an unknown outcome. Inspect the saved receipt; automatic replay is blocked.");
    if (status.remainingCalls < required) throw new Error(`REQUEST_BUDGET: need up to ${required} calls, ${status.remainingCalls} remain. Existing limits were preserved.`);
  }
  async generate(request: GenerateContentParameters, transport: SessionTransport): Promise<GenerateContentResponse> {
    const lock = await open(join(this.directory, "provider.lock"), "wx");
    try {
      const fingerprint = requestFingerprint(request);
      await this.assertAvailable(0);
      for (const id of await this.rows()) {
        const started = await this.optional(`${id}.started.json`) as { fingerprint?: string };
        if (started.fingerprint !== fingerprint) continue;
        const raw = await this.optional(`${id}.response.json`);
        if (raw === undefined) throw new Error("This exact request already failed. No automatic paid retry was made.");
        // Replayed historical tokens are not a second billable model invocation.
        const cached = { ...(raw as object) } as Record<string, unknown>; delete cached.usageMetadata;
        return Object.assign(new GenerateContentResponse(), cached);
      }
      const writer = request.config?.systemInstruction === WRITER_SYSTEM_INSTRUCTION;
      await this.assertAvailable(writer ? 3 : 1);
      const id = String((await this.rows()).length + 1).padStart(4, "0");
      await this.save(`${id}.started.json`, { fingerprint, stage: writer ? "writer" : "reviewer", startedAt: new Date().toISOString() });
      await this.save(`${id}.request.json`, request);
      try {
        if (request.config?.httpOptions?.retryOptions?.attempts !== 1) throw new Error("Session calls require SDK attempts=1.");
        const response = await transport.generateContent(request);
        await this.save(`${id}.response.json`, { candidates: response.candidates ?? [], usageMetadata: response.usageMetadata,
          modelVersion: response.modelVersion, responseId: response.responseId, promptFeedback: response.promptFeedback });
        return response;
      } catch (error) {
        await this.save(`${id}.failure.json`, { failedAt: new Date().toISOString(), rawMessageOmitted: true });
        throw error;
      }
    } finally { await lock.close(); await unlink(join(this.directory, "provider.lock")); }
  }
  private async rows(): Promise<string[]> {
    return (await readdir(join(this.directory, "calls"))).filter(n => /^\d{4,}\.started\.json$/.test(n)).map(n => n.replace(".started.json", "")).sort();
  }
  private async optional(name: string): Promise<unknown | undefined> {
    try { return JSON.parse(await readFile(join(this.directory, "calls", name), "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  }
  private async save(name: string, value: unknown): Promise<void> {
    await writeFile(join(this.directory, "calls", name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  }
}
