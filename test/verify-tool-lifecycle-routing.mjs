import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/hooks/stream/toolLifecycleRouting.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "toolLifecycleRouting.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { getToolChatId, rememberToolChat } = await import(moduleUrl);

const cache = new Map();

assert.equal(
  getToolChatId(cache, { chat_id: "chat-direct", tool_call_id: "tool-unknown" }),
  "chat-direct",
  "direct snake_case chat id should win",
);

assert.equal(
  getToolChatId(cache, { chatId: "chat-camel", tool_call_id: "tool-unknown" }),
  "chat-camel",
  "direct camelCase chat id should win",
);

rememberToolChat(cache, { chat_id: "chat-1", tool_call_id: "tool-read" }, "chat-1");

assert.equal(
  getToolChatId(cache, { tool_call_id: "tool-read" }),
  "chat-1",
  "sparse completion should route by known tool call id",
);

rememberToolChat(cache, { tool_call_id: "tool-ignored" }, undefined);
assert.equal(
  getToolChatId(cache, { tool_call_id: "tool-ignored" }),
  undefined,
  "missing chat id should not poison the cache",
);

assert.equal(
  getToolChatId(cache, { tool_call_id: "tool-missing" }),
  undefined,
  "unknown sparse tool events should not route to a random chat",
);

assert.equal(
  getToolChatId(
    cache,
    { tool_call_id: "tool-active" },
    { activeSessionId: "chat-active", streamingChats: { "chat-active": true } },
  ),
  "chat-active",
  "unknown sparse tool events should route to the active streaming chat when there is exactly one target",
);

assert.equal(
  getToolChatId(
    cache,
    { tool_call_id: "tool-ambiguous" },
    { activeSessionId: "chat-a", streamingChats: { "chat-a": false, "chat-b": true, "chat-c": true } },
  ),
  undefined,
  "unknown sparse tool events should not route when multiple non-active chats are streaming",
);

console.log("tool lifecycle routing ok");
