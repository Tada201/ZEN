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
import { persistExecutionCheckpointForEvent, flushPendingCheckpoints } from "./persistExecutionCheckpoint";
import { createAgentRuntimeBridge } from "@/atlas/agentRuntime/runtimeBridge";
import { normalizeChatDeltaEvent, normalizeChatDoneEvent } from "@/atlas/agentRuntime/normalizeEvent";
import { mergeRuntimeTextPartsIntoSteps, type AgentTurnRecord } from "@/atlas/agentRuntime/types";
import { presentExecutionError } from "@/atlas/agentRuntime/executionError";

interface UseChatChunkEventProps {
  resetHeartbeatTimeout: (chatId: string) => void;
  clearHeartbeatTimeout: (chatId: string) => void;
}

export function useChatChunkEvent({ resetHeartbeatTimeout, clearHeartbeatTimeout }: UseChatChunkEventProps) {
  const queryClient = useQueryClient();
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const chunkBuffersRef = useRef<Record<string, ChunkBuffer>>({});
  // A single chat can have overlapping assistant turns during rapid retries;
  // keep each pending buffer namespaced by backend message id when available.
  const chunkBufferKeysRef = useRef<Record<string, string>>({});
  const chunkRafRef = useRef<number | null>(null);
  // Entries are namespaced by chat id and backend message id so concurrent
  // streams cannot consume one another's first delta.
  const firstChunkDeltas = useRef<Record<string, ChunkBuffer>>({});
  const runtimeFirstDeltasRef = useRef<Record<string, string>>({});
  // firstChunkDeltas.current[chatId] is the chat-owned namespace prefix;
  // chunkTrackingKey adds the persisted message identity within that chat.
  const researchCompletionTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const runtimeBridgeRef = useRef<ReturnType<typeof createAgentRuntimeBridge> | null>(null);

  if (runtimeBridgeRef.current === null) {
    runtimeBridgeRef.current = createAgentRuntimeBridge((record: AgentTurnRecord) => {
      const textParts = record.parts.filter((part) => part.type === "text" || part.type === "reasoning");
      if (textParts.length === 0) return;
      useChatStore.getState().setSessionMessages(record.chatId, (prev: Message[]) => {
        const assistantIdx = findWritableAssistantIndex(prev, record.chatId, record.messageId);
        if (assistantIdx === -1) return prev;
        const current = prev[assistantIdx];
        const next = [...prev];
        const text = record.parts.find((part) => part.type === "text");
        const reasoning = record.parts
          .filter((part) => part.type === "reasoning")
          .map((part) => part.visibleText)
          .join("");
        next[assistantIdx] = {
          ...current,
          content: text?.visibleText || current.content,
          reasoning: reasoning || current.reasoning,
          // Keep the canonical runtime reveal visible inside the same ordered
          // timeline as tool/action steps. Previously this callback updated
          // only message-level content/reasoning, so live thinking disappeared
          // until chat:done and finalization appended one text block after all
          // tools. Runtime-owned steps are replaced per frame while execution
          // steps remain ordered by their backend sequence.
          steps: mergeRuntimeTextPartsIntoSteps(record.parts, current.steps),
          isThinking: record.status === "running" && Boolean(reasoning),
        };
        return next;
      });
    });
  }

  const runtimeBridge = runtimeBridgeRef.current;

  const flushAllChunkBuffers = useCallback(() => {
    const buffers = chunkBuffersRef.current;
    const bufferKeys = chunkBufferKeysRef.current;
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
        delete bufferKeys[chatId];
        continue;
      }

      const delta = buf.delta;
      const chunkType = buf.type;
      delete buffers[chatId];
      delete bufferKeys[chatId];

      // Text/reasoning visibility is now owned by the canonical runtime
      // scheduler. Keep the legacy buffer only for protocol/inline-think
      // compatibility until those parts migrate; never apply the same raw
      // delta to the message a second time.
      if (runtimeBridge && (chunkType === "text" || chunkType === "thought")) continue;

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

    // A hard WebView2 close fires `pagehide` without unmounting React, so the
    // cleanup below never runs. Flush the debounced tool-timeline checkpoints
    // synchronously here so the durable ledger survives an abrupt reload/close.
    const handlePageHide = () => {
      flushAllChunkBuffers();
      flushPendingCheckpoints();
    };
    window.addEventListener("pagehide", handlePageHide);

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

        const streamMessageId = event.payload.message_id || undefined;
        const existing = chunkBuffersRef.current[chatId];
        if (existing && existing.type !== chunkType && existing.delta) {
          applyBufferedDeltaToChat(chatId, existing.delta, existing.type, { messageId: existing.messageId });
          delete chunkBuffersRef.current[chatId];
          delete chunkBufferKeysRef.current[chatId];
        }

        const trackingKey = chunkTrackingKey(chatId, streamMessageId);
        firstChunkDeltas.current[trackingKey] = {
          delta,
          type: chunkType,
          messageId: streamMessageId,
        };

        const normalized = normalizeChatDeltaEvent(
          event.payload as unknown as Record<string, unknown>,
          chunkType === "thought" ? "reasoning-delta" : "text-delta",
        );
        if (normalized) runtimeBridge?.dispatch(normalized);

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
        const bufferKey = chunkTrackingKey(chatId, streamMessageId);
        const existing = chunkBuffersRef.current[chatId];
        const existingKey = chunkBufferKeysRef.current[chatId];
        const isFirstChunk = !existing;
        const canAppendToExisting = existing?.type === incomingType && (!streamMessageId || !existingKey || existingKey === bufferKey);
        
        // If the incoming chunk type differs from what's already buffered,
        // flush the old buffer first so text/thought boundaries are clean.
        if (existing && !canAppendToExisting && existing.delta) {
          const oldDelta = existing.delta;
          const oldType = existing.type;
          delete chunkBuffersRef.current[chatId];
          delete chunkBufferKeysRef.current[chatId];

          applyBufferedDeltaToChat(chatId, oldDelta, oldType, { messageId: existing.messageId });
        }

        const normalized = normalizeChatDeltaEvent(
          event.payload as unknown as Record<string, unknown>,
          incomingType === "thought" ? "reasoning-delta" : "text-delta",
        );
        if (normalized) {
          const firstKey = chunkTrackingKey(chatId, streamMessageId);
          const firstDelta = runtimeFirstDeltasRef.current[firstKey];
          if (firstDelta !== delta) runtimeBridge?.dispatch(normalized);
        }

        // Accumulate into legacy compatibility buffer for tool-protocol and
        // inline-think parsing until those channels migrate to AgentPart.
        chunkBuffersRef.current[chatId] = {
          delta: (canAppendToExisting ? existing.delta : "") + delta,
          type: incomingType,
          messageId: event.payload.message_id || existing?.messageId,
        };
        chunkBufferKeysRef.current[chatId] = bufferKey;

        if (isFirstChunk) {
          markFirstChunkTypeSent(chatId, incomingType, streamMessageId);
          runtimeFirstDeltasRef.current[chunkTrackingKey(chatId, streamMessageId)] = delta;
          ttftMark(chatId, 'firstChunk');

          requestAnimationFrame(() => {
            ttftMark(chatId, 'firstRender');
          });
        }

        if (isFirstChunk) {
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

        const normalizedDone = normalizeChatDoneEvent(event.payload as unknown as Record<string, unknown>);
        if (normalizedDone) runtimeBridge?.dispatch(normalizedDone);
        
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

          // The provider's done payload is canonical, but a few adapters
          // finish with an empty `content` after the text chunks have already
          // been committed to the timeline. Do not turn that valid streamed
          // answer into an empty assistant message: recover it from the text
          // steps before marking the message complete.
          const streamedText = (assistant.steps || [])
            .filter((step) => step.type === "text")
            .map((step) => step.content || "")
            .join("");
          const finalContent = isCancelled && event.payload.content
            ? assistant.content || streamedText
            : (event.payload.content || assistant.content || streamedText);
          const hasCanonicalOrRecoveredContent = Boolean(
            !isCancelled && (event.payload.content || streamedText),
          );
          const finalized = hasCanonicalOrRecoveredContent
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
        // Reconcile whenever a backend id is known — even if the assistant was
        // already remapped to it by an earlier chat:message. Gating on
        // `backendAssistantId !== assistantIdBeforeFinalize` skipped the merge
        // in exactly that case, stranding orphan tool-ledger rows that then
        // vanished on reload. reconcileStrayToolLedgers is a no-op when there
        // are no matching strays, so running it unconditionally is safe.
        if (backendAssistantId && assistantIdBeforeFinalize) {
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
          persistExecutionCheckpointForEvent({
            chatId,
            messageId: backendAssistantId,
            flush: true,
            traceStatus: isCancelled ? "cancelled" : "completed",
          });
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
        const errorPresentation = presentExecutionError(errorMessage, {
          context: "transport",
          recoverable,
        });
        const displayError = errorPresentation.summary;

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
          const failedMessage = markMessageAsFailed(next[assistantIdx], displayError, recoverable);
          next[assistantIdx] = {
            ...failedMessage,
            metadata: {
              ...failedMessage.metadata,
              errorCategory: errorPresentation.category,
              errorAction: errorPresentation.action,
              errorActionLabel: errorPresentation.actionLabel,
              errorTechnicalDetails: errorPresentation.technicalDetails,
              errorRetryable: errorPresentation.retryable,
            },
          };
          appliedToSendingAssistant = true;
          return next;
        });
        useChatStore.getState().setStreamingForChat(chatId, false);
        useChatStore.getState().setActiveAssistantForChat(chatId, null);
        if (appliedToSendingAssistant) {
          persistExecutionCheckpointForEvent({
            chatId,
            messageId: activeAssistantId,
            flush: true,
            traceStatus: recoverable ? "interrupted" : "failed",
          });
        }
        if (appliedToSendingAssistant && !recoverable) {
          toast.error(errorPresentation.summary);
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
      window.removeEventListener("pagehide", handlePageHide);
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
      flushPendingCheckpoints();
    };
  }, [queryClient, flushAllChunkBuffers, resetHeartbeatTimeout, clearHeartbeatTimeout]);
}
