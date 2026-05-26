import { useCallback } from "react";
import { chatApi } from "@/api";
import { Message } from "../components/chat/types";

import { useChatStore } from "@/lib/stores/useChatStore";

import { useShallow } from "zustand/react/shallow";

/**
 * Thin hook for per-session streaming state.
 * 
 * All Tauri event listeners have been moved to useGlobalStreamListener
 * which lives at the App root and never unmounts. This hook now simply
 * reads the per-session streaming state from Zustand and provides
 * the abort function.
 * 
 * @param chatId - The active chat session ID
 * @param _setMessages - DEPRECATED: kept for call-site compat, no longer used
 */
export function useStreamingChat(
  chatId: string | null,
  _setMessages?: (messages: Message[] | ((prev: Message[]) => Message[])) => void
) {
  const isStreaming = useChatStore(
    useShallow(state => state.streamingChats[chatId ?? ''] ?? false)
  );

  const abortStream = useCallback(async () => {
    try {
      if (chatId) {
        await chatApi.abortChat(chatId);
      }
    } catch (e) {
      console.warn("Failed to abort chat:", e);
    }
    // Clear streaming flag immediately for responsive UI
    if (chatId) {
      useChatStore.getState().setStreamingForChat(chatId, false);
    }
  }, [chatId]);

  return { isStreaming, abortStream };
}
