import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chunkHook = readFileSync("src/atlas/hooks/stream/useChatChunkEvent.ts", "utf8");
const chunkHelper = readFileSync("src/atlas/hooks/stream/chatChunkBuffer.ts", "utf8");
const agentEvents = readFileSync("src/atlas/hooks/stream/useAgentEvents.ts", "utf8");
const toolEvents = readFileSync("src/atlas/hooks/stream/useToolEvents.ts", "utf8");

assert(
  chunkHook.includes("chunkBuffersRef.current[chatId]") &&
    chunkHook.includes("firstChunkDeltas.current[chatId]") &&
    chunkHook.includes("firstChunkTypeSentKey(chatId") &&
    chunkHelper.includes("firstChunkTypeSentKey"),
  "token buffers and first-chunk de-dupe must be keyed by chat id",
);
assert(
  chunkHook.includes("setStreamingForChat(chatId, true)") &&
    chunkHook.includes("setStreamingForChat(chatId, false)"),
  "streaming state must be scoped to the affected chat id",
);
assert(
  agentEvents.includes("agentChatIdsRef") &&
    agentEvents.includes("taskChatIdsRef") &&
    agentEvents.includes("workflowChatIdsRef"),
  "agent/task/workflow lifecycle routing should maintain independent chat-id caches",
);
assert(
  toolEvents.includes("toolChatIdsRef") &&
    toolEvents.includes("getToolChatId") &&
    toolEvents.includes("rememberToolChat"),
  "tool lifecycle routing should maintain independent chat-id ownership",
);

console.log("concurrent stream isolation wiring verified");
