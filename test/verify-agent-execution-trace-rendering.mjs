import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const traceSource = readFileSync(
  new URL("../src/atlas/components/chat/AgentExecutionTrace.tsx", import.meta.url),
  "utf8",
);
const modelSource = readFileSync(
  new URL("../src/atlas/components/chat/agentExecutionTraceModel.ts", import.meta.url),
  "utf8",
);
const cardSource = readFileSync(
  new URL("../src/atlas/components/chat/ToolCallCard.tsx", import.meta.url),
  "utf8",
);
const assistantMessageSource = readFileSync(
  new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url),
  "utf8",
);
const chatQueriesSource = readFileSync(
  new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url),
  "utf8",
);

assert(
  modelSource.includes("ToolExecutionBatchLane") &&
    modelSource.includes("batchLanes") &&
    modelSource.includes("shouldShowBatchLanes"),
  "trace model should expose explicit batch lane data",
);
assert(
  traceSource.includes("trace.shouldShowBatchLanes") &&
    traceSource.includes("trace.batchLanes.map") &&
    traceSource.includes("function ToolBatchLane"),
  "trace UI should render grouped batch lanes",
);
assert(
    traceSource.includes("lane.ownerSummary") &&
    traceSource.includes("lane.runningToolSummaries.join") &&
    traceSource.includes("lane.resultSummary") &&
    traceSource.includes("lane.approvalCount") &&
    traceSource.includes("lane.approvalToolSummaries.join"),
  "batch lanes should expose owners, active tool input previews, approval-needed tool input previews, and result summaries",
);
assert(
  traceSource.includes("trace.approvalCount") &&
    traceSource.includes("trace.approvalToolSummaries.join") &&
    traceSource.includes("{lane.approvalCount} waiting approval"),
  "execution traces should separate approval-needed tool previews from actively running tools",
);
assert(
  traceSource.includes("collapsedSummary") &&
    traceSource.includes("!isExpanded && collapsedSummary") &&
    traceSource.includes('trace.runningToolSummaries.join(", ")') &&
    traceSource.includes("trace.resultSummary") &&
    traceSource.includes("trace.activeLaneSummary") &&
    traceSource.includes("trace.agentHierarchySummary") &&
    traceSource.includes("trace.ownerSummary"),
  "collapsed execution traces should preserve active batches, active tools, results, delegation hierarchy, and owners",
);
assert(
  modelSource.includes("agentHierarchySummary") &&
    modelSource.includes("getAgentHierarchySummary") &&
    modelSource.includes("parentId") &&
    traceSource.includes("delegation {trace.agentHierarchySummary}"),
  "execution traces should expose parent-to-child agent hierarchy",
);
assert(
  modelSource.includes("getToolActivitySummary") &&
    modelSource.includes("runningToolSummaries") &&
    modelSource.includes("approvalToolSummaries"),
  "trace model should expose exact running/approval tool input previews for collapsed Codebuff-like scanning",
);
assert(
  traceSource.includes("ToolTraceRow") &&
    traceSource.includes("ToolCallCard") &&
    traceSource.includes("preferCompact ? importantToolCalls : normalizedToolCalls") &&
    !traceSource.includes("totalToolCount <= 4"),
  "batch lanes should keep tool cards available without auto-expanding completed details",
);
assert(
  cardSource.includes("actionText") &&
    cardSource.includes("!isExpanded") &&
    !cardSource.includes("!isExpanded && compactPreview"),
  "collapsed tool cards should stay single-row and reveal details only when expanded",
);
assert(
  assistantMessageSource.includes("visibleGroupedSteps") &&
    assistantMessageSource.includes('step.kind !== "chat_status"') &&
    !assistantMessageSource.includes("ExecutionSummaryBar") &&
    !assistantMessageSource.includes("summarizeExecutionSteps"),
  "assistant messages should suppress low-value request pipeline cards and raw chat_status rows",
);
assert(
  !chatQueriesSource.includes(".sort(compareTimelineMessages)") &&
    !chatQueriesSource.includes("function compareTimelineMessages"),
  "persisted messages should preserve backend row order instead of re-sorting equal-second timestamps on reload",
);
assert(
  !traceSource.includes("TerminalWidget") &&
    !traceSource.includes("SearchResults") &&
    !traceSource.includes("ArtifactPreview") &&
    !cardSource.includes("TerminalWidget") &&
    !cardSource.includes("SearchResults") &&
    !cardSource.includes("ArtifactPreview"),
  "execution UI should not depend on legacy preview components",
);

console.log("agent execution trace rendering verifier passed");
