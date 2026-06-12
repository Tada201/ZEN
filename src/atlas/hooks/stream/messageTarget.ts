import type { Message } from "../../components/chat/types";

export function findWritableAssistantIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].status === "sending") return i;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].id.startsWith("temp-assistant-")) return i;
  }
  return -1;
}

export function markMessageAsFailed(message: Message, error: string): Message {
  const toolCalls = message.toolCalls?.map((tc) => {
    if (tc.status === "running" || tc.status === "awaiting_approval") {
      return { ...tc, status: "error" as const };
    }
    return tc;
  });

  const steps = message.steps?.map((step) => {
    let nextStep = step;
    if (step.status === "running" || step.status === "pending") {
      nextStep = { ...nextStep, status: "error" as const };
    }
    if (nextStep.toolCall && (nextStep.toolCall.status === "running" || nextStep.toolCall.status === "awaiting_approval")) {
      nextStep = {
        ...nextStep,
        toolCall: { ...nextStep.toolCall, status: "error" as const },
      };
    }
    return nextStep;
  });

  return {
    ...message,
    status: "failed",
    error,
    isThinking: false,
    ...(toolCalls ? { toolCalls } : {}),
    ...(steps ? { steps } : {}),
  };
}

export function markMessageAsFinished(message: Message, isCancelled: boolean, stopReason?: string): Message {
  const stepTargetStatus = isCancelled ? "cancelled" : "completed";
  const toolTargetStatus = isCancelled ? "error" : "completed";

  const toolCalls = message.toolCalls?.map((tc) => {
    if (tc.status === "running" || tc.status === "awaiting_approval") {
      return { ...tc, status: toolTargetStatus as "completed" | "error" };
    }
    return tc;
  });

  const steps = message.steps?.map((step) => {
    let nextStep = step;
    if (step.status === "running" || step.status === "pending") {
      nextStep = { ...nextStep, status: stepTargetStatus as "completed" | "cancelled" | "error" };
    }
    if (nextStep.toolCall && (nextStep.toolCall.status === "running" || nextStep.toolCall.status === "awaiting_approval")) {
      nextStep = {
        ...nextStep,
        toolCall: { ...nextStep.toolCall, status: toolTargetStatus as "completed" | "error" },
      };
    }
    return nextStep;
  });

  return {
    ...message,
    status: isCancelled ? "cancelled" : "sent",
    isThinking: false,
    metadata: {
      ...message.metadata,
      ...(stopReason ? { stopReason } : {}),
    },
    ...(toolCalls ? { toolCalls } : {}),
    ...(steps ? { steps } : {}),
  };
}
