import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { loadSourceModule, closeSourceModuleLoader } from "./test-loader.mjs";

const reducerSource = readFileSync(new URL("../src/atlas/hooks/stream/toolEventReducer.ts", import.meta.url), "utf8");
const messageItemSource = readFileSync(new URL("../src/atlas/components/chat/MessageItem.tsx", import.meta.url), "utf8");
assert(!reducerSource.includes("tool-ledger-"), "new tool events must not create renderable tool-ledger rows");
assert(!messageItemSource.includes("tool-ledger-"), "production rendering must not depend on tool-ledger rows");
assert(reducerSource.includes("rememberRecoveryTool"), "unowned tool events must use the recovery buffer");

const trace = await loadSourceModule("../src/atlas/agentRuntime/executionTrace.ts");
const {
  normalizeExecutionPhase,
  normalizeExecutionStatus,
  toolCallToExecutionNode,
} = trace;
assert.equal(normalizeExecutionPhase("tool_call_ready"), "tool_announced");
assert.equal(normalizeExecutionStatus("approval_required"), "waiting");
assert.equal(normalizeExecutionStatus("failed"), "failed");
assert.equal(normalizeExecutionStatus("complete"), "completed");
assert.equal(normalizeExecutionStatus("connection_lost"), "interrupted");

const previewNode = toolCallToExecutionNode({
  id: "tool-preview",
  name: "run_command",
  status: "completed",
  input: { command: "npm test" },
  output: `authorization: secret-value ${"x".repeat(700)}`,
  traceId: "trace-1",
  runId: "run-1",
  messageId: "message-1",
  sequence: 2,
});
assert(previewNode.outputPreview, "execution nodes should expose a bounded output preview");
assert(previewNode.outputPreview.includes("[redacted]"), "output previews should redact sensitive labels");
assert(previewNode.outputPreview.length <= 480, "output previews should remain bounded");
assert.equal(previewNode.resultSummary, previewNode.outputPreview, "result summary should use the canonical bounded preview");

const recovery = await loadSourceModule("../src/atlas/hooks/stream/strayToolLedger.ts");
const { clearRecoveryTools, rememberRecoveryTool, takeRecoveryTools, reconcileStrayToolLedgers } = recovery;
clearRecoveryTools();
rememberRecoveryTool("backend-2", {
  id: "late-tool",
  name: "read_file",
  status: "running",
  input: { path: "src/App.tsx" },
  output: "",
  messageId: "backend-2",
});
rememberRecoveryTool("backend-2", {
  id: "late-tool",
  name: "read_file",
  status: "completed",
  input: { path: "src/App.tsx" },
  output: "loaded",
  messageId: "backend-2",
});
const recovered = takeRecoveryTools(["backend-2"]);
assert.equal(recovered.length, 1, "duplicate late events should coalesce in recovery");
assert.equal(recovered[0].status, "completed", "late completion should upgrade the buffered start");
assert.equal(recovered[0].output, "loaded", "late completion output should survive recovery");
assert.equal(takeRecoveryTools(["backend-2"]).length, 0, "recovery should be consumed exactly once");

rememberRecoveryTool("backend-2", {
  id: "late-tool",
  name: "read_file",
  status: "completed",
  input: { path: "src/App.tsx" },
  output: "loaded",
  messageId: "backend-2",
});

const assistant = {
  id: "optimistic-2",
  sessionId: "chat-1",
  role: "assistant",
  content: "Done",
  status: "sent",
  steps: [{ type: "text", content: "Done" }],
  toolCalls: [],
};
const reconciled = reconcileStrayToolLedgers(
  [assistant],
  "optimistic-2",
  "backend-2",
);
assert.equal(reconciled.length, 1, "reconciliation must not synthesize a system ledger row");
assert.equal(reconciled[0].id, "backend-2", "reconciliation should remap the assistant to backend ownership");
assert.equal(reconciled[0].toolCalls[0].id, "late-tool", "recovered tool should attach to its backend owner");
assert.equal(reconciled[0].steps[0].toolCall.id, "late-tool", "recovered tool should remain in the ordered assistant timeline");

await closeSourceModuleLoader();
console.log("execution trace authority ok");
