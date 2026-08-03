import { chatApi } from "@/api/chatApi";
import { useChatStore } from "@/lib/stores/useChatStore";
import type { Message } from "../../components/chat/types";
import { projectStepsForPersistence } from "./projectStepsForPersistence";

const CHECKPOINT_DELAY_MS = 750;
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; json: string }>();
const lastPersisted = new Map<string, string>();

function findTimelineOwner(messages: Message[], messageId: string, toolCallId?: string): Message | undefined {
  return messages.find((message) => message.role === "assistant" && message.id === messageId)
    || (toolCallId
      ? messages.find((message) =>
          message.toolCalls?.some((tool) => tool.id === toolCallId)
          || message.steps?.some((step) => step.type === "tool-call" && step.toolCall?.id === toolCallId),
        )
      : undefined);
}

async function writeCheckpoint(key: string, chatId: string, messageId: string, json: string): Promise<void> {
  pending.delete(key);
  if (lastPersisted.get(key) === json) return;
  try {
    await chatApi.updateMessageSteps(chatId, messageId, json);
    lastPersisted.set(key, json);
  } catch (error) {
    console.error("[execution-checkpoint] Failed to persist active timeline:", error);
  }
}

/** Persist the compact execution ledger while a run is active. */
export function persistExecutionCheckpointForEvent({
  chatId,
  messageId,
  toolCallId,
  flush = false,
}: {
  chatId: string;
  messageId?: string | null;
  toolCallId?: string;
  flush?: boolean;
}): void {
  if (!messageId || messageId.startsWith("temp-assistant-")) return;

  const timelineOwner = findTimelineOwner(
    useChatStore.getState().sessionMessages[chatId] ?? [],
    messageId,
    toolCallId,
  );
  if (!timelineOwner?.steps?.length) return;

  const json = JSON.stringify(projectStepsForPersistence(timelineOwner.steps));
  const key = `${chatId}:${messageId}`;
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);

  if (flush) {
    void writeCheckpoint(key, chatId, messageId, json);
    return;
  }

  const timer = setTimeout(() => {
    void writeCheckpoint(key, chatId, messageId, json);
  }, CHECKPOINT_DELAY_MS);
  pending.set(key, { timer, json });
}

/** Persist a subagent update using the backend id carried by its parent tool. */
export function persistExecutionCheckpointForToolCall({
  chatId,
  toolCallId,
  flush = false,
}: {
  chatId: string;
  toolCallId?: string;
  flush?: boolean;
}): void {
  if (!toolCallId) return;
  const messages = useChatStore.getState().sessionMessages[chatId] ?? [];
  const owner = messages.find((message) =>
    message.toolCalls?.some((tool) => tool.id === toolCallId)
    || message.steps?.some((step) => step.type === "tool-call" && step.toolCall?.id === toolCallId),
  );
  const tool = owner?.toolCalls?.find((candidate) => candidate.id === toolCallId)
    || owner?.steps?.find((step) => step.type === "tool-call" && step.toolCall?.id === toolCallId)?.toolCall;
  persistExecutionCheckpointForEvent({
    chatId,
    messageId: tool?.messageId,
    toolCallId,
    flush,
  });
}
