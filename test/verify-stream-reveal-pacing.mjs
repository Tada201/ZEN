import fs from "node:fs";
import assert from "node:assert/strict";

const smoothMarkdown = fs.readFileSync("src/atlas/components/chat/SmoothMarkdown.tsx", "utf8");
const markdownContent = fs.readFileSync("src/atlas/components/chat/MarkdownContent.tsx", "utf8");

assert(
  smoothMarkdown.includes("streamingSpeed?: 'instant' | 'typewriter'"),
  "SmoothMarkdown should accept the persisted streaming speed setting",
);

assert(
  smoothMarkdown.includes("hasPartialStreamingReveal") &&
    smoothMarkdown.includes("keep revealing the remaining provider burst") &&
    smoothMarkdown.indexOf("hasPartialStreamingReveal") < smoothMarkdown.indexOf("setDisplayedContent(content);"),
  "SmoothMarkdown should not jump to the final answer when chat:done arrives with pending visible text",
);

assert(
  smoothMarkdown.includes("INSTANT_IMMEDIATE_LAG_CHARS") &&
    smoothMarkdown.includes("TYPEWRITER_IMMEDIATE_LAG_CHARS") &&
    smoothMarkdown.includes("streamingSpeed === 'typewriter'"),
  "SmoothMarkdown should smooth bursty output while preserving instant mode for small deltas",
);

assert(
  markdownContent.includes("s.streamingSpeed ?? 'instant'") &&
    markdownContent.includes("streamingSpeed={streamingSpeed}"),
  "MarkdownContent should wire the user streaming speed setting into SmoothMarkdown",
);

console.log("stream reveal pacing checks passed");
