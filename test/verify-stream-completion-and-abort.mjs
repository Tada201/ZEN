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
  new URL("../src-tauri/src/commands/chat/send.rs", import.meta.url),
  "utf8",
);
const runnerSource = readFileSync(
  new URL("../src-tauri/src/agent/runner/loop.rs", import.meta.url),
  "utf8",
);
const orchestratorSource = readFileSync(
  new URL("../src-tauri/src/agent/orchestrator/loop.rs", import.meta.url),
  "utf8",
);
const runnerLifecycleSource = readFileSync(
  new URL("../src-tauri/src/agent/runner/lifecycle.rs", import.meta.url),
  "utf8",
);
const messageTargetSource = readFileSync(
  new URL("../src/atlas/hooks/stream/messageTarget.ts", import.meta.url),
  "utf8",
);

assert(
  chunkHookSource.includes('listenAppEvent("chat:done"') &&
    chunkHookSource.includes("clearHeartbeatTimeout(chatId)") &&
    chunkHookSource.includes("setStreamingForChat(chatId, false)") &&
    chunkHookSource.includes("markMessageAsFinished(finalized, isCancelled, reason)") &&
    messageTargetSource.includes('status: isCancelled ? "cancelled" : "sent"') &&
    chunkHookSource.includes("ttftReport(chatId, reason)"),
  "chat:done must clear heartbeat, stop loading state, finalize assistant status, and report TTFT completion",
);

assert(
  chunkHookSource.includes('listenAppEvent("chat:error"') &&
    chunkHookSource.includes("markMessageAsFailed") &&
    messageTargetSource.includes('status: "failed"') &&
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

// The runner routes its terminal chat error through `emit_owned_chat_error`
// rather than emitting `AgentEvent::ChatError` directly. A sub-agent runs under
// the parent's chat id, so an unconditional emit failed the parent's assistant
// message whenever a child failed; the helper suppresses that for child runs
// while still unlocking the UI for a real parent failure.
assert(
  chatCommandSource.includes("token_for_error.is_cancelled()") &&
    chatCommandSource.includes('"chat:done"') &&
    chatCommandSource.includes('"content": "Response stopped."') &&
    runnerSource.includes("self.emit_owned_chat_error(ChatErrorPayload") &&
    runnerLifecycleSource.includes("fn emit_owned_chat_error") &&
    runnerLifecycleSource.includes("AgentEvent::ChatError(payload)") &&
    runnerLifecycleSource.includes("self.should_persist_to_parent_chat()") &&
    orchestratorSource.includes("AgentEvent::ChatError(") &&
    orchestratorSource.includes("ChatErrorPayload"),
  "backend runner and orchestrator failures must emit terminal chat events instead of only logging, and a child run must not fail the parent chat",
);

console.log("stream completion and abort verifier passed");
