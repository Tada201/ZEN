import type { Message, ToolCall } from "../types";
import { collectMessageToolCalls } from "../messageToolCallModel";

export interface PendingApproval {
  chatId: string;
  messageId: string;
  toolCall: ToolCall;
}

// Identity-keyed caches so the always-mounted pending-approval selectors stay
// cheap during streaming. Streaming updates replace only the changed message
// objects, so unchanged messages keep their references across frames: the
// per-message WeakMap makes rescanning a changed chat O(changed messages), the
// per-chat cache skips untouched chats, and the whole-result memo keeps the
// returned array reference stable so Zustand selectors bail out when no
// approval actually changed. Assumes immutable message updates (store rule).
interface MessagePendingEntry {
  messageId: string;
  toolCall: ToolCall;
}

const messagePendingCache = new WeakMap<Message, MessagePendingEntry[]>();
const chatPendingCache = new Map<string, { src: Message[]; result: PendingApproval[] }>();
const CHAT_CACHE_LIMIT = 32;

let lastInput: Record<string, Message[]> | null = null;
let lastResult: PendingApproval[] = [];

function collectMessagePending(message: Message): MessagePendingEntry[] {
  let cached = messagePendingCache.get(message);
  if (!cached) {
    cached = collectMessageToolCalls(message)
      .filter((toolCall) => toolCall.status === "awaiting_approval")
      .map((toolCall) => ({ messageId: message.id, toolCall }));
    messagePendingCache.set(message, cached);
  }
  return cached;
}

function collectChatPending(chatId: string, messages: Message[]): PendingApproval[] {
  const cached = chatPendingCache.get(chatId);
  if (cached && cached.src === messages) return cached.result;
  const result = messages.flatMap((message) =>
    collectMessagePending(message).map((entry) => ({
      chatId,
      messageId: entry.messageId,
      toolCall: entry.toolCall,
    })),
  );
  if (chatPendingCache.size > CHAT_CACHE_LIMIT) chatPendingCache.clear();
  chatPendingCache.set(chatId, { src: messages, result });
  return result;
}

export function collectPendingApprovals(
  sessionMessages: Record<string, Message[]>,
): PendingApproval[] {
  if (sessionMessages === lastInput) return lastResult;
  const pending: PendingApproval[] = [];
  const seen = new Set<string>();
  for (const [chatId, messages] of Object.entries(sessionMessages)) {
    for (const approval of collectChatPending(chatId, messages)) {
      if (seen.has(approval.toolCall.id)) continue;
      seen.add(approval.toolCall.id);
      pending.push(approval);
    }
  }
  lastInput = sessionMessages;
  if (pending.length === lastResult.length && pending.every((item, i) => item === lastResult[i])) {
    // Same content as the previous call: keep the old array reference so
    // selector subscribers treat this as unchanged.
    return lastResult;
  }
  lastResult = pending;
  return pending;
}

export function countPendingApprovals(sessionMessages: Record<string, Message[]>): number {
  return collectPendingApprovals(sessionMessages).length;
}
