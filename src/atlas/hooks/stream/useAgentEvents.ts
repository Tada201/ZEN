import { useEffect, useRef } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useChatStore } from "@/lib/stores/useChatStore";
import { Message } from "../../components/chat/types";
import { toast } from "@/lib/hooks/use-toast";

export function useAgentEvents() {
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    const setupListeners = async () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];

      const unlistenChatMessage = await listen<any>("chat:message", (event) => {
        const payload = event.payload as {
          chat_id: string;
          id: string;
          timestamp: string;
          role: "user" | "assistant" | "system" | "tool";
          kind?: string;
          content: string;
          metadata?: any;
        };
        const chatId = payload.chat_id;
        if (!chatId) return;

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          if (prev.some((m) => m.id === payload.id)) {
            return prev;
          }

          const newMessage: Message = {
            id: payload.id,
            sessionId: chatId,
            role: payload.role,
            content: payload.content || "",
            kind: payload.kind as any,
            status: "sent",
            createdAt: payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now(),
            metadata: payload.metadata,
          };

          return [...prev, newMessage];
        });
      });

      const unlistenContextDrift = await listen<any>("chat:context-drift", (event) => {
        const chatId = event.payload.chat_id;
        const activeChatId = useChatStore.getState().activeSessionId;
        if (chatId === activeChatId) {
          toast({
            title: "Context Drift Detected",
            description: `The conversation topic has drifted (Similarity: ${(event.payload.similarity * 100).toFixed(0)}%). Consider resetting topic or compacting history.`,
          });
        }
      });

      const unlistenResearchStep = await listen<any>("chat:research-step", (event) => {
        const payload = event.payload as {
          chat_id: string;
          message_id: string;
          text: string;
          status: "pending" | "running" | "completed" | "error";
        };
        const chatId = payload.chat_id;
        if (!chatId) return;

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const next = [...prev];
          let lastIdx = -1;
          for (let i = next.length - 1; i >= 0; i--) {
            const m = next[i];
            if (m.id === payload.message_id || m.status === "sending") {
              lastIdx = i;
              break;
            }
          }
          if (lastIdx !== -1) {
            const msg = next[lastIdx];
            const meta = msg.metadata || {};
            const prevSteps = meta.researchSteps || [];
            
            const existingIdx = prevSteps.findIndex((s: any) => s.text === payload.text);
            const steps = existingIdx !== -1
              ? prevSteps.map((s, i) => i === existingIdx ? { ...s, status: payload.status } : s)
              : [...prevSteps, { text: payload.text, status: payload.status }];
            
            next[lastIdx] = { ...msg, metadata: { ...meta, researchSteps: steps } };
          }
          return next;
        });
      });

      unlistenRefs.current.push(unlistenChatMessage, unlistenContextDrift, unlistenResearchStep);
    };

    setupListeners();

    return () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];
    };
  }, []);
}
