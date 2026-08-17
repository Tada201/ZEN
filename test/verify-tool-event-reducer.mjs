import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/hooks/stream/toolEventReducer.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const identitySource = readFileSync(
  new URL("../src/atlas/components/chat/tool/toolCallIdentity.ts", import.meta.url),
  "utf8",
).replace(/^import[^\n]+\n/, "");

// The reducer now depends on the Zustand chat store. Strip the alias import and
// inject a runtime mock so the isolated data-URL module can still be exercised.
const preparedSource = source
  .replace(/import\s+\{\s*getToolCallIdentity\s*\}\s+from\s+["']\.\.\/\.\.\/components\/chat\/tool\/toolCallIdentity["'];?\s*\n?/, `${identitySource}\n`)
  .replace(/import\s+\{\s*useChatStore\s*\}\s+from\s+["']@\/lib\/stores\/useChatStore["'];?\s*\n?/, "")
  .replace(/import\s+\{\s*rememberRecoveryTool\s*\}\s+from\s+["']\.\/strayToolLedger["'];?\s*\n?/, "globalThis.__recoveryTools = []; function rememberRecoveryTool(messageId, tool) { if (messageId) globalThis.__recoveryTools.push({ messageId, tool }); }")
  .trim() +
  `\nconst useChatStore = {\n` +
  `  getState: () => ({\n` +
  `    getActiveAssistantForChat: (chatId) => (globalThis.__activeAssistantByChat ?? {})[chatId] ?? null,\n` +
  `  }),\n` +
  `};\n`;

const transpiled = ts.transpileModule(preparedSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "toolEventReducer.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { makeToolCall, upsertTool } = await import(moduleUrl);

const chatId = "chat-1";
let messages = [
  { id: "user-1", sessionId: chatId, role: "user", content: "test", status: "sent" },
  { id: "assistant-1", sessionId: chatId, role: "assistant", content: "", status: "sending", steps: [], toolCalls: [] },
];

messages = upsertTool(
  messages,
  chatId,
  makeToolCall("tool-read", "read_file", "running", { path: "package.json" }, "", undefined, 100, {
    agentId: "agent-1",
    agentName: "Researcher",
    iteration: 2,
    approvalContext: {
      riskLevel: "medium",
      description: "Needs file access",
      argumentsPreview: '{"path":"package.json"}',
      suggestedPatterns: ["read-only"],
    },
    runId: "run-1",
    messageId: "assistant-message-1",
    parentAgentId: "orchestrator",
    executionId: "exec-read",
    batchId: "batch-read",
    toolBatchId: "tool-batch-read",
  }),
  100,
);
messages = upsertTool(messages, chatId, makeToolCall("tool-search", "web_search", "running", { query: "agent trace" }, "", undefined, 105), 105);

let assistant = messages.find((message) => message.id === "assistant-1");
assert.equal(assistant.toolCalls.length, 2, "parallel tool starts should attach to one assistant");
assert.equal(assistant.steps.filter((step) => step.type === "tool-call").length, 2, "steps should mirror tool calls");

messages = upsertTool(
  messages,
  chatId,
  makeToolCall("tool-read", "read_file", "completed", {}, '{"content":"package checked"}', 310, 410),
  410,
);

assistant = messages.find((message) => message.id === "assistant-1");
const readTool = assistant.toolCalls.find((tool) => tool.id === "tool-read");
assert.equal(readTool.status, "completed", "completion should update the existing tool card");
assert.deepEqual(readTool.input, { path: "package.json" }, "completion with empty input should preserve original arguments");
assert.equal(readTool.output, '{"content":"package checked"}', "completion output should be preserved for previews");
assert.equal(readTool.startTime, 100, "completion should preserve original start time");
assert.equal(readTool.completedAt, 410, "completion should record when the result became visible");
assert.equal(readTool.lastUpdatedAt, 410, "completion should update the live tool timestamp");
assert.equal(readTool.agentName, "Researcher", "completion should preserve original tool owner");
assert.equal(readTool.iteration, 2, "completion should preserve original iteration");
assert.equal(readTool.batchId, "batch-read", "completion should preserve original explicit batch id");
assert.equal(readTool.toolBatchId, "tool-batch-read", "completion should preserve original explicit tool batch id");
assert.equal(readTool.runId, "run-1", "completion should preserve original run id");
assert.equal(readTool.messageId, "assistant-message-1", "completion should preserve original message id");
assert.equal(readTool.parentAgentId, "orchestrator", "completion should preserve original parent agent id");
assert.equal(readTool.executionId, "exec-read", "completion should preserve original execution id");
assert.equal(readTool.approvalContext.description, "Needs file access", "completion should preserve approval context");
assert.equal(readTool.approvalContext.argumentsPreview, '{"path":"package.json"}', "completion should preserve approval argument preview");
assert.equal(readTool.attempts.length, 2, "start and completion attempts should both be retained");
assert.equal(
  assistant.steps.find((step) => step.type === "tool-call" && step.toolCall.id === "tool-read").toolCall.output,
  '{"content":"package checked"}',
  "tool-call step should receive the same completed output",
);

messages = upsertTool(
  messages,
  chatId,
  makeToolCall("tool-read", "read_file", "running", { path: "package.json" }, "", undefined, 420),
  420,
);

assistant = messages.find((message) => message.id === "assistant-1");
const lateStartedReadTool = assistant.toolCalls.find((tool) => tool.id === "tool-read");
assert.equal(lateStartedReadTool.status, "completed", "late tool start must not regress a completed tool card");
assert.equal(lateStartedReadTool.output, '{"content":"package checked"}', "late tool start must not erase completed output preview");
assert.equal(lateStartedReadTool.completedAt, 410, "late tool start must not erase completion timing");
assert.equal(
  assistant.steps.find((step) => step.type === "tool-call" && step.toolCall.id === "tool-read").toolCall.status,
  "completed",
  "late tool start must not regress the mirrored tool-call step",
);

messages = [
  { id: "user-parallel", sessionId: chatId, role: "user", content: "parallel", status: "sent" },
  { id: "assistant-parallel", sessionId: chatId, role: "assistant", content: "", status: "sending", steps: [], toolCalls: [] },
];
messages = upsertTool(messages, chatId, makeToolCall("slow-tool", "slow_search", "running", { query: "slow" }, "", undefined, 1000), 1000);
messages = upsertTool(messages, chatId, makeToolCall("fast-tool", "fast_search", "running", { query: "fast" }, "", undefined, 1005), 1005);
messages = upsertTool(messages, chatId, makeToolCall("fast-tool", "fast_search", "completed", {}, '{"results":[{"title":"fast"}]}', 10, 1100), 1100);
messages = upsertTool(messages, chatId, makeToolCall("slow-tool", "slow_search", "completed", {}, '{"results":[{"title":"slow"}]}', 250, 1400), 1400);

assistant = messages.find((message) => message.id === "assistant-parallel");
const fastTool = assistant.toolCalls.find((tool) => tool.id === "fast-tool");
const slowTool = assistant.toolCalls.find((tool) => tool.id === "slow-tool");
assert.equal(fastTool.completedAt, 1100, "fast parallel result should keep its own completion timestamp");
assert.equal(slowTool.completedAt, 1400, "slow parallel result should keep its later completion timestamp");
assert(slowTool.completedAt > fastTool.completedAt, "parallel completion order should be available to the UI");

messages = upsertTool(
  [{ id: "user-only", sessionId: chatId, role: "user", content: "test", status: "sent" }],
  chatId,
  makeToolCall("tool-orphan", "run_command", "awaiting_approval", { command: "npm run build" }, "", undefined, 500, { messageId: "backend-orphan" }),
  500,
);

assert.equal(messages.length, 1, "unowned tool events must not create a renderable fallback ledger row");
assert.equal(globalThis.__recoveryTools.length, 1, "unowned tool events should be retained in the recovery buffer");
assert.equal(globalThis.__recoveryTools[0].messageId, "backend-orphan", "recovery should be keyed by backend message ownership");
assert.equal(globalThis.__recoveryTools[0].tool.status, "awaiting_approval", "recovery should preserve approval state");

// P0 stray-tool fallback: when no assistant is sending and metadata does not
// match, the activeAssistantByChat registry should route the tool to the
// registered assistant instead of creating an orphan ledger message.
globalThis.__activeAssistantByChat = { [chatId]: "assistant-registered" };
messages = [
  { id: "user-1", sessionId: chatId, role: "user", content: "test", status: "sent" },
  { id: "assistant-registered", sessionId: chatId, role: "assistant", content: "", status: "sent", steps: [], toolCalls: [] },
];
messages = upsertTool(
  messages,
  chatId,
  makeToolCall("tool-registered", "read_file", "running", { path: "README.md" }, "", undefined, 600),
  600,
);
const registeredAssistant = messages.find((message) => message.id === "assistant-registered");
assert.equal(registeredAssistant.toolCalls.length, 1, "activeAssistantByChat fallback should attach stray tool to registered assistant");
assert.equal(messages.findIndex((message) => message.id.startsWith("tool-ledger-")), -1, "activeAssistantByChat fallback should prevent orphan ledger creation");

globalThis.__activeAssistantByChat = {};

// Chronological ordering: a tool that fires AFTER answer text was streamed
// must appear after that text, not hoisted above it. This is the multi-turn
// clumping regression — iteration-2 tools were being spliced before the first
// text step, stacking every tool card above the prose.
messages = [
  { id: "user-order", sessionId: chatId, role: "user", content: "order", status: "sent" },
  {
    id: "assistant-order",
    sessionId: chatId,
    role: "assistant",
    content: "First answer paragraph.",
    status: "sending",
    steps: [
      { type: "tool-call", toolCall: makeToolCall("tool-iter1", "web_search", "completed", {}, "{}", 10, 100) },
      { type: "text", content: "First answer paragraph." },
    ],
    toolCalls: [makeToolCall("tool-iter1", "web_search", "completed", {}, "{}", 10, 100)],
  },
];
messages = upsertTool(
  messages,
  chatId,
  makeToolCall("tool-iter2", "read_file", "running", { path: "b.ts" }, "", undefined, 200),
  200,
);
const orderedAssistant = messages.find((message) => message.id === "assistant-order");
const iter2StepIndex = orderedAssistant.steps.findIndex((s) => s.type === "tool-call" && s.toolCall.id === "tool-iter2");
const textStepIndex = orderedAssistant.steps.findIndex((s) => s.type === "text");
assert(iter2StepIndex > textStepIndex, "a later-iteration tool must appear after earlier answer text, not hoisted above it");
assert.equal(orderedAssistant.steps[orderedAssistant.steps.length - 1].toolCall?.id, "tool-iter2", "newest tool step should be appended last (chronological order)");

// Backend-id recovery routing: a tool carrying a backend messageId that no
// message owns must NOT graft onto a previous, already-`sent` assistant. It
// stays out of the render tree until chat:done can place it on the correct
// backend-id row instead of the prior turn's bubble.
globalThis.__activeAssistantByChat = {};
messages = [
  { id: "user-prev", sessionId: chatId, role: "user", content: "turn 1", status: "sent" },
  { id: "backend-turn-1", sessionId: chatId, role: "assistant", content: "Turn 1 done.", status: "sent", steps: [], toolCalls: [] },
];
messages = upsertTool(
  messages,
  chatId,
  makeToolCall("tool-turn2", "read_file", "running", { path: "c.ts" }, "", undefined, 300, { messageId: "backend-turn-2" }),
  300,
);
assert.equal(messages.length, 2, "backend-id tool with no owner must remain outside the render tree");
assert.equal(globalThis.__recoveryTools.at(-1).messageId, "backend-turn-2", "backend-id tool should enter recovery under its owner id");
const priorTurn = messages.find((message) => message.id === "backend-turn-1");
assert.equal(priorTurn.toolCalls.length, 0, "the previous finalized assistant must not absorb the new turn's tool");

globalThis.__activeAssistantByChat = {};

// Screenshot regression: chat-wide runId must NOT pull a new turn's tool onto
// the previous, already-sent assistant. `execution_run_id` is the chat id, so
// every tool in the chat shares one runId. When turn 2 starts, its tool must
// attach to the NEW sending assistant, not the finalized turn-1 assistant that
// holds same-runId tools.
messages = [
  { id: "user-1", sessionId: chatId, role: "user", content: "turn 1", status: "sent" },
  {
    id: "backend-1",
    sessionId: chatId,
    role: "assistant",
    content: "Turn 1 answer.",
    status: "sent",
    steps: [{ type: "tool-call", toolCall: makeToolCall("t1", "run_command", "completed", {}, "{}", 5, 100, { runId: chatId, messageId: "backend-1" }) }],
    toolCalls: [makeToolCall("t1", "run_command", "completed", {}, "{}", 5, 100, { runId: chatId, messageId: "backend-1" })],
  },
  { id: "user-2", sessionId: chatId, role: "user", content: "turn 2", status: "sent" },
  { id: "temp-assistant-2", sessionId: chatId, role: "assistant", content: "", status: "sending", steps: [], toolCalls: [] },
];
messages = upsertTool(
  messages,
  chatId,
  makeToolCall("t2", "run_command", "running", { command: "ls" }, "", undefined, 200, { runId: chatId }),
  200,
);
const turn1 = messages.find((m) => m.id === "backend-1");
const turn2 = messages.find((m) => m.id === "temp-assistant-2");
assert.equal(turn1.toolCalls.length, 1, "same chat-wide runId must not append the new turn's tool to the finalized turn-1 assistant");
assert.equal(turn2.toolCalls.length, 1, "new turn's tool must attach to the active sending assistant below the latest user message");
assert.equal(turn2.toolCalls[0].id, "t2", "the sending assistant should own the new tool");

// Sparse lifecycle events without a backend tool_call_id must still reconcile
// to one row. The sequence + run identity is stable across start/completion,
// and must not depend on the array index used by the renderer.
globalThis.__activeAssistantByChat = {};
messages = [
  { id: "assistant-sparse", sessionId: chatId, role: "assistant", content: "", status: "sending", steps: [], toolCalls: [] },
];
messages = upsertTool(
  messages,
  chatId,
  makeToolCall("", "run_command", "running", { command: "npm test" }, "", undefined, 500, { runId: chatId, sequence: 7 }),
  500,
);
messages = upsertTool(
  messages,
  chatId,
  makeToolCall("", "run_command", "completed", {}, "passed", 120, 620, { runId: chatId, sequence: 7 }),
  620,
);
const sparseAssistant = messages[0];
assert.equal(sparseAssistant.toolCalls.length, 1, "sparse lifecycle events should keep one tool call");
assert.equal(sparseAssistant.steps.length, 1, "sparse lifecycle events should keep one tool step");
assert.equal(sparseAssistant.toolCalls[0].status, "completed", "completion should update the stable sparse tool row");
assert.equal(sparseAssistant.toolCalls[0].output, "passed", "completion output should update the stable sparse tool row");

globalThis.__activeAssistantByChat = {};

console.log("tool event reducer ok");
