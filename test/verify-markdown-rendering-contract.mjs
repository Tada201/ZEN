import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const markdown = read("src/atlas/components/chat/MarkdownContent.tsx");
const references = read("src/atlas/components/chat/MarkdownReferences.tsx");
const smooth = read("src/atlas/components/chat/SmoothMarkdown.tsx");
const splitter = read("src/atlas/components/chat/markdown-utils.ts");
const helpers = read("src/atlas/components/chat/MarkdownHelperComponents.tsx");
const fixture = JSON.parse(read("test/chat-fixtures.json"));
const fixtureContent = fixture.test_markdown.flow.find((step) => step.type === "done")?.content || "";

assert(smooth.includes("remarkGfm"), "chat prose should use GitHub-Flavored Markdown parsing");
assert(smooth.includes("remarkMath") && smooth.includes("rehypeKatex"), "chat prose should render math safely through KaTeX");
assert(smooth.includes("remarkGemoji") && smooth.includes("remarkSupersub"), "chat prose should retain emoji and superscript/subscript extensions");
assert(markdown.includes("input: ({ checked") && markdown.includes("Completed task"), "GFM task lists should render as accessible read-only checkboxes");
assert(markdown.includes("https?:\\/\\/") && markdown.includes("mainContent"), "short streaming text should fall back to Markdown when it contains a URL");
assert(markdown.includes("table:") && markdown.includes("<Table"), "GFM tables should use the structured table renderer");
assert(markdown.includes("del:") && markdown.includes("sup:") && markdown.includes("sub:"), "inline strikethrough and superscript/subscript should have explicit formatting");
assert(references.includes("isSafeGeneratedHref(ref.url)") && !references.includes("href={ref.url}"), "reference cards must not bypass generated-link validation");
assert(references.includes('code sample containing "## References"') && references.includes("inFence"), "reference extraction must not consume headings inside fenced code");
assert(splitter.includes("`{3,}|~{3,}") && splitter.includes("isClosingFence"), "streaming block splitting should support both GFM fence styles");
assert(helpers.includes("opening = content.match") && helpers.includes("~{3,}"), "code-fence stripping should support tilde fences");
assert(fixtureContent.includes("|") && fixtureContent.includes("```") && fixtureContent.includes("> "), "the rich Markdown fixture should cover tables, fenced code, and blockquotes");

// Raw HTML remains intentionally unsupported: enabling it would require a
// sanitizer boundary rather than silently turning model text into DOM.
assert(!smooth.includes("rehypeRaw"), "raw HTML must not be enabled without an explicit sanitizer boundary");

console.log("markdown rendering contract passed");
