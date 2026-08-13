import type { Message, Step, ToolCall } from "../components/chat/types";
import {
  normalizeExecutionPhase,
  subagentToExecutionNode,
  toolCallToExecutionNode,
  type ExecutionNode,
} from "./executionTrace";
import { redactToolText } from "../components/chat/tool/toolTextRedaction";
import { buildToolOutputPreview } from "../components/chat/tool/toolOutputPreview";

export type InspectorStatusFilter = "all" | "active" | "completed" | "attention";
export type InspectorApprovalFilter = "all" | "required";
export type InspectorFilterState = {
  status: InspectorStatusFilter;
  phase: string;
  agent: string;
  tool: string;
  approval: InspectorApprovalFilter;
};

/** Keep diagnostics responsive even when a provider emits an unbounded trace. */
export const MAX_INSPECTOR_RENDER_NODES = 240;
export const MAX_INSPECTOR_EXPORT_NODES = 1000;

export type RunInspectorNode = ExecutionNode & {
  depth: number;
  statusLabel: string;
  hasChildren: boolean;
};

export type RunInspectorModel = {
  traceVersion: number;
  messageId: string;
  traceId: string;
  runId: string;
  status: string;
  statusLabel: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  nodes: RunInspectorNode[];
  rootNodes: RunInspectorNode[];
  agents: string[];
  toolCount: number;
  completedToolCount: number;
  failedToolCount: number;
  activeToolCount: number;
  approvalCount: number;
  filesChanged: number;
  resultSummary: string;
  phases: string[];
  tools: string[];
};

function statusLabel(phase: string) {
  switch (phase) {
    case "tool_running": return "Running";
    case "waiting_for_approval": return "Needs approval";
    case "errored": return "Failed";
    case "cancelled": return "Cancelled";
    case "interrupted": return "Interrupted";
    case "completed": return "Complete";
    case "streaming": return "Streaming";
    case "planning": return "Planning";
    default: return "Queued";
  }
}

function safeSummary(value: unknown, maxLength = 240) {
  let text = "";
  if (typeof value === "string") {
    text = value;
  } else if (value != null) {
    try {
      text = JSON.stringify(value);
    } catch {
      text = "[unavailable diagnostic]";
    }
  }
  return redactToolText(text)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function nodeFromTool(tool: ToolCall, messageId: string, sequence: number): ExecutionNode {
  const node = toolCallToExecutionNode(tool, messageId, sequence);
  const previewSource = tool.output || tool.outputPreview || "";
  const preview = buildToolOutputPreview(previewSource);
  return {
    ...node,
    summary: `${tool.name} · ${statusLabel(node.phase)}`,
    resultSummary: safeSummary(preview.summary || tool.outputPreview || tool.output),
    outputPreview: safeSummary(tool.outputPreview || preview.summary || tool.output, 480),
    safeDetails: {
      toolName: tool.name,
      executionId: tool.executionId,
      batchId: tool.batchId || tool.toolBatchId,
      exitCode: preview.exitCode,
      fileCount: preview.files.length,
      resultCount: preview.results.length,
      hasArtifact: Boolean(preview.artifact),
    },
  };
}

function nodeFromStep(step: Step, messageId: string, sequence: number): ExecutionNode | undefined {
  if (step.type !== "subagent" || !step.subagent) return undefined;
  const node = subagentToExecutionNode(step.subagent, messageId, step.sequence ?? sequence);
  return {
    ...node,
    summary: `${step.subagent.agentName || "Subagent"} · ${statusLabel(node.phase)}`,
    resultSummary: safeSummary(step.subagent.resultSummary || step.subagent.error),
    safeDetails: {
      agentName: step.subagent.agentName,
      task: safeSummary(step.subagent.task, 500),
      childToolCallIds: step.subagent.childToolCallIds || [],
      error: safeSummary(step.subagent.error),
    },
  };
}

function getDepth(nodeId: string, byId: Map<string, ExecutionNode>, visiting = new Set<string>()): number {
  const node = byId.get(nodeId);
  if (!node?.parentId || !byId.has(node.parentId) || visiting.has(nodeId)) return 0;
  return Math.min(12, getDepth(node.parentId, byId, new Set(visiting).add(nodeId)) + 1);
}

function breakNodeParentCycles(nodes: ExecutionNode[]): ExecutionNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentById = new Map(nodes.filter((node) => node.parentId && byId.has(node.parentId)).map((node) => [node.id, node.parentId!]));
  for (const start of [...parentById.keys()].sort()) {
    const path: string[] = [];
    const seen = new Map<string, number>();
    let current: string | undefined = start;
    while (current) {
      const prior = seen.get(current);
      if (prior !== undefined) {
        const cycle = path.slice(prior).sort();
        if (cycle.length > 0) parentById.delete(cycle[cycle.length - 1]);
        break;
      }
      seen.set(current, path.length);
      path.push(current);
      current = parentById.get(current);
    }
  }
  return nodes.map((node) => ({ ...node, parentId: parentById.get(node.id) }));
}

function classifyNode(node: RunInspectorNode): InspectorStatusFilter {
  if (node.phase === "tool_running" || node.phase === "streaming" || node.phase === "planning") return "active";
  if (node.phase === "errored" || node.phase === "waiting_for_approval" || node.phase === "interrupted") return "attention";
  if (node.phase === "completed" || node.phase === "cancelled") return "completed";
  return "active";
}

function nodeToolName(node: RunInspectorNode): string {
  return typeof node.safeDetails?.toolName === "string" ? node.safeDetails.toolName : node.kind;
}

function isApprovalNode(node: RunInspectorNode): boolean {
  return node.kind === "approval" || node.phase === "waiting_for_approval";
}

export function orderInspectorTreeNodes(nodes: RunInspectorNode[]): RunInspectorNode[] {
  const byParent = new Map<string | undefined, RunInspectorNode[]>();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const parent = node.parentId && byId.has(node.parentId) ? node.parentId : undefined;
    const siblings = byParent.get(parent) || [];
    siblings.push(parent ? node : { ...node, depth: 0 });
    byParent.set(parent, siblings);
  }
  const sortNodes = (items: RunInspectorNode[]) => items.sort((left, right) => left.sequence - right.sequence || (left.startedAt || 0) - (right.startedAt || 0) || left.id.localeCompare(right.id));
  const ordered: RunInspectorNode[] = [];
  const visited = new Set<string>();
  const visit = (items: RunInspectorNode[]) => {
    for (const node of sortNodes(items)) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      ordered.push(node);
      visit(byParent.get(node.id) || []);
    }
  };
  visit(byParent.get(undefined) || []);
  // Defensive inclusion for malformed input whose parent was filtered out or
  // whose cycle was not recoverable by the model projection.
  for (const node of sortNodes([...nodes])) {
    if (!ordered.some((candidate) => candidate.id === node.id)) ordered.push({ ...node, depth: 0 });
  }
  return ordered;
}

function safeDetailsSearch(value: Record<string, unknown> | undefined): string {
  if (!value) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "[unavailable diagnostic]";
  }
}

export function filterInspectorNodes(
  nodes: RunInspectorNode[],
  query: string,
  filter: InspectorStatusFilter,
  options: Partial<Omit<InspectorFilterState, "status">> = {},
) {
  const normalizedQuery = query.trim().toLowerCase();
  return nodes.filter((node) => {
    if (filter !== "all" && classifyNode(node) !== filter) return false;
    if (options.phase && options.phase !== "all" && node.phase !== options.phase) return false;
    if (options.agent && options.agent !== "all" && (node.agentName || "main") !== options.agent) return false;
    if (options.tool && options.tool !== "all" && nodeToolName(node) !== options.tool) return false;
    if (options.approval === "required" && !isApprovalNode(node)) return false;
    if (!normalizedQuery) return true;
    return [
      node.summary,
      node.target,
      node.resultSummary,
      node.agentName,
      nodeToolName(node),
      safeDetailsSearch(node.safeDetails),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export function buildRunInspectorModel(message: Message): RunInspectorModel {
  const steps = Array.isArray(message.steps) ? message.steps : [];
  const toolsById = new Map<string, ToolCall>();
  const messageTools = Array.isArray(message.toolCalls) ? message.toolCalls : [];
  for (const tool of messageTools) {
    if (typeof tool?.id === "string" && tool.id.trim() && !toolsById.has(tool.id)) toolsById.set(tool.id, tool);
  }
  for (const step of steps) {
    if (step.type === "tool-call" && step.toolCall?.id && !toolsById.has(step.toolCall.id)) {
      toolsById.set(step.toolCall.id, step.toolCall);
    }
  }

  const nodes: ExecutionNode[] = [];
  let fallbackSequence = 0;
  for (const tool of toolsById.values()) {
    nodes.push(nodeFromTool(tool, message.id, tool.sequence ?? fallbackSequence));
    fallbackSequence += 1;
  }
  for (const step of steps) {
    const node = nodeFromStep(step, message.id, fallbackSequence);
    if (node && !nodes.some((existing) => existing.id === node.id)) {
      nodes.push(node);
      fallbackSequence += 1;
    }
  }

  const safeNodes = breakNodeParentCycles(nodes.filter((node) => Boolean(node.id)));
  const byId = new Map(safeNodes.map((node) => [node.id, node]));
  const childIds = new Set<string>();
  const inspectorNodes = safeNodes
    .map((node) => {
      if (node.parentId && byId.has(node.parentId)) childIds.add(node.id);
      return {
        ...node,
        depth: getDepth(node.id, byId),
        statusLabel: statusLabel(node.phase),
        hasChildren: false,
      };
    })
    .sort((left, right) => left.sequence - right.sequence || (left.startedAt || 0) - (right.startedAt || 0) || left.id.localeCompare(right.id));
  const childIdSet = new Set(childIds);
  const nodesWithChildren = inspectorNodes.map((node) => ({
    ...node,
    hasChildren: inspectorNodes.some((candidate) => candidate.parentId === node.id),
  }));

  const runStatus = message.status === "sending" ? "streaming" : message.status || "completed";
  const runPhase = normalizeExecutionPhase(runStatus, runStatus);
  const firstStart = nodesWithChildren.map((node) => node.startedAt).find((value): value is number => typeof value === "number") ?? message.createdAt;
  const lastEnd = nodesWithChildren
    .map((node) => node.completedAt)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => b - a)[0] ?? (message.status === "sending" ? undefined : message.createdAt);
  const agents = [...new Set(nodesWithChildren.map((node) => node.agentName).filter((value): value is string => Boolean(value)))];
  const toolNodes = nodesWithChildren.filter((node) => node.kind === "tool");
  const filesChanged = toolNodes.reduce((total, node) => total + Number(node.safeDetails?.fileCount || 0), 0);
  const resultSummary = [
    toolNodes.length ? `${toolNodes.length} tools` : "",
    filesChanged ? `${filesChanged} files changed` : "",
    toolNodes.filter((node) => node.phase === "errored").length ? `${toolNodes.filter((node) => node.phase === "errored").length} failed` : "",
  ].filter(Boolean).join(" · ");

  return {
    traceVersion: typeof message.metadata?.traceVersion === "number" && Number.isFinite(message.metadata.traceVersion)
      ? message.metadata.traceVersion
      : 1,
    messageId: message.id,
    traceId: nodesWithChildren[0]?.traceId || message.id,
    runId: nodesWithChildren[0]?.runId || message.id,
    status: runPhase,
    statusLabel: statusLabel(runPhase),
    startedAt: firstStart,
    completedAt: lastEnd,
    durationMs: firstStart !== undefined && lastEnd !== undefined ? Math.max(0, lastEnd - firstStart) : undefined,
    nodes: nodesWithChildren,
    rootNodes: nodesWithChildren.filter((node) => !node.parentId || !childIdSet.has(node.id)),
    agents,
    toolCount: toolNodes.length,
    completedToolCount: toolNodes.filter((node) => node.phase === "completed").length,
    failedToolCount: toolNodes.filter((node) => node.phase === "errored").length,
    activeToolCount: toolNodes.filter((node) => node.phase === "tool_running").length,
    approvalCount: toolNodes.filter((node) => node.phase === "waiting_for_approval").length,
    filesChanged,
    resultSummary,
    phases: [...new Set(nodesWithChildren.map((node) => node.phase))].sort(),
    tools: [...new Set(toolNodes.map(nodeToolName))].sort(),
  };
}
