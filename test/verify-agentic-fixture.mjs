import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const fixtures = JSON.parse(readFileSync(new URL("./chat-fixtures.json", import.meta.url), "utf8"));
const fixture = fixtures.test_agentic;
const mockStreamingSource = readFileSync(new URL("../src/api/mockStreaming.ts", import.meta.url), "utf8");

assert(fixture, "test_agentic fixture must exist");
assert(Array.isArray(fixture.flow), "test_agentic.flow must be an array");

const flow = fixture.flow;
const types = flow.map((step) => step.type);

for (const requiredType of [
  "chat:status",
  "agent:spawn",
  "tool:start",
  "tool:authorization_request",
  "tool:complete",
  "agent:complete",
  "chunk:first",
  "done",
]) {
  assert(types.includes(requiredType), `fixture must include ${requiredType}`);
}

const toolBatch = flow.find((step) => step.type === "chat:status" && step.payload?.phase === "tool_batch_planned");
assert(toolBatch, "fixture must include a tool_batch_planned status");
assert.equal(toolBatch.payload.metadata?.parallel, true, "tool batch must be marked parallel");
assert(toolBatch.payload.metadata?.toolCount >= 2, "tool batch must include multiple tools");
assert(Array.isArray(toolBatch.payload.metadata?.tools), "tool batch must list planned tools");
assert(toolBatch.payload.metadata.tools.includes("write_todos"), "tool batch must include task planning");
const plannedBatchId = "mock-batch-research-001";

const spawn = flow.find((step) => step.type === "agent:spawn")?.payload;
const complete = flow.find((step) => step.type === "agent:complete")?.payload;
assert(spawn?.spawn_id, "agent spawn must include spawn_id");
assert.equal(complete?.spawn_id, spawn.spawn_id, "agent complete must reuse spawn_id");
assert(complete?.child_agent_name, "agent complete must include child_agent_name for UI labels");
assert(complete?.result?.summary, "agent complete must include result.summary for previews");

const toolStarts = flow.filter((step) => step.type === "tool:start");
assert(toolStarts.length >= 2, "fixture must include at least two tool starts");
assert(
  toolStarts.slice(0, 2).every((step) => Number(step.delay_ms) <= 150),
  "first two tool starts should be close enough to exercise parallel display",
);
assert(
  toolStarts.every((step) => step.agent_id && step.agent_name && typeof step.iteration === "number"),
  "tool starts should include agent ownership metadata",
);
assert(
  toolStarts.every((step) => step.batch_id === plannedBatchId),
  "tool starts should include explicit batch identity",
);

const todoTool = toolStarts.find((step) => step.tool_name === "write_todos");
assert(todoTool, "fixture must include a write_todos planning tool");
assert(Array.isArray(todoTool.arguments?.todos), "write_todos must include todos for checklist preview");
assert(todoTool.arguments.todos.length >= 4, "write_todos should include enough task items to preview");

const authorization = flow.find((step) => step.type === "tool:authorization_request");
assert(authorization?.tool_call_id, "approval event must include tool_call_id");
assert(authorization?.tool_name, "approval event must include tool_name");
assert(authorization?.arguments?.command, "approval event must include command arguments");
assert.equal(authorization?.batch_id, plannedBatchId, "approval event must preserve explicit batch identity");
assert.equal(authorization?.context?.risk_level, "medium", "approval event must include risk level");
assert(authorization?.context?.arguments_preview, "approval event must include argument preview");

const completions = new Map(
  flow
    .filter((step) => step.type === "tool:complete")
    .map((step) => [step.tool_call_id, step]),
);

for (const tool of [...toolStarts, authorization]) {
  const completion = completions.get(tool.tool_call_id);
  assert(completion, `tool ${tool.tool_call_id} must have a completion`);
  assert.equal(completion.tool_name, tool.tool_name, `tool ${tool.tool_call_id} completion must preserve display name`);
  assert(completion.output, `tool ${tool.tool_call_id} must include output for preview`);
  assert.equal(completion.agent_id, tool.agent_id, `tool ${tool.tool_call_id} completion must preserve agent id`);
  assert.equal(completion.batch_id, tool.batch_id, `tool ${tool.tool_call_id} completion must preserve batch id`);
}

const firstCompletionIndex = flow.findIndex((step) => step.type === "tool:complete");
const approvedStartIndex = flow.findIndex(
  (step) => step.type === "tool:start" && step.tool_call_id === authorization.tool_call_id,
);
assert(
  firstCompletionIndex !== -1 && approvedStartIndex !== -1 && firstCompletionIndex < approvedStartIndex,
  "fixture must show non-blocked parallel tools completing while an approval-gated tool is still pending",
);

const firstChunkIndex = types.indexOf("chunk:first");
const doneIndex = types.indexOf("done");
assert(firstChunkIndex !== -1 && doneIndex > firstChunkIndex, "done must occur after first streamed chunk");
assert(
  mockStreamingSource.includes("batch_id: step.batch_id") && mockStreamingSource.includes("batchId: toolStart.batch_id"),
  "mock client must emit and persist explicit batch identity for in-browser agentic verification",
);

console.log("agentic fixture ok");
