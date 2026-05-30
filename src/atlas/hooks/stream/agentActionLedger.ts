import type { AgentActionEventPayload } from "@/api/events";
import type { ActionMeta, Message, MessageKind, Step } from "../../components/chat/types";
import { findWritableAssistantIndex } from "./messageTarget";

function getNestedValue(obj: Record<string, unknown> | undefined, path: string[]): string | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
    if (cur === undefined || cur === null) return undefined;
  }
  return typeof cur === "string" && cur.trim() ? cur : undefined;
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

export function getActionEventId(payload: AgentActionEventPayload, kind: string): string {
  const metadata = payload.metadata || {};
  const toolName =
    metadata.toolCall?.toolName ||
    metadata.tool_call?.tool_name ||
    metadata.toolResult?.toolName ||
    metadata.tool_result?.tool_name ||
    payload.tool_name;

  const toolCallId =
    payload.tool_call_id ||
    metadata.toolCall?.toolCallId ||
    metadata.toolCall?.tool_call_id ||
    metadata.tool_call?.tool_call_id ||
    metadata.toolResult?.toolCallId ||
    metadata.toolResult?.tool_call_id ||
    metadata.tool_result?.tool_call_id;

  if ((kind === "tool_call" || kind === "tool_result") && toolName) {
    if (toolCallId) {
      return `tool:${toolCallId}`;
    }
    return `tool:${payload.iteration ?? metadata.iteration ?? "unknown"}:${toolName}`;
  }
  if (kind === "orchestrator_progress") {
    return `orchestrator:${payload.run_id || payload.chat_id || payload.chatId || "active"}`;
  }
  if (kind === "chat_status" && (payload.phase || payload.metadata?.phase)) {
    return `status:${payload.chat_id || payload.chatId || "active"}:${payload.phase || payload.metadata?.phase}`;
  }
  if (kind.startsWith("workflow_")) {
    return `workflow:${payload.workflow_id || payload.id || payload.chat_id || payload.chatId || "active"}`;
  }
  if (kind.startsWith("task_")) {
    const taskId = payload.task_id || payload.taskId || payload.id;
    if (taskId) return `task:${taskId}`;
  }
  if (kind === "task_list_updated") {
    return `task-list:${payload.chat_id || payload.chatId || "active"}`;
  }
  if (kind === "task_complexity_analyzed") {
    return `task-complexity:${payload.chat_id || payload.chatId || "active"}`;
  }
  if (kind === "agent_spawn" || kind === "agent_complete") {
    const spawnId =
      payload.spawn_id ||
      getNestedValue(metadata, ["spawn", "spawnId"]) ||
      getNestedValue(metadata, ["spawn", "spawn_id"]);
    if (spawnId) return `agent:${spawnId}`;
  }

  const stable =
    toolCallId ||
    payload.spawn_id ||
    payload.task_id ||
    payload.taskId ||
    payload.workflow_id ||
    getNestedValue(metadata, ["approvalRequest", "tool_call_id"]) ||
    getNestedValue(metadata, ["approvalRequest", "toolCallId"]) ||
    getNestedValue(metadata, ["approval_request", "tool_call_id"]) ||
    getNestedValue(metadata, ["spawn", "spawnId"]) ||
    getNestedValue(metadata, ["spawn", "spawn_id"]);

  if (stable) return `${kind}:${stable}`;
  if (payload.id) return `${kind}:${payload.id}`;
  return `${kind}:${payload.timestamp || ""}:${payload.message || payload.content || ""}`;
}

function toEpoch(timestamp?: string): number {
  return timestamp ? new Date(timestamp).getTime() : Date.now();
}

function getActiveAssistantIndex(messages: Message[], preferredMessageId?: string): number {
  if (preferredMessageId) {
    const exact = messages.findIndex((m) => m.id === preferredMessageId);
    if (exact !== -1) return exact;
  }

  return findWritableAssistantIndex(messages);
}

export function summarizeAction(payload: AgentActionEventPayload, kind: string): string {
  if (payload.content) return payload.content;
  if (kind === "chat_status") return payload.message || "Agent status updated";
  if (kind === "orchestrator_progress") return payload.message || payload.phase || payload.status || "Orchestrator progress";
  if (kind.startsWith("workflow_")) return payload.workflow_id ? `Workflow ${payload.workflow_id}` : "Workflow update";
  if (kind === "task_created") return payload.description || payload.task_id || payload.taskId || "Task created";
  if (kind === "task_updated") return payload.description || payload.message || payload.task_id || payload.taskId || "Task updated";
  if (kind === "task_list_updated") {
    const count = Array.isArray(payload.tasks) ? payload.tasks.length : 0;
    return count > 0 ? `${count} tasks planned` : "Task list updated";
  }
  if (kind === "task_complexity_analyzed") {
    const steps = payload.battle_plan?.steps;
    return steps?.length ? `${payload.tier || "Task"} plan: ${steps.join(" / ")}` : payload.tier || "Task complexity analyzed";
  }
  if (kind === "task_completed") {
    return summarizeUnknownResult(payload.result) || payload.description || payload.task_id || payload.taskId || "Task completed";
  }
  if (kind.startsWith("task_")) return payload.description || payload.error || payload.task_id || payload.taskId || "Task update";
  if (kind === "agent_spawn") return payload.task || `Spawned ${payload.child_agent_name || payload.child_agent_id || "agent"}`;
  if (kind === "agent_complete") return payload.error || `Agent ${payload.agent_id || "worker"} completed`;
  if (kind === "agent_handoff") return payload.reason || "Agent handoff";
  return kind.replace(/_/g, " ");
}

export function inferStatus(kind: string, payload: AgentActionEventPayload): Step["status"] {
  const explicit = payload.metadata?.status || payload.status;
  const toolResultStatus = payload.metadata?.toolResult?.status || payload.metadata?.tool_result?.status;
  if (explicit === "error" || explicit === "failed") return "error";
  if (explicit === "completed" || explicit === "complete" || explicit === "ok" || explicit === "success") return "completed";
  if (explicit === "cancelled" || explicit === "canceled") return "cancelled";
  if (toolResultStatus === "error" || toolResultStatus === "timeout") return "error";
  if (toolResultStatus === "ok") return "completed";
  if (kind === "task_created" || kind === "task_updated" || kind === "task_list_updated" || kind === "task_complexity_analyzed") return "running";
  if (kind.endsWith("_failed") || kind === "error") return "error";
  if (kind.endsWith("_completed") || kind === "agent_complete" || kind === "tool_result") return "completed";
  return "running";
}

function summarizeUnknownResult(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().slice(0, 220);
  if (typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  const candidate = record.summary || record.result || record.full_content || record.content || record.output;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.replace(/\s+/g, " ").trim().slice(0, 220);
  }
  return JSON.stringify(value).replace(/\s+/g, " ").trim().slice(0, 220);
}

function normalizeTaskResult(value: unknown, durationMs?: number): ActionMeta["taskResult"] | undefined {
  if (value === undefined || value === null) {
    return durationMs !== undefined ? { durationMs } : undefined;
  }
  if (typeof value === "string") {
    return { output: value, durationMs };
  }
  if (typeof value !== "object") {
    return { output: String(value), durationMs };
  }

  const record = value as Record<string, unknown>;
  const output = record.output || record.content || record.summary || record.result;
  const error = record.error;
  const success = record.success ?? (record.is_error !== undefined ? !record.is_error : undefined);
  return {
    success: typeof success === "boolean" ? success : undefined,
    output: typeof output === "string" ? output : output === undefined ? undefined : JSON.stringify(output),
    error: typeof error === "string" ? error : undefined,
    durationMs: typeof record.duration_ms === "number" ? record.duration_ms : durationMs,
  };
}

export function normalizeMetadata(kind: string, payload: AgentActionEventPayload): ActionMeta {
  const metadata = { ...(payload.metadata || {}) } as Record<string, unknown> & {
    approvalRequest?: unknown;
    approval_request?: unknown;
    spawn?: unknown;
    status?: unknown;
    toolCall?: unknown;
    tool_call?: unknown;
    toolResult?: unknown;
    tool_result?: unknown;
  };
  if (metadata.approval_request && !metadata.approvalRequest) {
    metadata.approvalRequest = metadata.approval_request;
  }
  if (metadata.tool_result && !metadata.toolResult) {
    metadata.toolResult = metadata.tool_result;
  }
  if (metadata.tool_call && !metadata.toolCall) {
    metadata.toolCall = metadata.tool_call;
  }
  if (kind === "agent_spawn" && !metadata.spawn) {
    metadata.spawn = {
      parentAgent: payload.parent_agent || payload.parentAgent || "main",
      childAgent: payload.child_agent_name || payload.child_agent_id || payload.childAgent || "agent",
      task: payload.task || "",
      status: "spawned",
    };
  }
  if (kind === "agent_complete" && !metadata.spawn) {
    const resultSummary = summarizeUnknownResult(payload.result) || payload.error;
    metadata.spawn = {
      parentAgent: payload.parent_agent || "main",
      childAgent: payload.child_agent_name || payload.childAgent || payload.child_agent_id || payload.agent_id || "agent",
      task: payload.task || resultSummary || "",
      status: payload.error ? "failed" : "completed",
      durationMs: payload.duration_ms,
    };
    if (resultSummary) metadata.resultSummary = resultSummary;
  }
  if (kind === "agent_handoff" && !metadata.handoff) {
    metadata.handoff = {
      fromAgent: payload.from_agent || payload.fromAgent || "agent",
      toAgent: payload.to_agent || payload.toAgent || "agent",
      reason: payload.reason || "",
    };
  }
  if (payload.iteration !== undefined) metadata.iteration = payload.iteration;
  const runId = stringValue(payload.run_id, payload.runId, metadata.runId, metadata.run_id);
  const messageId = stringValue(payload.message_id, payload.messageId, metadata.messageId, metadata.message_id);
  const parentAgentId = stringValue(
    payload.parent_agent_id,
    payload.parentAgentId,
    payload.parent_agent,
    payload.parentAgent,
    metadata.parentAgentId,
    metadata.parent_agent_id,
    metadata.parentAgent,
    metadata.parent_agent,
  );
  const executionId = stringValue(payload.execution_id, payload.executionId, metadata.executionId, metadata.execution_id);
  const batchId = stringValue(payload.batch_id, payload.batchId, metadata.batchId, metadata.batch_id);
  const toolBatchId = stringValue(payload.tool_batch_id, payload.toolBatchId, metadata.toolBatchId, metadata.tool_batch_id);
  if (runId !== undefined) metadata.runId = runId;
  if (messageId !== undefined) metadata.messageId = messageId;
  if (parentAgentId !== undefined) metadata.parentAgentId = parentAgentId;
  if (executionId !== undefined) metadata.executionId = executionId;
  if (batchId !== undefined) metadata.batchId = batchId;
  if (toolBatchId !== undefined) metadata.toolBatchId = toolBatchId;
  if (payload.agent_id !== undefined) metadata.agentId = payload.agent_id;
  if (payload.child_agent_id !== undefined && metadata.agentId === undefined) metadata.agentId = payload.child_agent_id;
  if (payload.agent_name !== undefined) metadata.agentName = payload.agent_name;
  if (payload.child_agent_name !== undefined && metadata.agentName === undefined) metadata.agentName = payload.child_agent_name;
  if (payload.phase !== undefined) metadata.phase = payload.phase;
  if (payload.message !== undefined) metadata.message = payload.message;
  if (payload.provider !== undefined) metadata.provider = payload.provider;
  if (payload.model !== undefined) metadata.model = payload.model;
  if (payload.toolCount !== undefined) metadata.toolCount = payload.toolCount;
  if (payload.parallel !== undefined) metadata.parallel = payload.parallel;
  if (payload.tools !== undefined) metadata.tools = payload.tools;
  if (payload.task_id !== undefined || payload.taskId !== undefined) metadata.taskId = payload.task_id ?? payload.taskId;
  if (payload.assigned_to !== undefined || payload.assignedTo !== undefined) metadata.assignedTo = payload.assigned_to ?? payload.assignedTo;
  if (payload.tasks !== undefined) metadata.tasks = payload.tasks;
  if (payload.workflow_id !== undefined) metadata.workflowId = payload.workflow_id;
  if (payload.total_tasks !== undefined) metadata.totalTasks = payload.total_tasks;
  if (payload.tasks_completed !== undefined) metadata.tasksCompleted = payload.tasks_completed;
  if (payload.duration_ms !== undefined && kind.startsWith("workflow_")) metadata.durationMs = payload.duration_ms;
  if (payload.tier !== undefined) metadata.tier = payload.tier;
  if (payload.battle_plan !== undefined) metadata.battlePlan = payload.battle_plan;
  if (payload.updates !== undefined) metadata.updates = payload.updates;
  if (kind.startsWith("task_")) {
    const taskResult = normalizeTaskResult(payload.result, payload.duration_ms);
    if (taskResult) metadata.taskResult = taskResult;
    const resultSummary = summarizeUnknownResult(payload.result) || payload.error;
    if (resultSummary) metadata.resultSummary = resultSummary;
  }
  if (payload.progressPercent !== undefined || payload.progress_percent !== undefined || payload.progress !== undefined) {
    metadata.progressPercent = payload.progressPercent ?? payload.progress_percent ?? payload.progress;
  }
  const status = inferStatus(kind, payload);
  metadata.status = status === "error" ? "error" : status === "completed" ? "completed" : "running";
  return metadata as ActionMeta;
}

export function createActionStep(payload: AgentActionEventPayload, kind: string): Step {
  return {
    type: "action",
    kind,
    content: summarizeAction(payload, kind),
    status: inferStatus(kind, payload),
    metadata: normalizeMetadata(kind, payload),
    timestamp: toEpoch(payload.timestamp),
    eventId: getActionEventId(payload, kind),
  };
}

function mergeActionMetadata(existing: ActionMeta | undefined, incoming: ActionMeta | undefined): ActionMeta {
  const merged = { ...(existing || {}), ...(incoming || {}) };
  if (
    (existing?.status === "completed" || existing?.status === "error" || existing?.status === "cancelled") &&
    incoming?.status === "running"
  ) {
    merged.status = existing.status;
  }
  if (existing?.spawn && incoming?.spawn) {
    merged.spawn = {
      ...existing.spawn,
      ...incoming.spawn,
      task: incoming.spawn.task && incoming.spawn.task !== incoming.resultSummary ? incoming.spawn.task : existing.spawn.task,
    };
  } else {
    merged.spawn = incoming?.spawn || existing?.spawn;
  }
  return merged;
}

function isTerminalStatus(status?: Step["status"]) {
  return status === "completed" || status === "error" || status === "cancelled";
}

function mergeActionStep(existing: Step, incoming: Step): Step {
  const metadata = mergeActionMetadata(existing.metadata, incoming.metadata);

  if (isTerminalStatus(existing.status) && incoming.status === "running") {
    return {
      ...existing,
      metadata,
    };
  }

  return {
    ...existing,
    ...incoming,
    metadata,
  };
}

export function appendActionStepToMessages(
  prev: Message[],
  chatId: string,
  payload: AgentActionEventPayload,
  kind: string,
): Message[] {
  const actionStep = createActionStep(payload, kind);
  const eventId = actionStep.eventId;

  const existingMessageIdx = prev.findIndex((m) => m.steps?.some((s) => s.type === "action" && s.eventId === eventId));
  if (existingMessageIdx !== -1) {
    const next = [...prev];
    const existingMessage = next[existingMessageIdx];
    next[existingMessageIdx] = {
      ...existingMessage,
      steps: (existingMessage.steps || []).map((step) =>
        step.type === "action" && step.eventId === eventId
          ? mergeActionStep(step, actionStep)
          : step
      ),
      metadata: mergeActionMetadata(existingMessage.metadata, actionStep.metadata),
    };
    return next;
  }

  const targetIdx = getActiveAssistantIndex(prev, payload.message_id);
  if (targetIdx !== -1) {
    const next = [...prev];
    const target = next[targetIdx];
    next[targetIdx] = {
      ...target,
      steps: [...(target.steps || []), actionStep],
      metadata: { ...(target.metadata || {}), ...(actionStep.metadata || {}) },
    };
    return next;
  }

  return [
    ...prev,
    {
      id: eventId || `${kind}-${Date.now()}`,
      sessionId: chatId,
      role: "system",
      content: payload.content || "",
      kind: kind as MessageKind,
      status: "sent",
      createdAt: actionStep.timestamp,
      metadata: actionStep.metadata,
      steps: [actionStep],
    },
  ];
}
