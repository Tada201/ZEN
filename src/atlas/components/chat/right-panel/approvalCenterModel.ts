import type { Message, ToolCall } from "../types";
import { collectMessageToolCalls } from "../messageToolCallModel";

export interface PendingApproval {
  chatId: string;
  messageId: string;
  toolCall: ToolCall;
}

export function collectPendingApprovals(
  sessionMessages: Record<string, Message[]>,
): PendingApproval[] {
  const pending: PendingApproval[] = [];
  const seen = new Set<string>();

  for (const [chatId, messages] of Object.entries(sessionMessages)) {
    for (const message of messages) {
      for (const toolCall of collectMessageToolCalls(message)) {
        if (toolCall.status !== "awaiting_approval" || seen.has(toolCall.id)) continue;
        seen.add(toolCall.id);
        pending.push({ chatId, messageId: message.id, toolCall });
      }
    }
  }

  return pending;
}

export function countPendingApprovals(sessionMessages: Record<string, Message[]>): number {
  return collectPendingApprovals(sessionMessages).length;
}
