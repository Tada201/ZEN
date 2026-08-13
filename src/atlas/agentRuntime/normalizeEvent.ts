import type { AgentRunEvent } from "./types.ts";

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

export function normalizeChatDeltaEvent(payload: Record<string, unknown>, fallbackKind: "text-delta" | "reasoning-delta"): AgentRunEvent | null {
  const chatId = stringValue(payload.chat_id, payload.chatId);
  const delta = stringValue(payload.delta, payload.text) || "";
  if (!chatId || !delta) return null;

  return {
    kind: fallbackKind === "reasoning-delta" || payload.type === "thought" || payload.type === "reasoning"
      ? "reasoning-delta"
      : "text-delta",
    runId: stringValue(payload.run_id, payload.runId, chatId) || chatId,
    chatId,
    messageId: stringValue(payload.message_id, payload.messageId),
    partId: stringValue(payload.part_id, payload.partId),
    sequence: typeof payload.sequence === "number" ? payload.sequence : undefined,
    delta,
  };
}

export function normalizeChatDoneEvent(payload: Record<string, unknown>): AgentRunEvent | null {
  const chatId = stringValue(payload.chat_id, payload.chatId);
  if (!chatId) return null;
  return {
    kind: "run-finish",
    runId: stringValue(payload.run_id, payload.runId, chatId) || chatId,
    chatId,
    messageId: stringValue(payload.message_id, payload.messageId),
    content: typeof payload.content === "string" ? payload.content : undefined,
    finishReason: stringValue(payload.reason, payload.finish_reason, payload.finishReason),
    sequence: typeof payload.sequence === "number" ? payload.sequence : undefined,
  };
}
