import { useEffect, useRef, useCallback } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/lib/stores/useChatStore";
import { Message, Step } from "../../components/chat/types";
import { ttftMark } from "@/lib/ttft";

interface UseChatChunkEventProps {
  resetHeartbeatTimeout: (chatId: string) => void;
  clearHeartbeatTimeout: (chatId: string) => void;
}

interface ChunkBuffer {
  delta: string;
  type: string; // "text" | "thought"
}

function applyBufferedDelta(message: Message, delta: string, chunkType: string, options?: { isThinking?: boolean }): Message {
  const prevSteps: Step[] = message.steps || [];

  if (chunkType === "thought") {
    const lastStepIdx = prevSteps.length - 1;
    const lastStep = prevSteps[lastStepIdx];
    const steps = lastStep && lastStep.type === "reasoning"
      ? prevSteps.map((s, i) => i === lastStepIdx ? { ...s, content: (s.content || "") + delta } : s)
      : [...prevSteps, { type: "reasoning" as const, content: delta }];

    return {
      ...message,
      reasoning: (message.reasoning || "") + delta,
      isThinking: options?.isThinking ?? true,
      steps,
    };
  }

  const lastStepIdx = prevSteps.length - 1;
  const lastStep = prevSteps[lastStepIdx];
  const steps = lastStep && lastStep.type === "text"
    ? prevSteps.map((s, i) => i === lastStepIdx ? { ...s, content: (s.content || "") + delta } : s)
    : [...prevSteps, { type: "text" as const, content: delta }];

  return {
    ...message,
    content: message.content + delta,
    ...(options?.isThinking === undefined ? {} : { isThinking: options.isThinking }),
    steps,
  };
}

function replaceTextStepsWithContent(message: Message, content: string): Message {
  const steps = message.steps || [];
  const firstTextIndex = steps.findIndex((step) => step.type === "text");
  const hasExecutionTimeline = steps.some((step) => step.type !== "text" && step.type !== "reasoning");

  if (hasExecutionTimeline && firstTextIndex !== -1) {
    const updatedSteps = steps.map((step, i) =>
      i === firstTextIndex ? { ...step, content } : step
    );
    return { ...message, content, steps: updatedSteps };
  }

  const withoutTextSteps = steps.filter((step) => step.type !== "text");

  if (!content) {
    return { ...message, content, steps: withoutTextSteps };
  }

  const textStep: Step = { type: "text", content };
  if (firstTextIndex === -1) {
    return { ...message, content, steps: [...steps, textStep] };
  }

  const nextSteps = [...withoutTextSteps];
  nextSteps.splice(Math.min(firstTextIndex, nextSteps.length), 0, textStep);
  return { ...message, content, steps: nextSteps };
}

function applyBufferedDeltaToChat(chatId: string, delta: string, chunkType: string, options?: { isThinking?: boolean }) {
  useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
    const last = prev[prev.length - 1];
    if (!last || last.role !== "assistant") return prev;

    const next = [...prev];
    next[next.length - 1] = applyBufferedDelta(last, delta, chunkType, options);
    return next;
  });
}

export function useChatChunkEvent({ resetHeartbeatTimeout, clearHeartbeatTimeout }: UseChatChunkEventProps) {
  const queryClient = useQueryClient();
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const chunkBuffersRef = useRef<Record<string, ChunkBuffer>>({});
  const chunkRafRef = useRef<number | null>(null);
  const firstChunkDeltas = useRef<Record<string, ChunkBuffer>>({});
  const firstStreamChunkSent = useRef<Set<string>>(new Set());
  const firstTextChunkSent = useRef<Set<string>>(new Set());

  const flushAllChunkBuffers = useCallback(() => {
    const buffers = chunkBuffersRef.current;
    const chatIds = Object.keys(buffers);
    chunkRafRef.current = null;

    if (chatIds.length === 0) return;

    const { setSessionMessages } = useChatStore.getState();

    for (const chatId of chatIds) {
      const buf = buffers[chatId];
      if (!buf.delta) continue;

      // Strip the already-handled first-chunk prefix so the delta
      // is not rendered twice when chat:chunk:first already flushed it.
      const prefix = firstChunkDeltas.current[chatId];
      if (prefix && buf.type === prefix.type && buf.delta.startsWith(prefix.delta)) {
        buf.delta = buf.delta.slice(prefix.delta.length);
        delete firstChunkDeltas.current[chatId];
      }
      if (!buf.delta) {
        delete buffers[chatId];
        continue;
      }

      const delta = buf.delta;
      const chunkType = buf.type;
      delete buffers[chatId];

      setSessionMessages(chatId, (prev: Message[]) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;

        const next = [...prev];
        next[next.length - 1] = applyBufferedDelta(last, delta, chunkType);
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
        if (firstTextChunkSent.current.has(chatId)) {
          firstChunkDeltas.current[chatId] = { delta, type: "text" };
          return;
        }
        firstStreamChunkSent.current.add(chatId);
        firstTextChunkSent.current.add(chatId);

        useChatStore.getState().setStreamingForChat(chatId, true);
        resetHeartbeatTimeout(chatId);

        const existing = chunkBuffersRef.current[chatId];
        if (existing && existing.type !== "text" && existing.delta) {
          applyBufferedDeltaToChat(chatId, existing.delta, existing.type);
          delete chunkBuffersRef.current[chatId];
        }

        firstChunkDeltas.current[chatId] = { delta, type: "text" };

        // Immediately merge the first delta into chat state — no buffering
        applyBufferedDeltaToChat(chatId, delta, "text");

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

        const incomingType: string = event.payload.type || "text";
        const delta: string = event.payload.delta || "";

        const isFirstChunk = !chunkBuffersRef.current[chatId];
        const existing = chunkBuffersRef.current[chatId];
        
        // If the incoming chunk type differs from what's already buffered,
        // flush the old buffer first so text/thought boundaries are clean.
        if (existing && existing.type !== incomingType && existing.delta) {
          const oldDelta = existing.delta;
          const oldType = existing.type;
          delete chunkBuffersRef.current[chatId];

          applyBufferedDeltaToChat(chatId, oldDelta, oldType);
        }

        // Accumulate into buffer
        chunkBuffersRef.current[chatId] = {
          delta: ((existing?.delta) || "") + delta,
          type: incomingType,
        };

        if (isFirstChunk) {
          firstStreamChunkSent.current.add(chatId);
          if (incomingType === "text") {
            firstTextChunkSent.current.add(chatId);
          }
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

        const buf = chunkBuffersRef.current[chatId];
        let finalDelta = buf?.delta || "";

        // Strip the already-handled first-chunk prefix if present
        const prefix = firstChunkDeltas.current[chatId];
        if (prefix && buf?.type === prefix.type && finalDelta.startsWith(prefix.delta)) {
          finalDelta = finalDelta.slice(prefix.delta.length);
        }
        delete chunkBuffersRef.current[chatId];
        delete firstChunkDeltas.current[chatId];
        firstStreamChunkSent.current.delete(chatId);
        firstTextChunkSent.current.delete(chatId);

        if (finalDelta) {
          applyBufferedDeltaToChat(chatId, finalDelta, buf?.type || "text", { isThinking: false });
        } else {
          // No pending text, but still clear the thinking flag
          useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== "assistant") return prev;

            const next = [...prev];
            next[next.length - 1] = { ...last, isThinking: false };
            return next;
          });
        }

        useChatStore.getState().setStreamingForChat(chatId, false);

        const reason: string = event.payload.reason || "complete";
        const isCancelled = reason === "cancelled";

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;

          const finalContent = isCancelled && event.payload.content
            ? last.content
            : (event.payload.content || last.content);
          const finalized = event.payload.content && !isCancelled
            ? replaceTextStepsWithContent(last, finalContent)
            : { ...last, content: finalContent };

          const next = [...prev];
          next[next.length - 1] = {
            ...finalized,
            status: isCancelled ? "cancelled" : "sent",
            isThinking: false,
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
        firstStreamChunkSent.current.delete(chatId);
        firstTextChunkSent.current.delete(chatId);
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
