import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { loadSourceModule, closeSourceModuleLoader } from "./test-loader.mjs";

const hydrationSource = readFileSync(new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url), "utf8");
const inspectorSource = readFileSync(new URL("../src/atlas/components/right-panel/RunInspector.tsx", import.meta.url), "utf8");
const rustSource = readFileSync(new URL("../src-tauri/src/db/queries/execution_trace.rs", import.meta.url), "utf8");
assert(hydrationSource.includes("projectNormalizedTraceToMessage"), "reload must use the normalized node adapter");
assert(hydrationSource.includes("trace.traceVersion < 2"), "legacy trace versions must retain the compatibility path");
assert(inspectorSource.includes("chatApi.listExecutionTraces"), "Run Inspector must read normalized traces directly");
assert(inspectorSource.includes("redactionPolicy: \"safe-details-v1\""), "trace export must declare its redaction policy");
assert(rustSource.includes("nodes_from_events"), "backend snapshots must expose normalized node records");
assert(rustSource.includes("safe_details_json"), "backend nodes must persist bounded safe details separately");

const executionTrace = await loadSourceModule("../src/atlas/agentRuntime/executionTrace.ts");
const { projectNormalizedTraceToMessage } = executionTrace;
const base = {
  id: "assistant-1",
  sessionId: "chat-1",
  role: "assistant",
  content: "Final answer",
  status: "sent",
  steps: [],
  toolCalls: [],
};
const trace = {
  traceId: "trace-1",
  chatId: "chat-1",
  messageId: "assistant-1",
  traceVersion: 2,
  status: "completed",
  updatedAt: "2026-08-13T00:00:00Z",
  eventCount: 3,
  nodes: [
    {
      id: "tool-1",
      traceId: "trace-1",
      runId: "run-1",
      messageId: "assistant-1",
      sequence: 1,
      kind: "tool",
      phase: "completed",
      startedAt: 100,
      completedAt: 250,
      durationMs: 150,
      summary: "read_file · completed",
      target: "src/App.tsx",
      resultSummary: "Read App",
      outputPreview: "Read App",
      safeDetails: { toolName: "read_file" },
    },
    {
      id: "action-1",
      traceId: "trace-1",
      runId: "run-1",
      messageId: "assistant-1",
      sequence: 2,
      kind: "action",
      phase: "completed",
      summary: "Checkpoint saved",
      resultSummary: "Checkpoint saved",
      safeDetails: { toolName: "checkpoint" },
    },
    {
      id: "tool-2",
      traceId: "trace-1",
      runId: "run-1",
      messageId: "assistant-1",
      sequence: 3,
      kind: "tool",
      phase: "completed",
      summary: "run_command · completed",
      target: "npm test",
      resultSummary: "passed",
      outputPreview: "passed",
      safeDetails: { toolName: "run_command" },
    },
  ],
};
const projected = projectNormalizedTraceToMessage(base, trace);
assert.deepEqual(projected.steps.map((step) => step.type), ["tool-call", "action", "tool-call"], "normalized node order must survive reload");
assert.deepEqual(projected.toolCalls.map((tool) => tool.id), ["tool-1", "tool-2"], "tool index must be derived from normalized nodes");
assert.equal(projected.toolCalls[0].input.path, "src/App.tsx", "tool target must remain usable after reload");
assert.equal(projected.toolCalls[1].input.command, "npm test", "command target must remain usable after reload");
assert.equal(projected.toolCalls[1].outputPreview, "passed", "bounded output preview must survive reload");
assert.equal(projected.metadata.traceVersion, 2, "message metadata must identify the active normalized trace version");
assert.equal(projected.metadata.traceId, "trace-1", "message metadata must preserve trace identity");
assert.equal(projected.status, "sent", "completed normalized traces must hydrate as sent");

await closeSourceModuleLoader();
console.log("execution trace reload parity ok");
