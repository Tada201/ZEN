import { useEffect, useRef, useCallback } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/lib/stores/useChatStore";
import { Message } from "../../components/chat/types";
import { ttftMark } from "@/lib/ttft";

interface UseChatChunkEventProps {
  resetHeartbeatTimeout: (chatId: string) => void;
  clearHeartbeatTimeout: (chatId: string) => void;
}

export function useChatChunkEvent({ resetHeartbeatTimeout, clearHeartbeatTimeout }: UseChatChunkEventProps) {
  const queryClient = useQueryClient();
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const chunkBuffersRef = useRef<Record<string, string>>({});
  const chunkRafRef = useRef<number | null>(null);
  const firstChunkDeltas = useRef<Record<string, string>>({});
  const firstChunkSent = useRef<Set<string>>(new Set());

  const flushAllChunkBuffers = useCallback(() => {
    const buffers = chunkBuffersRef.current;
    const chatIds = Object.keys(buffers);
    chunkRafRef.current = null;

    if (chatIds.length === 0) return;

    const { setSessionMessages } = useChatStore.getState();

    for (const chatId of chatIds) {
      let delta = buffers[chatId];
      if (!delta) continue;

      // Strip the already-handled first-chunk prefix so the delta
      // is not rendered twice when chat:chunk:first already flushed it.
      const prefix = firstChunkDeltas.current[chatId];
      if (prefix && delta.startsWith(prefix)) {
        delta = delta.slice(prefix.length);
        delete firstChunkDeltas.current[chatId];
      }
      if (!delta) {
        delete buffers[chatId];
        continue;
      }

      delete buffers[chatId];

      setSessionMessages(chatId, (prev: Message[]) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;

        const prevSteps = last.steps || [];
        const lastStepIdx = prevSteps.length - 1;
        const lastStep = prevSteps[lastStepIdx];
        const steps = lastStep && lastStep.type === "text"
          ? prevSteps.map((s, i) => i === lastStepIdx ? { ...s, content: (s.content || "") + delta } : s)
          : [...prevSteps, { type: "text" as const, content: delta }];

        const next = [...prev];
        next[next.length - 1] = { ...last, content: last.content + delta, steps };
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const setupListeners = async () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];

      const unlistenChunkFirst = await listen<any>("chat:chunk:first", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        const delta = event.payload.delta;
        if (!delta) return;

        // Guard: if the first chat:chunk already flushed before this event
        // arrived (Tauri events across names are unordered), skip merging
        // to avoid double-rendering the first delta.
        if (firstChunkSent.current.has(chatId)) {
          firstChunkDeltas.current[chatId] = delta;
          return;
        }
        firstChunkSent.current.add(chatId);

        useChatStore.getState().setStreamingForChat(chatId, true);
        resetHeartbeatTimeout(chatId);

        firstChunkDeltas.current[chatId] = delta;

        // Immediately merge the first delta into chat state — no buffering
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const prevSteps = last.steps || [];
          const lastStepIdx = prevSteps.length - 1;
          const lastStep = prevSteps[lastStepIdx];
          const steps = lastStep && lastStep.type === "text"
            ? prevSteps.map((s, i) => i === lastStepIdx ? { ...s, content: (s.content || "") + delta } : s)
            : [...prevSteps, { type: "text" as const, content: delta }];

          const next = [...prev];
          next[next.length - 1] = { ...last, content: last.content + delta, steps };
          return next;
        });

        ttftMark(chatId, 'firstChunk');
        requestAnimationFrame(() => {
          ttftMark(chatId, 'firstRender');
        });
      });

      const unlistenChunk = await listen<any>("chat:chunk", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        useChatStore.getState().setStreamingForChat(chatId, true);
        resetHeartbeatTimeout(chatId);

        const isFirstChunk = !chunkBuffersRef.current[chatId];
        chunkBuffersRef.current[chatId] = (chunkBuffersRef.current[chatId] || "") + event.payload.delta;
        
        if (isFirstChunk) {
          firstChunkSent.current.add(chatId);
          ttftMark(chatId, 'firstChunk');
          flushAllChunkBuffers();
          
          requestAnimationFrame(() => {
            ttftMark(chatId, 'firstRender');
          });
        } else if (!chunkRafRef.current) {
          chunkRafRef.current = requestAnimationFrame(flushAllChunkBuffers);
        }
      });

      const unlistenDone = await listen<any>("chat:done", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        clearHeartbeatTimeout(chatId);

        let finalDelta = chunkBuffersRef.current[chatId];
        if (!finalDelta) finalDelta = "";

        // Strip the already-handled first-chunk prefix if present
        const prefix = firstChunkDeltas.current[chatId];
        if (prefix && finalDelta.startsWith(prefix)) {
          finalDelta = finalDelta.slice(prefix.length);
        }
        delete chunkBuffersRef.current[chatId];
        delete firstChunkDeltas.current[chatId];
        firstChunkSent.current.delete(chatId);

        if (finalDelta) {
          useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== "assistant") return prev;

            const prevSteps = last.steps || [];
            const lastStepIdx = prevSteps.length - 1;
            const lastStep = prevSteps[lastStepIdx];
            const steps = lastStep && lastStep.type === "text"
              ? prevSteps.map((s, i) => i === lastStepIdx ? { ...s, content: (s.content || "") + finalDelta } : s)
              : [...prevSteps, { type: "text" as const, content: finalDelta }];

            const next = [...prev];
            next[next.length - 1] = { ...last, content: last.content + finalDelta, steps };
            return next;
          });
        }

        useChatStore.getState().setStreamingForChat(chatId, false);

        const reason: string = event.payload.reason || "complete";
        const isCancelled = reason === "cancelled";

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const next = [...prev];
          next[next.length - 1] = {
            ...last,
            status: isCancelled ? "cancelled" : "sent",
            content: isCancelled && event.payload.content
              ? last.content
              : (event.payload.content || last.content),
          };
          return next;
        });

        queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
      });

      const unlistenError = await listen<any>("chat:error", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        clearHeartbeatTimeout(chatId);
        useChatStore.getState().setStreamingForChat(chatId, false);
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const next = [...prev];
          next[next.length - 1] = { ...last, status: "failed", error: event.payload.error };
          return next;
        });
      });

      const unlistenStreamReset = await listen<any>("chat:stream-reset", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        delete chunkBuffersRef.current[chatId];
        delete firstChunkDeltas.current[chatId];
        firstChunkSent.current.delete(chatId);
        clearHeartbeatTimeout(chatId);
        useChatStore.getState().setStreamingForChat(chatId, false);
      });

      const unlistenResearchStep = await listen<any>("chat:research-step", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const prevResearchSteps = last.metadata?.researchSteps || [];
          const existingStepIdx = prevResearchSteps.findIndex(s => s.text === event.payload.text);
          const researchSteps = existingStepIdx >= 0
            ? prevResearchSteps.map((s, i) => i === existingStepIdx ? { ...s, status: event.payload.status } : s)
            : [...prevResearchSteps, { text: event.payload.text, status: event.payload.status }];

          const next = [...prev];
          next[next.length - 1] = {
            ...last,
            metadata: { ...last.metadata, researchSteps }
          };
          return next;
        });
      });

      unlistenRefs.current.push(unlistenChunkFirst, unlistenChunk, unlistenDone, unlistenError, unlistenStreamReset, unlistenResearchStep);
    };

    setupListeners();

    return () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];
      if (chunkRafRef.current) {
        cancelAnimationFrame(chunkRafRef.current);
        chunkRafRef.current = null;
      }
      flushAllChunkBuffers();
    };
  }, [queryClient, flushAllChunkBuffers, resetHeartbeatTimeout, clearHeartbeatTimeout]);
}
