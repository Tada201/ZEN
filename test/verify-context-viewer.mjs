#!/usr/bin/env node
/**
 * Verifier for the Codex-style context viewer feature.
 *
 * Pins the contract end-to-end:
 *   - Backend Rust types live in `src-tauri/src/agent/runner/context_breakdown.rs`
 *     and `src-tauri/src/commands/context_viewer.rs`.
 *   - Frontend TS types mirror them in `src/lib/types/contextBreakdown.ts`.
 *   - The runner emits `context:breakdown` from `event_bus.rs`.
 *   - The Tauri/JS API wrapper covers it under `src/api/contextApi.ts`.
 *   - The Zustand store subscribes via `src/lib/stores/useContextStore.ts`.
 *   - The composer mounts a `ContextViewerBadge` (via `ContextTrigger`).
 *
 * Pattern: static source verifier. Mirrors the IPI envelope verifier
 * (`test/verify-ipi-tool-output-enclosure.mjs`) for style.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const read = (rel) => readFileSync(resolve(root, rel), "utf8");

let passed = 0;
let failed = 0;
const failures = [];

const pass = (name) => {
  passed += 1;
  console.log(`✓ ${name}`);
};
const fail = (name, detail) => {
  failed += 1;
  failures.push({ name, detail });
  console.error(`✗ ${name}\n   ${detail}`);
};

// ─── Files exist ─────────────────────────────────────────────────────

const required = [
  "src-tauri/src/agent/runner/context_breakdown.rs",
  "src-tauri/src/commands/context_viewer.rs",
  "src/lib/types/contextBreakdown.ts",
  "src/api/contextApi.ts",
  "src/lib/stores/useContextStore.ts",
  "src/atlas/components/context/ContextViewerBadge.tsx",
];

for (const rel of required) {
  if (existsSync(resolve(root, rel))) {
    pass(`file exists: ${rel}`);
  } else {
    fail(`file exists: ${rel}`, "missing");
  }
}

// ─── Backend: context_breakdown.rs ───────────────────────────────────

const breakdownSrc = read("src-tauri/src/agent/runner/context_breakdown.rs");

const backendEnumMatches = [
  ["ContextBreakdownPayload", {
    label: "top-level payload",
    required: [
      "chat_id",
      "iteration",
      "total_tokens",
      "context_window",
      "actual_input_tokens",
      "actual_output_tokens",
    ],
  }],
  ["ContextSection", {
    label: "per-section record",
    required: ["id", "label", "category", "tokens", "chars"],
  }],
  ["CompactionEvent", {
    label: "compaction event",
    required: ["kind", "pre_tokens", "post_tokens"],
  }],
  ["SectionCategory", {
    label: "category enum",
    required: ["Messages", "SystemTools", "McpTools", "Skills", "SystemPrompt", "MetaContext"],
  }],
  ["ContextSectionId", {
    label: "section id enum",
    required: [
      "SafetyPreamble",
      "AgentInstructions",
      "Time",
      "UiRules",
      "DrawingCanvas",
      "GraphSession",
      "GraphSessionState",
      "DirectBoard",
      "ToolSystem",
      "TodoChecklist",
      "PatchRules",
      "AgentRoles",
      "SkillsCatalog",
      "SemanticRecall",
      "PreviousSummary",
      "CurrentSummary",
      "Conversation",
    ],
  }],
];

for (const [name, spec] of backendEnumMatches) {
  if (!new RegExp(`pub (?:struct|enum) ${name}\\b`).test(breakdownSrc)) {
    fail(`backend ${name} (${spec.label})`, "type not declared");
    continue;
  }
  pass(`backend ${name} (${spec.label}) declared`);
  for (const field of spec.required) {
    if (new RegExp(`\\b${field}\\b`).test(breakdownSrc)) {
      pass(`backend ${name} contains '${field}'`);
    } else {
      fail(`backend ${name} contains '${field}'`, "missing");
    }
  }
}

if (/pub fn compute_context_breakdown[\s\S]+&EnrichmentContext[\s\S]+&RunConfig/.test(breakdownSrc)) {
  pass("backend compute_context_breakdown signature matches (ctx, run_config)");
} else {
  fail(
    "backend compute_context_breakdown signature",
    "expected first two params: &EnrichmentContext, &RunConfig",
  );
}

if (/pub fn layer_totals\([\s\S]*?&EnrichmentContext[\s\S]*?\) -> LayerTotals/.test(breakdownSrc)) {
  pass("backend layer_totals signature matches");
} else {
  fail(
    "backend layer_totals signature",
    "expected `pub fn layer_totals(... &EnrichmentContext ...) -> LayerTotals`",
  );
}

// ─── Backend: event_bus.rs ──────────────────────────────────────────

const eventBusSrc = read("src-tauri/src/agent/event_bus.rs");

if (/ContextBreakdown\([^)]*ContextBreakdownPayload[^)]*\)/.test(eventBusSrc)) {
  pass("event_bus has ContextBreakdown variant");
} else {
  fail("event_bus has ContextBreakdown variant", "not found");
}

if (/AgentEvent::ContextBreakdown\(_[\s\S]*?"context:breakdown"/.test(eventBusSrc)) {
  pass("event_bus maps ContextBreakdown → \"context:breakdown\" event name");
} else {
  fail("event_bus ContextBreakdown event name", "\"context:breakdown\" not found in event_name()");
}

if (/AgentEvent::ContextBreakdown\(p\)[\s\S]+serde_json::to_value\(p\)/.test(eventBusSrc)) {
  pass("event_bus bridge_to_tauri serialises ContextBreakdown payload");
} else {
  fail("event_bus bridge_to_tauri serialises ContextBreakdown", "missing arm");
}

// ─── Backend: middleware instrumentation ────────────────────────────
// The middleware module was split into a directory; EnrichmentContext
// and its section-log methods live in `core.rs`, while the per-section
// instrumentation lives in `system_prompt.rs`. Concatenate both so the
// contract checks below see the whole surface.

const middlewareSrc =
  read("src-tauri/src/agent/middleware/core.rs") +
  "\n" +
  read("src-tauri/src/agent/middleware/system_prompt.rs");

const instrumentationChecks = [
  ["section_log: Vec<ContextSectionEntry>", "section_log field on EnrichmentContext"],
  [/pub fn record_section\([\s\S]+&mut self/, "record_section method"],
  [
    /pub fn try_push_section\([\s\S]+&mut self[\s\S]+id:\s*ContextSectionId/,
    "try_push_section method with ContextSectionId parameter (multi-line)",
  ],
  ["ContextSectionEntry {", "ContextSectionEntry struct field init"],
];

for (const [needle, name] of instrumentationChecks) {
  if (needle instanceof RegExp ? needle.test(middlewareSrc) : middlewareSrc.includes(needle)) {
    pass(`middleware.rs: ${name}`);
  } else {
    fail(`middleware.rs: ${name}`, `missing regex/pattern ${needle}`);
  }
}

// Spot-check: SystemPromptMiddleware records at least one section per cluster
const expectedSections = [
  "ContextSectionId::Time",
  "ContextSectionId::UiRules",
  "ContextSectionId::DrawingCanvas",
  "ContextSectionId::GraphSession",
  "ContextSectionId::GraphSessionState",
  "ContextSectionId::DirectBoard",
  "ContextSectionId::ToolSystem",
  "ContextSectionId::TodoChecklist",
  "ContextSectionId::PatchRules",
  "ContextSectionId::AgentRoles",
];

for (const id of expectedSections) {
  if (middlewareSrc.includes(id)) {
    pass(`middleware.rs instruments ${id}`);
  } else {
    fail(`middleware.rs instruments ${id}`, "missing");
  }
}

// ─── Backend: commands/context_viewer.rs ────────────────────────────

if (existsSync(resolve(root, "src-tauri/src/commands/context_viewer.rs"))) {
  const cvSrc = read("src-tauri/src/commands/context_viewer.rs");

  const cmdChecks = [
    ["pub async fn get_context_breakdown", "get_context_breakdown command"],
    ["pub async fn get_context_snapshot", "get_context_snapshot command"],
    ["#[derive(Debug, Clone, Serialize)]", "serde Serialize derives"],
  ];

  for (const [needle, name] of cmdChecks) {
    if (cvSrc.includes(needle)) {
      pass(`commands/context_viewer.rs: ${name}`);
    } else {
      fail(`commands/context_viewer.rs: ${name}`, `missing '${needle}'`);
    }
  }
}

// ─── Backend: lib.rs invoke_handler ─────────────────────────────────

const libSrc = read("src-tauri/src/lib.rs");

const libChecks = [
  ["commands::context_viewer::get_context_breakdown", "registers get_context_breakdown in invoke_handler"],
  ["commands::context_viewer::get_context_snapshot", "registers get_context_snapshot in invoke_handler"],
];

for (const [needle, name] of libChecks) {
  if (libSrc.includes(needle)) {
    pass(`lib.rs: ${name}`);
  } else {
    fail(`lib.rs: ${name}`, `missing '${needle}'`);
  }
}

// ─── Frontend: types/contextBreakdown.ts stays in lockstep ──────────

const tsSrc = read("src/lib/types/contextBreakdown.ts");

const tsMirrorChecks = [
  ["safety-preamble", "SafetyPreamble"],
  ["agent-instructions", "AgentInstructions"],
  ["drawing-canvas", "DrawingCanvas"],
  ["graph-session-state", "GraphSessionState"],
  ["todo-checklist", "TodoChecklist"],
  ["patch-rules", "PatchRules"],
  ["semantic-recall", "SemanticRecall"],
  ["previous-summary", "PreviousSummary"],
  ["current-summary", "CurrentSummary"],
];

for (const [kebab, rust] of tsMirrorChecks) {
  if (tsSrc.includes(`"${kebab}"`) && tsSrc.includes(`"${kebab}"`)) {
    pass(`TS mirrors Rust ${rust}`);
  } else {
    fail(`TS mirrors Rust ${rust}`, `missing '${kebab}'`);
  }
}

const tsRequired = [
  "formatTokens",
  "utilizationStatus",
  "SECTION_CATEGORY_COLOR",
  "SECTION_CATEGORY_LABEL",
  "ContextBreakdown",
  "ContextSection",
  "CompactionEvent",
  "ContextSnapshot",
  "actualInputTokens",
  "actualOutputTokens",
];

for (const name of tsRequired) {
  if (tsSrc.includes(name)) {
    pass(`ts types exposes ${name}`);
  } else {
    fail(`ts types exposes ${name}`, "missing");
  }
}

// ─── Frontend: api/contextApi.ts ────────────────────────────────────

const apiSrc = read("src/api/contextApi.ts");

const apiChecks = [
  ["onBreakdown", "onBreakdown subscription helper"],
  ['"context:breakdown"', "binds context:breakdown event name"],
  ["get_context_breakdown", "uses get_context_breakdown command"],
  ["get_context_snapshot", "uses get_context_snapshot command"],
  ["listen<ContextBreakdown>", "typed listener payload"],
];

for (const [needle, name] of apiChecks) {
  if (apiSrc.includes(needle)) {
    pass(`api/contextApi.ts: ${name}`);
  } else {
    fail(`api/contextApi.ts: ${name}`, `missing '${needle}'`);
  }
}

// ─── Frontend: stores/useContextStore.ts ────────────────────────────

const storeSrc = read("src/lib/stores/useContextStore.ts");

// Note: the create() invocation may be written as `create((set) => …)` with
// generics between, e.g. `create<State & Actions>(`. Patterns below
// intentionally match both shapes to avoid false positives on refactors.
const storeChecks = [
  [/create\b[\s\S]*?\(set\) =>/, "Zustand create hook with set callback"],
  ["apply: (payload)", "apply action accepts payload"],
  ["reset: (chatId)", "reset action exists"],
  ["latestIteration", "iteration dedupe field"],
];

for (const [needle, name] of storeChecks) {
  const ok = needle instanceof RegExp ? needle.test(storeSrc) : storeSrc.includes(needle);
  if (ok) {
    pass(`store: ${name}`);
  } else {
    fail(`store: ${name}`, `missing '${needle}'`);
  }
}

// ─── Frontend: components ───────────────────────────────────────────
// The context viewer collapsed into a single self-contained badge: the
// badge now owns its composition popover directly (opened above the
// circular gauge), so the former right-panel `ContextViewerPanel` and
// its `right.context` tab were removed. The contract is now badge-only.

const badgeSrc = read("src/atlas/components/context/ContextViewerBadge.tsx");

const badgeChecks = [
  ["ContextViewerBadge", "named export"],
  ["useContextStore", "consumes the store"],
  ["utilizationStatus", "uses status mapper"],
  ["data-testid=\"context-viewer-badge\"", "test id for e2e"],
  ["formatTokens", "uses token formatter"],
  ["compactionEvent", "renders compaction event in the popover"],
  ["actualInput", "surfaces provider-reported actual input tokens"],
  ["actualOutput", "surfaces provider-reported actual output tokens"],
];
for (const [needle, name] of badgeChecks) {
  if (badgeSrc.includes(needle)) {
    pass(`badge: ${name}`);
  } else {
    fail(`badge: ${name}`, `missing '${needle}'`);
  }
}

// ─── Integration: PremiumChatInput mounts the badge ─────────────────
// The badge is mounted through the `ContextTrigger` wrapper so the
// composer file stays under its line-count limit; accept either the
// direct import or the wrapper.

const inputFooterSources = [
  "src/atlas/components/PremiumChatInput.tsx",
  "src/atlas/components/ContextTrigger.tsx",
]
  .map((rel) => (existsSync(resolve(root, rel)) ? read(rel) : ""))
  .join("\n");
if (
  inputFooterSources.includes("ContextViewerBadge") ||
  inputFooterSources.includes("ContextTrigger")
) {
  pass("composer mounts the ContextViewerBadge (direct or via ContextTrigger)");
} else {
  fail("composer mounts the ContextViewerBadge", "missing");
}

// ─── Summary ────────────────────────────────────────────────────────

console.log("");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error("\nFailures:");
  for (const f of failures) {
    console.error(`  - ${f.name}: ${f.detail}`);
  }
  process.exit(1);
} else {
  console.log("\nAll context-viewer contract checks passed.");
}
