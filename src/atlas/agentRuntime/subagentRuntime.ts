import type { Step, ToolCall, SubagentStepData } from "../components/chat/types";

export type ScopedSubagentStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "incomplete" | "uncertain" | "stale";

export interface ScopedSubagentRecord {
  spawnId: string;
  parentToolCallId?: string;
  runId?: string;
  agentId: string;
  agentName: string;
  task: string;
  status: ScopedSubagentStatus;
  resultSummary?: string;
  resultContent?: string;
  intermediateContent?: { sequence: number; text: string }[];
  error?: string;
  durationMs?: number;
  timestamp?: number;
  childToolCallIds: string[];
}

const TERMINAL_STATUSES = new Set<ScopedSubagentStatus>([
  "completed",
  "failed",
  "cancelled",
  "incomplete",
  "uncertain",
  "stale",
]);

function nonEmpty(value: string | undefined, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function normalizeScopedSubagentStatus(value: unknown, recoveryState?: unknown): ScopedSubagentStatus {
  if (recoveryState === "stale") return "stale";
  if (value === "queued" || value === "running" || value === "completed" || value === "failed" || value === "cancelled" || value === "incomplete" || value === "uncertain" || value === "stale") {
    return value;
  }
  return "uncertain";
}

function isTerminal(status: ScopedSubagentStatus) {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Merge lifecycle observations without allowing a late running/queued event to
 * reopen a terminal child. Terminal-to-terminal updates are deliberately
 * stable as well: a duplicate or out-of-order completion cannot flip a failed
 * or cancelled child into a misleading success state.
 */
export function mergeScopedSubagentRecords(
  existing: ScopedSubagentRecord | undefined,
  incoming: ScopedSubagentRecord,
): ScopedSubagentRecord {
  if (!existing) {
    return {
      ...incoming,
      spawnId: nonEmpty(incoming.spawnId),
      agentId: nonEmpty(incoming.agentId),
      agentName: nonEmpty(incoming.agentName, "agent"),
      task: nonEmpty(incoming.task),
      status: normalizeScopedSubagentStatus(incoming.status),
      childToolCallIds: [...new Set(incoming.childToolCallIds || [])],
    };
  }

  const existingStatus = normalizeScopedSubagentStatus(existing.status);
  const incomingStatus = normalizeScopedSubagentStatus(incoming.status);
  const existingTerminal = isTerminal(existingStatus);
  const incomingTerminal = isTerminal(incomingStatus);
  const recoveredStaleCanResolve = existingStatus === "stale" && incomingTerminal && incomingStatus !== "stale";
  const status = recoveredStaleCanResolve
    ? incomingStatus
    : existingTerminal
      ? existingStatus
      : incomingStatus;

  return {
    ...existing,
    ...incoming,
    spawnId: existing.spawnId || incoming.spawnId,
    parentToolCallId: existing.parentToolCallId || incoming.parentToolCallId,
    runId: existing.runId || incoming.runId,
    agentId: nonEmpty(incoming.agentId, existing.agentId),
    agentName: nonEmpty(incoming.agentName, existing.agentName || "agent"),
    task: nonEmpty(incoming.task, existing.task),
    status: (existingTerminal || incomingTerminal) && !recoveredStaleCanResolve ? status : incomingStatus,
    resultSummary: incoming.resultSummary ?? existing.resultSummary,
    resultContent: incoming.resultContent ?? existing.resultContent,
    intermediateContent: incoming.intermediateContent ?? existing.intermediateContent,
    error: incoming.error ?? existing.error,
    durationMs: incoming.durationMs ?? existing.durationMs,
    // Lifecycle timestamps represent the child start, not the latest event.
    timestamp: existing.timestamp ?? incoming.timestamp,
    childToolCallIds: [...new Set([
      ...(existing.childToolCallIds || []),
      ...(incoming.childToolCallIds || []),
    ])],
  };
}

function recordFromStep(step: Step): ScopedSubagentRecord | undefined {
  if (step.type !== "subagent" || !step.subagent?.spawnId?.trim()) return undefined;
  const subagent = step.subagent;
  return {
    spawnId: subagent.spawnId.trim(),
    parentToolCallId: subagent.parentToolCallId,
    agentId: subagent.agentId || "",
    agentName: subagent.agentName || "agent",
    task: subagent.task || "",
    status: normalizeScopedSubagentStatus(subagent.status, subagent.recoveryState),
    resultSummary: subagent.resultSummary,
    resultContent: subagent.resultContent,
    intermediateContent: subagent.intermediateContent,
    error: subagent.error,
    durationMs: subagent.durationMs,
    timestamp: subagent.timestamp,
    childToolCallIds: subagent.childToolCallIds || [],
  };
}

export function projectScopedSubagents(steps: Step[] | undefined): Map<string, ScopedSubagentRecord> {
  const records = new Map<string, ScopedSubagentRecord>();
  for (const step of steps || []) {
    const incoming = recordFromStep(step);
    if (!incoming) continue;
    records.set(incoming.spawnId, mergeScopedSubagentRecords(records.get(incoming.spawnId), incoming));
  }
  return records;
}

/**
 * Select child tools using one ownership policy everywhere. Explicit persisted
 * ids are authoritative; legacy trace-id inference is used only when ids are
 * absent; the parent-tool fallback is last and never includes the spawn tool
 * itself. This prevents nested children or sibling tools leaking into a card.
 */
export function selectOwnedChildTools(record: Pick<ScopedSubagentRecord, "spawnId" | "parentToolCallId" | "childToolCallIds">, tools: ToolCall[]): ToolCall[] {
  const explicitIds = new Set(record.childToolCallIds || []);
  if (explicitIds.size > 0) return tools.filter((tool) => explicitIds.has(tool.id));

  const traceMatches = tools.filter((tool) => tool.traceId === record.spawnId);
  if (traceMatches.length > 0) return traceMatches;

  if (!record.parentToolCallId) return [];
  return tools.filter((tool) =>
    tool.id !== record.parentToolCallId && tool.parentToolCallId === record.parentToolCallId,
  );
}

export function selectScopedChildTools(record: ScopedSubagentRecord, tools: ToolCall[]): ToolCall[] {
  return selectOwnedChildTools(record, tools);
}

export function serializeScopedSubagents(steps: Step[] | undefined): ScopedSubagentRecord[] {
  return Array.from(projectScopedSubagents(steps).values());
}

/** Convert a merged runtime record back to the UI's persisted step shape. */
export function scopedSubagentToStep(record: ScopedSubagentRecord, previous?: Step): Step {
  const previousSubagent = previous?.subagent;
  const subagent: SubagentStepData = {
    ...previousSubagent,
    spawnId: record.spawnId,
    parentToolCallId: record.parentToolCallId,
    agentId: record.agentId,
    agentName: record.agentName,
    task: record.task,
    status: record.status === "stale" || record.status === "queued" ? "running" : record.status,
    recoveryState: record.status === "stale" ? "stale" : previousSubagent?.recoveryState,
    resultSummary: record.resultSummary,
    resultContent: record.resultContent,
    intermediateContent: record.intermediateContent,
    error: record.error,
    durationMs: record.durationMs,
    timestamp: record.timestamp,
    childToolCallIds: record.childToolCallIds,
  };
  return {
    ...previous,
    type: "subagent",
    status: record.status === "failed" ? "error" : record.status === "cancelled" ? "cancelled" : record.status === "running" ? "running" : "completed",
    recoveryState: record.status === "stale" ? "stale" : previous?.recoveryState,
    subagent,
  };
}
