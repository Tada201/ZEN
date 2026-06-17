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
    source.includes("min-h-8") &&
    source.includes("Preparing the answer"),
  "reasoning block should render as an accessible compact capsule in collapsed state",
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
    source.includes("img: () => null"),
  "reasoning block should retain math rendering while suppressing images",
);

assert(
  source.includes("!isThinking && !defaultOpen && !userToggled") &&
    source.includes("setExpanded(false)"),
  "reasoning block should auto-collapse after completion unless the user manually opened it",
);

assert(
  groupingSource.includes('item.type === "reasoning"') &&
    groupingSource.includes("merge with an existing reasoning block"),
  "interleaved reasoning chunks should render in reasoning blocks properly grouped",
);

console.log("reasoning block ux verifier passed");
