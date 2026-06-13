import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const messageList = readFileSync(new URL("../src/atlas/components/chat/MessageList.tsx", import.meta.url), "utf8");
const markdownUtils = readFileSync(new URL("../src/atlas/components/chat/markdown-utils.ts", import.meta.url), "utf8");
const ledger = readFileSync(new URL("../src/atlas/hooks/stream/agentActionLedger.ts", import.meta.url), "utf8");
const assistantMessage = readFileSync(new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url), "utf8");
const assistantParts = readFileSync(new URL("../src/atlas/components/chat/assistantMessageParts.ts", import.meta.url), "utf8");
const markdownContent = readFileSync(new URL("../src/atlas/components/chat/MarkdownContent.tsx", import.meta.url), "utf8");

assert(!messageList.includes("useVirtualizer"), "chat messages must remain in normal document flow");
assert(!messageList.includes("position: `translateY"), "chat rows must not be absolutely translated");
assert(messageList.includes("key={message.id}"), "message rows must use stable message IDs");
assert(markdownUtils.includes("id: `${type}-${blockIndex}`"), "markdown keys must survive stream completion");
assert(!markdownUtils.includes("isComplete ? 'done' : 'streaming'"), "completion must not remount markdown blocks");
assert(ledger.includes("appendActionStepInArrivalOrder"), "agent actions must preserve arrival chronology");
assert(!ledger.includes("insertActionStepBeforeText"), "late tool events must not jump before existing text");
assert(assistantParts.includes("shouldShowPostToolWorking"), "completed tools must expose a continuation state");
assert(assistantMessage.includes("Working on the response..."), "chat must show activity between tool completion and resumed text");
assert(assistantMessage.includes('aria-live="polite"'), "post-tool activity must be announced accessibly");
assert(markdownContent.includes("isPlainShortText"), "plain short deltas should bypass the full markdown parser");

console.log("chat render stability ok");
