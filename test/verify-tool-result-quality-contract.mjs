import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const preview = read("src/atlas/components/chat/tool/toolOutputPreview.ts");
const card = read("src/atlas/components/chat/ToolCallCard.tsx");
const terminal = read("src/atlas/components/chat/tool/content/TerminalContent.tsx");
const truncated = read("src/atlas/components/chat/tool/content/TruncatedOutput.tsx");
const search = read("src/atlas/components/chat/tool/content/SearchContent.tsx");
const detail = read("src/atlas/components/chat/tool/ToolDetailView.tsx");
const generic = read("src/atlas/components/chat/tool/content/GenericContent.tsx");
const primitives = read("src/atlas/components/chat/tool/content/primitives.tsx");
const errorFallback = read("src/atlas/components/chat/tool/ToolErrorFallback.tsx");

assert(preview.includes("normalizeFileRecord"), "file results must normalize into structured changes");
assert(preview.includes("redactToolText(rawDiff)") || preview.includes("redactToolText(record.diff)"), "diff previews must redact secrets before rendering");
assert(preview.includes("redactToolText(preserveText"), "terminal stdout/stderr must be redacted");
assert(preview.includes("const raw = redactToolText"), "raw output fallback must not preserve credential-shaped values");
assert(preview.includes("slice(0, 5)"), "search and file previews must remain bounded");
assert(preview.includes("12_000"), "terminal output must have a bounded payload cap");

assert(terminal.includes("TruncatedOutput") && truncated.includes("Show full output"), "terminal details need a deliberate full-output disclosure");
assert(terminal.includes("Copy output"), "terminal details need a copy action");
assert(terminal.includes("cwd {workingDirectory}"), "terminal details should expose the working directory");
assert(search.includes("index + 1"), "search results need numbered snippets");
assert(search.includes("isSafeSearchUrl"), "search result links must be scheme-safe");
assert(detail.includes("DiffCard"), "file changes need an expandable diff renderer");
assert(detail.includes("Open full diff"), "file diffs need an editor/artifact handoff");

assert(card.includes("isOutputFailure"), "non-zero command exits must become actionable tool failures");
assert(card.includes('effectiveStatus === "error" && onRetry'), "failed command results must expose retry");
assert(card.includes("undoToolCall"), "successful edits must expose checkpoint undo");
assert(card.includes("result.conflicts.length"), "undo must fail closed when the workspace changed");
assert(errorFallback.includes("Technical details"), "renderer failures must keep diagnostics behind disclosure");
assert(primitives.includes("bg-card"), "tool detail panels must use solid semantic surfaces");
assert(!generic.includes("bg-card/70") && !generic.includes("bg-background/30"), "generic details must not use washed-out primary surfaces");

console.log("tool result quality contract ok");
