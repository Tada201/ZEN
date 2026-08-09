import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const messageList = readFileSync(new URL("../src/atlas/components/chat/MessageList.tsx", import.meta.url), "utf8");
const markdownUtils = readFileSync(new URL("../src/atlas/components/chat/markdown-utils.ts", import.meta.url), "utf8");
const ledger = readFileSync(new URL("../src/atlas/hooks/stream/agentActionLedger.ts", import.meta.url), "utf8");
const assistantMessage = readFileSync(new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url), "utf8");
const assistantParts = readFileSync(new URL("../src/atlas/components/chat/assistantMessageParts.ts", import.meta.url), "utf8");
const markdownContent = readFileSync(new URL("../src/atlas/components/chat/MarkdownContent.tsx", import.meta.url), "utf8");
const chatQueries = readFileSync(new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url), "utf8");

assert(!messageList.includes("useVirtualizer"), "chat messages must remain in normal document flow");
assert(!messageList.includes("position: `translateY"), "chat rows must not be absolutely translated");
assert(messageList.includes("key={message.id}"), "message rows must use stable message IDs");
assert(markdownUtils.includes("id: `${type}-${blockIndex}`"), "markdown keys must survive stream completion");
assert(!markdownUtils.includes("isComplete ? 'done' : 'streaming'"), "completion must not remount markdown blocks");
assert(ledger.includes("appendActionStepInArrivalOrder"), "agent actions must preserve arrival chronology");
assert(!ledger.includes("insertActionStepBeforeText"), "late tool events must not jump before existing text");
assert(!assistantParts.includes("shouldShowPostToolWorking"), "obsolete post-tool status helper must not remain in the parent status path");
assert(assistantParts.includes("selectParentWorkingStatus"), "completed tools must flow through the single parent status selector");
assert(assistantMessage.includes("parentWorkingStatus"), "chat must expose one parent-level status projection");
assert(!assistantMessage.includes("Working on the response..."), "legacy duplicate post-tool status row must be removed");
assert(assistantMessage.includes('aria-live="polite"'), "parent status must be announced accessibly");
assert(markdownContent.includes("isPlainShortText"), "plain short deltas should bypass the full markdown parser");
assert(chatQueries.includes("matchedLiveMessageIds"), "message hydration must track optimistic rows matched to backend assistant rows");
assert(chatQueries.includes("if (existing) matchedLiveMessageIds.add(existing.id)"), "backend assistant reconciliation must record the matched optimistic identity");
assert(chatQueries.includes("!matchedLiveMessageIds.has(message.id)"), "matched optimistic assistants must not be appended as duplicate agent messages");

console.log("chat render stability ok");
