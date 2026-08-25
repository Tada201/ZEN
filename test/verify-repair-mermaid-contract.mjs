import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const repair = read("src-tauri/src/commands/chat/repair.rs");
const chatMod = read("src-tauri/src/commands/chat/mod.rs");
const lib = read("src-tauri/src/lib.rs");
const messageQueries = read("src-tauri/crates/zen-db/src/queries/message.rs");
const crud = read("src-tauri/src/commands/chat/crud.rs");
const chatApi = read("src/api/chatApi.ts");
const diagram = read("src/atlas/components/chat/MermaidDiagram.tsx");
const markdown = read("src/atlas/components/chat/MarkdownContent.tsx");
const assistant = read("src/atlas/components/chat/AssistantMessage.tsx");
const mermaidLib = read("src/lib/mermaid.ts");
const repairPersistence = read("src/lib/richContentRepair.ts");

// ── Backend: one-shot repair command ──────────────────────────────────────
assert(
  repair.includes("pub async fn repair_mermaid"),
  "repair.rs must expose the repair_mermaid command",
);
assert(
  repair.includes("Mermaid diagram repair specialist") &&
    repair.includes("Return ONLY the corrected Mermaid diagram code"),
  "the repair prompt must demand code-only output with no prose or fences",
);
assert(
  repair.includes("fn extract_fenced_code") &&
    repair.includes("trimmed.rfind(\"```\")"),
  "repair must defensively strip markdown fences from the model response",
);
assert(
  repair.includes("fn is_plausible_mermaid") &&
    repair.includes("MERMAID_DIAGRAM_TYPES"),
  "repair must validate the reply against known Mermaid diagram keywords",
);
assert(
  repair.includes("chat_stream(") &&
    repair.includes("Ok(fixed)"),
  "repair must call the active model and return the corrected code",
);
assert(
  repair.includes("active_model") && repair.includes("active_provider"),
  "repair must resolve the active model/provider with the standard fallbacks",
);

// ── Persistence: edited assistant messages survive reloads ─────────────────
assert(
  messageQueries.includes("pub async fn update_message_content") &&
    messageQueries.includes("role = 'assistant'") &&
    messageQueries.includes("steps_json"),
  "the message query layer must persist edited assistant content (+ steps_json) scoped to the chat",
);
assert(
  crud.includes("pub async fn update_message_content(") &&
    crud.includes("normalize_trace_checkpoint") &&
    crud.includes("queries::update_message_content("),
  "the command layer must expose update_message_content and wrap steps_json in the checkpoint envelope",
);
assert(
  lib.includes("commands::chat::update_message_content,"),
  "lib.rs must register update_message_content in the invoke handler",
);
assert(
  chatApi.includes("updateMessageContent") &&
    chatApi.includes('callCommand<void>("update_message_content"') &&
    chatApi.includes("stepsJson: stepsJson ?? null"),
  "chatApi must expose a typed updateMessageContent wrapper",
);
assert(
  repairPersistence.includes("export function replaceFirstFencedBlock") &&
    repairPersistence.includes("export async function persistFencedRepair") &&
    repairPersistence.includes("chatApi.updateMessageContent(") &&
    repairPersistence.includes("getSessionMessages(chatId)") &&
    repairPersistence.includes("setSessionMessages(chatId") &&
    repairPersistence.includes("traceStatus"),
  "the shared repair module must rewrite the fence in content + steps, persist via the typed API, and mirror into the live store",
);
assert(
  diagram.includes("persistFencedRepair({") &&
    diagram.includes('lang: "mermaid"') &&
    !diagram.includes("function replaceFirstFencedBlock"),
  "MermaidDiagram must consume the shared persistence path for its fenced repairs",
);
assert(
  markdown.includes("messageId={messageId}") &&
    markdown.includes("messageId?: string;"),
  "MarkdownContent must thread the backend message id to MermaidDiagram",
);
assert(
  assistant.includes("messageId={message.id}"),
  "AssistantMessage must pass the backend message id so repairs can be persisted",
);

// ── Registration ──────────────────────────────────────────────────────────
assert(
  chatMod.includes("mod repair;") && chatMod.includes("pub use repair::*;"),
  "the chat command module must declare and re-export repair",
);
assert(
  lib.includes("commands::chat::repair_mermaid,"),
  "lib.rs must register repair_mermaid in the invoke handler",
);

// ── Typed frontend API wrapper ────────────────────────────────────────────
assert(
  chatApi.includes("repairMermaid: (code: string, error: string") &&
    chatApi.includes('callCommand<string>("repair_mermaid"') &&
    chatApi.includes("provider: options?.provider ?? null") &&
    chatApi.includes("model: options?.model ?? null"),
  "chatApi must expose a typed repairMermaid wrapper for repair_mermaid",
);

// ── Component self-heal wiring ────────────────────────────────────────────
assert(
  diagram.includes("chatApi.repairMermaid") &&
    diagram.includes("handleRepair") &&
    diagram.includes('"Fix with AI"'),
  "MermaidDiagram must trigger a model repair from the error state",
);
assert(
  diagram.includes("const renderCode = repair && !showOriginal ? repair.fixedCode : code"),
  "the repaired diagram must replace the broken one in the render path",
);
assert(
  mermaidLib.includes("MERMAID_BASE_CONFIG") &&
    mermaidLib.includes("suppressErrorRendering: true") &&
    mermaidLib.includes("securityLevel: \"strict\"") &&
    mermaidLib.includes("startOnLoad: false"),
  "the shared Mermaid config must keep error-SVG injection suppressed with the canonical strict settings",
);
assert(
  mermaidLib.includes("export const MAX_DIAGRAM_CHARS = 20_000") &&
    mermaidLib.includes("maxTextSize: MAX_DIAGRAM_CHARS"),
  "the shared config must define and wire a canonical maxTextSize backstop",
);
assert(
  mermaidLib.includes("export class MermaidSizeError") &&
    mermaidLib.includes("code.length > MAX_DIAGRAM_CHARS") &&
    mermaidLib.includes("throw new MermaidSizeError(code.length, MAX_DIAGRAM_CHARS)"),
  "renderMermaidDiagram must fail fast with a typed size error before parsing oversized diagrams",
);
assert(
  mermaidLib.includes("export function getMermaidInitConfig") &&
    mermaidLib.includes("theme: theme === \"dark\" ? \"dark\" : \"default\""),
  "the shared module must expose one canonical theme-aware init config",
);
assert(
  mermaidLib.includes("export async function renderMermaidDiagram") &&
    mermaidLib.includes("mermaid.initialize(getMermaidInitConfig(theme))"),
  "the shared module must own initialize + render so every surface uses one canonical path",
);
assert(
  mermaidLib.includes("mermaidImportPromise ??= import(\"mermaid\")") &&
    mermaidLib.includes("export function loadMermaid"),
  "the lazy mermaid singleton must live in the shared module",
);
assert(
  diagram.includes('from "@/lib/mermaid"') &&
    diagram.includes("renderMermaidDiagram") &&
    diagram.includes("renderMermaidDiagram(renderCode, resolvedTheme)") &&
    !diagram.includes("mermaid.initialize("),
  "MermaidDiagram must consume the shared render path and not initialize locally",
);
assert(
  diagram.includes("overflow-x-auto") &&
    diagram.includes("min-w-fit") &&
    diagram.includes("scrollRef") &&
    diagram.includes("svgEl.style.width") &&
    diagram.includes("svgEl.style.maxWidth = \"none\""),
  "wide Mermaid SVGs must live in a horizontally scrollable wrapper sized by explicit pixel width, not overflow the column",
);
assert(
  diagram.includes("from its viewBox") &&
    diagram.includes("svgEl.viewBox?.baseVal"),
  "the natural diagram width must be measured from the SVG viewBox",
);
assert(
  diagram.includes("ZoomIn") &&
    diagram.includes("ZoomOut") &&
    diagram.includes("handleFit") &&
    diagram.includes("ZOOM_MIN") &&
    diagram.includes("ZOOM_MAX"),
  "the container must offer bounded zoom in/out/fit controls",
);
assert(
  diagram.includes("err instanceof MermaidSizeError") &&
    diagram.includes('"Diagram Too Large"') &&
    diagram.includes("setSizeError(false)"),
  "oversized diagrams must surface a distinct size error banner and clear on retry/success",
);
assert(
  diagram.includes("baseCode") && diagram.includes("setRepair(null)"),
  "an in-memory repair must reset when the underlying message content changes",
);
assert(
  diagram.includes("Repaired with AI") && diagram.includes("Show original"),
  "the repaired diagram must expose provenance and an original-code toggle",
);

console.log("Mermaid self-healing contract passed");
