import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { prepareMarkdownFootnotes } from "../src/atlas/components/chat/markdownFootnotes.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const markdown = read("src/atlas/components/chat/MarkdownContent.tsx");
const styles = read("src/styles/index.css");

const prepared = prepareMarkdownFootnotes(
  "Claim[^alpha] and again[^alpha]. Inline `[^alpha]` stays literal.\n\n```md\n[^alpha]\n```\n\n[^alpha]: Source **one**\n    with a continuation.",
  "chat:message-1",
);

assert.equal(prepared.footnotes.length, 1, "one definition should produce one compact footnote");
assert(prepared.content.includes("#chat-message-1-fn-note-1"), "the reference should point to a scoped note target");
assert(prepared.content.includes("footnote-ref:chat-message-1-fn-ref-1-0"), "the first occurrence should have a stable reference id");
assert(prepared.content.includes("footnote-ref:chat-message-1-fn-ref-1-1"), "repeated references should receive distinct stable ids");
assert(prepared.content.includes("`[^alpha]`") && prepared.content.includes("```md\n[^alpha]\n```"), "code examples must remain literal");
assert(prepared.content.includes("with a continuation."), "indented definition continuations should be preserved");
assert(prepared.content.includes("footnote-backlink"), "the generated list should include backlinks");

assert(markdown.includes("footnote-target") && markdown.includes("footnote-backlink"), "the renderer should own safe target and backlink anchors");
assert(markdown.includes("requestAnimationFrame") && markdown.includes("focus({ preventScroll: true })"), "footnote navigation should restore keyboard focus after anchor navigation");
assert(markdown.includes("markdown-footnotes-heading"), "footnotes should have a semantic styling hook");
assert(styles.includes(".markdown-footnotes-heading + ol") && styles.includes("markdown-footnote-backlink"), "footnotes should use compact chat styling");

console.log("markdown footnotes contract passed");
