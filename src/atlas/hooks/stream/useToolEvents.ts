import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listenAppEvent } from "@/api/events";
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

      const unlistenToolStart = await listenAppEvent("tool:start", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        useChatStore.getState().setStreamingForChat(chatId, true);
        resetHeartbeatTimeout(chatId);
        
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const existingMessageIdx = prev.findIndex((message) =>
            message.toolCalls?.some((tc) => tc.id === event.payload.tool_call_id) ||
            message.steps?.some((step) => step.type === "tool-call" && step.toolCall?.id === event.payload.tool_call_id)
          );
          if (existingMessageIdx !== -1) return prev;

          let targetIdx = -1;
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === "assistant" && prev[i].status === "sending") {
              targetIdx = i;
              break;
            }
          }
          const newTool: ToolCall = {
            id: event.payload.tool_call_id,
            name: event.payload.tool_name,
            status: "running",
            input: event.payload.arguments,
            output: "",
            startTime: Date.now(),
            attempts: [{
              status: "running",
              timestamp: Date.now(),
            }],
          };

          if (targetIdx === -1) {
            return [
              ...prev,
              {
                id: `tool-ledger-${event.payload.tool_call_id}`,
                sessionId: chatId,
                role: "system",
                content: "",
                status: "sent",
                kind: "system",
                createdAt: Date.now(),
                toolCalls: [newTool],
                steps: [{ type: "tool-call", toolCall: newTool }],
              } as Message,
            ];
          }
          const target = prev[targetIdx];

          const next = [...prev];
          next[targetIdx] = {
            ...target,
            toolCalls: [...(target.toolCalls || []), newTool],
            steps: [...(target.steps || []), { type: "tool-call", toolCall: newTool }]
          };
          return next;
        });
      });

      const unlistenToolComplete = await listenAppEvent("tool:complete", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        resetHeartbeatTimeout(chatId);
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          let targetIdx = -1;
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].toolCalls?.some(tc => tc.id === event.payload.tool_call_id) || prev[i].steps?.some(s => s.type === "tool-call" && s.toolCall?.id === event.payload.tool_call_id)) {
              targetIdx = i;
              break;
            }
          }
          if (targetIdx === -1) return prev;
          const target = prev[targetIdx];

          const updated = { ...target };
          const toolStatus: ToolCall["status"] = event.payload.status === "success" ? "completed" : "error";
          updated.toolCalls = (updated.toolCalls || []).map(tc =>
            tc.id === event.payload.tool_call_id
              ? {
                  ...tc,
                  status: toolStatus,
                  output: event.payload.output,
                  durationMs: event.payload.duration_ms,
                  attempts: [
                    ...(tc.attempts || []),
                    {
                      status: toolStatus,
                      durationMs: event.payload.duration_ms,
                      timestamp: Date.now(),
                    },
                  ],
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
                      status: toolStatus,
                      output: event.payload.output,
                      durationMs: event.payload.duration_ms,
                      attempts: [
                        ...(s.toolCall!.attempts || []),
                        {
                          status: toolStatus,
                          durationMs: event.payload.duration_ms,
                          timestamp: Date.now(),
                        },
                      ],
                    }
                  }
                : s
            );
          }

          const next = [...prev];
          next[targetIdx] = updated;
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
