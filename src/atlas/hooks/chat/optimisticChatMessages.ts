import type { Attachment, Message } from "../../components/chat/types";
import { createLocalFirstFeedbackStep } from "./localFirstFeedback";

export function createOptimisticChatMessages({
  sessionId,
  content,
  model,
  provider,
  deepResearch,
  generativeUI,
  tools,
  attachments = [],
  now = Date.now(),
}: {
  sessionId: string;
  content: string;
  model: string;
  provider: string;
  deepResearch?: boolean;
  generativeUI?: boolean;
  tools?: string[];
  attachments?: Attachment[];
  now?: number;
}): { userMessage: Message; assistantMessage: Message } {
  const userMessage: Message = {
    id: `temp-user-${now}`,
    sessionId,
    role: "user",
    content,
    createdAt: now,
    status: "sent",
    model,
    provider,
    steps: [],
    toolCalls: [],
    attachments,
    artifact: null,
  };

  const assistantMessage: Message = {
    id: `temp-assistant-${now}`,
    sessionId,
    role: "assistant",
    content: "",
    createdAt: now,
    status: "sending",
    model,
    provider,
    kind: deepResearch ? "deep_research" : undefined,
    steps: [
      createLocalFirstFeedbackStep({
        provider,
        model,
        tools,
        generativeUI,
        deepResearch,
        timestamp: now,
      }),
    ],
    toolCalls: [],
    attachments: [],
    artifact: null,
  };

  return { userMessage, assistantMessage };
}
