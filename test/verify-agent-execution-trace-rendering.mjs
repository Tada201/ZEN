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
const genericContentSource = readFileSync(
  new URL("../src/atlas/components/chat/tool/content/GenericContent.tsx", import.meta.url),
  "utf8",
);
const assistantMessageSource = readFileSync(
  new URL("../src/atlas/components/chat/AssistantMessage.tsx", import.meta.url),
  "utf8",
);
const assistantLogicSource = readFileSync(
  new URL("../src/atlas/components/chat/AssistantMessage.logic.ts", import.meta.url),
  "utf8",
);
const chatQueriesSource = readFileSync(
  new URL("../src/atlas/hooks/chat/useChatQueries.ts", import.meta.url),
  "utf8",
);

// The trace model still computes batch-lane data (other consumers/tests rely on
// it), but the Codex-style trace UI no longer renders lanes — it flattens to one
// quiet header + a single vertical ToolTraceRow list.
assert(
  modelSource.includes("ToolExecutionBatchLane") &&
    modelSource.includes("batchLanes") &&
    modelSource.includes("shouldShowBatchLanes"),
  "trace model should still expose explicit batch lane data for non-UI consumers",
);
assert(
  traceSource.includes("trace.shouldShowBatchLanes") &&
    !traceSource.includes('<span className="font-medium text-foreground">Agents</span>'),
  "trace UI should keep real batch lanes but remove the redundant Agents summary row",
);
assert(
  !traceSource.includes("collapsedSummary") &&
    traceSource.includes("headerLabel"),
  "collapsed trace should use a single quiet header label, not a multi-fragment summary",
);
assert(
  traceSource.includes("ToolTraceRow") &&
    traceSource.includes("ToolCallCard") &&
    traceSource.includes("normalizedToolCalls.map") &&
    !traceSource.includes("totalToolCount <= 4"),
  "the trace should render a flat ToolTraceRow list backed by ToolCallCard",
);
assert(
  modelSource.includes("agentHierarchySummary") &&
    modelSource.includes("getAgentHierarchySummary") &&
    modelSource.includes("parentId"),
  "trace model should still expose parent-to-child agent hierarchy",
);
assert(
  modelSource.includes("getToolActivitySummary") &&
    modelSource.includes("runningToolSummaries") &&
    modelSource.includes("approvalToolSummaries"),
  "trace model should still expose exact running/approval tool input previews",
);
assert(
  cardSource.includes("actionText") &&
    cardSource.includes("isExpanded") &&
    genericContentSource.includes("Input parameters") &&
    genericContentSource.includes("Raw result"),
  "collapsed tool cards should stay single-row while the renderer owns explicit detail disclosures",
);
assert(
  assistantMessageSource.includes("visibleGroupedSteps") &&
    assistantLogicSource.includes('step.kind !== "chat_status"') &&
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
