import type { Message } from "./types";
import { collectMessageToolCalls } from "./messageToolCallModel";

export type WorkspaceExecutionStatusKind = "idle" | "running" | "paused" | "approval" | "review" | "error" | "completed";

export interface WorkspaceExecutionStatus {
  kind: WorkspaceExecutionStatusKind;
  label: string;
  detail: string;
  activeToolCount: number;
  pendingApprovalCount: number;
}

function currentTurnMessages(messages: Message[]): Message[] {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  return messages.slice(lastUserIndex + 1);
}

function currentTurnToolCalls(turnMessages: Message[]) {
  return turnMessages.flatMap(collectMessageToolCalls);
}

export function deriveWorkspaceExecutionStatus(
  messages: Message[],
  isStreaming: boolean,
): WorkspaceExecutionStatus {
  const turnMessages = currentTurnMessages(messages);
  const toolCalls = currentTurnToolCalls(turnMessages);
  const pendingApprovalCount = toolCalls.filter((tool) => tool.status === "awaiting_approval").length;
  const activeToolCount = toolCalls.filter((tool) => tool.status === "running").length;
  const subagentSteps = turnMessages.flatMap((message) => message.steps || []).filter((step) => step.type === "subagent");
  const failedSubagentCount = subagentSteps.filter((step) => step.subagent?.status === "failed").length;
  const reviewSubagentCount = subagentSteps.filter((step) => ["incomplete", "uncertain", "stale"].includes(step.subagent?.status || "")).length;
  let lastAssistant: Message | undefined;
  for (let index = turnMessages.length - 1; index >= 0; index -= 1) {
    if (turnMessages[index]?.role === "assistant") {
      lastAssistant = turnMessages[index];
      break;
    }
  }
  const hasExecution = toolCalls.length > 0 || turnMessages.some((message) =>
    message.steps?.some((step) => step.type !== "text"),
  );
  const hasError = Boolean(lastAssistant?.status === "failed" || toolCalls.some((tool) => tool.status === "error") || failedSubagentCount > 0);

  if (pendingApprovalCount > 0) {
    return {
      kind: "approval",
      label: "Needs approval",
      detail: `${pendingApprovalCount} action${pendingApprovalCount === 1 ? "" : "s"} waiting`,
      activeToolCount,
      pendingApprovalCount,
    };
  }

  if (hasError) {
    return {
      kind: "error",
      label: "Failed",
      detail: failedSubagentCount > 0 ? "Review delegated work" : "Review the latest run",
      activeToolCount,
      pendingApprovalCount,
    };
  }

  if (reviewSubagentCount > 0) {
    return {
      kind: "review",
      label: "Needs review",
      detail: "Review delegated work",
      activeToolCount,
      pendingApprovalCount,
    };
  }

  if (lastAssistant?.status === "paused") {
    return {
      kind: "paused",
      label: "Paused",
      detail: "Response paused",
      activeToolCount,
      pendingApprovalCount,
    };
  }

  if (isStreaming || activeToolCount > 0 || lastAssistant?.status === "sending") {
    return {
      kind: "running",
      label: "Running",
      detail: activeToolCount > 0
        ? `${activeToolCount} active action${activeToolCount === 1 ? "" : "s"}`
        : "Agent is working",
      activeToolCount,
      pendingApprovalCount,
    };
  }

  if (hasExecution && lastAssistant?.status === "sent") {
    return {
      kind: "completed",
      label: "Complete",
      detail: "Latest run finished",
      activeToolCount,
      pendingApprovalCount,
    };
  }

  return {
    kind: "idle",
    label: "Ready",
    detail: "No active run",
    activeToolCount,
    pendingApprovalCount,
  };
}
