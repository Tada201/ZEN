import type { Step } from "./types";

type ActionTaskPreview = NonNullable<NonNullable<Step["metadata"]>["tasks"]>[number];

export type NormalizedTaskPreview = {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "error" | "cancelled";
  assignee?: string;
};

export type NormalizedTaskResultPreview = {
  text: string;
  durationMs?: number;
  success?: boolean;
};

export type TaskPlanPreviewModel = {
  tasks: NormalizedTaskPreview[];
  hiddenTaskCount: number;
  battlePlanSteps: string[];
  taskResult?: NormalizedTaskResultPreview;
  hasPreview: boolean;
};

function compactText(value: unknown, fallback = "") {
  if (value === undefined || value === null || value === "") return fallback;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/\s+/g, " ").trim();
}

function readTaskId(task: ActionTaskPreview, index: number) {
  return compactText(task.id || task.task_id || `task-${index + 1}`);
}

function readTaskLabel(task: ActionTaskPreview, id: string) {
  return compactText(task.description || task.title || task.name || task.task || id, id);
}

function normalizeTaskStatus(status: unknown): NormalizedTaskPreview["status"] {
  if (status === "running" || status === "in_progress" || status === "in-progress" || status === "started" || status === "active") return "running";
  if (status === "completed" || status === "complete" || status === "success" || status === "done") return "completed";
  if (status === "error" || status === "failed" || status === "failure") return "error";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  return "pending";
}

function readTaskAssignee(task: ActionTaskPreview) {
  return compactText(task.assignedTo || task.assigned_to || task.agentName || task.agent_name || task.agentId || task.agent_id);
}

function normalizeTask(task: ActionTaskPreview, index: number): NormalizedTaskPreview {
  const id = readTaskId(task, index);
  return {
    id,
    label: readTaskLabel(task, id),
    status: normalizeTaskStatus(task.status),
    assignee: readTaskAssignee(task) || undefined,
  };
}

function normalizeTaskResult(taskResult: NonNullable<Step["metadata"]>["taskResult"]): NormalizedTaskResultPreview | undefined {
  if (!taskResult) return undefined;
  const text = compactText(taskResult.error || taskResult.output);
  return {
    text,
    durationMs: taskResult.durationMs,
    success: taskResult.success,
  };
}

export function buildTaskPlanPreviewModel(step: Step): TaskPlanPreviewModel {
  const rawTasks = step.metadata?.tasks || [];
  const battlePlanSteps = (step.metadata?.battlePlan?.steps || []).map((item) => compactText(item)).filter(Boolean);
  const taskResult = normalizeTaskResult(step.metadata?.taskResult);
  const tasks = rawTasks.map(normalizeTask);

  return {
    tasks: tasks.slice(0, 8),
    hiddenTaskCount: Math.max(0, tasks.length - 8),
    battlePlanSteps: battlePlanSteps.slice(0, 6),
    taskResult,
    hasPreview: tasks.length > 0 || battlePlanSteps.length > 0 || Boolean(taskResult),
  };
}
