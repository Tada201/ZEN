import { loadSourceModule, closeSourceModuleLoader } from "./test-loader.mjs";
import { strict as assert } from "node:assert";

const typesModule = await loadSourceModule("../src/atlas/components/chat/types.ts");
const { normalizeVercelMessage } = typesModule;

const stepsJson = JSON.stringify([
  { type: "text", content: "I'll delegate that." },
  {
    type: "subagent",
    eventId: "spawn-abc",
    status: "completed",
    subagent: {
      spawnId: "spawn-abc",
      parentToolCallId: "tc-1",
      agentId: "agent-1",
      agentName: "ResearchAgent",
      task: "Find relevant specs",
      status: "completed",
      resultSummary: "Found 3 specs",
      durationMs: 1200,
      childToolCallIds: ["tc-search-1"],
    },
  },
  {
    type: "tool-call",
    toolCall: {
      id: "tc-search-1",
      name: "web_search",
      status: "completed",
      input: { query: "Zen agentic UI specs" },
      output: "[{\"title\":\"Spec\"}]",
    },
  },
]);

const dbMessage = {
  id: "msg-1",
  chatId: "chat-1",
  role: "assistant",
  content: "Done.",
  model: "test",
  createdAt: new Date().toISOString(),
  isComplete: 1,
  toolCalls: null,
  reasoningDetails: null,
  metadata: null,
  attachments: null,
  kind: "chat",
  stepsJson,
};

const normalized = normalizeVercelMessage(dbMessage);

assert.equal(normalized.steps.length, 3, "all steps should be rehydrated from stepsJson");

const subagentStep = normalized.steps[1];
assert.equal(subagentStep.type, "subagent", "second step should be a subagent step");
assert.equal(subagentStep.subagent.agentName, "ResearchAgent", "agent name should be preserved");
assert.equal(subagentStep.subagent.task, "Find relevant specs", "task should be preserved");
assert.equal(subagentStep.subagent.status, "completed", "status should be preserved");
assert.equal(subagentStep.subagent.resultSummary, "Found 3 specs", "result summary should be preserved");
assert.deepEqual(subagentStep.subagent.childToolCallIds, ["tc-search-1"], "child tool ids should be preserved");

const toolStep = normalized.steps[2];
assert.equal(toolStep.type, "tool-call", "third step should be a tool-call step");
assert.equal(toolStep.toolCall.name, "web_search", "tool-call step should preserve tool name");

await closeSourceModuleLoader();
console.log("subagent execution preview ok");
