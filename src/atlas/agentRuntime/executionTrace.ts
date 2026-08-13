import type {
  ExecutionTracePhase,
  Message,
  Step,
  SubagentStepData,
  ToolCall,
} from "../components/chat/types";

/** Canonical run-level lifecycle shared by runtime, persistence, and UI. */
export type CanonicalExecutionStatus =
  | "queued"
  | "running"
  | "waiting"
  | "draining"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled";

export type ExecutionNodeKind =
  | "run"
  | "model_turn"
  | "planning"
  | "reasoning"
  | "tool"
  | "approval"
  | "subagent"
  | "artifact"
  | "response"
  | "error";

export interface NormalizedExecutionNode {
  id: string;
  traceId: string;
  runId: string;
  messageId: string;
  parentId?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  sequence: number;
  kind: string;
  phase?: string | null;
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
  summary: string;
  target?: string | null;
  resultSummary?: string | null;
  outputPreview?: string | null;
  safeDetails?: Record<string, unknown>;
  retryCount?: number | null;
}

export interface NormalizedExecutionTrace {
  traceId: string;
  chatId: string;
  messageId: string;
  traceVersion: number;
  status: string;
  startedAt?: number | null;
  completedAt?: number | null;
  updatedAt: string;
  eventCount: number;
  nodes: NormalizedExecutionNode[];
  steps?: unknown[];
}

export interface ExecutionNode {
  id: string;
  traceId: string;
  runId: string;
  messageId: string;
  parentId?: string;
  agentId?: string;
  agentName?: string;
  sequence: number;
  kind: ExecutionNodeKind;
  phase: ExecutionTracePhase;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  summary: string;
  target?: string;
  resultSummary?: string;
  /** Bounded, redacted output used by storage and diagnostic surfaces. */
  outputPreview?: string;
  safeDetails?: Record<string, unknown>;
  retryCount?: number;
}

const TERMINAL_PHASES = new Set<ExecutionTracePhase>([
  "completed",
  "interrupted",
  "errored",
  "cancelled",
]);

const TERMINAL_STATUS_HINTS = new Set([
  "completed",
  "complete",
  "success",
  "ok",
  "sent",
  "failed",
  "failure",
  "error",
  "errored",
  "timeout",
  "timed_out",
  "cancelled",
  "canceled",
  "stopped",
  "interrupted",
  "connection_lost",
]);

function lifecycleValue(phase: string | undefined, status: string | undefined): string {
  const normalizedStatus = status?.trim().toLowerCase();
  // Providers sometimes leave a stale `phase: tool_running` beside a terminal
  // status. Terminal status is the safer authority because showing a spinner
  // after failure/completion is more misleading than losing a transient phase.
  if (normalizedStatus && (TERMINAL_STATUS_HINTS.has(normalizedStatus) || normalizedStatus.includes("approval"))) {
    return normalizedStatus;
  }
  return (phase || status || "").trim().toLowerCase();
}

export function normalizeExecutionPhase(
  phase: string | undefined,
  status: string | undefined,
): ExecutionTracePhase {
  const value = lifecycleValue(phase, status);
  if (value === "accepted" || value === "queued") return "queued";
  if (value.includes("plan")) return "planning";
  if (value === "tool_call_streaming" || value === "tool_call_ready") return "tool_announced";
  if (value === "tool_executing" || value === "running" || value === "spawned") return "tool_running";
  if (value === "approval_required" || value.includes("approval")) return "waiting_for_approval";
  if (value === "agent_streaming" || value === "streaming") return "streaming";
  if (value === "draining") return "draining";
  if (value === "cancelled" || value === "canceled" || value === "stopped") return "cancelled";
  if (value === "interrupted" || value === "connection_lost") return "interrupted";
  if (value === "failed" || value === "failure" || value === "error" || value === "errored" || value === "timeout" || value === "timed_out") return "errored";
  if (value === "completed" || value === "complete" || value === "success" || value === "sent") return "completed";
  if (value.includes("escalat")) return "escalating";
  if (value.includes("input") || value.includes("clarif")) return "waiting_for_input";
  return "queued";
}

export function isTerminalExecutionPhase(phase: ExecutionTracePhase): boolean {
  return TERMINAL_PHASES.has(phase);
}

/**
 * Convert the richer trace phase into the one run-level vocabulary. Keep this
 * as the only phase/status boundary so Rust status strings and UI labels do not
 * grow another parallel mapping.
 */
export function normalizeExecutionStatus(
  phase: string | undefined,
  status: string | undefined,
): CanonicalExecutionStatus {
  switch (normalizeExecutionPhase(phase, status)) {
    case "completed": return "completed";
    case "errored": return "failed";
    case "interrupted": return "interrupted";
    case "cancelled": return "cancelled";
    case "waiting_for_approval":
    case "waiting_for_input": return "waiting";
    case "draining": return "draining";
    case "tool_running":
    case "tool_announced":
    case "streaming":
    case "planning": return "running";
    default: return "queued";
  }
}

const OUTPUT_PREVIEW_MAX = 480;

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeOutputPreview(value: unknown): string | undefined {
  const text = safeString(value);
  if (!text) return undefined;
  const redacted = text.replace(/(api[_-]?key|authorization|bearer|credential|password|secret|token)([\\s:=]+)([^\\s,}]+)/gi, "$1$2[redacted]");
  return redacted.length <= OUTPUT_PREVIEW_MAX
    ? redacted
    : `${redacted.slice(0, OUTPUT_PREVIEW_MAX - 1)}…`;
}

export function toolCallToExecutionNode(
  tool: ToolCall,
  messageId = tool.messageId || "",
  fallbackSequence = 0,
): ExecutionNode {
  const phase = normalizeExecutionPhase(tool.phase, tool.status);
  return {
    id: tool.id,
    traceId: tool.traceId || tool.runId || tool.id,
    runId: tool.runId || tool.traceId || "",
    messageId,
    parentId: tool.parentToolCallId,
    agentId: tool.agentId,
    agentName: tool.agentName,
    sequence: tool.sequence ?? fallbackSequence,
    kind: phase === "waiting_for_approval" ? "approval" : "tool",
    phase,
    startedAt: tool.startTime,
    completedAt: tool.completedAt,
    durationMs: tool.durationMs,
    summary: `${tool.name} ${phase === "errored" ? "failed" : phase === "completed" ? "completed" : "running"}`,
    target: safeString(typeof tool.input === "string" ? tool.input : tool.input?.path || tool.input?.command || tool.input?.query),
    resultSummary: safeOutputPreview(tool.outputPreview || tool.output),
    outputPreview: safeOutputPreview(tool.outputPreview || tool.output),
    safeDetails: {
      toolName: tool.name,
      executionId: tool.executionId,
      batchId: tool.batchId,
      toolBatchId: tool.toolBatchId,
    },
    retryCount: tool.retries,
  };
}

export function subagentToExecutionNode(
  subagent: SubagentStepData,
  messageId: string,
  fallbackSequence = 0,
): ExecutionNode {
  const phase = normalizeExecutionPhase(subagent.status, subagent.status);
  return {
    id: subagent.spawnId,
    traceId: subagent.spawnId,
    runId: subagent.spawnId,
    messageId,
    parentId: subagent.parentToolCallId,
    agentId: subagent.agentId,
    agentName: subagent.agentName,
    sequence: fallbackSequence,
    kind: "subagent",
    phase,
    startedAt: subagent.timestamp,
    durationMs: subagent.durationMs,
    summary: `${subagent.agentName || "Subagent"} ${phase === "errored" ? "failed" : phase === "completed" ? "completed" : "working"}`,
    resultSummary: safeString(subagent.resultSummary),
    safeDetails: {
      task: subagent.task,
      childToolCallIds: subagent.childToolCallIds,
      error: subagent.error,
    },
  };
}

export function sortExecutionNodes(nodes: ExecutionNode[]): ExecutionNode[] {
  return [...nodes].sort((left, right) =>
    left.sequence - right.sequence
    || (left.startedAt || 0) - (right.startedAt || 0)
    || left.id.localeCompare(right.id),
  );
}

function normalizedToolStatus(phase: string | null | undefined): ToolCall["status"] {
  switch (normalizeExecutionPhase(phase || undefined, phase || undefined)) {
    case "waiting_for_approval": return "awaiting_approval";
    case "completed": return "completed";
    case "errored": return "error";
    default: return "running";
  }
}

function targetInput(node: NormalizedExecutionNode): ToolCall["input"] {
  if (!node.target) return {};
  const name = String(node.safeDetails?.toolName || "").toLowerCase();
  if (name.includes("search") || name.includes("query")) return { query: node.target };
  if (name.includes("command") || name.includes("shell") || name.includes("exec")) return { command: node.target };
  if (name.includes("url") || name.includes("browse") || name.includes("fetch")) return { url: node.target };
  return { path: node.target };
}

function normalizedNodeToToolCall(node: NormalizedExecutionNode): ToolCall {
  const phase = normalizeExecutionPhase(node.phase || undefined, node.phase || undefined);
  return {
    id: node.id,
    name: String(node.safeDetails?.toolName || node.kind || "tool"),
    status: normalizedToolStatus(node.phase),
    input: targetInput(node),
    output: node.outputPreview || node.resultSummary || "",
    outputPreview: node.outputPreview || node.resultSummary || undefined,
    durationMs: node.durationMs ?? undefined,
    runId: node.runId,
    messageId: node.messageId,
    parentToolCallId: node.parentId || undefined,
    agentId: node.agentId || undefined,
    agentName: node.agentName || undefined,
    traceId: node.traceId,
    sequence: node.sequence,
    phase,
    startTime: node.startedAt ?? undefined,
    completedAt: node.completedAt ?? undefined,
    retries: node.retryCount ?? undefined,
    executionId: typeof node.safeDetails?.executionId === "string" ? node.safeDetails.executionId : undefined,
    batchId: typeof node.safeDetails?.batchId === "string" ? node.safeDetails.batchId : undefined,
    toolBatchId: typeof node.safeDetails?.toolBatchId === "string" ? node.safeDetails.toolBatchId : undefined,
  };
}

function normalizedNodeToStep(node: NormalizedExecutionNode): Step {
  const kind = node.kind.toLowerCase();
  if (kind === "tool" || kind === "tool-call" || kind === "approval") {
    return { type: "tool-call", toolCall: normalizedNodeToToolCall(node), sequence: node.sequence, phase: normalizeExecutionPhase(node.phase || undefined, node.phase || undefined) };
  }
  if (kind === "subagent") {
    return {
      type: "subagent",
      sequence: node.sequence,
      phase: normalizeExecutionPhase(node.phase || undefined, node.phase || undefined),
      status: normalizedToolStatus(node.phase) === "error" ? "error" : normalizedToolStatus(node.phase) === "completed" ? "completed" : "running",
      subagent: {
        spawnId: node.id,
        parentToolCallId: node.parentId || undefined,
        agentId: node.agentId || "",
        agentName: node.agentName || "Subagent",
        task: typeof node.safeDetails?.task === "string" ? node.safeDetails.task : node.summary,
        status: normalizedToolStatus(node.phase) === "error" ? "failed" : normalizedToolStatus(node.phase) === "completed" ? "completed" : "running",
        resultSummary: node.resultSummary || node.outputPreview || undefined,
        durationMs: node.durationMs ?? undefined,
        timestamp: node.startedAt ?? undefined,
      },
    };
  }
  if (kind === "reasoning") return { type: "reasoning", content: node.resultSummary || node.summary, sequence: node.sequence };
  if (kind === "text" || kind === "response") return { type: "text", content: node.resultSummary || node.summary, sequence: node.sequence };
  return {
    type: "action",
    kind: node.kind,
    content: node.resultSummary || node.summary,
    status: normalizedToolStatus(node.phase) === "error" ? "error" : normalizedToolStatus(node.phase) === "completed" ? "completed" : "running",
    timestamp: node.startedAt ?? undefined,
    sequence: node.sequence,
    eventId: node.id,
    metadata: { ...(node.safeDetails || {}), phase: node.phase || undefined, runId: node.runId, messageId: node.messageId } as Step["metadata"],
  };
}

/** Project normalized v2 nodes into the legacy Message shape for inline consumers. */
function isTerminalNode(node: NormalizedExecutionNode): boolean {
  return isTerminalExecutionPhase(normalizeExecutionPhase(node.phase || undefined, node.phase || undefined));
}

function mergeDuplicateNormalizedNode(existing: NormalizedExecutionNode, incoming: NormalizedExecutionNode): NormalizedExecutionNode {
  const existingTime = existing.completedAt ?? existing.startedAt;
  const incomingTime = incoming.completedAt ?? incoming.startedAt;
  const incomingIsOlder = typeof existingTime === "number" && typeof incomingTime === "number" && incomingTime < existingTime;
  const keepExistingTerminal = isTerminalNode(existing) && (!isTerminalNode(incoming) || incomingIsOlder || incomingTime === undefined);
  return {
    ...existing,
    ...incoming,
    phase: keepExistingTerminal ? existing.phase : incoming.phase,
    summary: incoming.summary || existing.summary,
    target: incoming.target || existing.target,
    resultSummary: incoming.resultSummary || existing.resultSummary,
    outputPreview: incoming.outputPreview || existing.outputPreview,
    safeDetails: { ...(existing.safeDetails || {}), ...(incoming.safeDetails || {}) },
  };
}

function sanitizeNormalizedNodes(nodes: unknown): NormalizedExecutionNode[] {
  if (!Array.isArray(nodes)) return [];
  const byId = new Map<string, NormalizedExecutionNode>();
  nodes.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const candidate = raw as Partial<NormalizedExecutionNode>;
    if (typeof candidate.id !== "string" || !candidate.id.trim()) return;
    const normalized: NormalizedExecutionNode = {
      ...candidate,
      id: candidate.id,
      traceId: typeof candidate.traceId === "string" ? candidate.traceId : "",
      runId: typeof candidate.runId === "string" ? candidate.runId : "",
      messageId: typeof candidate.messageId === "string" ? candidate.messageId : "",
      sequence: typeof candidate.sequence === "number" && Number.isFinite(candidate.sequence) ? candidate.sequence : index,
      kind: typeof candidate.kind === "string" && candidate.kind.trim() ? candidate.kind : "tool",
      summary: typeof candidate.summary === "string" ? candidate.summary : "Execution step",
    };
    const existing = byId.get(normalized.id);
    byId.set(normalized.id, existing ? mergeDuplicateNormalizedNode(existing, normalized) : normalized);
  });
  return [...byId.values()];
}

export function projectNormalizedTraceToMessage(message: Message, trace: NormalizedExecutionTrace): Message {
  const nodes = sanitizeNormalizedNodes(trace.nodes).sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
  const steps = nodes.map(normalizedNodeToStep);
  const toolCalls = steps
    .filter((step): step is Step & { type: "tool-call"; toolCall: ToolCall } => step.type === "tool-call" && Boolean(step.toolCall))
    .map((step) => step.toolCall);
  const status = normalizeExecutionStatus(trace.status, trace.status);
  return {
    ...message,
    steps,
    toolCalls,
    status: status === "failed" ? "failed" : status === "cancelled" || status === "interrupted" ? "cancelled" : status === "completed" ? "sent" : "sending",
    metadata: {
      ...(message.metadata || {}),
      traceVersion: trace.traceVersion,
      traceStatus: trace.status,
      traceId: trace.traceId,
      runId: nodes[0]?.runId || message.metadata?.runId,
      messageId: trace.messageId,
    },
  };
}
