import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/components/chat/messageListStreamSignature.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "messageListStreamSignature.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { buildMessageListStreamSignature } = await import(moduleUrl);

const base = {
  id: "assistant-1",
  role: "assistant",
  status: "sending",
  content: "a".repeat(100),
  steps: [{ type: "text", content: "a".repeat(100) }],
};

assert.equal(
  buildMessageListStreamSignature(base),
  buildMessageListStreamSignature({ ...base, content: "a".repeat(180), steps: [{ type: "text", content: "a".repeat(180) }] }),
  "small text deltas should stay in the same stream signature bucket",
);

assert.notEqual(
  buildMessageListStreamSignature(base),
  buildMessageListStreamSignature({ ...base, content: "a".repeat(260), steps: [{ type: "text", content: "a".repeat(260) }] }),
  "large enough text growth should advance the signature bucket",
);

const runningTool = {
  ...base,
  steps: [{ type: "tool-call", toolCall: { id: "tool-1", name: "read_file", status: "running", input: {}, output: "", batchId: "batch-1" } }],
};
const completedTool = {
  ...base,
  steps: [{ type: "tool-call", toolCall: { id: "tool-1", name: "read_file", status: "completed", input: {}, output: "", batchId: "batch-1" } }],
};
assert.notEqual(
  buildMessageListStreamSignature(runningTool),
  buildMessageListStreamSignature(completedTool),
  "tool status transitions should still update the signature immediately",
);

const sameToolSmallOutput = {
  ...completedTool,
  steps: [{ type: "tool-call", toolCall: { id: "tool-1", name: "read_file", status: "completed", input: {}, output: "x".repeat(512), batchId: "batch-1" } }],
};
assert.equal(
  buildMessageListStreamSignature(completedTool),
  buildMessageListStreamSignature(sameToolSmallOutput),
  "small tool output growth should not force list measurement",
);

const providerStatus = {
  ...base,
  steps: [{ type: "action", kind: "chat_status", status: "running", content: "", metadata: { phase: "provider_ready" } }],
};
const modelStatus = {
  ...base,
  steps: [{ type: "action", kind: "chat_status", status: "running", content: "", metadata: { phase: "llm_invoked" } }],
};
assert.notEqual(
  buildMessageListStreamSignature(providerStatus),
  buildMessageListStreamSignature(modelStatus),
  "status-only pipeline phase changes should update list measurement and autoscroll",
);

const workflowProgressA = {
  ...base,
  steps: [{ type: "action", kind: "orchestrator_progress", status: "running", content: "", metadata: { progressPercent: 20, tasksCompleted: 1, totalTasks: 5 } }],
};
const workflowProgressB = {
  ...base,
  steps: [{ type: "action", kind: "orchestrator_progress", status: "running", content: "", metadata: { progressPercent: 40, tasksCompleted: 2, totalTasks: 5 } }],
};
assert.notEqual(
  buildMessageListStreamSignature(workflowProgressA),
  buildMessageListStreamSignature(workflowProgressB),
  "workflow progress metadata should update list measurement without relying on content text",
);

console.log("message list stream signature ok");
