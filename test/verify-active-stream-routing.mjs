import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/hooks/stream/activeStreamRouting.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "activeStreamRouting.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { getActiveStreamingChatId, getDirectOrActiveStreamingChatId } = await import(moduleUrl);

assert.equal(
  getActiveStreamingChatId({ activeSessionId: "chat-1", streamingChats: { "chat-1": true, "chat-2": true } }),
  "chat-1",
  "active streaming chat should win when multiple chats are streaming",
);

assert.equal(
  getActiveStreamingChatId({ activeSessionId: "chat-1", streamingChats: { "chat-1": false, "chat-2": true } }),
  "chat-2",
  "single streaming chat should be routable even when active chat is idle",
);

assert.equal(
  getActiveStreamingChatId({ activeSessionId: "chat-1", streamingChats: { "chat-1": false, "chat-2": true, "chat-3": true } }),
  undefined,
  "ambiguous sparse events should not route when multiple non-active chats are streaming",
);

assert.equal(
  getActiveStreamingChatId({ activeSessionId: null, streamingChats: {} }),
  undefined,
  "no streaming chats should not produce a fallback route",
);

assert.equal(
  getDirectOrActiveStreamingChatId(
    { activeSessionId: "chat-active", streamingChats: { "chat-active": true } },
    { chat_id: "chat-direct" },
  ),
  "chat-direct",
  "explicit event chat id should win over active stream fallback",
);

assert.equal(
  getDirectOrActiveStreamingChatId(
    { activeSessionId: "chat-active", streamingChats: { "chat-active": true } },
    {},
  ),
  "chat-active",
  "sparse task planning events should route to the active streaming chat",
);

console.log("active stream routing ok");
