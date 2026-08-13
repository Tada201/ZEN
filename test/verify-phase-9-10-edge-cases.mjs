import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { loadSourceModule, closeSourceModuleLoader } from "./test-loader.mjs";

const executionSource = readFileSync(
  new URL("../src/atlas/agentRuntime/executionTrace.ts", import.meta.url),
  "utf8",
);
const genericSource = readFileSync(
  new URL("../src/atlas/components/chat/tool/content/GenericContent.tsx", import.meta.url),
  "utf8",
);
const querySource = readFileSync(
  new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url),
  "utf8",
);
const traceSource = readFileSync(
  new URL("../src/atlas/components/chat/AgentExecutionTrace.tsx", import.meta.url),
  "utf8",
);
const cardSource = readFileSync(
  new URL("../src/atlas/components/chat/ToolCallCard.tsx", import.meta.url),
  "utf8",
);

assert(executionSource.includes("TERMINAL_STATUS_HINTS"), "terminal statuses must override stale execution phases");
assert(executionSource.includes("sanitizeNormalizedNodes"), "normalized trace hydration must sanitize malformed node arrays");
assert(executionSource.includes("mergeDuplicateNormalizedNode"), "duplicate normalized node IDs need deterministic merging");
assert(genericSource.includes("outputPreview.errorMessage"), "structured errors must remain visible even without stderr or exit codes");
assert(traceSource.includes('toolCall.recoveryState === "stale"'), "stale ledger rows need an interrupted visual signal");
assert(cardSource.includes("outputPreview.errorMessage") && cardSource.includes("outputPreview.stderr"), "error-only previews must still mount expanded diagnostics");
assert(querySource.includes("trace.traceVersion > current.traceVersion") && querySource.includes("nextUpdatedAt >= currentUpdatedAt"), "duplicate traces for one message must resolve deterministically");

const traceModule = await loadSourceModule("../src/atlas/agentRuntime/executionTrace.ts");
assert.equal(
  traceModule.normalizeExecutionPhase("tool_running", "error"),
  "errored",
  "a stale running phase must not hide a terminal error status",
);
assert.equal(
  traceModule.normalizeExecutionStatus("tool_running", "completed"),
  "completed",
  "a stale running phase must not keep a completed run active",
);
assert.equal(
  traceModule.normalizeExecutionPhase("tool_running", "timeout"),
  "errored",
  "timeouts must map to the failed lifecycle",
);

const projected = traceModule.projectNormalizedTraceToMessage(
  { id: "message-1", role: "assistant", content: "", status: "sending" },
  {
    traceId: "trace-1",
    chatId: "chat-1",
    messageId: "message-1",
    traceVersion: 2,
    status: "completed",
    updatedAt: "now",
    eventCount: 4,
    nodes: [
      {
        id: "tool-1",
        traceId: "trace-1",
        runId: "run-1",
        messageId: "message-1",
        sequence: 1,
        kind: "tool",
        phase: "completed",
        startedAt: 10,
        completedAt: 20,
        summary: "run_command completed",
        outputPreview: "Command passed",
        safeDetails: { toolName: "run_command" },
      },
      {
        id: "tool-1",
        traceId: "trace-1",
        runId: "run-1",
        messageId: "message-1",
        sequence: 1,
        kind: "tool",
        phase: "tool_running",
        startedAt: 10,
        summary: "stale running duplicate",
        safeDetails: { toolName: "run_command" },
      },
      { id: "malformed-without-kind" },
      { sequence: 99, kind: "tool" },
    ],
  },
);

assert.equal(projected.toolCalls?.length, 2, "duplicate IDs and invalid nodes must not create duplicate execution cards");
assert.equal(projected.toolCalls?.[0].status, "completed", "a stale duplicate must not regress a terminal node");
assert.equal(projected.toolCalls?.[0].outputPreview, "Command passed", "duplicate merging must preserve the useful preview");
assert.equal(projected.toolCalls?.[1].name, "tool", "nodes missing kind should receive a safe generic tool identity");
assert.equal(projected.status, "sent", "a completed normalized trace must not remain in a sending state");

await closeSourceModuleLoader();
console.log("Phase 9–10 edge-case verifier passed");
