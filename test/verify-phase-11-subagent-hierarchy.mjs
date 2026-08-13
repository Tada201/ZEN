import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { loadSourceModule, closeSourceModuleLoader } from "./test-loader.mjs";

const runtime = await loadSourceModule("../src/atlas/agentRuntime/subagentRuntime.ts");
const treeModule = await loadSourceModule("../src/atlas/agentRuntime/delegationTree.ts");
const { projectScopedSubagents, selectOwnedChildTools, normalizeScopedSubagentStatus } = runtime;
const { buildDelegationTree } = treeModule;

const subagentStep = (spawnId, status, extra = {}) => ({
  type: "subagent",
  eventId: spawnId,
  status: status === "failed" ? "error" : status === "cancelled" ? "cancelled" : status === "running" ? "running" : "completed",
  subagent: {
    spawnId,
    parentToolCallId: extra.parentToolCallId,
    agentId: extra.agentId || spawnId,
    agentName: extra.agentName || spawnId,
    task: extra.task || `Task for ${spawnId}`,
    status,
    resultSummary: extra.resultSummary,
    error: extra.error,
    timestamp: extra.timestamp || 100,
    childToolCallIds: extra.childToolCallIds || [],
  },
});

const records = projectScopedSubagents([
  subagentStep("spawn-1", "completed", { childToolCallIds: ["tool-1"], resultSummary: "done" }),
  // A late running duplicate must not reopen the completed child, and its new
  // explicit child id must still be retained for ownership reconstruction.
  subagentStep("spawn-1", "running", { childToolCallIds: ["tool-2"] }),
]);
assert.equal(records.get("spawn-1").status, "completed", "late running lifecycle events must not reopen a terminal child");
assert.deepEqual(records.get("spawn-1").childToolCallIds, ["tool-1", "tool-2"], "duplicate lifecycle events must union child tool ids");
assert.equal(records.get("spawn-1").resultSummary, "done", "late partial updates must preserve terminal summaries");
assert.equal(normalizeScopedSubagentStatus("provider_made_up_state"), "uncertain", "unknown lifecycle states must fail closed into review state");

const recovered = projectScopedSubagents([
  { ...subagentStep("spawn-recovered", "running"), subagent: { ...subagentStep("spawn-recovered", "running").subagent, recoveryState: "stale" } },
  subagentStep("spawn-recovered", "completed", { resultSummary: "finished after reconnect" }),
]);
assert.equal(recovered.get("spawn-recovered").status, "completed", "a real terminal event must resolve a stale reload marker");

const explicitRecord = {
  spawnId: "spawn-explicit",
  parentToolCallId: "spawn-parent-tool",
  childToolCallIds: ["owned-tool"],
};
const ownedTool = { id: "owned-tool", name: "read_file", status: "completed", input: {}, output: "" };
const siblingTool = { id: "sibling-tool", name: "run_command", status: "completed", input: {}, output: "", traceId: "spawn-explicit", parentToolCallId: "spawn-parent-tool" };
assert.deepEqual(selectOwnedChildTools(explicitRecord, [ownedTool, siblingTool]).map((tool) => tool.id), ["owned-tool"], "explicit child ids must exclude sibling and legacy matches");

const tools = [
  { id: "spawn-child-tool", name: "spawn_agent", status: "completed", input: {}, output: "", traceId: "spawn-parent" },
  { id: "parent-tool", name: "read_file", status: "completed", input: {}, output: "", traceId: "spawn-parent" },
  { id: "child-tool", name: "web_search", status: "completed", input: {}, output: "", traceId: "spawn-child" },
  { id: "sibling-tool", name: "run_command", status: "completed", input: {}, output: "", traceId: "other" },
];
const nestedSteps = [
  subagentStep("spawn-parent", "completed", { childToolCallIds: ["spawn-child-tool", "parent-tool"] }),
  subagentStep("spawn-child", "failed", { parentToolCallId: "spawn-child-tool", childToolCallIds: ["child-tool"], error: "child failed" }),
  // Duplicate persisted child lifecycle row must not produce a second card.
  subagentStep("spawn-child", "running", { parentToolCallId: "spawn-child-tool" }),
];
const tree = buildDelegationTree(nestedSteps, tools);
assert.equal(tree.roots.length, 1, "nested hierarchy must retain one root delegation");
assert.deepEqual(tree.childrenByParent.get("spawn-parent").map((step) => step.subagent.spawnId), ["spawn-child"], "duplicate child rows must collapse to one nested step");
assert.equal(tree.nodes.get("spawn-child").parentSpawnId, "spawn-parent", "child parentage must use the explicit parent spawn tool id");
assert.equal(tree.nodes.get("spawn-child").status, "failed", "out-of-order running child updates must not erase failure");
assert.equal(tree.nodes.get("spawn-parent").childToolCount, 1, "nested spawn tools must remain available for child hierarchy but not inflate parent work count");

const cyclicSteps = [
  subagentStep("a", "running", { parentToolCallId: "tool-b", childToolCallIds: ["tool-a"] }),
  subagentStep("b", "running", { parentToolCallId: "tool-a", childToolCallIds: ["tool-b"] }),
];
const cyclicTree = buildDelegationTree(cyclicSteps, [
  { id: "tool-a", name: "spawn_agent", status: "running", input: {}, output: "" },
  { id: "tool-b", name: "spawn_agent", status: "running", input: {}, output: "" },
]);
assert.equal(cyclicTree.roots.length, 1, "cyclic persisted parentage must be broken into a visible root");
assert(cyclicTree.nodes.get("a").depth <= 8 && cyclicTree.nodes.get("b").depth <= 8, "corrupt depth must remain bounded");

const persistence = readFileSync(new URL("../src/atlas/hooks/stream/projectStepsForPersistence.ts", import.meta.url), "utf8");
const events = readFileSync(new URL("../src/atlas/hooks/stream/useAgentEvents.ts", import.meta.url), "utf8");
const scopedStore = readFileSync(new URL("../src/atlas/agentRuntime/scopedSubagentStore.ts", import.meta.url), "utf8");
assert(persistence.includes("childToolCallIds: [...new Set(subagent.childToolCallIds || [])]"), "reload persistence must retain explicit child tool ids");
assert(events.includes("if (!spawnId.trim()) return"), "malformed subagent lifecycle events must be rejected");
assert(events.includes("normalizeScopedSubagentStatus(payload.status)"), "live lifecycle events must normalize unknown statuses before rendering");
assert(events.includes("existing?.subagent?.childToolCallIds"), "live lifecycle updates must preserve child ids when payloads are partial");
assert(readFileSync(new URL("../src/atlas/agentRuntime/subagentRuntime.ts", import.meta.url), "utf8").includes("return \"uncertain\""), "unknown subagent status handling must remain explicit");
assert(scopedStore.includes("selectOwnedChildTools"), "runtime store must use the canonical ownership selector");

await closeSourceModuleLoader();
console.log("phase 11 subagent hierarchy edge cases ok");
