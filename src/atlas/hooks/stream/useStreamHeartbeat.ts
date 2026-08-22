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

function toolIsActive(status?: string): boolean {
  return status === "running" || status === "awaiting_approval" || status === "pending";
}

/** True while any tool on the assistant turn is legitimately in flight —
 *  a multi-minute command, a deep-research wait, or a tool parked on
 *  approval. Silence during tool work is not a dead connection. */
function hasActiveToolWork(assistant: Message): boolean {
  if (assistant.toolCalls?.some((tc) => toolIsActive(tc.status))) return true;
  return (
    assistant.steps?.some(
      (step) =>
        step.type === "tool-call" &&
        (toolIsActive(step.status) || toolIsActive(step.toolCall?.status)),
    ) ?? false
  );
}

export function useStreamHeartbeat() {
  const resetHeartbeatTimeout = useCallback((chatId: string) => {
    clearHeartbeatTimeout(chatId);
    const arm = () => {
      heartbeatTimeouts[chatId] = setTimeout(() => {
        const store = useChatStore.getState();
        const messages = store.sessionMessages[chatId] ?? [];
        const assistantIdx = findWritableAssistantIndex(messages, chatId);
        const assistant = assistantIdx >= 0 ? messages[assistantIdx] : undefined;

        // Rescue: an executing or approval-parked tool produces no chunks by
        // design. Reschedule instead of failing the turn mid-work; the tool's
        // own terminal event re-arms or clears the heartbeat.
        if (assistant && hasActiveToolWork(assistant)) {
          arm();
          return;
        }

        console.warn(`[useStreamHeartbeat] Heartbeat timed out for chat: ${chatId}`);

        store.setStreamingForChat(chatId, false);
        store.setActiveAssistantForChat(chatId, null);

        store.setSessionMessages(chatId, (prev: Message[]) => {
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
    };
    arm();
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
