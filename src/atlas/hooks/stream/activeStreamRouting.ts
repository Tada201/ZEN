export type ActiveStreamState = {
  activeSessionId?: string | null;
  streamingChats?: Record<string, boolean>;
};

type ChatIdPayload = {
  chat_id?: string | null;
  chatId?: string | null;
};

export function getActiveStreamingChatId(state: ActiveStreamState): string | undefined {
  const streamingChats = state.streamingChats || {};
  const activeSessionId = state.activeSessionId;

  if (activeSessionId && streamingChats[activeSessionId]) {
    return activeSessionId;
  }

  const streamingIds = Object.entries(streamingChats)
    .filter(([, isStreaming]) => isStreaming)
    .map(([chatId]) => chatId);

  return streamingIds.length === 1 ? streamingIds[0] : undefined;
}

export function getDirectOrActiveStreamingChatId(
  state: ActiveStreamState,
  payload: ChatIdPayload,
): string | undefined {
  return payload.chat_id || payload.chatId || getActiveStreamingChatId(state);
}
