import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { splitMarkdownIntoBlocks } from "../src/atlas/components/chat/markdown-utils.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const details = read("src/atlas/components/chat/MarkdownDetails.tsx");
const markdown = read("src/atlas/components/chat/MarkdownContent.tsx");
const styles = read("src/styles/index.css");

const fixture = [
  "Intro",
  "",
  "<details open>",
  "<summary>Unsafe <script>alert(1)</script> title</summary>",
  "",
  "Body **content**.",
  "",
  "```md",
  "</details>",
  "```",
  "",
  "</details>",
  "",
  "After",
].join("\n");
const blocks = splitMarkdownIntoBlocks(fixture, false);
const detail = blocks.find((block) => block.type === "details");

assert(detail, "recognized details markup should become a dedicated block");
assert.equal(detail.summary, "Unsafe alert(1) title", "summary text should be reduced to safe plain text");
assert.equal(detail.initiallyOpen, true, "the constrained open attribute should be preserved as initial state");
assert(detail.content.includes("```md") && detail.content.includes("</details>"), "code-like closing tags must remain inside the details body");
assert.equal(blocks.filter((block) => block.type === "details").length, 1, "one disclosure should produce one block");

const streaming = splitMarkdownIntoBlocks("<details>\n<summary>Live section</summary>\nPartial body", true);
assert.equal(streaming[0]?.type, "details", "unfinished details should remain renderable during streaming");
assert.equal(streaming[0]?.isComplete, false, "unfinished details should be marked incomplete");

const unsafeAttributes = splitMarkdownIntoBlocks('<details onclick="alert(1)">\n<summary>Ignored</summary>\n</details>', false);
assert(!unsafeAttributes.some((block) => block.type === "details"), "arbitrary details attributes must not activate the extension");

assert(details.includes("<details") && details.includes("<summary"), "the renderer should use native disclosure elements");
assert(details.includes("aria-controls") && details.includes("role=\"region\""), "details content should expose accessible relationships");
assert(details.includes("onToggle") && details.includes("isStreaming"), "users should control disclosure state while streaming stays open");
assert(markdown.includes("block.type === 'details'"), "the production Markdown block renderer should route details blocks");
assert(!markdown.includes("rehypeRaw"), "details support must not require raw HTML rendering");
assert(styles.includes(".markdown-details-summary") && styles.includes(".markdown-details[open]"), "details should have compact chat styling");

console.log("markdown details contract passed");
