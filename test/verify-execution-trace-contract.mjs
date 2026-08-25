import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { loadSourceModule, closeSourceModuleLoader } from "./test-loader.mjs";

const trace = await loadSourceModule("../src/atlas/agentRuntime/executionTrace.ts");
const { normalizeExecutionPhase, normalizeExecutionStatus, toolCallToExecutionNode, subagentToExecutionNode, sortExecutionNodes } = trace;

assert.equal(normalizeExecutionPhase("tool_executing"), "tool_running");
assert.equal(normalizeExecutionPhase("approval_required"), "waiting_for_approval");
assert.equal(normalizeExecutionPhase("failed"), "errored");
assert.equal(normalizeExecutionPhase("complete"), "completed");
assert.equal(normalizeExecutionStatus("approval_required"), "waiting");
assert.equal(normalizeExecutionStatus("failed"), "failed");

const toolNode = toolCallToExecutionNode({
  id: "tool-child",
  name: "run_command",
  status: "completed",
  input: { command: "cargo check" },
  output: "exit 0",
  traceId: "trace-child",
  runId: "run-child",
  messageId: "message-1",
  parentToolCallId: "spawn-1",
  sequence: 4,
  phase: "completed",
  startTime: 100,
  completedAt: 300,
  durationMs: 200,
}, "message-1");
assert.equal(toolNode.id, "tool-child");
assert.equal(toolNode.parentId, "spawn-1");
assert.equal(toolNode.sequence, 4);
assert.equal(toolNode.phase, "completed");
assert.equal(toolNode.target, "cargo check");
assert.equal(toolNode.outputPreview, "exit 0");

const childNode = subagentToExecutionNode({
  spawnId: "spawn-1",
  parentToolCallId: "spawn-parent",
  agentId: "reviewer",
  agentName: "Reviewer",
  task: "Review the change",
  status: "completed",
  childToolCallIds: ["tool-child"],
  resultSummary: "Looks good",
  timestamp: 90,
}, "message-1", 3);
assert.equal(childNode.parentId, "spawn-parent");
assert.deepEqual(childNode.safeDetails.childToolCallIds, ["tool-child"]);
assert.equal(childNode.phase, "completed");

assert.deepEqual(
  sortExecutionNodes([toolNode, childNode]).map((node) => node.id),
  ["spawn-1", "tool-child"],
  "canonical nodes should sort by explicit sequence before timestamps",
);

const eventBus = readFileSync(new URL("../src-tauri/crates/zen-agent/src/event_bus.rs", import.meta.url), "utf8");
const runner = readFileSync(new URL("../src-tauri/crates/zen-agent/src/runner/lifecycle.rs", import.meta.url), "utf8");
const dispatch = ["mod.rs", "router.rs", "executors.rs", "completion.rs"]
  .map((f) => readFileSync(new URL(`../src-tauri/crates/zen-agent/src/runner/dispatch/${f}`, import.meta.url), "utf8")).join("");
const spawn = [
  "child.rs", "completion.rs", "deps.rs", "failure.rs", "messaging.rs",
  "model_select.rs", "outcome.rs", "params.rs", "tool.rs",
].map((f) => readFileSync(new URL(`../src-tauri/src/agent/tools/spawn_tools/${f}`, import.meta.url), "utf8")).join("");
const service = readFileSync(new URL("../src-tauri/src/services/tool.rs", import.meta.url), "utf8");

for (const field of ["parent_tool_call_id", "sequence", "timestamp", "phase"]) {
  assert(eventBus.includes(`pub ${field}:`), `backend event contract should include ${field}`);
}
assert(runner.includes("next_event_sequence"), "runner should own monotonic event sequencing");
assert(dispatch.includes("self.next_event_sequence()"), "tool events should use backend sequence values");
assert(spawn.includes("with_parent_tool_call_id(parent_tool_call_id.clone())"), "child runner should inherit its owning tool id");
assert(spawn.includes("child_tool_call_ids"), "subagent completion should report child tool ids");
assert(service.includes("_parent_tool_call_id"), "parent ownership should cross the private tool boundary");

await closeSourceModuleLoader();
console.log("execution trace contract ok");
