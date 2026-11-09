// Live Scope-change proposal in the isolated replay only; never changes primary.
import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLivePlanningConfig } from "../../dist/src/planning/config.js";
import { FilePlanningMemoryStore } from "../../dist/src/planning/memory-store.js";
import { SupervisorController } from "../../dist/src/supervisor/controller.js";
import { FileSupervisorStore } from "../../dist/src/supervisor/memory-store.js";
import { FileDevelopmentStore } from "../../dist/src/development/memory-store.js";
import { createVertexAiClient, GeminiPlanningWriter, GeminiPlanningReviewer } from "../../dist/src/planning/google-genai.js";
import { GeminiSupervisorProposer } from "../../dist/src/supervisor/google-genai.js";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const replayRoot = join(repository, "../scratch/approved-scope-replay-20261108");
const output = join(repository, "docs/acceptance/2026-11-08/scope-change-test");
const primaryFile = join(repository, ".adtf/projects/supervisor-gemini-acceptance/supervisor/state.json");
const originalText = await readFile(primaryFile, "utf8");
const primary = JSON.parse(originalText);
const config = await loadLivePlanningConfig("config.json", replayRoot);
const memory = new FilePlanningMemoryStore(config.memory.directory);
const base = await memory.getPlanningLoopState(config.projectId);
assert.equal(base.status, "awaiting_approval");
assert.equal(base.currentPlanVersion, 2);
await assert.rejects(access(join(config.memory.directory, "projects", config.projectId, "supervisor/state.json")), { code: "ENOENT" });
const store = new FileSupervisorStore(config.memory.directory);
await store.update(config.projectId, async () => ({ schemaVersion: 1, projectId: config.projectId, revision: 1,
  phase: "scope_approved", originalRequest: primary.originalRequest, clarifications: primary.clarifications,
  scope: primary.scope, scopeApprovalId: primary.scopeApprovalId,
  events: [{ at: new Date().toISOString(), action: "TEST-STUB-context-import", detail: "Isolated fixture imports genuine approved Scope and reviewed replay Plan; no primary workflow or user decision is fabricated." }] }));
const client = createVertexAiClient();
const controller = new SupervisorController({ config, memory, store, developmentStore: new FileDevelopmentStore(config.memory.directory),
  proposer: new GeminiSupervisorProposer(client, config.planning.writer, (usage) => store.appendUsage(usage)),
  writer: new GeminiPlanningWriter(client, memory), reviewer: new GeminiPlanningReviewer(client, memory) });
const reason = "인수시험용 가정이다. 실제 primary 기획을 바꾸거나 제품을 구현하려는 요청이 아니다. 기존 유통기한 조회에서 N을 반드시 입력하도록 한 조건을 바꾸어, N을 생략하면 7일을 기본값으로 사용하고 명시한 N이 있으면 기존대로 검증·적용하도록 변경하는 승인/거절 분기를 시험한다. 명시적인 기준일, lot·수량·날짜 경계, 저장·제외 기능은 그대로 보존한다. 이 제안은 사용자 결정 전까지 채택하지 않는다.";
await controller.continuation().requestScopeChange(reason);
const proposed = await controller.continuation().proposeScopeChange();
const item = proposed.continuations.at(-1);
assert.equal(item.status, "proposed");
assert.equal(await readFile(primaryFile, "utf8"), originalText);
await mkdir(output);
const scope = item.proposedScope;
await writeFile(join(output, "proposal.json"), JSON.stringify(item, null, 2) + "\n");
await writeFile(join(output, "state.json"), JSON.stringify(proposed, null, 2) + "\n");
const lines = ["# 격리된 인수시험용 Scope 변경 제안", "", "**실제 primary Scope v4와 승인된 기획안 v3에는 영향이 없다.**", "",
  `- 시험 실행: approved-scope-replay-20261108 / Scope 변경 분기`, `- 변경안: ${scope.id} v${scope.version}`, `- 기준: ${item.baseScope.id} v${item.baseScope.version}`, `- 상태: 사용자 결정 대기`, "", reason, "", "## 생성된 변경 Scope 원문", "", scope.goal, "", "### 필수 기능", "",
  ...scope.requiredFeatures.map((feature) => `- **${feature.id}**: ${feature.statement}`), "", "### 제외 기능", "", ...scope.excludedFeatures.map((feature) => `- **${feature.id}**: ${feature.statement}`), "", "### 제약", "", ...scope.technicalConstraints.map((constraint) => `- ${constraint}`), "", "승인/거절은 각각 별도 격리 복사본에서 시험할 수 있으며 실제 프로젝트를 변경하거나 개발을 실행하지 않는다. 생성된 기획의 최종 승인도 자동으로 기록하지 않는다."];
await writeFile(join(output, "proposal.md"), lines.join("\n") + "\n");
await writeFile(join(output, "manifest.json"), JSON.stringify({ label: "isolated acceptance scenario", memoryRoot: config.memory.directory,
  projectId: config.projectId, continuationId: item.id, sourcePlanVersion: item.base.currentPlanVersion, primaryUnchanged: true,
  primaryHash: createHash("sha256").update(originalText).digest("hex"), userDecision: "pending" }, null, 2) + "\n");
console.log(JSON.stringify({ scope: scope.id, version: scope.version, state: item.status, primaryUnchanged: true }));
