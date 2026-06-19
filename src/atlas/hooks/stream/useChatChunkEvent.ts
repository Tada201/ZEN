import { useEffect, useRef, useCallback } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listenAppEvent } from "@/api/events";
import { useChatStore } from "@/lib/stores/useChatStore";
import { Message } from "../../components/chat/types";
import { ttftMark, ttftReport } from "@/lib/ttft";
import { findWritableAssistantIndex, markMessageAsFailed, markMessageAsFinished } from "./messageTarget";
import {
  applyBufferedDeltaToChat,
  applyBufferedDeltaToMessage,
  clearChunkTrackingForChat,
  markFirstChunkTypeSent,
  normalizeChatChunkType,
  replaceTextStepsWithContent,
  type ChunkBuffer,
} from "./chatChunkBuffer";

interface UseChatChunkEventProps {
  resetHeartbeatTimeout: (chatId: string) => void;
  clearHeartbeatTimeout: (chatId: string) => void;
}

export function useChatChunkEvent({ resetHeartbeatTimeout, clearHeartbeatTimeout }: UseChatChunkEventProps) {
  const queryClient = useQueryClient();
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const chunkBuffersRef = useRef<Record<string, ChunkBuffer>>({});
  const chunkRafRef = useRef<number | null>(null);
  const firstChunkDeltas = useRef<Record<string, ChunkBuffer>>({});

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
        const assistantIdx = findWritableAssistantIndex(prev);
        if (assistantIdx === -1) return prev;

        const next = [...prev];
        next[assistantIdx] = applyBufferedDeltaToMessage(next[assistantIdx], delta, chunkType);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    let didCancel = false;

    const setupListeners = async () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];

      const unlistenChunkFirst = await listenAppEvent("chat:chunk:first", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        const delta = event.payload.delta;
        if (!delta) return;
        const chunkType = normalizeChatChunkType(event.payload.type);

        // Guard: if the first chat:chunk already flushed before this event
        // arrived (Tauri events across names are unordered), skip merging
        // to avoid double-rendering the first delta.
        if (!markFirstChunkTypeSent(chatId, chunkType)) {
          firstChunkDeltas.current[chatId] = { delta, type: chunkType };
          return;
        }

        useChatStore.getState().setStreamingForChat(chatId, true);
        resetHeartbeatTimeout(chatId);

        const existing = chunkBuffersRef.current[chatId];
        if (existing && existing.type !== chunkType && existing.delta) {
          applyBufferedDeltaToChat(chatId, existing.delta, existing.type);
          delete chunkBuffersRef.current[chatId];
        }

        firstChunkDeltas.current[chatId] = { delta, type: chunkType };

        // Immediately merge the first delta into chat state — no buffering
        applyBufferedDeltaToChat(chatId, delta, chunkType, {
          isThinking: chunkType === "thought",
        });

        ttftMark(chatId, 'firstChunk');
        requestAnimationFrame(() => {
          ttftMark(chatId, 'firstRender');
        });
      });

      const unlistenChunk = await listenAppEvent("chat:chunk", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        useChatStore.getState().setStreamingForChat(chatId, true);
        resetHeartbeatTimeout(chatId);

        const incomingType = normalizeChatChunkType(event.payload.type);
        const delta: string = event.payload.delta || "";
        if (!delta) return;

        const existing = chunkBuffersRef.current[chatId];
        const isFirstChunk = !existing;
        const canAppendToExisting = existing?.type === incomingType;
        
        // If the incoming chunk type differs from what's already buffered,
        // flush the old buffer first so text/thought boundaries are clean.
        if (existing && !canAppendToExisting && existing.delta) {
          const oldDelta = existing.delta;
          const oldType = existing.type;
          delete chunkBuffersRef.current[chatId];

          applyBufferedDeltaToChat(chatId, oldDelta, oldType);
        }

        // Accumulate into buffer
        chunkBuffersRef.current[chatId] = {
          delta: (canAppendToExisting ? existing.delta : "") + delta,
          type: incomingType,
        };

        if (isFirstChunk) {
          markFirstChunkTypeSent(chatId, incomingType);
          ttftMark(chatId, 'firstChunk');
          flushAllChunkBuffers();

          requestAnimationFrame(() => {
            ttftMark(chatId, 'firstRender');
          });
        } else if (!chunkRafRef.current) {
          chunkRafRef.current = requestAnimationFrame(flushAllChunkBuffers);
        }
      });

      const unlistenDone = await listenAppEvent("chat:done", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        clearHeartbeatTimeout(chatId);
        
        // Ensure any pending chunks are flushed before finalization
        flushAllChunkBuffers();

        const buf = chunkBuffersRef.current[chatId];
        let finalDelta = buf?.delta || "";

        // Strip the already-handled first-chunk prefix if present
        const prefix = firstChunkDeltas.current[chatId];
        if (prefix && buf?.type === prefix.type && finalDelta.startsWith(prefix.delta)) {
          finalDelta = finalDelta.slice(prefix.delta.length);
        }
        clearChunkTrackingForChat(chatId, chunkBuffersRef.current, firstChunkDeltas.current);

        if (finalDelta) {
          applyBufferedDeltaToChat(chatId, finalDelta, buf?.type || "text", { isThinking: false });
        } else {
          // No pending text, but still clear the thinking flag
          useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
            const assistantIdx = findWritableAssistantIndex(prev);
            if (assistantIdx === -1) return prev;

            const next = [...prev];
            next[assistantIdx] = { ...next[assistantIdx], isThinking: false };
            return next;
          });
        }

        useChatStore.getState().setStreamingForChat(chatId, false);

        const reason: string = event.payload.reason || "complete";
        const isCancelled = reason === "cancelled";

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const assistantIdx = findWritableAssistantIndex(prev);
          if (assistantIdx === -1) return prev;
          const assistant = prev[assistantIdx];

          // Guard: if already failed (chat:error fired first), don't overwrite
          if (assistant.status === "failed") return prev;

          // Guard: for deep_research messages, the final content arrives
          // via the chat:message event (not chat:done). Don't blank it
          // if we haven't received chat:message yet — let that handler
          // populate the content. Also skip query invalidation since
          // the chat:message handler will update the message in-place.
          if (assistant.kind === "deep_research") {
            const next = [...prev];
            next[assistantIdx] = markMessageAsFinished(assistant, isCancelled, reason);
            return next;
          }

          const finalContent = isCancelled && event.payload.content
            ? assistant.content
            : (event.payload.content || assistant.content);
          const finalized = event.payload.content && !isCancelled
            ? replaceTextStepsWithContent(assistant, finalContent)
            : { ...assistant, content: finalContent };

          const next = [...prev];
          next[assistantIdx] = markMessageAsFinished(finalized, isCancelled, reason);
          return next;
        });

        // Skip query invalidation for deep_research — the chat:message
        // handler (in useAgentEvents.ts) updates the message in-place,
        // and we don't want the refetch to replace the live state.
        const currentMessages = useChatStore.getState().sessionMessages[chatId];
        const hasDeepResearch = currentMessages?.some((m) => m.kind === "deep_research");
        if (!hasDeepResearch) {
          queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
        }
        ttftReport(chatId, reason);
      });

      const unlistenError = await listenAppEvent("chat:error", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        clearHeartbeatTimeout(chatId);
        clearChunkTrackingForChat(chatId, chunkBuffersRef.current, firstChunkDeltas.current);
        console.error("[chat:error]", event.payload.error);
        ttftReport(chatId, "error");
        let appliedToSendingAssistant = false;
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const assistantIdx = findWritableAssistantIndex(prev);
          if (assistantIdx === -1) return prev;
          if (prev[assistantIdx].status !== "sending") return prev;

          const next = [...prev];
          next[assistantIdx] = markMessageAsFailed(next[assistantIdx], event.payload.error || "The model stream stopped before returning output.");
          appliedToSendingAssistant = true;
          return next;
        });
        useChatStore.getState().setStreamingForChat(chatId, false);
        if (appliedToSendingAssistant) {
          toast.error(event.payload.error || "The model stream stopped before returning output.");
        }
      });

      const unlistenStreamReset = await listenAppEvent("chat:stream-reset", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        clearChunkTrackingForChat(chatId, chunkBuffersRef.current, firstChunkDeltas.current);
        clearHeartbeatTimeout(chatId);
        useChatStore.getState().setStreamingForChat(chatId, false);
      });

      const unlisteners = [
        unlistenChunkFirst,
        unlistenChunk,
        unlistenDone,
        unlistenError,
        unlistenStreamReset,
      ];

      if (didCancel) {
        unlisteners.forEach(u => u());
        return;
      }

      unlistenRefs.current.push(...unlisteners);
    };

    setupListeners();

    return () => {
      didCancel = true;
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
