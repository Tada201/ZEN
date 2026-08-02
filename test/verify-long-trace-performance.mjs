import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const messageList = read("src/atlas/components/chat/MessageList.tsx");
const signature = read("src/atlas/components/chat/messageListStreamSignature.ts");
const reasoning = read("src/atlas/components/chat/ReasoningBlock.tsx");
const markdown = read("src/atlas/components/chat/MarkdownContent.tsx");
const trace = read("src/atlas/components/chat/AgentExecutionTrace.tsx");
const laneModel = read("src/atlas/components/chat/agentDelegationLaneModel.ts");
const lane = read("src/atlas/components/chat/AgentDelegationLane.tsx");
const research = read("src/atlas/components/chat/DeepResearchRunMessage.tsx");
const output = read("src/atlas/components/chat/tool/content/TruncatedOutput.tsx");

// Typing/scroll work must be coalesced rather than writing layout once per
// token or once per stream-signature update.
assert(messageList.includes("scrollFrameRef"), "message scrolling needs one shared pending frame");
assert(messageList.includes("window.requestAnimationFrame"), "message scrolling should write layout in a paint frame");
assert(messageList.includes("window.cancelAnimationFrame"), "message scrolling must cancel pending work on unmount");
assert(messageList.includes("if (!isAutoScrolling.current) return"), "a queued scroll frame must re-check user scroll intent before writing layout");
assert(signature.includes("CONTENT_BUCKET_SIZE"), "stream signatures should bucket small text deltas");
assert(signature.includes("TOOL_OUTPUT_BUCKET_SIZE"), "stream signatures should bucket small tool-output deltas");

// Active reasoning is intentionally cheap; completed reasoning may use the
// richer markdown/math renderer without reparsing a growing stream.
assert(reasoning.includes("isThinking ? \"\" : normalizeMathMarkdown"), "active reasoning must defer markdown normalization");
assert(reasoning.includes("whitespace-pre-wrap"), "active reasoning must retain readable plain-text output");
assert(reasoning.includes("}, 1000);"), "reasoning duration must update at display precision");

// Short plain streaming text bypasses block splitting, while rich markdown
// retains the normal renderer and stable memoized block path.
assert(markdown.includes("isPlainShortText"), "markdown should expose a short-text fast path");
assert(markdown.includes("mainContent.length <= 240"), "short-text fast path must remain bounded");
assert(markdown.includes("!/[#*_`\\[\\]|]/.test(mainContent)"), "short-text fast path must exclude inline code and markdown punctuation");
assert(markdown.includes("splitMarkdownIntoBlocks"), "rich markdown must retain the block renderer");

// Long traces should not broaden subscriptions or remount a live group for
// changing child-id lists.
assert(trace.includes("useMemo(() => dedupeTraceToolCalls"), "trace tool deduplication should be memoized");
assert(trace.includes("normalizedToolCalls.map"), "trace rows should render from the normalized collection");
assert(!trace.includes("toolCalls.map(t => t.id).join"), "trace keys must not depend on changing child-id lists");

// The delegation output cap is named once and consumed by the renderer. The
// source step remains untouched, preserving persisted/replay fidelity.
assert(laneModel.includes("export const MAX_LIVE_OUTPUT_CHARS = 12_000"), "delegation output cap needs a named owner");
assert(lane.includes("MAX_LIVE_OUTPUT_CHARS"), "delegation renderer must consume the shared output cap");
assert(lane.includes("slice(-MAX_LIVE_OUTPUT_CHARS)"), "delegation output must keep only a bounded tail");
assert(lane.includes("max-h-64"), "bounded delegation output must remain independently scrollable");
assert(research.includes("processSteps.slice(-12)"), "research activity must render only a bounded recent window");
assert(output.includes("truncateMiddle"), "generic tool output must use progressive truncation");

console.log("long trace performance contracts passed");
