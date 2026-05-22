import { useCallback, useRef, useEffect } from "react";
import { useChatStore } from "@/lib/stores/useChatStore";
import { Message } from "../../components/chat/types";

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
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        if (last.status === "sent" || last.status === "failed") return prev;

        const next = [...prev];
        next[next.length - 1] = {
          ...last,
          status: "failed",
          error: "Connection interrupted. No response from model for 10 seconds."
        };
        return next;
      });

      delete heartbeatTimeoutsRef.current[chatId];
    }, 10000);
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
