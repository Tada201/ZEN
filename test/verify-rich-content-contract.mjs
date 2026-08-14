import { existsSync, readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const chartLib = read("src/lib/chart.ts");
const treeLib = read("src/lib/tree.ts");
const chart = read("src/atlas/components/chat/ChartBlock.tsx");
const tree = read("src/atlas/components/chat/FileTree.tsx");
const repairBackend = read("src-tauri/src/commands/chat/repair.rs");
const lib = read("src-tauri/src/lib.rs");
const chatApi = read("src/api/chatApi.ts");
const markdown = read("src/atlas/components/chat/MarkdownContent.tsx");

// ── Canonical chart module ────────────────────────────────────────────────
assert(
  chartLib.includes("export const CHART_TYPES") &&
    chartLib.includes("export interface ChartSpec") &&
    chartLib.includes("export const DEFAULT_CHART_COLORS"),
  "the canonical chart module must own the chart type set, schema, and palette",
);
assert(
  chartLib.includes("export const MAX_CHART_CHARS") &&
    chartLib.includes("tooLarge: true") &&
    chartLib.includes("content.length > MAX_CHART_CHARS"),
  "the chart module must fail fast with a tooLarge result before parsing oversized payloads",
);
assert(
  chartLib.includes("export function parseChartContent") &&
    chartLib.includes("Array.isArray(record.data)") &&
    chartLib.includes("keys.length === 0"),
  "the chart module must own the canonical fence-stripping parse and schema validation",
);

// ── Canonical tree module ─────────────────────────────────────────────────
assert(
  treeLib.includes("export interface TreeNode") &&
    treeLib.includes("export function parseTree"),
  "the canonical tree module must own the tree node model and parser",
);
assert(
  treeLib.includes("export const MAX_TREE_LINES") &&
    treeLib.includes("truncated") &&
    treeLib.includes("lines.slice(0, maxLines)"),
  "the tree module must guard oversized trees with a truncation result",
);

// ── Renderers consume the canonical modules without local drift ───────────
assert(
  chart.includes("from '@/lib/chart'") &&
    chart.includes("parseChartContent(content)") &&
    chart.includes("DEFAULT_CHART_COLORS") &&
    !chart.includes("const DEFAULT_COLORS") &&
    !chart.includes("JSON.parse(cleaned)"),
  "ChartBlock must consume the shared parse/palette and not duplicate them locally",
);
assert(
  chart.includes("Chart Too Large") &&
    chart.includes("MAX_CHART_CHARS.toLocaleString()") &&
    chart.includes("chartData.tooLarge"),
  "ChartBlock must surface a distinct too-large state instead of a generic fallback",
);
assert(
  chart.includes("Condense with AI") &&
    chart.includes("chatApi.repairChart") &&
    chart.includes("persistFencedRepair") &&
    chart.includes("lang: 'chart'") &&
    chart.includes("repairFailed"),
  "ChartBlock must offer a condense-with-AI self-heal loop that persists through the shared repair module",
);
assert(
  repairBackend.includes("pub async fn repair_chart") &&
    repairBackend.includes("REPAIR_CHART_SYSTEM_PROMPT") &&
    repairBackend.includes("fn is_plausible_chart") &&
    repairBackend.includes("fn extract_fenced_code"),
  "the backend must expose a chart repair command with a condense prompt and plausibility validation",
);
assert(
  lib.includes("commands::chat::repair_chart,"),
  "lib.rs must register repair_chart in the invoke handler",
);
assert(
  chatApi.includes("repairChart") &&
    chatApi.includes('callCommand<string>("repair_chart"'),
  "chatApi must expose a typed repairChart wrapper",
);
assert(
  markdown.includes("<ChartBlock content={codeStr} isStreaming={isStreaming} chatId={chatId} messageId={messageId} />"),
  "MarkdownContent must thread chat/message context to ChartBlock so condensations can persist",
);
assert(
  tree.includes('from "@/lib/tree"') &&
    tree.includes("parseTree(content)") &&
    !tree.includes("function parseTree(") &&
    !tree.includes("interface TreeNode"),
  "FileTree must consume the shared parser and not duplicate the model locally",
);
assert(
  tree.includes("Tree truncated") &&
    tree.includes("MAX_TREE_LINES"),
  "FileTree must surface a truncation notice for oversized trees",
);

// ── No duplicate chart renderer ───────────────────────────────────────────
assert(
  !existsSync(new URL("../src/components/Zen/widgets/ChartBlock.tsx", import.meta.url)) &&
    !read("src/components/Zen/widgets/index.ts").includes("export { ChartBlock }"),
  "the orphaned chart.js ChartBlock must stay retired — all chart rendering goes through the canonical recharts surface",
);

console.log("rich content canonical modules contract passed");
