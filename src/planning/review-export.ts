import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PlanDraft } from "./contracts.js";
import { renderUserReviewTable, type UserReviewTable } from "./user-review.js";

/** Explicit export to a new directory only. A manifest written last marks a complete bundle. */
export async function exportUserReviewBundle(directory: string, plan: PlanDraft, review: UserReviewTable): Promise<string> {
  const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
  if (hash(JSON.stringify(plan)) !== review.source.planSha256) throw new Error("Export Plan differs from review-table source.");
  const target = resolve(directory);
  await mkdir(target); // Existing output is never replaced, including partial failed exports.
  const files = { "plan.md": plan.content, "review.json": JSON.stringify(review, null, 2) + "\n", "review.md": renderUserReviewTable(review) };
  for (const [name, content] of Object.entries(files)) await writeFile(join(target, name), content, { flag: "wx" });
  await writeFile(join(target, "bundle.json"), JSON.stringify({ schemaVersion: 1, complete: true, kind: "planning_document_review",
    source: review.source, implementationVerification: "not_performed", hashes: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)])) }, null, 2) + "\n", { flag: "wx" });
  return target;
}
