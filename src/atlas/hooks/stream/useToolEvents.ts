import { useEffect, useRef } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useChatStore } from "@/lib/stores/useChatStore";
import { Message, ToolCall } from "../../components/chat/types";

interface UseToolEventsProps {
  resetHeartbeatTimeout: (chatId: string) => void;
}

export function useToolEvents({ resetHeartbeatTimeout }: UseToolEventsProps) {
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    const setupListeners = async () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];

      const unlistenToolStart = await listen<any>("tool:start", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        useChatStore.getState().setStreamingForChat(chatId, true);
        resetHeartbeatTimeout(chatId);
        
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const newTool: ToolCall = {
            id: event.payload.tool_call_id,
            name: event.payload.tool_name,
            status: "running",
            input: event.payload.arguments,
            output: ""
          };

          const next = [...prev];
          next[next.length - 1] = {
            ...last,
            toolCalls: [...(last.toolCalls || []), newTool],
            steps: [...(last.steps || []), { type: "tool-call", toolCall: newTool }]
          };
          return next;
        });
      });

      const unlistenToolComplete = await listen<any>("tool:complete", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        resetHeartbeatTimeout(chatId);
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const updated = { ...last };
          updated.toolCalls = (updated.toolCalls || []).map(tc =>
            tc.id === event.payload.tool_call_id
              ? {
                  ...tc,
                  status: event.payload.status === "success" ? "completed" : "error" as any,
                  output: event.payload.output
                }
              : tc
          );

          if (updated.steps) {
            updated.steps = updated.steps.map(s =>
              (s.type === "tool-call" && s.toolCall?.id === event.payload.tool_call_id)
                ? {
                    ...s,
                    toolCall: {
                      ...s.toolCall!,
                      status: event.payload.status === "success" ? "completed" : "error" as any,
                      output: event.payload.output
                    }
                  }
                : s
            );
          }

          const next = [...prev];
          next[next.length - 1] = updated;
          return next;
        });
      });

      unlistenRefs.current.push(unlistenToolStart, unlistenToolComplete);
    };

    setupListeners();

    return () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];
    };
  }, [resetHeartbeatTimeout]);
}
