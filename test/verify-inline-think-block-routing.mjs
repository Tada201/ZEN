import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import ts from "typescript";

const streamSourcePath = new URL("../src/atlas/hooks/stream/useChatChunkEvent.ts", import.meta.url);
const chunkHelperPath = new URL("../src/atlas/hooks/stream/chatChunkBuffer.ts", import.meta.url);
const markdownSourcePath = new URL("../src/atlas/components/chat/MarkdownContent.tsx", import.meta.url);
const chatTypesPath = new URL("../src/atlas/components/chat/types.ts", import.meta.url);
const markdownUtilsPath = new URL("../src/atlas/components/chat/markdown-utils.ts", import.meta.url);

const streamSource = readFileSync(streamSourcePath, "utf8");
const chunkHelperSource = readFileSync(chunkHelperPath, "utf8");
const markdownSource = readFileSync(markdownSourcePath, "utf8");
const chatTypesSource = readFileSync(chatTypesPath, "utf8");
const markdownUtilsSource = readFileSync(markdownUtilsPath, "utf8");

assert(
  streamSource.includes("applyBufferedDeltaToMessage") &&
    chunkHelperSource.includes("splitInlineThinkTags") &&
    chunkHelperSource.includes('type: open ? "thought" : "text"') &&
    chunkHelperSource.includes("metadata: {") &&
    chunkHelperSource.includes("inlineThinkOpen: split.open") &&
    chunkHelperSource.includes("inlineThinkPending: split.pending"),
  "streaming text deltas should route inline think tags into reasoning state and remember open or partial tags across chunks",
);

assert(
  streamSource.includes("replaceTextStepsWithContent") &&
    chunkHelperSource.includes("splitInlineThinkContent") &&
    chunkHelperSource.includes("hasInlineThinkTags") &&
    chunkHelperSource.includes("normalizedReasoning || message.reasoning"),
  "final content replacement should strip inline think tags and preserve reasoning",
);

assert(
  markdownSource.includes("extractInlineThoughtBlocks") &&
    markdownSource.includes("ReasoningBlock") &&
    chatTypesSource.includes("(?:thought|think)"),
  "MarkdownContent should render replayed <think> blocks as reasoning fallback",
);

assert(
  markdownUtilsSource.includes("(?:thought|think)") &&
    markdownUtilsSource.includes("inThoughtBlock"),
  "markdown block splitter should understand <think> aliases while streaming",
);

const strippedSource = chunkHelperSource.replace(/^import .+;\r?\n/gm, "");
const transpiled = ts.transpileModule(strippedSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: "chatChunkBuffer.ts",
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
const { splitInlineThinkTags } = await import(moduleUrl);

assert.deepEqual(splitInlineThinkTags("<think>plan</think>answer"), {
  segments: [
    { type: "thought", content: "plan" },
    { type: "text", content: "answer" },
  ],
  open: false,
  pending: "",
});

const first = splitInlineThinkTags("prefix <think>plan", false);
assert.deepEqual(first, {
  segments: [
    { type: "text", content: "prefix " },
    { type: "thought", content: "plan" },
  ],
  open: true,
  pending: "",
});

const second = splitInlineThinkTags(" continued</think> answer", first.open);
assert.deepEqual(second, {
  segments: [
    { type: "thought", content: " continued" },
    { type: "text", content: " answer" },
  ],
  open: false,
  pending: "",
});

const splitTagStart = splitInlineThinkTags("<thi", false);
assert.deepEqual(splitTagStart, {
  segments: [],
  open: false,
  pending: "<thi",
});

const splitTagEnd = splitInlineThinkTags("nk>plan</think>answer", splitTagStart.open, splitTagStart.pending);
assert.deepEqual(splitTagEnd, {
  segments: [
    { type: "thought", content: "plan" },
    { type: "text", content: "answer" },
  ],
  open: false,
  pending: "",
});

assert.deepEqual(splitInlineThinkTags("<thought>x</thought>y"), {
  segments: [
    { type: "thought", content: "x" },
    { type: "text", content: "y" },
  ],
  open: false,
  pending: "",
});

console.log("inline think block routing verifier passed");
