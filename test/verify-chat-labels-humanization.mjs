import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

// Rule 4 — Chat labels MUST use product language, not implementation names.
// Per RULES.md: "Prefer 'Reading files', 'Running tests', 'Approval needed',
// or 'Delegated to reviewer' over raw tool ids, event kinds, or JSON keys."
// Per docs/architecture/frontend-rules.md (Chat Timeline Rules #8): labels
// are product-facing; the implementation name must never reach the user.
//
// The contract flows through three load-bearing abstractions:
//   1. ToolCallCard derives every visible tool label through
//      humanizeToolName(...).
//   2. AssistantMessageTrace derives every visible action label through
//      getActionPresentation(step), with snake_case/underscore kinds
//      replaced by spaces before display.
//   3. AgentDelegationLane renders "Delegated to {agentName}" plus the
//      lane's resultSummary as the user-facing row.

const toolCallCardSource = readFileSync(
  new URL("../src/atlas/components/chat/ToolCallCard.tsx", import.meta.url),
  "utf8",
);
const assistantMessageTraceSource = readFileSync(
  new URL("../src/atlas/components/chat/AssistantMessageTrace.tsx", import.meta.url),
  "utf8",
);
const delegationLaneSource = readFileSync(
  new URL("../src/atlas/components/chat/AgentDelegationLane.tsx", import.meta.url),
  "utf8",
);

// ── 4a. Central tool-name humanizer ──
// ToolCallCard must provide a central humanizeToolName helper that every
// visible label flows through. The reference implementation has the helper
// at the top of the file and uses it from getToolActionVerb /
// buildToolOutputPreview.
assert(
  /function\s+humanizeToolName|const\s+humanizeToolName\s*=/.test(toolCallCardSource),
  "ToolCallCard must define a central humanizeToolName helper for tool-id-to-verb mapping",
);
// The user-facing verb set. The exact strings must be reachable from
// humanizeToolName / getToolActionVerb. We accept either double- or
// single-quoted literals.
for (const verb of ["Reading", "Writing", "Searching", "Running"]) {
  assert(
    toolCallCardSource.includes(`"${verb}"`) || toolCallCardSource.includes(`'${verb}'`),
    `ToolCallCard must surface the user-facing verb "${verb}" so raw tool ids never appear in chat labels`,
  );
}

// ── 4b. Central action-presentation abstraction ──
// AssistantMessageTrace must derive every visible action label through
// getActionPresentation(step). Without this centralization we cannot trust
// that a future event kind will be remapped to product language before
// hitting the chat timeline.
assert(
  /function\s+getActionPresentation|const\s+getActionPresentation\s*=/.test(assistantMessageTraceSource),
  "AssistantMessageTrace must centralize visible-label derivation in getActionPresentation(step)",
);

// ── 4c. Concrete product-language output strings ──
// getActionPresentation must produce these exact labels for the
// well-known event kinds. Each label is what the user will see in the
// chat ledger — anything else is a leak of an implementation name.
const productLanguageLabels = [
  { substr: "Spawned ",          msg: "agent_spawn must render as 'Spawned {childAgent}'" },
  { substr: "Approval required", msg: "approval_request must render as 'Approval required: {tool}'" },
  { substr: "Clarification needed", msg: "clarification_request must render as 'Clarification needed'" },
  { substr: "handed off to",     msg: "agent_handoff must render as '{from} handed off to {to}'" },
  { substr: "Task created",      msg: "task_created must render as 'Task created', not a snake_case raw kind" },
  { substr: "Task started",      msg: "task_started must render as 'Task started'" },
  { substr: "Task completed",    msg: "task_completed must render as 'Task completed'" },
];
for (const check of productLanguageLabels) {
  assert(
    assistantMessageTraceSource.includes(check.substr),
    `AssistantMessageTrace ${check.msg}`,
  );
}

// ── 4d. Snake-case removal before display ──
// Raw event kinds arrive snake_case (workflow_started, orchestrator_progress,
// task_list_updated). getActionPresentation must strip underscores before
// returning a user-visible label so a leaked kind can never render as
// `workflow_started` in the chat.
assert(
  assistantMessageTraceSource.includes('.replace(/_/g, " ")') ||
    assistantMessageTraceSource.includes(".replace(/_/g, ' ')") ||
    assistantMessageTraceSource.includes('.replace(/[_-]+/g, " ")') ||
    assistantMessageTraceSource.includes(".replace(/[_-]+/g, ' ')"),
  "AssistantMessageTrace.getActionPresentation must replace underscores (and ideally hyphens) with spaces before returning a user-visible label",
);

// ── 4e. Subagent row label ──
// AgentDelegationLane renders the subagent row that DOES appear in the
// parent chat timeline. It must read the agent name through product
// language, not raw spawn ids.
assert(
  delegationLaneSource.includes("Delegated to") &&
    delegationLaneSource.includes("{lane.agentName}"),
  "AgentDelegationLane must render 'Delegated to {agentName}' — never raw spawn_id or child_agent_id",
);

// ── 4f. Result summary first, transcript optional ──
// The lane exposes lane.resultSummary up-front and only escalates to
// transcript content after the user expands the row, never by default.
assert(
  delegationLaneSource.includes("lane.resultSummary"),
  "AgentDelegationLane must surface the lane.resultSummary as the default (collapsed) text so the user sees a summary, not the full transcript",
);

console.log("chat label humanization verifier passed");
