import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const chunkHookSource = readFileSync(
  new URL("../src/atlas/hooks/stream/useChatChunkEvent.ts", import.meta.url),
  "utf8",
);
const abortHookSource = readFileSync(
  new URL("../src/atlas/hooks/useStreamingChat.ts", import.meta.url),
  "utf8",
);
const chatCommandSource = readFileSync(
  new URL("../src-tauri/src/commands/chat.rs", import.meta.url),
  "utf8",
);

assert(
  chunkHookSource.includes('listenAppEvent("chat:done"') &&
    chunkHookSource.includes("clearHeartbeatTimeout(chatId)") &&
    chunkHookSource.includes("setStreamingForChat(chatId, false)") &&
    chunkHookSource.includes('status: isCancelled ? "cancelled" : "sent"') &&
    chunkHookSource.includes("ttftReport(chatId, reason)"),
  "chat:done must clear heartbeat, stop loading state, finalize assistant status, and report TTFT completion",
);

assert(
  chunkHookSource.includes('listenAppEvent("chat:error"') &&
    chunkHookSource.includes('status: "failed"') &&
    chunkHookSource.includes("setStreamingForChat(chatId, false)") &&
    chunkHookSource.includes("toast.error"),
  "chat:error must fail the visible assistant message and clear loading state",
);

assert(
  abortHookSource.includes("await chatApi.abortChat(chatId)") &&
    abortHookSource.includes("setStreamingForChat(chatId, false)") &&
    abortHookSource.includes('status: "cancelled"') &&
    abortHookSource.includes('error: message.content?.trim() ? undefined : "Response stopped."'),
  "stop button abort must immediately clear loading state and finalize the visible assistant row",
);

assert(
  chatCommandSource.includes("token_for_error.is_cancelled()") &&
    chatCommandSource.includes('"chat:done"') &&
    chatCommandSource.includes('"reason": "cancelled"') &&
    chatCommandSource.includes('"chat:error"') &&
    chatCommandSource.includes("Chat runner failed") &&
    chatCommandSource.includes("Orchestrator failed"),
  "backend spawned runner/orchestrator failures must emit terminal chat events instead of only logging",
);

console.log("stream completion and abort verifier passed");
