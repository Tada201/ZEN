import type { AgentActionEventPayload } from "@/api/events";
import { useAgentActivityStore } from "@/lib/stores/agentActivityStore";

export type AgentTaskStatus = "pending" | "in_progress" | "completed" | "failed";

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function eventTimestamp(payload: AgentActionEventPayload): number {
  return payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now();
}

function agentTaskId(payload: AgentActionEventPayload, chatId: string) {
  return stringValue(
    payload.spawn_id,
    payload.id,
    payload.child_agent_id,
    payload.childAgent,
    payload.agent_id,
    payload.agent_name,
    payload.child_agent_name,
    `${chatId}:${payload.agent_id || payload.child_agent_name || "agent"}:${payload.iteration ?? "active"}`,
  )!;
}

function taskEventId(payload: AgentActionEventPayload, chatId: string) {
  return stringValue(payload.task_id, payload.taskId, payload.id, `${chatId}:${payload.description || payload.task || "task"}`)!;
}

function taskDescription(payload: AgentActionEventPayload) {
  return stringValue(payload.description, payload.task, payload.message, payload.content) || "Task";
}

export function syncAgentSpawnToActivity(chatId: string, payload: AgentActionEventPayload) {
  const store = useAgentActivityStore.getState();
  const id = agentTaskId(payload, chatId);
  const agentName = stringValue(payload.child_agent_name, payload.agent_name, payload.childAgent, payload.agent_id) || "Agent";
  const agentId = stringValue(payload.child_agent_id, payload.agent_id, payload.childAgent, agentName) || agentName;
  const startedAt = eventTimestamp(payload);

  store.addTask({
    id,
    chatId,
    agentId,
    agentName,
    parentAgentId: stringValue(payload.parent_agent_id, payload.parentAgentId, payload.parent_agent, payload.parentAgent),
    task: taskDescription(payload),
    status: "in_progress",
    startedAt,
  });
  store.addActivity({
    chatId,
    agentId,
    agentName,
    type: "spawn",
    status: "running",
    timestamp: startedAt,
    message: taskDescription(payload),
    metadata: payload as Record<string, unknown>,
  });
}

export function syncAgentCompleteToActivity(chatId: string, payload: AgentActionEventPayload) {
  const store = useAgentActivityStore.getState();
  const id = agentTaskId(payload, chatId);
  const agentName = stringValue(payload.child_agent_name, payload.agent_name, payload.childAgent, payload.agent_id) || "Agent";
  const agentId = stringValue(payload.child_agent_id, payload.agent_id, payload.childAgent, agentName) || agentName;
  const completedAt = eventTimestamp(payload);
  const failed = Boolean(payload.error);

  store.completeTask(id, failed ? "failed" : "completed", payload.result, payload.error, completedAt);
  store.addActivity({
    chatId,
    agentId,
    agentName,
    type: failed ? "error" : "status",
    status: failed ? "error" : "completed",
    timestamp: completedAt,
    duration: numberValue(payload.duration_ms),
    message: payload.error || taskDescription(payload),
    metadata: payload as Record<string, unknown>,
  });
}

export function syncAgentHandoffToActivity(chatId: string, payload: AgentActionEventPayload) {
  const agentName = stringValue(payload.to_agent, payload.toAgent, payload.agent_name, payload.agent_id) || "Agent";
  useAgentActivityStore.getState().addActivity({
    chatId,
    agentId: stringValue(payload.agent_id, payload.to_agent, payload.toAgent, agentName) || agentName,
    agentName,
    type: "handoff",
    status: "running",
    timestamp: eventTimestamp(payload),
    message: payload.reason || "Agent handoff",
    metadata: payload as Record<string, unknown>,
  });
}

export function syncTaskToActivity(chatId: string, payload: AgentActionEventPayload, status: AgentTaskStatus) {
  const store = useAgentActivityStore.getState();
  const id = taskEventId(payload, chatId);
  const agentName = stringValue(payload.assigned_to, payload.assignedTo, payload.agent_name, payload.agent_id) || "Task";
  const agentId = stringValue(payload.agent_id, payload.assigned_to, payload.assignedTo, agentName) || agentName;
  const timestamp = eventTimestamp(payload);
  const progress = numberValue(payload.progressPercent, payload.progress_percent, payload.progress);

  store.addTask({
    id,
    chatId,
    agentId,
    agentName,
    task: taskDescription(payload),
    status,
    startedAt: timestamp,
  });
  store.updateTask(id, {
    status,
    task: taskDescription(payload),
    progress: progress ?? (status === "completed" || status === "failed" ? 100 : status === "in_progress" ? 50 : 0),
    error: payload.error,
  });
  if (status === "completed" || status === "failed") {
    store.completeTask(id, status, payload.result, payload.error, timestamp);
  }
  store.addActivity({
    chatId,
    agentId,
    agentName,
    type: status === "failed" ? "error" : "status",
    status: status === "failed" ? "error" : status === "completed" ? "completed" : "running",
    timestamp,
    message: taskDescription(payload),
    metadata: payload as Record<string, unknown>,
  });
}
