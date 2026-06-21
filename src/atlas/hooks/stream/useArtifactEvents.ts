import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listenAppEvent } from "@/api/events";
import { useChatStore } from "@/lib/stores/useChatStore";
import { Message } from "../../components/chat/types";
import { findWritableAssistantIndex } from "./messageTarget";
import { applyArtifactDeltaToMessages, applyArtifactStartToMessages } from "./artifactStreamBuffer";

interface UseArtifactEventsProps {
  resetHeartbeatTimeout: (chatId: string) => void;
}

export function useArtifactEvents({ resetHeartbeatTimeout }: UseArtifactEventsProps) {
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const deltaBuffersRef = useRef<Record<string, string>>({});
  const deltaRafRef = useRef<number | null>(null);

  const flushArtifactDeltas = () => {
    const buffers = deltaBuffersRef.current;
    const chatIds = Object.keys(buffers);
    deltaRafRef.current = null;
    if (chatIds.length === 0) return;

    const { setSessionMessages } = useChatStore.getState();
    for (const chatId of chatIds) {
      const delta = buffers[chatId];
      delete buffers[chatId];
      if (!delta) continue;
      setSessionMessages(chatId, (prev: Message[]) => applyArtifactDeltaToMessages(prev, delta, chatId));
    }
  };

  useEffect(() => {
    const setupListeners = async () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];

      const unlistenArtifactStart = await listenAppEvent("artifact:start", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        resetHeartbeatTimeout(chatId);
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) =>
          applyArtifactStartToMessages(prev, {
            type: event.payload.artifact_type,
            title: event.payload.title,
            language: event.payload.language,
            content: ""
          }, chatId)
        );
      });

      const unlistenArtifactDelta = await listenAppEvent("artifact:delta", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        resetHeartbeatTimeout(chatId);
        const delta = event.payload.delta || "";
        if (!delta) return;
        deltaBuffersRef.current[chatId] = `${deltaBuffersRef.current[chatId] || ""}${delta}`;
        if (!deltaRafRef.current) {
          deltaRafRef.current = requestAnimationFrame(flushArtifactDeltas);
        }
      });

      const unlistenArtifactComplete = await listenAppEvent("artifact:complete", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        resetHeartbeatTimeout(chatId);
        const pending = deltaBuffersRef.current[chatId];
        if (pending) {
          delete deltaBuffersRef.current[chatId];
          useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => applyArtifactDeltaToMessages(prev, pending, chatId));
        }
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const assistantIdx = findWritableAssistantIndex(prev, chatId);
          if (assistantIdx === -1 || !prev[assistantIdx].artifact) return prev;

          const next = [...prev];
          next[assistantIdx] = { ...prev[assistantIdx] };
          return next;
        });
      });

      unlistenRefs.current.push(unlistenArtifactStart, unlistenArtifactDelta, unlistenArtifactComplete);
    };

    setupListeners();

    return () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];
      if (deltaRafRef.current) {
        cancelAnimationFrame(deltaRafRef.current);
        deltaRafRef.current = null;
      }
      flushArtifactDeltas();
    };
  }, [resetHeartbeatTimeout]);
}
