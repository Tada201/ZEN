// Verifier migrated to the reusable SSOT helper at `src/lib/test-ssot/extract.mjs`.
// Every assertion that existed in the imperative form is preserved — the helper
// just routes them through `pinExport`, `pinActiveImport`, `pinAbsent`,
// `pinContains`, and `pinRegexPresent` so future SSOT consolidations can reuse
// the same defense-in-depth shape (export pin + active-import pin + legacy-name
// absence cross-cutting) for free.
//
// Source loading is inlined here (rather than factored into a helper) because
// a helper cannot know its caller's location — `import.meta.url` inside the
// helper would resolve paths relative to the helper file, not the verifier
// file. The standard Node ESM pattern `readFileSync(new URL("...", import.meta.url), "utf8")`
// is the idiomatic equivalent and is used throughout.

import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import {
  checkAll,
  pinAbsent,
  pinActiveImport,
  pinContains,
  pinExport,
  pinRegexPresent,
} from "../src/lib/test-ssot/extract.mjs";

// ── Source loading via inline `readFileSync(new URL(.., import.meta.url), "utf8")` ──
// mockStreaming forward-looking guard — this file emits raw fixture data and
// does not derive verbs today, but it is the most likely future drift site if
// a mock-side verb surface is added. Including it now means future mock-drift
// surfaces immediately via the cross-cutting legacy-name pin below.
const extractTsSource = readFileSync(
  new URL("../src/lib/test-ssot/extract.ts", import.meta.url),
  "utf8",
);
const extractMjsSource = readFileSync(
  new URL("../src/lib/test-ssot/extract.mjs", import.meta.url),
  "utf8",
);
const cardSource = readFileSync(
  new URL("../src/atlas/components/chat/ToolCallCard.tsx", import.meta.url),
  "utf8",
);
const traceSource = readFileSync(
  new URL("../src/atlas/components/chat/AgentExecutionTrace.tsx", import.meta.url),
  "utf8",
);
const actionTraceSource = readFileSync(
  new URL("../src/atlas/components/chat/AssistantMessageTrace.tsx", import.meta.url),
  "utf8",
);
const delegationLaneSource = readFileSync(
  new URL("../src/atlas/components/chat/AgentDelegationLane.tsx", import.meta.url),
  "utf8",
);
const assistantMessageSource = readFileSync(
  new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url),
  "utf8",
);
const mockStreamingSource = readFileSync(
  new URL("../src/api/mockStreaming.ts", import.meta.url),
  "utf8",
);
const detailSource = readFileSync(
  new URL("../src/atlas/components/chat/tool/ToolDetailView.tsx", import.meta.url),
  "utf8",
);
const genericContentSource = readFileSync(
  new URL("../src/atlas/components/chat/tool/content/GenericContent.tsx", import.meta.url),
  "utf8",
);
const terminalContentSource = readFileSync(
  new URL("../src/atlas/components/chat/tool/content/TerminalContent.tsx", import.meta.url),
  "utf8",
);
const imageContentSource = readFileSync(
  new URL("../src/atlas/components/chat/tool/content/ImageContent.tsx", import.meta.url),
  "utf8",
);

// Cross-cutting legacy name absence — applied to every chat-timeline owner
// file so the old SSOT name cannot be re-introduced anywhere downstream.
const legacyNameAbsent = pinAbsent(
  "getToolActionVerb",
  "legacy helper name 'getToolActionVerb' must NOT appear; route through 'humanizeToolAction' in ToolCallCard.tsx",
);

// Parity-pin authorities — single source of truth for the helper's exported
// factory names. Adding a new factory requires updating ONLY this array AND
// the matching `export function NAME` declaration in both `.ts` and `.mjs`.
// The parity-pin block below asserts every name shows up on both sides.
const EXPECTED_EXPORTS = [
  "pinExport",
  "pinActiveImport",
  "pinAbsent",
  "pinContains",
  "pinRegexPresent",
  "checkAll",
];
const parityFactoryPins = (filename) =>
  EXPECTED_EXPORTS.map((name) =>
    pinContains(
      `export function ${name}`,
      `${name} must be exported in ${filename}`,
    ),
  );
const readSourceSyncAbsent = pinAbsent(
  "export function readSourceSync",
  "readSourceSync must NOT be exported (a helper cannot know the caller's import.meta.url; source loading is verifier-local)",
);

// ── Pin table ───────────────────────────────────────────────────────────────
// The table shape is `{ context, source, pins: Pin[] }`. Each entry's failure
// message reads `${context}: ${pin.describe}`. Cross-cutting pins are repeated
// across multiple entries (no implicit looping) so the failure message stays
// grounded in a specific file.

checkAll(assert, [
  // ── PARITY BETWEEN extract.ts AND extract.mjs ─────────────────────────────
  // Both files must declare the same set of exported helpers. Drift between
  // them fails the verifier at test time so the runtime/typed mirror never
  // silently diverges. Both files deliberately omit `readSourceSync` — it
  // was removed because a helper cannot know its caller's `import.meta.url`,
  // so the verifier inlines `readFileSync(new URL(.., import.meta.url), ...)`.
  {
    context: "src/lib/test-ssot/extract.ts",
    source: extractTsSource,
    pins: [
      ...parityFactoryPins("extract.ts"),
      pinContains("export type Pin = Readonly", "Pin type alias must use the narrowed Readonly<{...}> form (the JSDoc on Pin requires the factory-first rule)"),
      pinContains("export type AssertFn", "AssertFn type must be present in the .ts reference"),
      readSourceSyncAbsent,
    ],
  },
  {
    context: "src/lib/test-ssot/extract.mjs",
    source: extractMjsSource,
    pins: [
      ...parityFactoryPins("extract.mjs"),
      readSourceSyncAbsent,
    ],
  },

  // ── TOOLCALLCARD ──────────────────────────────────────────────────────────
  // Producer-side: cardSource must export the canonical verb helper AND carry
  // the user-readable verb literals (`Searching`/`Reading`/`Writing`/`Running`).
  // It also carries the status-label table, the output preview builder, the
  // Technical details disclosure, the approval flow, the orchestration footer
  // cleanup pins, and the ToolDetailView expansion wiring.
  {
    context: "ToolCallCard.tsx",
    source: cardSource,
    pins: [
      pinContains("function humanizeToolAction", "tool cards should derive readable action verbs through humanizeToolAction"),
      pinContains("Searching", "action family table must include 'Searching'"),
      pinContains("Reading", "action family table must include 'Reading'"),
      pinContains("Writing", "action family table must include 'Writing'"),
      pinContains("Running", "action family table must include 'Running'"),
      pinExport("humanizeToolAction", "humanizeToolAction must be the central, exported helper in ToolCallCard.tsx"),
      legacyNameAbsent,
      pinContains("function getStatusLabel", "tool cards should expose compact status labels"),
      pinContains("Needs approval", "status labels should include 'Needs approval'"),
      pinContains("Complete", "status labels should include 'Complete'"),
      pinContains("Failed", "status labels should include 'Failed'"),
      pinContains("buildToolOutputPreview", "tool cards should derive summaries from structured preview data"),
      pinContains("Technical details", "raw output should be hidden behind an explicit disclosure"),
      pinContains("<details", "raw output disclosure must use the native <details> element"),
      pinAbsent("<MarkdownContent", "tool output should not render arbitrary raw markdown in the timeline"),
      pinContains("Approval context", "approval flow should remain visible and actionable"),
      pinContains("Deny", "approval flow should expose a Deny control"),
      pinContains("Approve", "approval flow should expose an Approve control"),
      pinAbsent(
        ["agent {ownerLabel}", "batch {batchId}", "iter {iteration}"],
        "orchestration metadata footer (agent/batch/iter) must be removed from tool cards",
      ),
      pinAbsent(
        ["getStatusLabel(status)}\n        </span>", "bg-success/10 text-success"],
        "the text status pill must be removed; the colored status icon carries state",
      ),
      pinContains("deltaLabel", "completed file edits should show a compact +/- delta on the collapsed line"),
      pinContains("<ToolDetailView", "tool card expansion must route through ToolDetailView"),
    ],
  },

  // ── AGENTEXECUTIONTRACE ──────────────────────────────────────────────────
  // Consumer-side: must actively import humanizeToolAction from ToolCallCard
  // (verb SSOT). Must NOT carry any of the four stale family-table literal
  // branches (those would re-derive the SSOT inline and triplicate the
  // consolidated single source). Plus the cross-cutting legacy-name pin.
  {
    context: "AgentExecutionTrace.tsx",
    source: traceSource,
    pins: [
      pinActiveImport("humanizeToolAction", "ToolCallCard", "AgentExecutionTrace must import humanizeToolAction from ToolCallCard (SSOT enforcement)"),
      legacyNameAbsent,
      pinAbsent(
        [
          'lower.includes("create")',
          'lower.includes("terminal") || lower.includes("shell") || lower.includes("command") || lower.includes("bash")',
          'lower.includes("read") || lower.includes("list") || lower.includes("open")',
          'lower.includes("search") || lower.includes("web") || lower.includes("grep")',
        ],
        "AgentExecutionTrace must not re-derive the verb family inline — route through humanizeToolAction",
      ),
    ],
  },

  // ── ASSISTANTMESSAGETRACE ────────────────────────────────────────────────
  // Consumer-side: must actively import humanizeToolName from ToolCallCard
  // (noun SSOT) AND AgentDelegationLane so the delegation leaf stays
  // reachable. Must NOT expose `serializeActionDetails` (raw JSON scrub) and
  // must carry a `Technical details` disclosure over the argsPreview. Plus
  // the cross-cutting legacy-name pin.
  {
    context: "AssistantMessageTrace.tsx",
    source: actionTraceSource,
    pins: [
      pinActiveImport("humanizeToolName", "ToolCallCard", "AssistantMessageTrace must import humanizeToolName from ToolCallCard (chat_status noun SSOT)"),
      pinActiveImport("AgentDelegationLane", "AgentDelegationLane", "AssistantMessageTrace must import AgentDelegationLane (path-style agnostic: relative './AgentDelegationLane' or aliased '@/atlas/components/chat/AgentDelegationLane') so the delegation leaf stays reachable"),
      legacyNameAbsent,
      pinAbsent("serializeActionDetails", "action rows should not expose internal JSON event payloads"),
      pinContains("Issue", "action rows should expose the user-readable issue label"),
      pinContains("<details", "approval argument previews must use the native disclosure"),
      pinContains("Technical details", "approval argument previews must be hidden behind a 'Technical details' disclosure"),
      pinContains("argsPreview", "approval argument previews must derive from structured argsPreview data"),
      pinAbsent("{argsPreview}</pre>", "approval argument previews must not dump raw JSON via argsPreview"),
    ],
  },

  // ── AGENTDELEGATIONLANE ───────────────────────────────────────────────────
  // Leaf in the delegation chain. Must export its component AND must NOT
  // establish any tool-name humanization surface — no humanizeToolName
  // import, no snake-to-TitleCase regex, no `'search'` heuristic. Plus the
  // cross-cutting legacy-name pin. The collapse-by-default contract requires
  // `useState(isError)` (auto-expand on failure only) and `conciseLivePreview`
  // (collapse live agent content). `{lane.liveContent}` is forbidden to keep
  // the lane from dumping full subagent transcripts.
  {
    context: "AgentDelegationLane.tsx",
    source: delegationLaneSource,
    pins: [
      pinExport("AgentDelegationLane", "AgentDelegationLane.tsx must export its component as the delegation-chain leaf"),
      legacyNameAbsent,
      pinAbsent(
        ["humanizeToolName", /\.replace\s*\(\s*\/\[_-\]\+/, /toLowerCase\(\)\.[^)]*includes\(\s*["']search["']/],
        "AgentDelegationLane must NOT introduce a tool-name humanization surface (no 'humanizeToolName' import, no snake-to-TitleCase, no 'search' heuristic); route through AssistantMessageTrace",
      ),
      pinContains("useState(isError)", "subagent rows must persist only the error signal so collapse-by-default holds"),
      pinAbsent("{lane.liveContent}", "subagent rows must not dump full live transcripts inline"),
      pinContains("conciseLivePreview", "subagent rows must surface a concise preview, not a full transcript"),
    ],
  },

  // ── ASSISTANTMESSAGE ──────────────────────────────────────────────────────
  // Composition root: must import the verb consumer (AgentExecutionTrace),
  // the noun consumer (AgentActionStep + ResearchTimeline). Must NOT define
  // a local snake-to-TitleCase or `.replaceAll` noun surface. Must render
  // one grouped execution row per tool group (no per-tool .map/forEach
  // iteration on step.toolCalls at the parent-message level). The
  // shouldShowToolGroupInTimeline gate must return early on actionable
  // tools AND on reload (`isStreaming && !hasAssistantAnswer`). Plus the
  // cross-cutting legacy-name pin.
  {
    context: "AssistantMessage.tsx",
    source: assistantMessageSource,
    pins: [
      // AgentExecutionTrace is reached via ExecutionGroup (the grouped
      // execution row owner), not imported directly by AssistantMessage.
      pinActiveImport("ExecutionGroup", "ExecutionGroup", "AssistantMessage must import ExecutionGroup (which owns the AgentExecutionTrace delegation) so the verb SSOT stays in the chain without an artificial direct import"),
      pinActiveImport("AgentActionStep", "AssistantMessageTrace", "AssistantMessage must import AgentActionStep from './AssistantMessageTrace' so the noun SSOT stays in the delegation chain"),
      pinActiveImport("ResearchTimeline", "AssistantMessageTrace", "AssistantMessage must import ResearchTimeline from './AssistantMessageTrace' so the deep-research surface is not duplicated in AssistantMessage.tsx"),
      legacyNameAbsent,
      pinAbsent(
        [/\.replace\s*\(\s*\/\[_-\]\+/, /\.replaceAll\s*\(\s*["']_["']/],
        "AssistantMessage must NOT define a local noun-humanization surface (no `.replace(/[_-]/g)` regex, no `.replaceAll('_', ' ')`); route through 'humanizeToolName' (ToolCallCard SSOT) via sub-components",
      ),
      pinContains("toolCalls={step.toolCalls}", "assistant messages should pass `toolCalls` as a single prop into the grouped execution row, not iterate inside the message"),
      pinAbsent("step.toolCalls.map(tool =>", "assistant messages must not iterate step.toolCalls inside the message body"),
      pinContains("function shouldShowToolGroupInTimeline", "assistant messages should expose shouldShowToolGroupInTimeline as the visibility gate"),
      pinContains('message.status === "sending"', "shouldShowToolGroupInTimeline must read live message.status as the isStreaming signal"),
      pinContains("hasAssistantAnswerText", "shouldShowToolGroupInTimeline must consider the assistant-answer presence"),
      pinContains("isStreaming && !hasAssistantAnswer", "shouldShowToolGroupInTimeline must gate visibility on the streaming + assistant-answer state"),
      pinContains('tool.status === "awaiting_approval"', "shouldShowToolGroupInTimeline must keep awaiting_approval rows visible"),
      pinContains('tool.status === "error"', "shouldShowToolGroupInTimeline must keep error rows visible"),
      pinRegexPresent(
        /if\s*\(\s*hasActionableTool\s*\)\s*return\s+true\s*;?/m,
        "shouldShowToolGroupInTimeline must early-return true for actionable tools (running/awaiting_approval/error)",
      ),
      pinRegexPresent(
        /return\s+isStreaming\s*&&\s*!hasAssistantAnswer\s*;?/m,
        "shouldShowToolGroupInTimeline must return isStreaming && !hasAssistantAnswer on the fall-through branch (reload-completion equivalence)",
      ),
      pinContains("groupedSteps.filter(", "visibleGroupedSteps must filter through shouldShowToolGroupInTimeline per step"),
      pinRegexPresent(
        /shouldShowToolGroupInTimeline\(\s*step,\s*message\.status\s*===\s*"sending",\s*hasAssistantAnswerText(?:\s*,\s*revealCompletedToolHistory)?\s*\)/,
        "the filter call site must wire `message.status === 'sending'` (and may pass the optional revealCompletedToolHistory override) so reload triggers the same hide path",
      ),
      pinContains("<ExecutionGroup", "assistant messages must render the grouped execution row via ExecutionGroup (which owns the AgentExecutionTrace delegation)"),
      pinAbsent(
        /\.toolCalls\.(map|forEach|flatMap)\(\(tool\b/,
        "AssistantMessage must not re-iterate step.toolCalls at the parent-message level (defeats the grouped execution row)",
      ),
    ],
  },

  // ── MOCKSTREAMING ─────────────────────────────────────────────────────────
  // Forward-looking guard only. The file emits raw fixture data today but is
  // the most likely future drift site if a mock-side verb surface is added.
  // The cross-cutting legacy-name pin catches re-introductions immediately.
  {
    context: "mockStreaming.ts",
    source: mockStreamingSource,
    pins: [
      legacyNameAbsent,
    ],
  },

  // ── TOOLDETAILVIEW / CONTENT EXPANSION CONTRACT ────────────────────────────
  // Expansion contract: file edits render as a diff viewer, non-file tools
  // render input-box-then-output-box, terminal tools render a command header
  // + output + exit-code chip, image generation renders from a safe asset
  // URL with the safelist gate.
  {
    context: "ToolDetailView.tsx (file edits)",
    source: detailSource,
    pins: [
      pinContains("parseUnifiedDiff", "file edits must expand into a diff viewer"),
      pinContains("DiffCard", "file edits must render via the DiffCard component"),
    ],
  },
  {
    context: "GenericContent.tsx",
    source: genericContentSource,
    pins: [
      // Raw tool input belongs behind an explicit disclosure, not a
      // top-level Panel label="Input" that leads the primary view.
      pinContains("<details", "non-file tools must hide raw input behind a native disclosure element"),
      pinContains("Technical details", "non-file tools must label the raw input disclosure 'Technical details'"),
      pinContains('label="Output"', "non-file tools must expand into an output box"),
    ],
  },
  {
    context: "TerminalContent.tsx",
    source: terminalContentSource,
    pins: [
      pinContains('label="Terminal"', "terminal tools must render a terminal header"),
      pinContains("$ ", "terminal tools must render a command-prompt glyph"),
      pinContains("exit ", "terminal tools must render an exit-code chip"),
    ],
  },
  {
    context: "ImageContent.tsx",
    source: imageContentSource,
    pins: [
      pinContains("toAssetUrl", "image generation must derive an asset URL through the safe resolver"),
      pinContains("isSafeGeneratedHref", "image generation must gate asset URLs through the safelist"),
      pinContains("<img", "image generation must render a native <img> tag"),
    ],
  },
]);

console.log("tool execution card ux ok");
