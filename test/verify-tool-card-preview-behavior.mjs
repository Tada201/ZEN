import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const cardSource = readFileSync(
  new URL("../src/atlas/components/chat/ToolCallCard.tsx", import.meta.url),
  "utf8",
);
// Technical/raw output disclosure moved out of ToolCallCard into the detail
// content subcomponents after the FoldOutCard refactor.
const genericContentSource = readFileSync(
  new URL("../src/atlas/components/chat/tool/content/GenericContent.tsx", import.meta.url),
  "utf8",
);
const errorFallbackSource = readFileSync(
  new URL("../src/atlas/components/chat/tool/ToolErrorFallback.tsx", import.meta.url),
  "utf8",
);
const traceSource = readFileSync(
  new URL("../src/atlas/components/chat/AssistantMessageTrace.tsx", import.meta.url),
  "utf8",
);
const agentExecutionTraceSource = readFileSync(
  new URL("../src/atlas/components/chat/AgentExecutionTrace.tsx", import.meta.url),
  "utf8",
);
const taskPlanSource = readFileSync(
  new URL("../src/atlas/components/chat/AssistantTaskPlanPreview.tsx", import.meta.url),
  "utf8",
);

assert(cardSource.includes("defaultExpanded?: boolean"), "ToolCallCard should expose a defaultExpanded prop");
assert(cardSource.includes("defaultExpanded ?? hasAction"), "approval and error tool cards should open by default");
assert(
  cardSource.includes("useEffect") && cardSource.includes("!userToggledRef.current") && cardSource.includes("hasAction"),
  "tool cards should auto-open only for approval/error states unless the user toggled them",
);
assert(!cardSource.includes('role="button"'), "approval controls should use native buttons, not span role=button");
assert(cardSource.includes('<button') && cardSource.includes('type="button"'), "tool card controls should be native buttons");
assert(
  (genericContentSource.includes("<details") || errorFallbackSource.includes("<details")) &&
    (genericContentSource.includes("Technical details") || errorFallbackSource.includes("Technical details")),
  "technical output should be behind a disclosure",
);
assert(cardSource.includes("onViewArtifact") && cardSource.includes("outputPreview"), "tool cards should forward generated artifacts from tool output");
const detailViewSource = readFileSync(
  new URL("../src/atlas/components/chat/tool/ToolDetailView.tsx", import.meta.url),
  "utf8",
);
assert(
  detailViewSource.includes("onViewArtifact") && detailViewSource.includes("Open {outputPreview.artifact.title}"),
  "artifact previews should include an open action in the expanded detail view",
);
// Codex-style trace: a quiet header + a single flat list of tool rows. Parallel
// progress is conveyed by the header running/failed counts. Execution lanes were
// reintroduced by the delegation design (see verify-subagent-batch-contract),
// but they render as a bounded grid separate from the flat tool list, and the
// noisy multi-fragment collapsed summary stays removed.
assert(
  !agentExecutionTraceSource.includes("collapsedSummary") &&
    !agentExecutionTraceSource.includes("Batch started in parallel"),
  "the noisy collapsed summary and parallel-metadata chip row must be removed",
);
assert(
  !agentExecutionTraceSource.includes("trace.batchLanes.map") ||
    agentExecutionTraceSource.includes("trace.batchLanes.slice(0,"),
  "execution lanes must be bounded (sliced) rather than exhaustively mapped",
);
assert(
  agentExecutionTraceSource.includes("headerLabel") &&
    agentExecutionTraceSource.includes("singleToolActionLine") &&
    agentExecutionTraceSource.includes("${normalizedToolCalls.length} tools"),
  "the collapsed header should read as one action line or 'Ran/Running N tools'",
);
assert(
  agentExecutionTraceSource.includes("normalizedToolCalls.map") &&
    agentExecutionTraceSource.includes("ToolTraceRow"),
  "the expanded trace should render a flat ToolTraceRow list over all tools",
);
assert(traceSource.includes("getActionChips"), "action rows should expose important agent/approval metadata inline");
assert(traceSource.includes("spawn.parentAgent") && traceSource.includes("spawn.childAgent"), "subagent rows should show parent-to-child delegation");
assert(traceSource.includes("risk_level") && traceSource.includes("arguments_preview"), "approval rows should keep risk and redacted argument handling available");
assert(
  traceSource.includes("redactTracePreview") &&
    !traceSource.includes("serializeActionDetails"),
  "trace approval and error previews should be defensively redacted without exposing event JSON",
);
assert(traceSource.includes("AssistantTaskPlanPreview"), "action rows should render planned task details inline");
assert(taskPlanSource.includes("Task plan") && taskPlanSource.includes("Plan steps"), "task planning events should expose readable task and plan previews");
assert(taskPlanSource.includes("preview.tasks.map") && taskPlanSource.includes("preview.battlePlanSteps.map"), "task plan previews should render bounded model output");
assert(taskPlanSource.includes("Task result") && taskPlanSource.includes("preview.taskResult.text"), "task completion rows should expose result output inline");
// Orchestration ownership/iteration chips are intentionally dropped from the
// card in the Codex-style redesign; they were pure noise in the timeline.
assert(
  !cardSource.includes("`${parentAgentId} -> ${agentLabel}`") &&
    !cardSource.includes("iter {iteration}"),
  "parent-to-child ownership and iteration chips must be removed from tool cards",
);
assert(cardSource.includes("approvalContext") && cardSource.includes("Approval context"), "approval tool cards should show approval context details");
assert(cardSource.includes("riskLevel") && !cardSource.includes("{approvalContext.argumentsPreview}"), "approval argument previews should not be dumped directly");

// A file edit's unified diff is a legitimate on-expand disclosure (RULES.md §Chat
// Timeline Rendering allows payloads behind an explicit expansion). It renders in
// ToolDetailView via parseUnifiedDiff + DiffCard, never on the collapsed line.
const detailSource = readFileSync(
  new URL("../src/atlas/components/chat/tool/ToolDetailView.tsx", import.meta.url),
  "utf8",
);
assert(
  detailSource.includes("parseUnifiedDiff") && detailSource.includes("DiffCard"),
  "file diffs should render in the expanded detail view via the diff parser + DiffCard",
);
assert(
  detailSource.includes("defaultOpen={outputPreview.files.length === 1}"),
  "single-file edits should reveal the diff when the tool detail is opened",
);
assert(
  !cardSource.includes("file.diff"),
  "the collapsed tool card must not render raw diff snippets inline",
);

console.log("tool card preview behavior ok");
