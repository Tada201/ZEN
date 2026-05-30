import type { AgentActionEventPayload, TaskEventPayload } from "@/api/events";
import { getActiveStreamingChatId, getDirectOrActiveStreamingChatId, type ActiveStreamState } from "./activeStreamRouting";

type TaskRoutingPayload = Pick<AgentActionEventPayload, "chat_id" | "chatId" | "task_id" | "taskId" | "id">;
type WorkflowRoutingPayload = Pick<AgentActionEventPayload, "chat_id" | "chatId" | "workflow_id" | "id">;

export function getTaskId(payload: TaskRoutingPayload): string | undefined {
  return payload.task_id || payload.taskId || payload.id;
}

export function rememberTaskChat(
  cache: Map<string, string>,
  payload: TaskRoutingPayload,
  chatId?: string | null,
) {
  if (!chatId) return;
  const taskId = getTaskId(payload);
  if (taskId) cache.set(taskId, chatId);
}

export function rememberTaskListChats(
  cache: Map<string, string>,
  tasks: TaskEventPayload[] | undefined,
  chatId?: string | null,
) {
  tasks?.forEach((task) => rememberTaskChat(cache, task, chatId));
}

export function getTaskChatId(
  cache: Map<string, string>,
  state: ActiveStreamState,
  payload: TaskRoutingPayload,
): string | undefined {
  const direct = payload.chat_id || payload.chatId;
  if (direct) return direct;

  const taskId = getTaskId(payload);
  if (taskId) {
    const mapped = cache.get(taskId);
    if (mapped) return mapped;
  }

  return getActiveStreamingChatId(state);
}

export function rememberWorkflowChat(
  cache: Map<string, string>,
  payload: WorkflowRoutingPayload,
  chatId?: string | null,
) {
  if (chatId && payload.workflow_id) cache.set(payload.workflow_id, chatId);
}

export function getWorkflowChatId(
  cache: Map<string, string>,
  state: ActiveStreamState,
  payload: WorkflowRoutingPayload,
): string | undefined {
  const direct = payload.chat_id || payload.chatId;
  if (direct) return direct;

  if (payload.workflow_id) {
    const mapped = cache.get(payload.workflow_id);
    if (mapped) return mapped;
  }

  return getActiveStreamingChatId(state);
}

export function getTaskPlanChatId(
  state: ActiveStreamState,
  payload: Pick<AgentActionEventPayload, "chat_id" | "chatId">,
): string | undefined {
  return getDirectOrActiveStreamingChatId(state, payload);
}
