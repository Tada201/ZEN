type ToolLifecyclePayload = {
  chat_id?: string | null;
  chatId?: string | null;
  tool_call_id?: string | null;
};

type ActiveStreamState = {
  activeSessionId?: string | null;
  streamingChats?: Record<string, boolean>;
};

export function rememberToolChat(
  cache: Map<string, string>,
  payload: ToolLifecyclePayload,
  chatId?: string | null,
) {
  if (!chatId || !payload.tool_call_id) return;
  cache.set(payload.tool_call_id, chatId);
}

export function getToolChatId(
  cache: Map<string, string>,
  payload: ToolLifecyclePayload,
  activeState?: ActiveStreamState,
): string | undefined {
  const direct = payload.chat_id || payload.chatId;
  if (direct) return direct;
  const cached = payload.tool_call_id ? cache.get(payload.tool_call_id) : undefined;
  if (cached) return cached;

  const streamingChats = activeState?.streamingChats || {};
  const activeSessionId = activeState?.activeSessionId;
  if (activeSessionId && streamingChats[activeSessionId]) return activeSessionId;

  const streamingIds = Object.entries(streamingChats)
    .filter(([, isStreaming]) => isStreaming)
    .map(([chatId]) => chatId);
  return streamingIds.length === 1 ? streamingIds[0] : undefined;
}
