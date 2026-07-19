// Rule 8 (chat timeline rules & frontend-rules.md) — the right-side agent
// orchestrator panel must use product language, not implementation names.
// Per the same contract, completed/loaded state should be carried by a
// status ICON consistent with the chat timeline (ToolCallCard), not by a
// monochrome uppercase pill. And raw tool metadata must live behind a
// Technical details disclosure (R3), not be free-form JSON in the panel.
//
// After the AgentOrchestratorPanel split (Phase 4), the user-facing text
// now lives across several sibling files. The verifier scans all of them
// so the contract is owned at the surface and not at any single component.

import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const ownerFiles = [
  "../src/components/widgets/orchestrator/BirdsEyeView.tsx",
  "../src/components/widgets/orchestrator/AgentWorkspace.tsx",
  "../src/components/widgets/orchestrator/LogEntry.tsx",
  "../src/components/widgets/orchestrator/AgentStatusIcon.tsx",
  "../src/components/widgets/orchestrator/timeUtils.tsx",
  "../src/components/widgets/orchestrator/AgentOrchestratorPanel.tsx",
].map((path) => new URL(path, import.meta.url));

const combinedSurface = ownerFiles
  .map((url) => readFileSync(url, "utf8"))
  .join("\n// ─── file boundary ───\n");

const cssSource = readFileSync(
  new URL("../src/components/widgets/orchestrator/agent-orchestrator.css", import.meta.url),
  "utf8",
);

// ── 8a. Banned implementation literals ──────────────────────────────────────
// Each banned literal below USED to appear inside AgentOrchestratorPanel.
// After the split, these literals must NOT appear in any of the owner files.
const banned = [
  "ORCHESTRATOR_DASHBOARD",
  "ACTIVE_NODES",
  "PENDING_QUEUE",
  "SESSION_ARCHIVE",
  "CROSS_SESSION_REGISTRY",
  "MISSION_OBJECTIVE",
  "TASK_CHRONICLE",
  "RESOLUTION_PAYLOAD",
  "SYSTEM_FAULT_DETECTED",
  "NO_ACTIVE_NODES",
  "SYNCING_DATA_LINK...",
  "[TOOL_DATA]",
  "DISMISS_TASK",
  "Purge Global Logs",
  "RUNNING_<ElapsedTime",
  "'FINISHED'",
];
for (const bad of banned) {
  assert(
    !combinedSurface.includes(bad),
    `orchestrator-panel owner files must not contain the implementation literal "${bad}" — use a product-language label instead`,
  );
}

// ── 8b. Required product-language replacements ──────────────────────────────
const required = [
  "Live agents",
  "Running in this session",
  "Waiting",
  "Completed in this session",
  "Other sessions",
  "Task",
  "Activity",
  "Result",
  "Failure details",
  "No agents running",
  "Loading\u2026",
  "technical details",
  "Stop",
  "Clear agent panel",
  "Done",
  "Delegated task",
];
const lower = combinedSurface.toLowerCase();
for (const word of required) {
  assert(
    lower.includes(word.toLowerCase()),
    `orchestrator-panel owner files must surface the product-language term "${word}"`,
  );
}

// ── 8c. Status icon contract, not TITLE pill ────────────────────────────────
const bannedPillStrings = [
  "label: 'PENDING'",
  "label: 'ACTIVE'",
  "label: 'SUCCESS'",
  "label: 'FAULT'",
];
for (const banned of bannedPillStrings) {
  assert(
    !combinedSurface.includes(banned),
    `StatusBadge must not carry the legacy uppercase text pill (${banned}); use the ToolCallCard-aligned status icon set`,
  );
}

for (const icon of ["CheckCircle2", "Clock", "Loader2", "XCircle"]) {
  assert(
    combinedSurface.includes(icon),
    `orchestrator-panel owner files must import lucide icon ${icon} so status is carried by icon, not by text pill`,
  );
}

assert(
  combinedSurface.includes("text-success/80") || combinedSurface.includes("text-success"),
  "status icons must use theme tokens (success/primary/warning/destructive), not raw hex or text-green-500",
);
assert(
  !/text-green-500/.test(combinedSurface),
  "orchestrator-panel owner files must drop the legacy text-green-500 tone; use text-success(/-80) to match the timeline",
);

// ── 8d. Tool-call metadata contract: structured summary, NOT a JSON dump ───
// The first-level "Technical details" disclosure must open to a semantic
// <dl> with curated labels (Tool/Target/Status/Result/Error/Duration).
// Anything else lives behind a nested "Raw payload" disclosure that is the
// ONLY sanctioned path to call redactLogMetadata. JSON.stringify(log.metadata)
// at the top level is a regression of the chat timeline contract.
const bannedJsonLeak = /\{\s*JSON\.stringify\s*\(\s*log\.metadata/;
const bannedPreJsonDump = /<pre[^>]*>\s*\{\s*JSON\.stringify/;

assert(
  !bannedJsonLeak.test(combinedSurface),
  'log.metadata must NOT be stringified directly into the view. Use the structured summary in LogEntry.tsx (R3 / chat timeline rules).',
);
assert(
  !bannedPreJsonDump.test(combinedSurface),
  '<pre> blocks must not render {JSON.stringify(...)} directly; redactLogMetadata is the only sanctioned output path.',
);
assert(
  /<details\b/.test(combinedSurface) && /Technical details/.test(combinedSurface),
  'Tool-call metadata must be wrapped in a <details><summary>Technical details</summary> disclosure in LogEntry.tsx.',
);
assert(
  /<dl\b/.test(combinedSurface) && /SUMMARY_LABELS/.test(combinedSurface),
  'Technical details must render a semantic <dl> definition list driven by the pinned SUMMARY_LABELS constant.',
);
// Anchor against the const declaration: labels live in SUMMARY_LABELS at
// runtime (the JSX uses {field.label}), so the verifier scans the const
// literal directly. Stable against field-label renames inside <dl>.
const summaryLabelsConst = combinedSurface.match(
  /SUMMARY_LABELS\s*=\s*\{[^}]*\}\s*as const/,
);
assert(
  summaryLabelsConst,
  'LogEntry.tsx must declare a SUMMARY_LABELS const to drive the user-facing summary table.',
);
for (const label of ['Tool', 'Target', 'Status', 'Result', 'Error', 'Duration']) {
  assert(
    new RegExp(`\\b${label}\\s*:\\s*['"\`]${label}['"\`]`).test(summaryLabelsConst[0]),
    `SUMMARY_LABELS must pin the literal "${label}" so a regression that drops a row fails the contract`,
  );
}
assert(
  /<details\b/.test(combinedSurface) &&
    /\bsummary\b/i.test(combinedSurface) &&
    /Raw payload/.test(combinedSurface) &&
    /redactLogMetadata/.test(combinedSurface),
  'A nested "Raw payload" disclosure inside "Technical details" must call redactLogMetadata — the only sanctioned path for secret-shaped metadata',
);
// Allowlist: the structured summary extractor must read the well-known
// nested paths. A regression that drops these would put a JSON blob back
// into the user-facing rows.
const nestedReadPaths = [
  ['toolCall', 'toolName'],
  ['toolCallPreview', 'toolName'],
  ['toolCall', 'input', 'path'],
  ['toolResult', 'status'],
  ['durationMs'],
].map((path) => `['${path.join("', '")}']`);
for (const fragment of nestedReadPaths) {
  assert(
    combinedSurface.includes(fragment),
    `summarizeToolMetadata should surface metadata nested at ${fragment} — without it the disclosure regresses to a JSON dump`,
  );
}

// ── 8e. CSS tone: no telemetry uppercase + tracking on panel chrome ─────────
const chromeClasses = [
  ".agent-birds-eye__title",
  ".live-agent-panel__title",
  ".live-agent-panel__section-title",
  ".live-agent-panel__state",
  ".agent-card__name",
];
for (const cls of chromeClasses) {
  const escaped = cls.replace(/\./g, "\\.");
  const ruleMatch = cssSource.match(new RegExp(escaped + "\\s*\\{[^}]*\\}", "i"));
  assert(ruleMatch, `agent-orchestrator.css must define ${cls}`);
  assert(
    !/text-transform:\s*uppercase/i.test(ruleMatch[0]),
    `${cls} must not use text-transform:uppercase; match chat-side voice`,
  );
}

for (const cls of chromeClasses) {
  const escaped = cls.replace(/\./g, "\\.");
  const ruleMatch = cssSource.match(new RegExp(escaped + "\\s*\\{[^}]*\\}", "i"));
  if (ruleMatch) {
    assert(
      !/letter-spacing:\s*0\.1[0-9]em/i.test(ruleMatch[0]),
      `${cls} must not use wide letter-spacing (>=0.10em); drop telemetry-tracker feel`,
    );
  }
}
assert(
  !/letter-spacing:\s*0\.1[0-9]em/i.test(cssSource.replace(/\.live-agent-panel__metric[^{]*\{[^}]*\}/gi, "")),
  "no other chrome selector may carry >=0.10em letter-spacing",
);

// ── 8f. Node-id leak fix ────────────────────────────────────────────────────
assert(
  !/NODE_ID:/.test(combinedSurface) && /Delegated task/.test(combinedSurface),
  "Per-task sub-label must avoid leaking the internal NODE_ID; use 'Delegated task'",
);

// ── 8g. LiveSessionExecution header already product-language ───────────────
const liveSessionSource = readFileSync(
  new URL("../src/components/widgets/orchestrator/AgentOrchestratorLiveSession.tsx", import.meta.url),
  "utf8",
);
assert(liveSessionSource.includes("Live session execution"));
assert(liveSessionSource.includes("Agent lanes"));
assert(liveSessionSource.includes("Recent tools"));

// ── 8h. Split ownership assertions (Phase 4 refactor contract) ─────────────
// Each user-facing surface now lives in its own dedicated file. The
// verifier pins the public exports so a future regression that re-inlines
// logic into AgentOrchestratorPanel.tsx fails this contract.
const panelOnly = readFileSync(
  new URL("../src/components/widgets/orchestrator/AgentOrchestratorPanel.tsx", import.meta.url),
  "utf8",
);
const birdsEyeOnly = readFileSync(
  new URL("../src/components/widgets/orchestrator/BirdsEyeView.tsx", import.meta.url),
  "utf8",
);
const workspaceOnly = readFileSync(
  new URL("../src/components/widgets/orchestrator/AgentWorkspace.tsx", import.meta.url),
  "utf8",
);
const logEntryOnly = readFileSync(
  new URL("../src/components/widgets/orchestrator/LogEntry.tsx", import.meta.url),
  "utf8",
);
const statusIconOnly = readFileSync(
  new URL("../src/components/widgets/orchestrator/AgentStatusIcon.tsx", import.meta.url),
  "utf8",
);

assert(
  birdsEyeOnly.includes("Live agents") &&
    birdsEyeOnly.includes("Running in this session") &&
    birdsEyeOnly.includes("Waiting") &&
    birdsEyeOnly.includes("Completed in this session") &&
    birdsEyeOnly.includes("Other sessions") &&
    birdsEyeOnly.includes("No agents running") &&
    /function\s+BirdsEyeView\s*\(/.test(birdsEyeOnly),
  "BirdsEyeView.tsx must own the bird's-eye view surface (Live agents, Running/Waiting/Completed/Other sessions, No agents running, the BirdsEyeView component)",
);

assert(
  workspaceOnly.includes("Delegated task") &&
    workspaceOnly.includes("Task") &&
    workspaceOnly.includes("Activity") &&
    workspaceOnly.includes("Result") &&
    workspaceOnly.includes("Failure details") &&
    workspaceOnly.includes("Loading") &&
    /function\s+AgentWorkspace\s*\(/.test(workspaceOnly),
  "AgentWorkspace.tsx must own the workspace surface (Delegated task, Task, Activity, Result, Failure details, Loading)",
);

assert(
  /export\s+function\s+LogEntry\b/.test(logEntryOnly) &&
    /export\s+const\s+MemoizedLogEntry\s*=/.test(logEntryOnly) &&
    /export\s+function\s+redactLogMetadata\b/.test(logEntryOnly),
  "LogEntry.tsx must own the LogEntry component, the memoized export, and the redactLogMetadata helper",
);

assert(
  /export\s+function\s+AgentStatusIcon\b/.test(statusIconOnly) &&
    statusIconOnly.includes("CheckCircle2") &&
    statusIconOnly.includes("Loader2") &&
    statusIconOnly.includes("XCircle") &&
    statusIconOnly.includes("Clock"),
  "AgentStatusIcon.tsx must own the icon-only status and re-import the four Lucide icons",
);

assert(
  panelOnly.includes("BirdsEyeView") &&
    panelOnly.includes("AgentWorkspace") &&
    panelOnly.includes("AnimatePresence") &&
    !/function\s+BirdsEyeView\s*\(/.test(panelOnly) &&
    !/function\s+AgentWorkspace\s*\(/.test(panelOnly) &&
    !/function\s+LogEntry\s*\(/.test(panelOnly) &&
    !/export\s+function\s+redactLogMetadata\b/.test(panelOnly),
  "AgentOrchestratorPanel.tsx must stay slim (AnimatePresence routing only) and import the split children — no inline BirdsEyeView / AgentWorkspace / LogEntry implementations remain",
);

console.log("orchestrator panel labels contract ok");
