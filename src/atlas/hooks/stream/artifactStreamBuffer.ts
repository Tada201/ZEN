import type { Message } from "../../components/chat/types";
import { findWritableAssistantIndex } from "./messageTarget";

export function applyArtifactStartToMessages(
  prev: Message[],
  artifact: NonNullable<Message["artifact"]>,
  chatId?: string | null,
): Message[] {
  const assistantIdx = findWritableAssistantIndex(prev, chatId);
  if (assistantIdx === -1) return prev;

  const next = [...prev];
  next[assistantIdx] = {
    ...next[assistantIdx],
    artifact: { ...artifact, content: artifact.content || "" },
  };
  return next;
}

export function applyArtifactDeltaToMessages(prev: Message[], delta: string, chatId?: string | null): Message[] {
  if (!delta) return prev;
  const assistantIdx = findWritableAssistantIndex(prev, chatId);
  if (assistantIdx === -1) return prev;
  const assistant = prev[assistantIdx];
  if (!assistant.artifact) return prev;

  const next = [...prev];
  next[assistantIdx] = {
    ...assistant,
    artifact: {
      ...assistant.artifact,
      content: `${assistant.artifact.content || ""}${delta}`,
    },
  };
  return next;
}
