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
