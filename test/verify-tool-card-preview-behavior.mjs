import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const cardSource = readFileSync(
  new URL("../src/atlas/components/chat/ToolCallCard.tsx", import.meta.url),
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
assert(
  cardSource.includes("defaultExpanded ?? (status === 'awaiting_approval' || status === 'error')"),
  "approval and error tool cards should open by default",
);
assert(
  cardSource.includes("useEffect") && cardSource.includes("!userToggledRef.current && defaultExpanded"),
  "tool cards should auto-open when a live running tool later completes with previewable output",
);
assert(!cardSource.includes('role="button"'), "approval controls should use native buttons, not span role=button");
assert(cardSource.includes('<button') && cardSource.includes('type="button"'), "tool card controls should be native buttons");
assert(cardSource.includes("<details") && cardSource.includes("<summary"), "raw output should be behind a disclosure");
assert(cardSource.includes("onViewArtifact") && cardSource.includes("outputPreview.artifact"), "tool cards should expose generated artifacts from tool output");
assert(cardSource.includes("ExternalLink") && cardSource.includes("> Open"), "artifact previews should include an open action");
assert(
  agentExecutionTraceSource.includes('totalToolCount <= 4') && agentExecutionTraceSource.includes('toolCall.status === "completed"') && agentExecutionTraceSource.includes("Boolean(toolCall.output)"),
  "small completed tool batches with output should show previews without an extra click",
);
assert(
  agentExecutionTraceSource.includes("Batch started in parallel") && agentExecutionTraceSource.includes("agents {trace.ownerSummary}") && agentExecutionTraceSource.includes("active {trace.runningToolSummaries.join"),
  "parallel tool batches should expose batch mode, owners, and active tools",
);
assert(
  agentExecutionTraceSource.includes("completed {trace.completionSummary}") && agentExecutionTraceSource.includes("trace.completionOrder.length > 1"),
  "parallel tool batches should expose result completion order",
);
assert(
  agentExecutionTraceSource.includes("trace.shouldShowBatchLanes") &&
    agentExecutionTraceSource.includes("ToolBatchLane") &&
    agentExecutionTraceSource.includes("lane.runningToolSummaries.join"),
  "parallel tool batches should render grouped batch lanes with active tool previews",
);
assert(
  agentExecutionTraceSource.includes("preferCompact ? importantToolCalls : toolCalls") || agentExecutionTraceSource.includes("preferCompact ? importantToolCalls : normalizedToolCalls"),
  "chat compact mode should keep normal tool telemetry in the Active Agents panel while preserving approval/error rows",
);
assert(
  agentExecutionTraceSource.includes("preferCompact && importantToolCalls.length === 0") &&
    agentExecutionTraceSource.includes("normalizedToolCalls.map"),
  "chat compact mode should summarize normal tool telemetry while preserving approval/error rows",
);
assert(traceSource.includes("getActionChips"), "action rows should expose important agent/approval metadata inline");
assert(traceSource.includes("spawn.parentAgent") && traceSource.includes("spawn.childAgent"), "subagent rows should show parent-to-child delegation");
assert(traceSource.includes("risk_level") && traceSource.includes("arguments_preview"), "approval rows should show risk and argument preview metadata");
assert(
  traceSource.includes("redactTracePreview") &&
    traceSource.includes("redactTracePreview(preview?.argumentsPreview") &&
    traceSource.includes("redactTracePreview(context?.arguments_preview || approval.arguments"),
  "trace approval and tool-call previews should be defensively redacted before display",
);
assert(traceSource.includes("AssistantTaskPlanPreview"), "action rows should render planned task details inline");
assert(taskPlanSource.includes("Planned tasks") && taskPlanSource.includes("Battle plan"), "task planning events should expose readable task and plan previews");
assert(taskPlanSource.includes("preview.tasks.map") && taskPlanSource.includes("preview.battlePlanSteps.map"), "task plan previews should render bounded model output");
assert(taskPlanSource.includes("Task result") && taskPlanSource.includes("preview.taskResult.text"), "task completion rows should expose result output inline");
assert(
  cardSource.includes("parentAgentId") &&
    cardSource.includes("childAgentLabel") &&
    cardSource.includes("`${parentAgentId} -> ${childAgentLabel}`") &&
    cardSource.includes("iter {iteration}"),
  "tool cards should show parent-to-child agent ownership and iteration for each tool",
);
assert(cardSource.includes("approvalContext") && cardSource.includes("Approval context"), "approval tool cards should show approval context details");
assert(cardSource.includes("riskLevel") && cardSource.includes("argumentsPreview") && cardSource.includes("suggestedPatterns"), "approval tool cards should show risk, argument preview, and suggested patterns");
assert(
  cardSource.includes("redactPreviewDetail") &&
    cardSource.includes("approvalArgumentsPreview") &&
    !cardSource.includes("{approvalContext.argumentsPreview}"),
  "approval argument previews should be defensively redacted before display",
);
assert(cardSource.includes("buildToolChecklistPreview") && cardSource.includes("checklistPreview.map"), "checklist tools should render todo items instead of only raw JSON");
assert(cardSource.includes("file.diff") && cardSource.includes("slice(0, 1200)"), "file previews should render bounded diff snippets when available");

console.log("tool card preview behavior ok");
