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
  chunkTrackingKey,
  replaceTextStepsWithContent,
  type ChunkBuffer,
} from "./chatChunkBuffer";
import { reconcileStrayToolLedgers } from "./strayToolLedger";
import { persistExecutionCheckpointForEvent } from "./persistExecutionCheckpoint";

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
  const researchCompletionTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  const flushAllChunkBuffers = useCallback(() => {
    const buffers = chunkBuffersRef.current;
    const chatIds = Object.keys(buffers);
    chunkRafRef.current = null;

    if (chatIds.length === 0) return;

    const { setSessionMessages } = useChatStore.getState();

    for (const chatId of chatIds) {
      const buf = buffers[chatId];
      if (!buf.delta) continue;

      // Strip only a first prefix belonging to this backend stream. Never use
      // a chat-global prefix here: a late event from an older turn must not
      // alter the current assistant response.
      const trackingKey = chunkTrackingKey(chatId, buf.messageId);
      const prefix = firstChunkDeltas.current[trackingKey];
      if (prefix && buf.type === prefix.type && buf.delta.startsWith(prefix.delta)) {
        buf.delta = buf.delta.slice(prefix.delta.length);
        delete firstChunkDeltas.current[trackingKey];
      }
      if (!buf.delta) {
        delete buffers[chatId];
        continue;
      }

      const delta = buf.delta;
      const chunkType = buf.type;
      delete buffers[chatId];

      setSessionMessages(chatId, (prev: Message[]) => {
        const assistantIdx = findWritableAssistantIndex(prev, chatId, buf.messageId);
        if (assistantIdx === -1) return prev;

        const next = [...prev];
        next[assistantIdx] = applyBufferedDeltaToMessage(next[assistantIdx], delta, chunkType, {
          messageId: buf.messageId,
        });
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

        // If the normal event already applied this first delta, the delayed
        // fast-path event is duplicate metadata only. Do not save it as a
        // future prefix: that would strip unrelated text from the next turn.
        if (!markFirstChunkTypeSent(chatId, chunkType, event.payload.message_id || undefined)) {
          return;
        }

        useChatStore.getState().setStreamingForChat(chatId, true);
        resetHeartbeatTimeout(chatId);

        const existing = chunkBuffersRef.current[chatId];
        if (existing && existing.type !== chunkType && existing.delta) {
          applyBufferedDeltaToChat(chatId, existing.delta, existing.type, { messageId: existing.messageId });
          delete chunkBuffersRef.current[chatId];
        }

        const streamMessageId = event.payload.message_id || undefined;
        const trackingKey = chunkTrackingKey(chatId, streamMessageId);
        firstChunkDeltas.current[trackingKey] = {
          delta,
          type: chunkType,
          messageId: streamMessageId,
        };

        // Immediately merge the first delta into chat state — no buffering
        applyBufferedDeltaToChat(chatId, delta, chunkType, {
          isThinking: chunkType === "thought",
          messageId: event.payload.message_id || undefined,
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

        const streamMessageId = event.payload.message_id || undefined;
        const existing = chunkBuffersRef.current[chatId];
        const isFirstChunk = !existing;
        const canAppendToExisting = existing?.type === incomingType;
        
        // If the incoming chunk type differs from what's already buffered,
        // flush the old buffer first so text/thought boundaries are clean.
        if (existing && !canAppendToExisting && existing.delta) {
          const oldDelta = existing.delta;
          const oldType = existing.type;
          delete chunkBuffersRef.current[chatId];

          applyBufferedDeltaToChat(chatId, oldDelta, oldType, { messageId: existing.messageId });
        }

        // Accumulate into buffer
        chunkBuffersRef.current[chatId] = {
          delta: (canAppendToExisting ? existing.delta : "") + delta,
          type: incomingType,
          messageId: event.payload.message_id || existing?.messageId,
        };

        if (isFirstChunk) {
          markFirstChunkTypeSent(chatId, incomingType, streamMessageId);
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
        
        // Ensure any pending chunks are flushed before finalization. The
        // flush consumes and clears the buffer, so never read that buffer
        // after flushing; doing so discarded the final reasoning fragment.
        flushAllChunkBuffers();
        clearChunkTrackingForChat(chatId, chunkBuffersRef.current, firstChunkDeltas.current);

        // Clear the thinking flag after the drain. Late thought chunks are
        // routed by backend message_id and may still extend the completed
        // reasoning step without being attached to a new assistant turn.
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const assistantIdx = findWritableAssistantIndex(prev, chatId, event.payload.message_id);
          if (assistantIdx === -1) return prev;
          const next = [...prev];
          next[assistantIdx] = { ...next[assistantIdx], isThinking: false };
          return next;
        });

        const reason: string = event.payload.reason || "complete";
        const isCancelled = reason === "cancelled";
        const messagesBeforeFinalize = useChatStore.getState().sessionMessages[chatId] ?? [];
        const assistantIndexBeforeFinalize = findWritableAssistantIndex(
          messagesBeforeFinalize,
          chatId,
          event.payload.message_id,
        );
        const assistantIdBeforeFinalize = assistantIndexBeforeFinalize >= 0
          ? messagesBeforeFinalize[assistantIndexBeforeFinalize]?.id
          : undefined;

        // Track whether streaming should stop after message finalization.
        // For deep_research handoff (no content yet), keep streaming alive
        // so the UI does not render "interrupted" during the 20-second
        // window that awaits chat:message with the final report.
        let shouldStopStreaming = true;

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const assistantIdx = findWritableAssistantIndex(prev, chatId, event.payload.message_id);
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
            // Deep research publishes its final report through chat:message.
            // Tauri event names are not ordered, so chat:done may arrive
            // first. Keep the placeholder live until the report event fills
            // it instead of marking an empty research card complete.
            if (assistant.content.trim()) {
              // Content already present — finalize immediately.
              next[assistantIdx] = markMessageAsFinished(assistant, isCancelled, reason);
            } else {
              // No content yet — chat:message should arrive soon to fill it.
              // Keep streaming=true so DeepResearchMessage does not render
              // "interrupted" during the handoff window. The fallback
              // timer or chat:message handler will stop streaming later.
              shouldStopStreaming = false;
              next[assistantIdx] = { ...assistant, isThinking: false };
              researchCompletionTimersRef.current[chatId] = setTimeout(() => {
                const store = useChatStore.getState();
                const msgs = store.sessionMessages[chatId];
                const idx = msgs?.findIndex((m) => m.id === assistant.id) ?? -1;
                if (idx === -1) return;
                const msg = msgs[idx];
                // If chat:message already filled content or finalized, bail.
                if (msg.status !== "sending" || msg.content.trim()) return;
                console.warn(`[chat:done] Deep research fallback timeout for chat ${chatId} — finalizing without content.`);
                store.setSessionMessages(chatId, (prev2: Message[]) => {
                  const i = prev2.findIndex((m) => m.id === assistant.id);
                  if (i === -1) return prev2;
                  const next2 = [...prev2];
                  next2[i] = markMessageAsFinished(next2[i], false, "fallback-timeout");
                  return next2;
                });
                store.setStreamingForChat(chatId, false);
                store.setActiveAssistantForChat(chatId, null);
                queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
                toast.error("Research completed but the final report was not received. Partial results may be available.");
              }, 20_000);
            }
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

        // Persist the final execution timeline so the chat UI is identical
        // before and after reload. Only persist when the backend emitted a
        // real message_id — never with the optimistic in-memory ID, which
        // would attach steps to the wrong DB row and violate the backend-ID
        // contract. Branches that cannot yet emit a real message_id (deep
        // research handoff, orchestrator, etc.) must wait until the backend
        // can provide the true persisted row ID before calling this.
        //
        // The persisted payload is a UI-only projection: raw tool arguments,
        // full output, base64 blobs, and subagent transcripts are excluded so
        // the DB row stays small and well under the 2 MB backend cap.
        const backendAssistantId = event.payload.message_id;
        if (backendAssistantId && assistantIdBeforeFinalize && backendAssistantId !== assistantIdBeforeFinalize) {
          useChatStore.getState().setSessionMessages(chatId, (prev) =>
            reconcileStrayToolLedgers(prev, assistantIdBeforeFinalize, backendAssistantId),
          );
        }
        // NOTE: The runner loop, deep_research, and orchestrator branches all
        // emit a real backend message_id in chat:done, so all three timelines
        // now persist. If a future branch cannot emit a real message_id, it
        // MUST skip persistence here rather than fabricating an optimistic ID
        // (persisting with a fake ID would attach steps to the wrong DB row).
        if (backendAssistantId) {
          persistExecutionCheckpointForEvent({ chatId, messageId: backendAssistantId, flush: true });
        }

        // Stop streaming after setSessionMessages unless we're in a
        // deep_research handoff (shouldStopStreaming === false).
        if (shouldStopStreaming) {
          useChatStore.getState().setStreamingForChat(chatId, false);
          useChatStore.getState().setActiveAssistantForChat(chatId, null);
        }

        // Skip query invalidation for deep_research — the chat:message
        // handler (in useAgentEvents.ts) updates the message in-place,
        // and we don't want the refetch to replace the live state.
        const currentMessages = useChatStore.getState().sessionMessages[chatId];
        const hasDeepResearch = currentMessages?.some((m) => m.kind === "deep_research");
        if (!hasDeepResearch) {
          queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
        } else {
          // Cancel any fallback timeout since chat:message arrived or
          // the research had content (finalized above).
          if (researchCompletionTimersRef.current[chatId]) {
            clearTimeout(researchCompletionTimersRef.current[chatId]);
            delete researchCompletionTimersRef.current[chatId];
          }
        }
        ttftReport(chatId, reason);
      });

      const unlistenChatMessage = await listenAppEvent("chat:message", (event) => {
        // When chat:message arrives for a deep_research message, cancel
        // the fallback timer — the message will be finalized properly.
        // Also stop streaming for this chat since the handoff is complete.
        const chatId = event.payload.chat_id;
        const kind = event.payload.kind;
        if (chatId && kind === "deep_research") {
          if (researchCompletionTimersRef.current[chatId]) {
            clearTimeout(researchCompletionTimersRef.current[chatId]);
            delete researchCompletionTimersRef.current[chatId];
          }
          // End the handoff — streaming was kept alive in chat:done
          // so the UI would not render "interrupted" prematurely.
          useChatStore.getState().setStreamingForChat(chatId, false);
          useChatStore.getState().setActiveAssistantForChat(chatId, null);
          queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
        }
      });

      const unlistenError = await listenAppEvent("chat:error", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;
        // Cancel any fallback timer on error
        if (researchCompletionTimersRef.current[chatId]) {
          clearTimeout(researchCompletionTimersRef.current[chatId]);
          delete researchCompletionTimersRef.current[chatId];
        }

        const activeAssistantId = useChatStore.getState().getActiveAssistantForChat(chatId);
        if (!activeAssistantId) return;

        const recoverable = event.payload.recoverable === true;
        const errorMessage = event.payload.error || "The model stream stopped before returning output.";

        clearHeartbeatTimeout(chatId);
        clearChunkTrackingForChat(chatId, chunkBuffersRef.current, firstChunkDeltas.current);
        console.error("[chat:error]", errorMessage);
        ttftReport(chatId, "error");
        let appliedToSendingAssistant = false;
        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const assistantIdx = findWritableAssistantIndex(prev, chatId);
          if (assistantIdx === -1) return prev;
          if (prev[assistantIdx].id !== activeAssistantId) return prev;
          if (prev[assistantIdx].status !== "sending") return prev;

          const next = [...prev];
          next[assistantIdx] = markMessageAsFailed(next[assistantIdx], errorMessage, recoverable);
          appliedToSendingAssistant = true;
          return next;
        });
        useChatStore.getState().setStreamingForChat(chatId, false);
        useChatStore.getState().setActiveAssistantForChat(chatId, null);
        if (appliedToSendingAssistant && !recoverable) {
          toast.error(errorMessage);
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
        unlistenChatMessage,
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
      // Clear all fallback timers on unmount
      Object.values(researchCompletionTimersRef.current).forEach(clearTimeout);
      researchCompletionTimersRef.current = {};
      flushAllChunkBuffers();
    };
  }, [queryClient, flushAllChunkBuffers, resetHeartbeatTimeout, clearHeartbeatTimeout]);
}
