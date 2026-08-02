import type { Message, ToolCall } from "./types";

/**
 * Returns the canonical tool-call projection for one message. Persisted
 * timelines can contain a tool in both `toolCalls` and `steps`; retain the
 * richer message-level entry and add only step-only calls.
 */
export function collectMessageToolCalls(message: Message): ToolCall[] {
  const calls: ToolCall[] = [];
  const seenIds = new Set<string>();

  for (const toolCall of message.toolCalls ?? []) {
    if (seenIds.has(toolCall.id)) continue;
    calls.push(toolCall);
    seenIds.add(toolCall.id);
  }

  for (const step of message.steps ?? []) {
    const toolCall = step.type === "tool-call" ? step.toolCall : undefined;
    if (!toolCall || seenIds.has(toolCall.id)) continue;
    calls.push(toolCall);
    seenIds.add(toolCall.id);
  }

  return calls;
}
