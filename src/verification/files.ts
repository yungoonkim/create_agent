import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ArtifactEvidence, VerificationEvidence } from "./contracts.js";
import { artifactPath } from "./validation.js";

export class ArtifactInspectionError extends Error {
  constructor(readonly outcome: "failed" | "blocked", message: string) { super(message); }
}

export async function inspectFile(workspace: string, path: string): Promise<ArtifactEvidence> {
  artifactPath(path);
  try {
    const target = await realpath(resolve(workspace, ...path.split(/[\\/]/)));
    const rel = relative(workspace, target);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new ArtifactInspectionError("blocked", "Artifact resolves outside the workspace.");
    const file = await open(target, "r");
    try {
      const before = await file.stat();
      if (!before.isFile() || before.size > 8 * 1024 * 1024) throw new ArtifactInspectionError("blocked", "Artifact must be a regular file of at most 8 MiB.");
      const hash = createHash("sha256");
      let size = 0;
      for await (const chunk of file.createReadStream({ autoClose: false })) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 8 * 1024 * 1024) throw new ArtifactInspectionError("blocked", "Artifact grew beyond the inspection limit.");
        hash.update(buffer);
      }
      const after = await file.stat();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || size !== after.size) throw new ArtifactInspectionError("blocked", "Artifact changed during inspection.");
      return { path, size, sha256: hash.digest("hex") };
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof ArtifactInspectionError) throw error;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") throw new ArtifactInspectionError("failed", `Missing artifact or verification input: ${path}.`);
    throw new ArtifactInspectionError("blocked", `Cannot inspect artifact or verification input: ${path}.`);
  }
}

export async function assertEvidenceCurrent(evidence: VerificationEvidence): Promise<void> {
  const root = await realpath(evidence.workspaceRoot);
  if (root !== evidence.workspaceRoot) throw new Error("Verification workspace changed; verify again.");
  for (const artifact of evidence.artifacts) {
    const current = await inspectFile(root, artifact.path);
    if (current.sha256 !== artifact.sha256 || current.size !== artifact.size) throw new Error(`Verification evidence is stale for ${artifact.path}; verify again.`);
  }
}
