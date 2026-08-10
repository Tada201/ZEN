import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const card = [
  await read("src/atlas/components/chat/DeepResearchMessage.tsx"),
  await read("src/atlas/components/chat/DeepResearchRunMessage.tsx"),
].join("\n");
const messageItem = await read("src/atlas/components/chat/MessageItem.tsx");
const messageList = await read("src/atlas/components/chat/MessageList.tsx");
const chatSection = await read("src/atlas/sections/ChatSection.tsx");
const useAgentEvents = await read("src/atlas/hooks/stream/useAgentEvents.ts");
const useChatChunkEvent = await read("src/atlas/hooks/stream/useChatChunkEvent.ts");
const useChatQueries = await read("src/atlas/hooks/chat/useChatQueries.ts");

// ── Stale Sending Detection ──────────────────────────────────────────────

expect(card.includes("isStaleSending") && card.includes('message.status === "sending" && isChatStreaming === false'),
  "DeepResearchMessage must detect stale sending: status='sending' && isChatStreaming===false.");

expect(card.includes("isStaleSending") && card.includes("isChatStreaming === false"),
  "isStaleSending must use strict comparison (===) against false, not just falsy check.");

expect(card.includes("isStaleEmpty") && card.includes("(isFailed || isStaleSending) && !message.content && steps.length === 0"),
  "isStaleEmpty must check (isFailed || isStaleSending) combined with empty content and zero steps.");

// ── Stale Status Text Rendering ──────────────────────────────────────────

expect(card.includes('"Research interrupted"') && card.includes('isStaleEmpty'),
  "Stale empty research must render 'Research interrupted' status text.");

expect(card.includes('"Research interrupted (partial results)"') && card.includes("isStaleSending") && card.includes("message.content"),
  "Stale sending with content must render 'Research interrupted (partial results)'.");

expect(card.includes("Connection was lost. Partial results are shown above"),
  "Stale sending with partial results must show amber warning about lost connection.");

expect(card.includes("The research process ended before collecting any data."),
  "Stale empty research must show message about ending before collecting data.");

// ── isComplete Includes isStaleSending ───────────────────────────────────

expect(card.includes("message.status === \"sent\" || message.metadata?.status === \"completed\" || isFailed || isStaleSending"),
  "isComplete must include isStaleSending so the elapsed timer stops for phantom-streaming messages.");

// ── Elapsed Timer Stops on Stale ─────────────────────────────────────────

expect(card.includes("{!isComplete && (") &&
  (card.includes("formatTime(elapsed)") || card.includes("formatElapsed(elapsed)")),
  "The elapsed timer badge must be hidden when isComplete is true (including stale sending).");

// ── Cancel Button (onAbort) ──────────────────────────────────────────────

expect(card.includes("onAbort") && card.includes("Stop") && card.includes("Square"),
  "DeepResearchMessage must accept an onAbort prop and render a 'Stop' button with Square icon.");

expect(card.includes('title="Stop research"'),
  "The cancel button must have a 'Stop research' accessible title.");

expect(card.includes("onClick={onAbort}"),
  "The cancel button must call onAbort when clicked.");

// The timer/cancel area should use {!isComplete} not {!isComplete && !isStaleSending}
// since isComplete already includes isStaleSending.
expect(!card.includes("!isComplete && !isStaleSending"),
  "The timer/cancel area should not have a redundant !isStaleSending guard since isComplete already includes it.");

// ── StaleRetryButton Component ───────────────────────────────────────────

expect(card.includes("function StaleRetryButton") && card.includes("Retry research"),
  "StaleRetryButton component must exist and render 'Retry research' text.");

expect(card.includes("StaleRetryButton") && card.includes("onContinueResearch"),
  "StaleRetryButton must receive onContinueResearch callback.");

expect(card.includes("messages[i].role === \"user\"") || card.includes("messages[i].role === 'user'"),
  "StaleRetryButton must find the preceding user message in the messages array.");

expect(card.includes("onContinueResearch(messages[i].content)") || card.includes("onContinueResearch(messages[i].content)"),
  "StaleRetryButton must call onContinueResearch with the preceding user message content.");

// ── StaleRetryButton Rendered Conditionally ──────────────────────────────

expect(card.includes("{isStaleEmpty && (") && card.includes("StaleRetryButton"),
  "StaleRetryButton must only render when isStaleEmpty is true.");

expect(card.includes("{onContinueResearch && (") && card.includes("StaleRetryButton"),
  "StaleRetryButton must only render when onContinueResearch is provided.");

// ── Prop Threading for isChatStreaming ────────────────────────────────────

expect(messageList.includes("isChatStreaming") && messageList.includes("_isStreaming"),
  "MessageList must thread isChatStreaming (from _isStreaming) to MemoizedMessageItem.");

expect(messageItem.includes("isChatStreaming") && messageItem.includes("DeepResearchMessage"),
  "MessageItem must accept and forward isChatStreaming to DeepResearchMessage.");

// ── Prop Threading for onAbort ───────────────────────────────────────────

const globalStream = await read("src/atlas/hooks/useGlobalStreamListener.ts");

expect(globalStream.includes("useAgentEvents({ resetHeartbeatTimeout })") || globalStream.includes("useAgentEvents({resetHeartbeatTimeout})"),
  "useGlobalStreamListener must pass resetHeartbeatTimeout to useAgentEvents.");

expect((chatSection.includes("onAbort={abortStream}") ||
  chatSection.includes("onAbort={isArchivedSession ? undefined : abortStream}")) &&
  chatSection.includes("MessageList"),
  "ChatSection must pass abortStream as onAbort to MessageList.");

expect(messageList.includes("onAbort") && messageList.includes("MemoizedMessageItem"),
  "MessageList must accept and forward onAbort to MemoizedMessageItem.");

expect(messageItem.includes("onAbort") && messageItem.includes("DeepResearchMessage"),
  "MessageItem must accept and forward onAbort to DeepResearchMessage.");

expect(card.includes("onAbort") && card.includes("DeepResearchRunMessage"),
  "DeepResearchMessage must accept onAbort and forward it to DeepResearchRunMessage.");

// ── Fallback Timeout in chat:done ────────────────────────────────────────

expect(useChatChunkEvent.includes("researchCompletionTimersRef") && useChatChunkEvent.includes("setTimeout"),
  "useChatChunkEvent must have a researchCompletionTimersRef and use setTimeout for fallback.");

expect(useChatChunkEvent.includes("20_000") || useChatChunkEvent.includes("20000"),
  "The fallback timeout must be 20 seconds.");

expect(useChatChunkEvent.includes("fallback-timeout") || useChatChunkEvent.includes("fallback timeout"),
  "The fallback timeout must use a recognizable reason string.");

expect(useChatChunkEvent.includes("chat:message") && useChatChunkEvent.includes("clearTimeout"),
  "The chat:message listener must cancel the fallback timer.");

// ── Heartbeat Reset on Research Steps ────────────────────────────────────

expect(useAgentEvents.includes("resetHeartbeatTimeout?.(chatId)") && useAgentEvents.includes("chat:research-step"),
  "useAgentEvents must call resetHeartbeatTimeout on chat:research-step events.");

expect(useAgentEvents.includes("resetHeartbeatTimeout?:"),
  "useAgentEvents must accept resetHeartbeatTimeout as an optional parameter.");

// ── createdAt Preservation ────────────────────────────────────────────────

expect(useAgentEvents.includes("createdAt: next[researchIdx].createdAt") && useAgentEvents.includes("deep_research"),
  "useAgentEvents must preserve createdAt from optimistic placeholder for deep_research messages.");

// ── Query Refetch Guard ──────────────────────────────────────────────────

expect(useChatQueries.includes("existingIsComplete && fetchedIsComplete") && useChatQueries.includes("liveStepCount > fetchedStepCount"),
  "useChatQueries must guard against overwriting richer live researchSteps with stale fetched data.");

// ── Phantom Streaming Guard ──────────────────────────────────────────────

expect(useChatQueries.includes('m.kind === "deep_research" && m.status === "sending"'),
  "useChatQueries must block refetch when a deep_research message is in sending status.");

if (failures.length > 0) {
  console.error("Deep research stale detection contract failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Deep research stale detection contract passed.");
