import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const sourcePath = new URL("../src/atlas/hooks/stream/agentLifecycleRouting.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8").replace(
  'import { getActiveStreamingChatId, type ActiveStreamState } from "./activeStreamRouting";',
  `function getActiveStreamingChatId(state) {
    const streamingChats = state.streamingChats || {};
    const activeSessionId = state.activeSessionId;
    if (activeSessionId && streamingChats[activeSessionId]) return activeSessionId;
    const streamingIds = Object.entries(streamingChats).filter(([, isStreaming]) => isStreaming).map(([chatId]) => chatId);
    return streamingIds.length === 1 ? streamingIds[0] : undefined;
  }`,
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "agentLifecycleRouting.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { getAgentChatId, getAgentLifecycleKeys, rememberAgentChat } = await import(moduleUrl);

const spawnPayload = {
  chat_id: "chat-1",
  spawn_id: "spawn-1",
  child_agent_id: "agent-child-1",
  child_agent_name: "Researcher",
  metadata: {
    spawn: {
      childAgent: "Researcher",
      spawnId: "spawn-1",
    },
  },
};

const keys = getAgentLifecycleKeys(spawnPayload);
assert(keys.includes("spawn-1"), "spawn id should be routable");
assert(keys.includes("agent-child-1"), "child agent id should be routable");
assert.equal(new Set(keys).size, keys.length, "agent lifecycle routing keys should be deduped");

const cache = new Map();
rememberAgentChat(cache, spawnPayload, "chat-1");
assert.equal(getAgentChatId(cache, { spawn_id: "spawn-1" }), "chat-1", "completion should route by spawn id");
assert.equal(getAgentChatId(cache, { agent_id: "agent-child-1" }), "chat-1", "completion should route by child agent id");
assert.equal(getAgentChatId(cache, { from_agent: "agent-child-1", to_agent: "agent-reviewer" }), "chat-1", "handoff should route by known source agent");
assert.equal(getAgentChatId(cache, { chat_id: "chat-direct", agent_id: "unknown" }), "chat-direct", "direct chat id should win");

rememberAgentChat(cache, { agent_id: "agent-reviewer" }, "chat-1");
assert.equal(getAgentChatId(cache, { to_agent: "agent-reviewer" }), "chat-1", "handoff should route by known destination agent");
assert.equal(getAgentChatId(cache, { agent_id: "missing" }), undefined, "unknown agent events should not route to a random chat");
assert.equal(
  getAgentChatId(new Map(), { agent_id: "sparse-agent" }, { activeSessionId: "chat-active", streamingChats: { "chat-active": true } }),
  "chat-active",
  "unknown sparse agent lifecycle events should route to the active streaming chat",
);
assert.equal(
  getAgentChatId(new Map(), { agent_id: "ambiguous-agent" }, { activeSessionId: "chat-a", streamingChats: { "chat-a": false, "chat-b": true, "chat-c": true } }),
  undefined,
  "unknown sparse agent lifecycle events should not route when multiple non-active chats are streaming",
);

console.log("agent lifecycle routing ok");
