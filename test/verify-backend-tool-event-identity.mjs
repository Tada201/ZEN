import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const eventBus = readFileSync(new URL("../src-tauri/src/agent/event_bus.rs", import.meta.url), "utf8");
const toolDispatch = ["mod.rs", "router.rs", "executors.rs", "completion.rs"]
  .map((f) => readFileSync(new URL(`../src-tauri/src/agent/runner/dispatch/${f}`, import.meta.url), "utf8")).join("");
const toolService = readFileSync(new URL("../src-tauri/src/services/tool.rs", import.meta.url), "utf8");

function structBlock(source, name) {
  const match = source.match(new RegExp(`pub struct ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert(match, `${name} should exist`);
  return match[1];
}

function assertFields(block, name, fields) {
  for (const field of fields) {
    assert(block.includes(`pub ${field}:`), `${name} should expose ${field}`);
  }
}

const identityFields = ["run_id", "parent_agent_id", "execution_id", "batch_id", "tool_batch_id"];
assertFields(structBlock(eventBus, "ToolStartPayload"), "ToolStartPayload", identityFields);
assertFields(structBlock(eventBus, "ToolCompletePayload"), "ToolCompletePayload", identityFields);
assertFields(structBlock(eventBus, "ToolAuthorizationPayload"), "ToolAuthorizationPayload", [
  ...identityFields,
  "agent_id",
  "agent_name",
  "iteration",
]);

assert(toolDispatch.includes("fn tool_batch_id("), "runner should define a stable tool batch id helper");
assert(toolDispatch.includes("let tool_batch_id = self.tool_batch_id(chat_id, agent_id, iteration);"), "runner should compute one batch id per tool iteration");
assert(toolDispatch.includes("ToolStartPayload {"), "runner should emit tool:start");
assert(toolDispatch.includes("ToolCompletePayload {"), "runner should emit tool:complete");
for (const assignment of [
  "run_id: Some(run_id.clone())",
  "parent_agent_id: parent_agent_id.clone()",
  "execution_id: Some(tc_id.clone())",
  "batch_id: Some(tool_batch_id.clone())",
  "tool_batch_id: Some(tool_batch_id.clone())",
]) {
  assert(toolDispatch.includes(assignment), `tool:start should include ${assignment}`);
}

for (const assignment of [
  "run_id: Some(self.execution_run_id(chat_id))",
  "parent_agent_id: self.parent_agent_id()",
  "execution_id: Some(result.tool_call_id.clone())",
  "batch_id: Some(self.tool_batch_id(chat_id, agent_id, iteration))",
  "tool_batch_id: Some(self.tool_batch_id(chat_id, agent_id, iteration))",
]) {
  assert(toolDispatch.includes(assignment), `tool:complete should include ${assignment}`);
}

assert(toolService.includes("pub struct ToolApprovalExecutionContext"), "approval requests should accept execution identity context");
for (const key of [
  '"run_id": run_id',
  '"parent_agent_id": parent_agent_id',
  '"execution_id": execution_id',
  '"batch_id": batch_id',
  '"tool_batch_id": tool_batch_id',
  '"agent_id": agent_id',
  '"agent_name": agent_name',
  '"iteration": iteration',
]) {
  assert(toolService.includes(key), `approval request event should include ${key}`);
}

console.log("backend tool event identity contract ok");
