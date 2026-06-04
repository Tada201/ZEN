import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const fixtures = JSON.parse(readFileSync(new URL("./chat-fixtures.json", import.meta.url), "utf8"));
const sourcePath = new URL("../src/api/mockClient.ts", import.meta.url);
let mockStreamingSource = readFileSync(new URL("../src/api/mockStreaming.ts", import.meta.url), "utf8")
  .replace(
    'import { createActionStep } from "@/atlas/hooks/stream/agentActionLedger";',
    `function createActionStep(payload, kind) {
      const spawn = payload.spawn || {
        parentAgent: payload.parent_agent || "main",
        childAgent: payload.child_agent_name || payload.child_agent_id || payload.agent_id || "agent",
        task: payload.task || "",
        status: payload.status || (kind === "agent_complete" ? "completed" : "running"),
        durationMs: payload.duration_ms,
      };
      return {
        type: "action",
        kind,
        content: payload.message || payload.task || payload.content || "",
        status: payload.status === "failed" || payload.error ? "error" : kind === "agent_complete" ? "completed" : "running",
        metadata: {
          phase: payload.phase,
          parallel: payload.parallel,
          tools: payload.tools,
          spawn,
          resultSummary: payload.result && typeof payload.result === "object" ? payload.result.summary : payload.result,
          iteration: payload.iteration,
        },
        timestamp: payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now(),
        eventId: payload.spawn_id ? "agent:" + payload.spawn_id : kind + ":" + (payload.phase || payload.timestamp || ""),
      };
    }`,
  )
  .replace('import chatFixtures from "../../test/chat-fixtures.json";', `const chatFixtures = ${JSON.stringify(fixtures)};`)
  .replace('export function triggerMockStream', 'function triggerMockStream');
let source = readFileSync(sourcePath, "utf8")
  .replace('import { SECRET_PRESENT_VALUE } from "./settingsApi";', 'const SECRET_PRESENT_VALUE = "__secret_present__";')
  .replace('import { triggerMockStream } from "./mockStreaming";', mockStreamingSource);

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "mockClient.ts",
});

const storage = new Map();
globalThis.window = {};
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { executeMockCommand, mockListen } = await import(moduleUrl);

const chatId = "mock-runtime-agentic";
const eventNames = [
  "chat:status",
  "agent:spawn",
  "tool:start",
  "tool:authorization_request",
  "tool:complete",
  "agent:complete",
  "chat:chunk:first",
  "chat:done",
];
const events = [];
const startedAt = performance.now();
let firstEventAt;
const unlisten = eventNames.map((eventName) =>
  mockListen(eventName, (event) => {
    if (firstEventAt === undefined) firstEventAt = performance.now() - startedAt;
    events.push({ event: eventName, payload: event.payload });
  }),
);

const donePromise = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("mock agentic stream did not finish")), 10_000);
  mockListen("chat:done", () => {
    clearTimeout(timeout);
    resolve();
  });
});

await executeMockCommand("send_message", {
  chatId,
  content: "test codebuff agentic delegation",
  model: "mock-model",
  provider: "mock",
});
await donePromise;
unlisten.forEach((fn) => fn());

assert(firstEventAt !== undefined && firstEventAt < 50, "mock IPC should emit immediate status feedback");

const names = events.map((event) => event.event);
assert(names.includes("agent:spawn"), "mock stream should emit subagent spawn");
assert(names.includes("agent:complete"), "mock stream should emit subagent completion");
assert(names.includes("tool:authorization_request"), "mock stream should emit approval-gated tool request");
assert(names.includes("chat:chunk:first"), "mock stream should emit first chunk");
assert(names.at(-1) === "chat:done", "mock stream should end with chat done");

const toolStarts = events.filter((event) => event.event === "tool:start");
const toolCompletions = events.filter((event) => event.event === "tool:complete");
const approval = events.find((event) => event.event === "tool:authorization_request");
assert(toolStarts.length >= 4, "mock stream should emit all tool starts including approved command start");
assert(toolCompletions.length >= 4, "mock stream should emit all tool completions");
assert(toolStarts.every((event) => event.payload.batch_id === "mock-batch-research-001"), "tool starts should carry batch id");
assert(toolCompletions.every((event) => event.payload.batch_id === "mock-batch-research-001"), "tool completions should carry batch id");
assert.equal(approval.payload.batch_id, "mock-batch-research-001", "approval request should carry batch id");

const firstCompletionIndex = events.findIndex((event) => event.event === "tool:complete");
const approvedStartIndex = events.findIndex(
  (event) => event.event === "tool:start" && event.payload.tool_call_id === approval.payload.tool_call_id,
);
assert(firstCompletionIndex !== -1 && approvedStartIndex !== -1 && firstCompletionIndex < approvedStartIndex, "parallel tools should complete while approval-gated command is pending");

const persisted = await executeMockCommand("get_messages", { chatId });
const assistant = persisted.find((message) => message.role === "assistant");
assert(assistant, "mock stream should persist completed assistant message");
assert(assistant.toolCalls?.length >= 4, "persisted assistant should retain tool calls");
assert(assistant.toolCalls.every((tool) => tool.batchId === "mock-batch-research-001"), "persisted tool calls should retain batch id");
assert(assistant.steps?.some((step) => step.type === "tool-call" && step.toolCall?.batchId === "mock-batch-research-001"), "persisted execution steps should retain batch id");

console.log("mock agentic stream verifier passed");
