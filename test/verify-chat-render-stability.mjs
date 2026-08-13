import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const messageList = readFileSync(new URL("../src/atlas/components/chat/MessageList.tsx", import.meta.url), "utf8");
const markdownUtils = readFileSync(new URL("../src/atlas/components/chat/markdown-utils.ts", import.meta.url), "utf8");
const ledger = readFileSync(new URL("../src/atlas/hooks/stream/agentActionLedger.ts", import.meta.url), "utf8");
const assistantMessage = readFileSync(new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url), "utf8");
const assistantTrace = readFileSync(new URL("../src/atlas/components/chat/AgentExecutionTrace.tsx", import.meta.url), "utf8");
const assistantParts = readFileSync(new URL("../src/atlas/components/chat/assistantMessageParts.ts", import.meta.url), "utf8");
const markdownContent = readFileSync(new URL("../src/atlas/components/chat/MarkdownContent.tsx", import.meta.url), "utf8");
const chatQueries = readFileSync(new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url), "utf8");
const chatStatus = readFileSync(new URL("../src/api/chatStatus.ts", import.meta.url), "utf8");
const workspaceBackground = readFileSync(new URL("../src/components/workbench/WorkspaceBackground.tsx", import.meta.url), "utf8");

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
assert(!messageList.includes("<motion.div"), "message rows must not run a motion animation for every stream update");
assert(!assistantMessage.includes("<motion.div"), "assistant streaming content must not use per-update motion wrappers");
assert(!assistantTrace.includes("<motion.div"), "execution trace rows must not use per-update motion wrappers");
assert(!chatStatus.includes("ProviderReady") && !chatStatus.includes("provider_ready"), "provider-ready status must remain removed");
assert(!workspaceBackground.includes("will-change:transform,opacity,filter"), "workspace wallpaper must not force a permanent GPU layer");
assert(!workspaceBackground.includes("translate3d(0,0,0)"), "workspace wallpaper must not force translate3d compositing");
assert(chatQueries.includes("matchedLiveMessageIds"), "message hydration must track optimistic rows matched to backend assistant rows");
assert(chatQueries.includes("if (existing) matchedLiveMessageIds.add(existing.id)"), "backend assistant reconciliation must record the matched optimistic identity");
assert(chatQueries.includes("!matchedLiveMessageIds.has(message.id)"), "matched optimistic assistants must not be appended as duplicate agent messages");

console.log("chat render stability ok");
