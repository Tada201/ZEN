import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useChatStore } from "@/lib/stores/useChatStore";
import { Message } from "../../components/chat/types";
import { findWritableAssistantIndex, markMessageAsFailed } from "./messageTarget";

const STREAM_HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

// Module-level map so abortStream in useStreamingChat can clear timers
// without needing to share a hook instance with useStreamHeartbeat.
const heartbeatTimeouts: Record<string, NodeJS.Timeout> = {};

/** Clear any pending heartbeat timer for a given chat. */
export function clearHeartbeatTimeout(chatId: string): void {
  if (heartbeatTimeouts[chatId]) {
    clearTimeout(heartbeatTimeouts[chatId]);
    delete heartbeatTimeouts[chatId];
  }
}

export function useStreamHeartbeat() {
  const resetHeartbeatTimeout = useCallback((chatId: string) => {
    clearHeartbeatTimeout(chatId);
    heartbeatTimeouts[chatId] = setTimeout(() => {
        console.warn(`[useStreamHeartbeat] Heartbeat timed out for chat: ${chatId}`);
        
        useChatStore.getState().setStreamingForChat(chatId, false);
        useChatStore.getState().setActiveAssistantForChat(chatId, null);
        
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const assistantIdx = findWritableAssistantIndex(prev, chatId);
          if (assistantIdx === -1) return prev;
          const assistant = prev[assistantIdx];
          // Guard terminal states — including "cancelled" so an abort
          // is never overwritten by the heartbeat timeout.
          if (assistant.status === "sent" || assistant.status === "failed" || assistant.status === "cancelled") return prev;

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

        delete heartbeatTimeouts[chatId];
      }, STREAM_HEARTBEAT_TIMEOUT_MS);
  }, [clearHeartbeatTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.keys(heartbeatTimeouts).forEach(chatId => {
        clearHeartbeatTimeout(chatId);
      });
    };
  }, []);

  return { resetHeartbeatTimeout, clearHeartbeatTimeout };
}
