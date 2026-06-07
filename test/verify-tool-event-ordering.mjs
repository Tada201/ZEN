import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const reducerPath = new URL("../src/atlas/hooks/stream/toolEventReducer.ts", import.meta.url);
const source = readFileSync(reducerPath, "utf8").replace(
  'import type { Message, ToolCall } from "../../components/chat/types";',
  "",
);
const transpiled = ts.transpileModule(source, {
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
const finalAssistant = {
  id: "assistant-live",
  sessionId: chatId,
  role: "assistant",
  content: "Here is the final answer.",
  status: "sent",
  createdAt: 2,
  steps: [{ type: "text", content: "Here is the final answer." }],
  toolCalls: [],
};

const lateCompletion = makeToolCall(
  "call-tool-list",
  "tool_list",
  "completed",
  {},
  "[{\"category\":\"search\"}]",
  12,
  10,
  { messageId: "assistant-live", runId: "run-1" },
);

const routed = upsertTool([
  { id: "user-1", sessionId: chatId, role: "user", content: "Search news", status: "sent", createdAt: 1 },
  finalAssistant,
], chatId, lateCompletion, 11);

assert.equal(routed.length, 2, "late tool completion must not create a bottom system ledger message");
assert.equal(routed[1].toolCalls.length, 1, "late tool completion should attach to the assistant message");
assert.equal(routed[1].steps[0].type, "tool-call", "late tool should render before final text when first seen after completion");
assert.equal(routed[1].steps[1].type, "text", "assistant final text should stay after the tool trace");

const lateUpdate = makeToolCall(
  "call-tool-list",
  "tool_list",
  "running",
  { query: "search" },
  "",
  undefined,
  12,
  { messageId: "assistant-live", runId: "run-1" },
);
const preserved = upsertTool(routed, chatId, lateUpdate, 13);
assert.equal(preserved.length, 2, "late stale updates must still merge into the assistant message");
assert.equal(preserved[1].toolCalls[0].status, "completed", "terminal tool status should not regress to running");
assert.deepEqual(preserved[1].toolCalls[0].input, { query: "search" }, "non-empty late input should enrich the existing card");

console.log("PASS tool event ordering keeps tool cards with their assistant turn");
