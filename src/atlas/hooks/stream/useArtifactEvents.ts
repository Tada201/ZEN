import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listenAppEvent } from "@/api/events";
import { useChatStore } from "@/lib/stores/useChatStore";
import { Message } from "../../components/chat/types";

interface UseArtifactEventsProps {
  resetHeartbeatTimeout: (chatId: string) => void;
}

export function useArtifactEvents({ resetHeartbeatTimeout }: UseArtifactEventsProps) {
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    const setupListeners = async () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];

      const unlistenArtifactStart = await listenAppEvent("artifact:start", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        resetHeartbeatTimeout(chatId);
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const updated = { ...last };
          updated.artifact = {
            type: event.payload.artifact_type,
            title: event.payload.title,
            language: event.payload.language,
            content: ""
          };

          const next = [...prev];
          next[next.length - 1] = updated;
          return next;
        });
      });

      const unlistenArtifactDelta = await listenAppEvent("artifact:delta", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        resetHeartbeatTimeout(chatId);
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant" || !last.artifact) return prev;

          const updated = { ...last };
          updated.artifact = {
            ...last.artifact,
            content: last.artifact.content + event.payload.delta
          };

          const next = [...prev];
          next[next.length - 1] = updated;
          return next;
        });
      });

      const unlistenArtifactComplete = await listenAppEvent("artifact:complete", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        resetHeartbeatTimeout(chatId);
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant" || !last.artifact) return prev;

          const next = [...prev];
          next[next.length - 1] = { ...last };
          return next;
        });
      });

      unlistenRefs.current.push(unlistenArtifactStart, unlistenArtifactDelta, unlistenArtifactComplete);
    };

    setupListeners();

    return () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];
    };
  }, [resetHeartbeatTimeout]);
}
