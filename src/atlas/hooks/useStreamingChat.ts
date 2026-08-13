import { useCallback, useRef } from "react";
import { chatApi } from "@/api";
import { toast } from "sonner";
import { Message } from "../components/chat/types";

import { useChatStore } from "@/lib/stores/useChatStore";
import { clearHeartbeatTimeout } from "./stream/useStreamHeartbeat";

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
  const controlRequestRef = useRef(0);
  const isStreaming = useChatStore(
    useShallow(state => state.streamingChats[chatId ?? ''] ?? false)
  );

  const abortStream = useCallback(async () => {
    if (!chatId) return;
    const requestId = ++controlRequestRef.current;
    try {
      const accepted = await chatApi.abortChat(chatId);
      if (requestId !== controlRequestRef.current) return;
      if (!accepted) {
        toast.info("That response has already finished.");
        return;
      }
    } catch (e) {
      // Do not mark the visible run as cancelled when the backend did not
      // accept the stop request. The runner may still be executing, and the
      // next terminal event must remain authoritative.
      console.warn("Failed to abort chat:", e);
      toast.error("Could not stop the response. It may still be running.");
      return;
    }
    if (requestId !== controlRequestRef.current) return;
    // Clear streaming flag immediately for responsive UI. The backend's
    // terminal event remains idempotent and will reconcile the durable trace.
    if (chatId) {
      // Cancel any pending heartbeat timer so it doesn't overwrite
      // the "cancelled" status with a failure message.
      clearHeartbeatTimeout(chatId);
      useChatStore.getState().setStreamingForChat(chatId, false);
      useChatStore.getState().setActiveAssistantForChat(chatId, null);
      useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
        for (let i = prev.length - 1; i >= 0; i--) {
          const message = prev[i];
          if (message.role === "assistant" && (message.status === "sending" || message.status === "paused")) {
            const next = [...prev];
            next[i] = {
              ...message,
              status: "cancelled",
              isThinking: false,
              error: message.content?.trim() ? undefined : "Response stopped.",
            };
            return next;
          }
        }
        return prev;
      });
    }
  }, [chatId]);

  const pauseStream = useCallback(async () => {
    if (!chatId) return;
    const requestId = ++controlRequestRef.current;
    try {
      const accepted = await chatApi.pauseChat(chatId);
      if (requestId !== controlRequestRef.current) return;
      if (!accepted) {
        toast.info("That response is no longer running.");
        return;
      }
      useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (next[i].role === "assistant" && next[i].status === "sending") {
            next[i] = { ...next[i], status: "paused", isThinking: false };
            break;
          }
        }
        return next;
      });
    } catch (e) {
      if (requestId === controlRequestRef.current) {
        console.warn("Failed to pause chat:", e);
        toast.error("Could not pause the response. It is still running.");
      }
    }
  }, [chatId]);

  const resumeStream = useCallback(async () => {
    if (!chatId) return;
    const requestId = ++controlRequestRef.current;
    try {
      const accepted = await chatApi.continueChat(chatId);
      if (requestId !== controlRequestRef.current) return;
      if (!accepted) {
        toast.info("That response is no longer paused.");
        return;
      }
      useChatStore.getState().setStreamingForChat(chatId, true);
      useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (next[i].role === "assistant" && next[i].status === "paused") {
            next[i] = { ...next[i], status: "sending", error: undefined };
            break;
          }
        }
        return next;
      });
    } catch (e) {
      if (requestId === controlRequestRef.current) {
        console.warn("Failed to resume chat:", e);
        toast.error("Could not resume the response. Try again.");
      }
    }
  }, [chatId]);

  return { isStreaming, abortStream, pauseStream, resumeStream };
}
