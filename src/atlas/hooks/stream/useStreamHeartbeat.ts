import { useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useChatStore } from "@/lib/stores/useChatStore";
import { Message } from "../../components/chat/types";
import { findWritableAssistantIndex, markMessageAsFailed } from "./messageTarget";

const STREAM_HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

export function useStreamHeartbeat() {
  const heartbeatTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  const clearHeartbeatTimeout = useCallback((chatId: string) => {
    if (heartbeatTimeoutsRef.current[chatId]) {
      clearTimeout(heartbeatTimeoutsRef.current[chatId]);
      delete heartbeatTimeoutsRef.current[chatId];
    }
  }, []);

  const resetHeartbeatTimeout = useCallback((chatId: string) => {
    clearHeartbeatTimeout(chatId);

    heartbeatTimeoutsRef.current[chatId] = setTimeout(() => {
      console.warn(`[useStreamHeartbeat] Heartbeat timed out for chat: ${chatId}`);
      
      useChatStore.getState().setStreamingForChat(chatId, false);
      
      useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
        const assistantIdx = findWritableAssistantIndex(prev);
        if (assistantIdx === -1) return prev;
        const assistant = prev[assistantIdx];
        if (assistant.status === "sent" || assistant.status === "failed") return prev;

        const next = [...prev];
        next[assistantIdx] = markMessageAsFailed(
          assistant,
          "Connection interrupted. No response from model for 5 minutes."
        );
        toast.error("Connection interrupted — no response from model for 5 minutes.", {
          id: `heartbeat-${chatId}`,
        });
        return next;
      });

      delete heartbeatTimeoutsRef.current[chatId];
    }, STREAM_HEARTBEAT_TIMEOUT_MS);
  }, [clearHeartbeatTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.keys(heartbeatTimeoutsRef.current).forEach(chatId => {
        clearHeartbeatTimeout(chatId);
      });
    };
  }, [clearHeartbeatTimeout]);

  return { resetHeartbeatTimeout, clearHeartbeatTimeout };
}
