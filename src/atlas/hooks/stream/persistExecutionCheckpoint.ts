import { chatApi } from "@/api/chatApi";
import { useChatStore } from "@/lib/stores/useChatStore";
import type { Message } from "../../components/chat/types";
import { projectStepsForPersistence } from "./projectStepsForPersistence";

const CHECKPOINT_DELAY_MS = 750;
const TRACE_VERSION = 2;
type TraceStatus = "running" | "completed" | "cancelled" | "failed" | "interrupted" | "checkpoint";
type PersistedCheckpoint = {
  timer: ReturnType<typeof setTimeout>;
  json: string;
  chatId: string;
  messageId: string;
  status: TraceStatus;
};

const pending = new Map<string, PersistedCheckpoint>();
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

function updateTracePersistence(
  chatId: string,
  messageId: string,
  patch: {
    tracePersistence: "saved" | "failed";
    traceStatus?: TraceStatus;
    tracePersistenceError?: string;
  },
) {
  useChatStore.getState().setSessionMessages(chatId, (messages) => {
    const index = messages.findIndex((message) => message.id === messageId);
    if (index === -1) return messages;
    const next = [...messages];
    const message = next[index];
    next[index] = {
      ...message,
      metadata: {
        ...(message.metadata || {}),
        traceVersion: TRACE_VERSION,
        ...patch,
      },
    };
    return next;
  });
}

async function writeCheckpoint(
  key: string,
  chatId: string,
  messageId: string,
  json: string,
  status: TraceStatus,
): Promise<void> {
  pending.delete(key);
  const cacheValue = `${status}:${json}`;
  if (lastPersisted.get(key) === cacheValue) return;
  try {
    // Keep the legacy message projection during the transition, but make the
    // normalized backend event ledger authoritative for new reloads and the
    // Run Inspector. Either durable path may succeed independently so a
    // transient migration/IPC issue does not erase an otherwise valid trace.
    const [legacyResult, normalizedResult] = await Promise.allSettled([
      chatApi.updateMessageSteps(chatId, messageId, json, status),
      chatApi.upsertExecutionTrace(chatId, messageId, json, status),
    ]);
    if (legacyResult.status === "rejected" && normalizedResult.status === "rejected") {
      throw legacyResult.reason;
    }
    if (normalizedResult.status === "rejected") {
      console.warn("[execution-checkpoint] Normalized trace write failed; legacy projection retained");
    }
    lastPersisted.set(key, cacheValue);
    updateTracePersistence(chatId, messageId, {
      tracePersistence: "saved",
      traceStatus: status,
    });
  } catch {
    // Keep the live trace intact and expose a calm, actionable state in the
    // message metadata. The raw IPC/backend error is intentionally not shown
    // because it may contain provider or environment details.
    updateTracePersistence(chatId, messageId, {
      tracePersistence: "failed",
      traceStatus: status,
      tracePersistenceError: "The execution trace could not be saved. The live timeline is still available.",
    });
    console.error("[execution-checkpoint] Failed to persist execution trace checkpoint");
  }
}

/** Persist the compact execution ledger while a run is active. */
export function persistExecutionCheckpointForEvent({
  chatId,
  messageId,
  toolCallId,
  flush = false,
  traceStatus = "running",
}: {
  chatId: string;
  messageId?: string | null;
  toolCallId?: string;
  flush?: boolean;
  traceStatus?: TraceStatus;
}): Promise<void> | undefined {
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
    // Return the write so callers that refetch straight after (chat:done →
    // invalidateQueries) can await it; writeCheckpoint never rejects.
    return writeCheckpoint(key, chatId, messageId, json, traceStatus);
  }

  const timer = setTimeout(() => {
    void writeCheckpoint(key, chatId, messageId, json, traceStatus);
  }, CHECKPOINT_DELAY_MS);
  pending.set(key, { timer, json, chatId, messageId, status: traceStatus });
}

/**
 * Fire every debounced checkpoint that is still waiting. Called on
 * `pagehide`/unmount so a hard WebView2 close cannot drop the last checkpoint.
 */
export function flushPendingCheckpoints(): void {
  for (const [key, entry] of pending) {
    clearTimeout(entry.timer);
    void writeCheckpoint(key, entry.chatId, entry.messageId, entry.json, entry.status);
  }
}

/** Persist a subagent update using the backend id carried by its parent tool. */
export function persistExecutionCheckpointForToolCall({
  chatId,
  toolCallId,
  flush = false,
  traceStatus = "running",
}: {
  chatId: string;
  toolCallId?: string;
  flush?: boolean;
  traceStatus?: TraceStatus;
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
    traceStatus,
  });
}
