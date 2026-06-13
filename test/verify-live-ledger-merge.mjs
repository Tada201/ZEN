import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/hooks/chat/liveLedgerMerge.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "liveLedgerMerge.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { findLiveAssistantForFetched, mergeLiveToolState } = await import(moduleUrl);

const liveAssistant = {
  id: "temp-assistant-1",
  sessionId: "chat-1",
  role: "assistant",
  content: "I checked the trace and build.",
  status: "sent",
  toolCalls: [
    {
      id: "tool-read-1",
      name: "read_file",
      status: "completed",
      input: { path: "src/atlas/hooks/stream/useToolEvents.ts" },
      output: "preserved read result",
      durationMs: 120,
    },
  ],
  steps: [
    {
      type: "action",
      kind: "agent_spawn",
      content: "Spawned Researcher",
      status: "running",
      eventId: "agent:researcher-1",
      metadata: { spawn: { childAgent: "Researcher", status: "spawned" } },
    },
    {
      type: "tool-call",
      toolCall: {
        id: "tool-read-1",
        name: "read_file",
        status: "completed",
        input: { path: "src/atlas/hooks/stream/useToolEvents.ts" },
        output: "preserved read result",
        durationMs: 120,
      },
    },
    {
      type: "action",
      kind: "agent_complete",
      content: "Researcher completed",
      status: "completed",
      eventId: "agent:researcher-1",
      metadata: { spawn: { childAgent: "Researcher", status: "completed" } },
    },
  ],
};

const fetchedAssistant = {
  id: "db-assistant-1",
  sessionId: "chat-1",
  role: "assistant",
  content: "I checked the trace and build.",
  status: "sent",
  toolCalls: [],
  steps: [{ type: "text", content: "I checked the trace and build." }],
};

const live = findLiveAssistantForFetched(fetchedAssistant, [
  { id: "user-1", sessionId: "chat-1", role: "user", content: "test", status: "sent" },
  liveAssistant,
]);
assert.equal(live?.id, liveAssistant.id, "fetched assistant should match live temp assistant by content");

const merged = mergeLiveToolState(fetchedAssistant, live);
assert.equal(merged.toolCalls.length, 1, "live tool call should survive DB refresh");
assert.equal(merged.toolCalls[0].name, "read_file", "tool display name should be preserved");
assert.equal(merged.toolCalls[0].output, "preserved read result", "tool result preview should be preserved");
assert(merged.steps.some((step) => step.type === "tool-call" && step.toolCall?.id === "tool-read-1"), "tool step should survive");
assert(
  merged.steps.some((step) => step.type === "action" && step.eventId === "agent:researcher-1" && step.status === "completed"),
  "subagent lifecycle row should survive and end completed",
);
assert.deepEqual(
  merged.steps.map((step) => step.type),
  ["action", "tool-call", "action", "text"],
  "DB refresh must preserve live tool chronology instead of moving tools below completed text",
);

const interleavedLive = {
  ...liveAssistant,
  steps: [
    { type: "text", content: "Starting analysis." },
    liveAssistant.steps[1],
    { type: "text", content: "Finished analysis." },
  ],
};
const interleavedFetched = {
  ...fetchedAssistant,
  content: "Starting analysis. Finished analysis.",
  steps: [
    { type: "text", content: "Starting analysis." },
    { type: "text", content: "Finished analysis." },
  ],
};
const interleaved = mergeLiveToolState(interleavedFetched, interleavedLive);
assert.deepEqual(
  interleaved.steps.map((step) => step.type),
  ["text", "tool-call", "text"],
  "tool calls must remain between the text segments where they occurred",
);

const olderFetchedAssistant = {
  ...fetchedAssistant,
  id: "db-assistant-older",
  content: "Different old answer",
};
const fallback = findLiveAssistantForFetched(olderFetchedAssistant, [liveAssistant], { allowLatestFallback: false });
assert.equal(fallback, undefined, "fallback live ledger match must not attach to non-latest fetched assistants");

console.log("live ledger merge ok");
