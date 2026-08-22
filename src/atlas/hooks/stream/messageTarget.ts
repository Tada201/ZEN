import type { Message } from "../../components/chat/types";
import { useChatStore } from "@/lib/stores/useChatStore";
import { isRetiredStreamTarget } from "./streamSupersession";

function assistantHasVisibleContent(message: Message): boolean {
  return Boolean(
    message.content?.trim() ||
    message.reasoning?.trim() ||
    message.steps?.some((step) =>
      step.type === "text"
        ? Boolean((step.content || "").trim())
        : step.type === "reasoning" || step.type === "tool-call" || step.type === "action"
    ) ||
    (message.toolCalls?.length ?? 0) > 0
  );
}

/**
 * Close any in-flight assistant placeholders before starting a new turn so
 * late stream events cannot attach to the wrong bubble.
 */
export function supersedeStaleSendingAssistants(messages: Message[]): Message[] {
  return messages.map((message) => {
    if (message.role !== "assistant" || message.status !== "sending") return message;

    if (assistantHasVisibleContent(message)) {
      return markMessageAsFinished(message, true, "superseded");
    }

    return {
      ...message,
      status: "cancelled" as const,
      isThinking: false,
      error: undefined,
    };
  });
}

export function findWritableAssistantIndex(messages: Message[], chatId?: string | null, messageId?: string | null): number {
  // Prefer the backend identity carried by stream events. This lets a chunk
  // delivered around chat:done update its original assistant row without
  // falling through to a different turn or being discarded after finalization.
  if (messageId) {
    const exactIdx = messages.findIndex((message) =>
      message.id === messageId &&
      message.role === "assistant" &&
      (message.status === "sending" || message.status === "sent" || message.status === "paused"),
    );
    if (exactIdx !== -1) return exactIdx;
    // A superseded run's late events carry message ids that no longer match
    // any row (regenerate slice, superseded placeholder). Drop them instead
    // of falling through to the active assistant below, which would graft
    // the old run's prose onto the replacement turn.
    if (isRetiredStreamTarget(chatId, messageId)) return -1;
  }

  const activeAssistantId = chatId
    ? useChatStore.getState().getActiveAssistantForChat(chatId)
    : null;

  if (activeAssistantId) {
    const activeIdx = messages.findIndex((message) => message.id === activeAssistantId);
    if (
      activeIdx !== -1 &&
      messages[activeIdx].role === "assistant" &&
      (messages[activeIdx].status === "sending" || messages[activeIdx].status === "paused")
    ) {
      return activeIdx;
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && (messages[i].status === "sending" || messages[i].status === "paused")) return i;
  }

  // A database refresh can reconcile the optimistic placeholder before its
  // terminal stream event arrives. Keep routing that stream to its local row.
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].id.startsWith("temp-assistant-")) return i;
  }

  return -1;
}

export function markMessageAsFailed(message: Message, error: string, recoverable = false): Message {
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
    metadata: {
      ...message.metadata,
      error,
      status: "error",
      recoverable,
    },
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
    error: undefined,
    isThinking: false,
    metadata: {
      ...message.metadata,
      ...(stopReason ? { stopReason } : {}),
    },
    ...(toolCalls ? { toolCalls } : {}),
    ...(steps ? { steps } : {}),
  };
}
