import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createHash } from "node:crypto";
import { loadLivePlanningConfig, parseScopeContract } from "../planning/config.js";
import { createVertexAiClient } from "../planning/google-genai.js";
import { initializePlanningSession, importPlanningRecovery, runPlanningSession, planningSessionStatus, exportPlanningSession, sessionFileHashes, increasePlanningSessionBudget } from "../planning/session.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const allowed: Record<string, readonly string[]> = {
    init: ["session", "config", "scope", "requirements", "max-calls"],
    import: ["session", "from", "config"], run: ["session", "run-live"], status: ["session"], export: ["session"], budget: ["session", "max-calls", "reason"],
  };
  if (!command || !allowed[command]) throw new Error("Use init, import, run, status, export or budget.");
  const opts = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]?.replace(/^--/, "");
    if (!key || args[i] !== `--${key}` || !allowed[command]!.includes(key) || opts.has(key)) throw new Error("Unknown or duplicate session option.");
    const value = key === "run-live" ? "true" : args[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing --${key} value.`);
    opts.set(key, value);
  }
  const required = (key: string): string => { const value = opts.get(key); if (!value) throw new Error(`Missing --${key}.`); return value; };
  const directory = resolve(required("session"));
  if (command === "budget") {
    await increasePlanningSessionBudget(directory, Number(required("max-calls")), required("reason"));
    console.log(JSON.stringify(await planningSessionStatus(directory), null, 2)); return;
  }
  if (command === "init" || command === "import") {
    const config = await loadLivePlanningConfig(required("config"), process.cwd());
    if (command === "import") await importPlanningRecovery(directory, resolve(required("from")), config);
    else {
      const scope = parseScopeContract(JSON.parse(await readFile(resolve(required("scope")), "utf8")), config.projectId);
      const requirements = await readFile(resolve(required("requirements")), "utf8");
      const maxCalls = Number(required("max-calls"));
      console.log(JSON.stringify({ scope, requirements, maxCalls }, null, 2));
      const phrase = `APPROVE ${scope.id} v${scope.version}`;
      const rl = createInterface({ input: stdin, output: stdout });
      try { if ((await rl.question(`Scope approval: type ${phrase}: `)).trim() !== phrase) throw new Error("Scope not approved; no model call was made."); }
      finally { rl.close(); }
      await initializePlanningSession(directory, config, scope, requirements, maxCalls, "User approved the displayed Scope interactively in the persistent Planning session CLI.");
    }
    console.log(JSON.stringify(await planningSessionStatus(directory), null, 2)); return;
  }
  if (command === "status") { console.log(JSON.stringify(await planningSessionStatus(directory), null, 2)); return; }
  let failure: unknown;
  if (command === "run") {
    required("run-live");
    try {
      // Construct credentials only after the persistent request budget permits an actual call.
      let client: ReturnType<typeof createVertexAiClient> | undefined;
      console.log(JSON.stringify(await runPlanningSession(directory, { generateContent: request => {
        client ??= createVertexAiClient(); return client.models.generateContent(request);
      } }), null, 2));
    } catch (error) { failure = error; }
  }
  const output = await exportPlanningSession(directory);
  await writeFile(resolve(output, "artifact-manifest.json"), JSON.stringify({ sha256: await sessionFileHashes(output) }, null, 2), { flag: "wx" });
  const archive = resolve(dirname(directory), `${basename(output)}.tar.gz`);
  const packed = spawnSync("tar", ["-czf", archive, "-C", dirname(output), basename(output)], { encoding: "utf8" });
  if (packed.status !== 0) throw new Error("Archive failed; saved session remains available.");
  console.log(`RESULT_ARCHIVE=${archive}`);
  console.log(`RESULT_SHA256=${createHash("sha256").update(await readFile(archive)).digest("hex")}`);
  if (failure) throw failure;
}
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Session stopped";
  console.error(message.includes("REQUEST_BUDGET") || message.includes("Scope") || message.includes("Missing --") ? message :
    "Session stopped. Inspect the saved state and model receipts; no automatic paid retry was made.");
  process.exitCode = 1;
});
