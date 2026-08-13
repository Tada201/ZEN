import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("src/App.tsx");
const preview = read("src/atlas/components/chat/ReasoningBlockPreview.tsx");
const contract = read("src/atlas/components/chat/reasoningBlockPreviewContract.ts");

assert(contract.includes("zen-harness=reasoning-block"), "reasoning preview must have a stable query contract");
assert(app.includes("REASONING_BLOCK_PREVIEW_QUERY"), "App must import the reasoning preview query contract");
assert(app.includes("import.meta.env.DEV") && app.includes("window.location.search.includes(REASONING_BLOCK_PREVIEW_QUERY)"), "reasoning preview must be development-only and query-gated");
assert(app.includes('import("./atlas/components/chat/ReasoningBlockPreview")'), "App must lazy-load the reasoning preview");

assert(preview.includes('import { ReasoningBlock } from "./ReasoningBlock"'), "preview must mount the production ReasoningBlock");
assert(preview.includes("splitReasoningSections") && preview.includes("INTERLEAVED_REASONING_SECTIONS"), "preview must exercise titled interleaved reasoning sections");
assert(preview.includes("defaultOpen={false}") && preview.includes("defaultOpen />"), "preview must show collapsed and expanded states");
assert(preview.includes("isThinking={isStreaming}"), "preview must show the live streaming state");
assert(preview.includes("STREAM_SEGMENTS") && preview.includes("Replay stream"), "preview must provide a repeatable deterministic stream");
assert(preview.includes("text{confidence}") && preview.includes("${CODE_FENCE}ts"), "preview content must exercise display math and fenced TypeScript");
assert(preview.includes("Collapsed completed") && preview.includes("Expanded completed") && preview.includes("Interleaved sections") && preview.includes("Live stream"), "preview must label the core visual states");
assert(preview.includes("Dev-only preview") && preview.includes("zen-harness=reasoning-block"), "preview must disclose its prototype maturity and gate");
assert(!preview.includes("invoke(") && !preview.includes("listen("), "preview must not call backend commands or subscribe to events");

console.log("reasoning block preview contract passed");
