import type { Step, ToolCall } from "./types";
import { buildExecutionLedger, type ExecutionLedger } from "./agentExecutionLedger";
import { buildToolOutputPreview } from "./tool/toolOutputPreview";

export type AgentExecutionTraceModel = {
  active: boolean;
  completedCount: number;
  errorCount: number;
  runningCount: number;
  approvalCount: number;
  finishedCount: number;
  progressPercent: number;
  completedPercent: number;
  errorPercent: number;
  startedTogether: boolean;
  explicitBatch: boolean;
  batchSummary: string;
  resultSummary: string;
  executionLabel: string;
  ownerLabels: string[];
  ownerSummary: string;
  runningToolNames: string[];
  approvalToolNames: string[];
  runningToolSummaries: string[];
  approvalToolSummaries: string[];
  completionSummary: string;
  latestFinishedTool?: ToolCall;
  completionOrder: ToolCall[];
  batchLanes: ToolExecutionBatchLane[];
  shouldShowBatchLanes: boolean;
  activeLaneSummary: string;
  ledger: ExecutionLedger;
  agentSummary: string;
  agentHierarchySummary: string;
  handoffSummary: string;
  /** Brief label for collapsed compact mode, e.g. "read_file — src/utils.ts" */
  compactLabel: string;
  /** Deduplicated tool names in this trace */
  compactToolNames: string[];
  /** Category breakdown, e.g. "3 file reads, 2 commands" */
  compactCategoryLabel: string;
};

export type ToolExecutionBatchLane = {
  id: string;
  label: string;
  toolCalls: ToolCall[];
  toolCount: number;
  completedCount: number;
  errorCount: number;
  runningCount: number;
  approvalCount: number;
  progressPercent: number;
  completedPercent: number;
  errorPercent: number;
  ownerSummary: string;
  runningToolNames: string[];
  approvalToolNames: string[];
  runningToolSummaries: string[];
  approvalToolSummaries: string[];
  resultSummary: string;
};

function isRunningTool(toolCall: ToolCall) {
  return toolCall.status === "running" && toolCall.recoveryState !== "stale";
}

function isAwaitingApprovalTool(toolCall: ToolCall) {
  return toolCall.status === "awaiting_approval";
}

function isFinishedTool(toolCall: ToolCall) {
  return toolCall.status === "completed" || toolCall.status === "error";
}

function getToolOwnerLabel(toolCall: ToolCall) {
  return toolCall.agentName || toolCall.agentId || "main";
}

function compactText(value: unknown, maxLength = 90): string {
  if (value === undefined || value === null || value === "") return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/(api[_-]?key|authorization|bearer|credential|password|secret|token)/i.test(text)) {
    return "[redacted]";
  }
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstInputLabel(input: ToolCall["input"]) {
  const record = asRecord(input);
  const args = asRecord(record.arguments);
  return compactText(
    record.command ||
      record.cmd ||
      record.script ||
      args.query ||
      args.url ||
      record.query ||
      record.url ||
      record.path ||
      record.file ||
      record.filePath ||
      record.targetPath ||
      record.title ||
      record.name ||
      record.task
  );
}

function getDisplayToolName(toolCall: ToolCall) {
  const name = toolCall.name.toLowerCase();
  const input = asRecord(toolCall.input);
  const args = asRecord(input.arguments);
  const innerTool = String(input.tool_id || input.tool || input.name || "").toLowerCase();
  const hasSearchArgs = Boolean(input.query || args.query || input.url || args.url);
  const outputLooksLikeSearch = Boolean(toolCall.output && buildToolOutputPreview(toolCall.output).results.length > 0);

  if (
    name.includes("search") ||
    name.includes("web") ||
    innerTool.includes("search") ||
    innerTool.includes("web") ||
    (name === "tool_exec" && (hasSearchArgs || outputLooksLikeSearch))
  ) {
    return "Web search";
  }

  return toolCall.name;
}

function getToolActivitySummary(toolCall: ToolCall) {
  const label = firstInputLabel(toolCall.input);
  const name = getDisplayToolName(toolCall);
  return label ? `${name}: ${label}` : name;
}

function getStartedTogether(toolCalls: ToolCall[]) {
  if (getExplicitBatchIds(toolCalls).length > 0) return true;
  const sortedStartTimes = toolCalls
    .map((tc) => tc.startTime)
    .filter((time): time is number => typeof time === "number")
    .sort((a, b) => a - b);
  return sortedStartTimes.length > 1 && sortedStartTimes[sortedStartTimes.length - 1] - sortedStartTimes[0] < 750;
}

function getExplicitBatchIds(toolCalls: ToolCall[]) {
  const counts = new Map<string, number>();
  toolCalls.forEach((toolCall) => {
    const batchId = toolCall.toolBatchId || toolCall.batchId;
    if (batchId) counts.set(batchId, (counts.get(batchId) || 0) + 1);
  });
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([batchId]) => batchId);
}

function getCompletionOrder(toolCalls: ToolCall[]) {
  return toolCalls
    .filter((tc) => isFinishedTool(tc) && typeof tc.completedAt === "number")
    .sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));
}

function getOwnerSummary(toolCalls: ToolCall[]) {
  const counts = new Map<string, number>();
  toolCalls.forEach((toolCall) => {
    const owner = getToolOwnerLabel(toolCall);
    counts.set(owner, (counts.get(owner) || 0) + 1);
  });

  return Array.from(counts.entries())
    .slice(0, 4)
    .map(([owner, count]) => count > 1 ? `${owner} x${count}` : owner)
    .join(", ");
}

function getCompletionSummary(completionOrder: ToolCall[]) {
  return completionOrder
    .slice(-4)
    .map((toolCall) => toolCall.name)
    .join(" -> ");
}

function getResultSummary(toolCalls: ToolCall[]) {
  let files = 0;
  let linesAdded = 0;
  let linesRemoved = 0;
  let artifacts = 0;
  let results = 0;
  let commandFailures = 0;
  let commandSuccesses = 0;
  const summaries: string[] = [];
  const commandSummaries: string[] = [];

  toolCalls.forEach((toolCall) => {
    if (!toolCall.output) {
      if (toolCall.status === "error") commandFailures += 1;
      return;
    }
    const preview = buildToolOutputPreview(toolCall.output);
    files += preview.files.length;
    linesAdded += preview.files.reduce((total, file) => total + (file.linesAdded || 0), 0);
    linesRemoved += preview.files.reduce((total, file) => total + (file.linesRemoved || 0), 0);
    artifacts += preview.artifact ? 1 : 0;
    results += preview.results.length;
    if (preview.exitCode !== undefined) {
      if (preview.summary && commandSummaries.length < 2) commandSummaries.push(preview.summary);
      if (preview.exitCode === "0") commandSuccesses += 1;
      else commandFailures += 1;
    } else if (toolCall.status === "error") {
      commandFailures += 1;
    }
    if (preview.summary && summaries.length < 2) summaries.push(preview.summary);
  });

  const fileDelta = linesAdded > 0 || linesRemoved > 0 ? ` (+${linesAdded}/-${linesRemoved})` : "";
  const parts = [
    files > 0 ? `${files} file${files === 1 ? "" : "s"}${fileDelta}` : "",
    artifacts > 0 ? `${artifacts} artifact${artifacts === 1 ? "" : "s"}` : "",
    results > 0 ? `${results} result${results === 1 ? "" : "s"}` : "",
    ...commandSummaries,
    commandFailures > commandSummaries.filter((summary) => summary.toLowerCase().includes("failed")).length ? `${commandFailures} failed command${commandFailures === 1 ? "" : "s"}` : "",
    commandSuccesses > commandSummaries.filter((summary) => !summary.toLowerCase().includes("failed")).length ? `${commandSuccesses} command${commandSuccesses === 1 ? "" : "s"} ok` : "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : summaries.join(" / ");
}

function getBatchLaneLabel(batchId: string | undefined, index: number, toolCalls: ToolCall[]) {
  if (batchId) return `Batch ${batchId}`;
  if (toolCalls.length > 1) return `Parallel batch ${index + 1}`;
  return `Tool ${index + 1}`;
}

type BatchLaneInput = { key: string; batchId?: string; label: string; toolCalls: ToolCall[]; index: number };

function getBatchLanes(toolCalls: ToolCall[], startedTogether: boolean, ledger: ExecutionLedger): ToolExecutionBatchLane[] {
  const toolsById = new Map(toolCalls.map((tool) => [tool.id, tool]));
  const ledgerBatchLanes: BatchLaneInput[] = [];
  ledger.batches.forEach((batch, index) => {
    const laneTools = batch.toolIds.map((id) => toolsById.get(id)).filter((tool): tool is ToolCall => Boolean(tool));
    if (laneTools.length === 0) return;
    ledgerBatchLanes.push({
      key: batch.id,
      batchId: batch.explicit ? batch.label.replace(/^Batch /, "") : undefined,
      label: batch.label,
      toolCalls: laneTools,
      index,
    });
  });

  const lanes: BatchLaneInput[] = ledgerBatchLanes.length > 0
    ? ledgerBatchLanes
    : [{ key: startedTogether && toolCalls.length > 1 ? "parallel" : "single", batchId: undefined, label: getBatchLaneLabel(undefined, 0, toolCalls), toolCalls, index: 0 }];

  return lanes.map((lane) => {
    const completedCount = lane.toolCalls.filter((tc) => tc.status === "completed").length;
    const errorCount = lane.toolCalls.filter((tc) => tc.status === "error").length;
    const runningCount = lane.toolCalls.filter(isRunningTool).length;
    const approvalCount = lane.toolCalls.filter(isAwaitingApprovalTool).length;
    const finishedCount = completedCount + errorCount;

    return {
      id: lane.key,
      label: lane.label || getBatchLaneLabel(lane.batchId, lane.index, lane.toolCalls),
      toolCalls: lane.toolCalls,
      toolCount: lane.toolCalls.length,
      completedCount,
      errorCount,
      runningCount,
      approvalCount,
      progressPercent: lane.toolCalls.length > 0 ? Math.round((finishedCount / lane.toolCalls.length) * 100) : 0,
      completedPercent: lane.toolCalls.length > 0 ? Math.round((completedCount / lane.toolCalls.length) * 100) : 0,
      errorPercent: lane.toolCalls.length > 0 ? Math.round((errorCount / lane.toolCalls.length) * 100) : 0,
      ownerSummary: getOwnerSummary(lane.toolCalls),
      runningToolNames: lane.toolCalls.filter(isRunningTool).map(getDisplayToolName).slice(0, 3),
      approvalToolNames: lane.toolCalls.filter(isAwaitingApprovalTool).map(getDisplayToolName).slice(0, 3),
      runningToolSummaries: lane.toolCalls.filter(isRunningTool).map(getToolActivitySummary).slice(0, 3),
      approvalToolSummaries: lane.toolCalls.filter(isAwaitingApprovalTool).map(getToolActivitySummary).slice(0, 3),
      resultSummary: getResultSummary(lane.toolCalls),
    };
  });
}

function getAgentSummary(ledger: ExecutionLedger) {
  const agents = ledger.agents.filter((agent) => agent.id !== ledger.rootAgentId);
  if (agents.length === 0) return "";
  return agents
    .slice(0, 4)
    .map((agent) => {
      const parts = [agent.name, agent.toolIds.length > 0 ? `${agent.toolIds.length} tools` : "", agent.status !== "running" ? agent.status : ""].filter(Boolean);
      return parts.join(" ");
    })
    .join(", ");
}

function getAgentHierarchySummary(ledger: ExecutionLedger) {
  const agentsById = new Map(ledger.agents.map((agent) => [agent.id, agent]));
  return ledger.agents
    .filter((agent) => agent.id !== ledger.rootAgentId && agent.parentId)
    .slice(0, 4)
    .map((agent) => {
      const parent = agentsById.get(agent.parentId || "");
      return `${parent?.name || agent.parentId} -> ${agent.name}`;
    })
    .join(", ");
}

function getHandoffSummary(ledger: ExecutionLedger) {
  if (ledger.handoffs.length === 0) return "";
  return ledger.handoffs
    .slice(-3)
    .map((handoff) => `${handoff.fromAgent} -> ${handoff.toAgent}`)
    .join(", ");
}

function getActiveLaneSummary(batchLanes: ToolExecutionBatchLane[]) {
  return batchLanes
    .filter((lane) => lane.runningCount > 0 || lane.approvalCount > 0)
    .slice(0, 3)
    .map((lane) => {
      const runningTools = lane.runningToolSummaries.length > 0 ? `running ${lane.runningToolSummaries.join(", ")}` : "";
      const approvalTools = lane.approvalToolSummaries.length > 0 ? `waiting approval ${lane.approvalToolSummaries.join(", ")}` : "";
      const activeTools = [runningTools, approvalTools].filter(Boolean).join(", ");
      return `${lane.label}${activeTools ? `: ${activeTools}` : ""}`;
    })
    .join(" / ");
}

type ToolCategory = "file" | "command" | "search" | "other";

function classifyTool(name: string): ToolCategory {
  const n = name.toLowerCase();
  if (n.includes("search") || n.includes("web") || n.includes("grep") || n.includes("find")) return "search";
  if (n.includes("bash") || n.includes("shell") || n.includes("command") || n.includes("test") || n.includes("npm") || n.includes("cargo") || n.includes("terminal")) return "command";
  if (n.includes("file") || n.includes("read") || n.includes("write") || n.includes("edit") || n.includes("create") || n.includes("patch") || n.includes("list_dir")) return "file";
  return "other";
}

const CATEGORY_LABELS: Record<ToolCategory, [string, string]> = {
  file: ["file op", "file ops"],
  command: ["command", "commands"],
  search: ["search", "searches"],
  other: ["tool", "tools"],
};

function getToolCategoryCounts(toolCalls: ToolCall[]): string {
  const counts = new Map<ToolCategory, number>();
  toolCalls.forEach((tc) => {
    const cat = classifyTool(getDisplayToolName(tc));
    counts.set(cat, (counts.get(cat) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => {
      const [singular, plural] = CATEGORY_LABELS[cat];
      return `${count} ${count === 1 ? singular : plural}`;
    })
    .join(", ");
}

function getCompactLabel(
  toolCalls: ToolCall[],
  categoryLabel: string,
  runningCount: number,
  approvalCount: number,
  errorCount: number,
): string {
  if (toolCalls.length === 0) return "No tools";

  if (toolCalls.length === 1) {
    const tc = toolCalls[0];
    const name = getDisplayToolName(tc);
    const inputLabel = firstInputLabel(tc.input);
    const suffix = inputLabel ? ` — ${inputLabel}` : "";
    if (tc.status === "running") return `${name}${suffix}`;
    if (tc.status === "awaiting_approval") return `${name} — needs approval`;
    if (tc.status === "error") {
      const preview = buildToolOutputPreview(tc.output || "");
      const errMsg = preview.summary || "failed";
      return `${name} — ${errMsg}`;
    }
    // completed
    const preview = buildToolOutputPreview(tc.output || "");
    return preview.summary
      ? `${name} — ${preview.summary}`
      : `${name}${suffix}`;
  }

  // Multi-tool
  const total = toolCalls.length;
  const parts: string[] = [`${total} tools`];

  if (runningCount > 0) {
    parts.push(`${runningCount} running`);
  } else if (approvalCount > 0) {
    parts.push(`${approvalCount} awaiting approval`);
  } else if (errorCount > 0) {
    parts.push(`${errorCount} failed`);
  }

  if (categoryLabel) parts.push(categoryLabel);
  return parts.join(" — ");
}

export function buildAgentExecutionTraceModel(toolCalls: ToolCall[], steps: Step[] = []): AgentExecutionTraceModel {
  const ledger = buildExecutionLedger({ steps, toolCalls });
  const completedCount = toolCalls.filter((tc) => tc.status === "completed").length;
  const errorCount = toolCalls.filter((tc) => tc.status === "error").length;
  const runningCount = toolCalls.filter(isRunningTool).length;
  const approvalCount = toolCalls.filter(isAwaitingApprovalTool).length;
  const finishedCount = completedCount + errorCount;
  const progressPercent = toolCalls.length > 0 ? Math.round((finishedCount / toolCalls.length) * 100) : 0;
  const completedPercent = toolCalls.length > 0 ? Math.round((completedCount / toolCalls.length) * 100) : 0;
  const errorPercent = toolCalls.length > 0 ? Math.round((errorCount / toolCalls.length) * 100) : 0;
  const startedTogether = getStartedTogether(toolCalls);
  const explicitBatchIds = getExplicitBatchIds(toolCalls);
  const explicitBatch = explicitBatchIds.length > 0;
  const batchSummary = explicitBatch
    ? explicitBatchIds.slice(0, 3).map((batchId) => {
        const count = toolCalls.filter((tool) => (tool.toolBatchId || tool.batchId) === batchId).length;
        return `${batchId} x${count}`;
      }).join(", ")
    : "";
  const ownerLabels = Array.from(new Set(toolCalls.map(getToolOwnerLabel))).slice(0, 4);
  const completionOrder = getCompletionOrder(toolCalls);
  const latestFinishedTool = completionOrder[completionOrder.length - 1];
  const resultSummary = getResultSummary(toolCalls);
  const batchLanes = getBatchLanes(toolCalls, startedTogether, ledger);
  const activeLaneSummary = getActiveLaneSummary(batchLanes);
  const shouldShowBatchLanes =
    toolCalls.length > 1 &&
    (explicitBatch || startedTogether || batchLanes.some((lane) => lane.toolCount > 1));
  const compactToolNames = Array.from(new Set(toolCalls.map(getDisplayToolName))).slice(0, 6);
  const compactCategoryLabel = getToolCategoryCounts(toolCalls);
  const compactLabel = getCompactLabel(toolCalls, compactCategoryLabel, runningCount, approvalCount, errorCount);

  return {
    active: runningCount > 0 || approvalCount > 0,
    completedCount,
    errorCount,
    runningCount,
    approvalCount,
    finishedCount,
    progressPercent,
    completedPercent,
    errorPercent,
    startedTogether,
    explicitBatch,
    batchSummary,
    resultSummary,
    executionLabel: explicitBatch || startedTogether || runningCount > 1 ? "Parallel tool execution" : "Tool execution",
    ownerLabels,
    ownerSummary: getOwnerSummary(toolCalls),
    runningToolNames: toolCalls.filter(isRunningTool).map(getDisplayToolName).slice(0, 4),
    approvalToolNames: toolCalls.filter(isAwaitingApprovalTool).map(getDisplayToolName).slice(0, 4),
    runningToolSummaries: toolCalls.filter(isRunningTool).map(getToolActivitySummary).slice(0, 4),
    approvalToolSummaries: toolCalls.filter(isAwaitingApprovalTool).map(getToolActivitySummary).slice(0, 4),
    completionSummary: getCompletionSummary(completionOrder),
    latestFinishedTool,
    completionOrder,
    batchLanes,
    shouldShowBatchLanes,
    activeLaneSummary,
    ledger,
    agentSummary: getAgentSummary(ledger),
    agentHierarchySummary: getAgentHierarchySummary(ledger),
    handoffSummary: getHandoffSummary(ledger),
    compactLabel,
    compactToolNames,
    compactCategoryLabel,
  };
}
