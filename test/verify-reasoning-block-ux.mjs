import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const source = readFileSync(
  new URL("../src/atlas/components/chat/ReasoningBlock.tsx", import.meta.url),
  "utf8",
);
const groupingSource = readFileSync(
  new URL("../src/atlas/components/chat/assistantMessageParts.ts", import.meta.url),
  "utf8",
);

assert(
  source.includes("Collapse reasoning details") &&
    source.includes("Expand reasoning details") &&
    source.includes("execution-reasoning-summary") &&
    source.includes("min-h-7") &&
    source.includes("Preparing the answer"),
  "reasoning block should render as an accessible one-line summary in collapsed state",
);

assert(
  source.includes("max-h-[260px]") &&
    source.includes("overflow-y-auto") &&
    source.includes("Reasoning") &&
    source.includes("live") &&
    source.includes("complete"),
  "expanded reasoning panel should be bounded, scrollable, and status-aware",
);

assert(
  source.includes("normalizeMathMarkdown") &&
    source.includes("remarkMath") &&
    source.includes("rehypeKatex") &&
    source.includes("img: () => null") &&
    source.includes("reasoning-markdown") &&
    source.includes("h1:") &&
    source.includes("pre:") &&
    source.includes("safeHref"),
  "reasoning block should retain safe math rendering and structured markdown formatting",
);

assert(
  source.includes("setInterval") &&
    source.includes("}, 1000);"),
  "reasoning duration should update at a one-second cadence",
);
assert(
  !source.includes("collapseTimeoutRef") &&
    !source.includes("setExpanded(false)"),
  "reasoning should not force-close content when live thinking completes",
);

assert(
  groupingSource.includes('item.type === "reasoning"') &&
    groupingSource.includes("merge with an existing reasoning block"),
  "interleaved reasoning chunks should render in reasoning blocks properly grouped",
);

console.log("reasoning block ux verifier passed");
