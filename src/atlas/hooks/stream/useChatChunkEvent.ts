import { useEffect, useRef, useCallback } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listenAppEvent } from "@/api/events";
import { useChatStore } from "@/lib/stores/useChatStore";
import { Message, Step } from "../../components/chat/types";
import { ttftMark, ttftReport } from "@/lib/ttft";
import { findWritableAssistantIndex, markMessageAsFailed, markMessageAsFinished } from "./messageTarget";

interface UseChatChunkEventProps {
  resetHeartbeatTimeout: (chatId: string) => void;
  clearHeartbeatTimeout: (chatId: string) => void;
}

interface ChunkBuffer {
  delta: string;
  type: string; // "text" | "thought"
}

interface InlineThinkSplit {
  segments: Array<{ type: "text" | "thought"; content: string }>;
  open: boolean;
  pending: string;
}

export function normalizeChatChunkType(type?: string): string {
  return type === "reasoning" ? "thought" : type || "text";
}

export function firstChunkTypeSentKey(chatId: string, chunkType: string): string {
  return `${chatId}\u0000${chunkType}`;
}

const INLINE_THINK_TAGS = ["<think>", "</think>", "<thought>", "</thought>"];

function getTrailingInlineThinkTagPrefix(text: string): string {
  const start = text.lastIndexOf("<");
  if (start === -1) return "";
  const suffix = text.slice(start);
  const lowerSuffix = suffix.toLowerCase();
  if (!lowerSuffix || lowerSuffix.includes(">")) return "";
  return INLINE_THINK_TAGS.some((tag) => tag.startsWith(lowerSuffix) && tag !== lowerSuffix)
    ? suffix
    : "";
}

export function splitInlineThinkTags(text: string, initiallyOpen = false, pending = ""): InlineThinkSplit {
  const segments: InlineThinkSplit["segments"] = [];
  const tagPattern = /(<\/?(?:think|thought)>)/ig;
  const input = pending + text;
  let open = initiallyOpen;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(input)) !== null) {
    const before = input.slice(cursor, match.index);
    if (before) {
      segments.push({ type: open ? "thought" : "text", content: before });
    }

    open = !match[1].startsWith("</");
    cursor = match.index + match[1].length;
  }

  const rest = input.slice(cursor);
  const trailingPending = getTrailingInlineThinkTagPrefix(rest);
  const emitRest = trailingPending ? rest.slice(0, -trailingPending.length) : rest;
  if (emitRest) {
    segments.push({ type: open ? "thought" : "text", content: emitRest });
  }

  return { segments, open, pending: trailingPending };
}

function applyDeltaSegment(message: Message, delta: string, chunkType: string, options?: { isThinking?: boolean }): Message {
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

function applyBufferedDelta(message: Message, delta: string, chunkType: string, options?: { isThinking?: boolean }): Message {
  if (chunkType === "thought") {
    return applyDeltaSegment(message, delta, chunkType, options);
  }

  const inlineState = message.metadata as { inlineThinkOpen?: boolean; inlineThinkPending?: string } | undefined;
  const thinkState = Boolean(inlineState?.inlineThinkOpen);
  const thinkPending = inlineState?.inlineThinkPending || "";
  const split = splitInlineThinkTags(delta, thinkState, thinkPending);

  if (!thinkState && !thinkPending && !split.open && !split.pending && split.segments.length === 1 && split.segments[0]?.type === "text") {
    return applyDeltaSegment(message, delta, chunkType, options);
  }

  let nextMessage = message;
  for (const segment of split.segments) {
    nextMessage = applyDeltaSegment(nextMessage, segment.content, segment.type, {
      isThinking: segment.type === "thought" ? true : options?.isThinking,
    });
  }

  return {
    ...nextMessage,
    isThinking: split.open ? true : (options?.isThinking ?? false),
    metadata: {
      ...nextMessage.metadata,
      inlineThinkOpen: split.open,
      inlineThinkPending: split.pending,
    },
  };
}

function splitInlineThinkContent(content: string): { content: string; reasoning: string } {
  const split = splitInlineThinkTags(content, false);
  let cleanContent = "";
  let reasoning = "";

  for (const segment of split.segments) {
    if (segment.type === "thought") {
      reasoning += segment.content;
    } else {
      cleanContent += segment.content;
    }
  }

  return {
    content: cleanContent.trim(),
    reasoning: reasoning.trim(),
  };
}

function replaceTextStepsWithContent(message: Message, content: string): Message {
  const extracted = splitInlineThinkContent(content);
  const hasInlineThinkTags = /<\/?(?:think|thought)>/i.test(content);
  const normalizedContent = hasInlineThinkTags ? extracted.content : content;
  const normalizedReasoning = extracted.reasoning;
  const steps = message.steps || [];
  const firstTextIndex = steps.findIndex((step) => step.type === "text");
  const hasExecutionTimeline = steps.some((step) => step.type !== "text" && step.type !== "reasoning");
  const reasoningSteps = normalizedReasoning
    ? steps.filter((step) => step.type === "reasoning")
    : [];
  const hasReasoningStep = reasoningSteps.length > 0;
  const appendReasoning = (nextSteps: Step[]): Step[] => {
    if (!normalizedReasoning) return nextSteps;
    if (hasReasoningStep) {
      let didUpdate = false;
      return nextSteps.map((step) => {
        if (step.type !== "reasoning" || didUpdate) return step;
        didUpdate = true;
        return { ...step, content: normalizedReasoning };
      });
    }
    return [{ type: "reasoning" as const, content: normalizedReasoning }, ...nextSteps];
  };

  if (hasExecutionTimeline && firstTextIndex !== -1) {
    const updatedSteps = steps.map((step, i) =>
      i === firstTextIndex ? { ...step, content: normalizedContent } : step
    );
    return {
      ...message,
      content: normalizedContent,
      reasoning: normalizedReasoning || message.reasoning,
      steps: appendReasoning(updatedSteps),
    };
  }

  const withoutTextSteps = steps.filter((step) => step.type !== "text");

  if (!normalizedContent) {
    return {
      ...message,
      content: normalizedContent,
      reasoning: normalizedReasoning || message.reasoning,
      steps: appendReasoning(withoutTextSteps),
    };
  }

  const textStep: Step = { type: "text", content: normalizedContent };
  if (firstTextIndex === -1) {
    return {
      ...message,
      content: normalizedContent,
      reasoning: normalizedReasoning || message.reasoning,
      steps: appendReasoning([...steps, textStep]),
    };
  }

  const nextSteps = [...withoutTextSteps];
  nextSteps.splice(Math.min(firstTextIndex, nextSteps.length), 0, textStep);
  return {
    ...message,
    content: normalizedContent,
    reasoning: normalizedReasoning || message.reasoning,
    steps: appendReasoning(nextSteps),
  };
}

function applyBufferedDeltaToChat(chatId: string, delta: string, chunkType: string, options?: { isThinking?: boolean }) {
  useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
    const assistantIdx = findWritableAssistantIndex(prev);
    if (assistantIdx === -1) return prev;

    const next = [...prev];
    next[assistantIdx] = applyBufferedDelta(next[assistantIdx], delta, chunkType, options);
    return next;
  });
}

function clearChunkTrackingForChat(
  chatId: string,
  chunkBuffers: Record<string, ChunkBuffer>,
  firstChunkDeltas: Record<string, ChunkBuffer>,
  firstChunkTypesSent: Set<string>,
) {
  delete chunkBuffers[chatId];
  delete firstChunkDeltas[chatId];
  firstChunkTypesSent.forEach((key) => {
    if (key.startsWith(`${chatId}\u0000`)) {
      firstChunkTypesSent.delete(key);
    }
  });
}

export function useChatChunkEvent({ resetHeartbeatTimeout, clearHeartbeatTimeout }: UseChatChunkEventProps) {
  const queryClient = useQueryClient();
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const chunkBuffersRef = useRef<Record<string, ChunkBuffer>>({});
  const chunkRafRef = useRef<number | null>(null);
  const firstChunkDeltas = useRef<Record<string, ChunkBuffer>>({});
  const firstChunkTypesSent = useRef<Set<string>>(new Set());

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
        next[assistantIdx] = applyBufferedDelta(next[assistantIdx], delta, chunkType);
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
        if (firstChunkTypesSent.current.has(firstChunkTypeSentKey(chatId, chunkType))) {
          firstChunkDeltas.current[chatId] = { delta, type: chunkType };
          return;
        }
        firstChunkTypesSent.current.add(firstChunkTypeSentKey(chatId, chunkType));

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
          firstChunkTypesSent.current.add(firstChunkTypeSentKey(chatId, incomingType));
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

        const buf = chunkBuffersRef.current[chatId];
        let finalDelta = buf?.delta || "";

        // Strip the already-handled first-chunk prefix if present
        const prefix = firstChunkDeltas.current[chatId];
        if (prefix && buf?.type === prefix.type && finalDelta.startsWith(prefix.delta)) {
          finalDelta = finalDelta.slice(prefix.delta.length);
        }
        clearChunkTrackingForChat(chatId, chunkBuffersRef.current, firstChunkDeltas.current, firstChunkTypesSent.current);

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

          const finalContent = isCancelled && event.payload.content
            ? assistant.content
            : (event.payload.content || assistant.content);
          const finalized = event.payload.content && !isCancelled
            ? replaceTextStepsWithContent(assistant, finalContent)
            : { ...assistant, content: finalContent };

          const next = [...prev];
          next[assistantIdx] = markMessageAsFinished(finalized, isCancelled);
          return next;
        });

        queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
        ttftReport(chatId, reason);
      });

      const unlistenError = await listenAppEvent("chat:error", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        clearHeartbeatTimeout(chatId);
        clearChunkTrackingForChat(chatId, chunkBuffersRef.current, firstChunkDeltas.current, firstChunkTypesSent.current);
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

        clearChunkTrackingForChat(chatId, chunkBuffersRef.current, firstChunkDeltas.current, firstChunkTypesSent.current);
        clearHeartbeatTimeout(chatId);
        useChatStore.getState().setStreamingForChat(chatId, false);
      });

      const unlistenResearchStep = await listenAppEvent("chat:research-step", (event) => {
        const chatId = event.payload.chat_id;
        if (!chatId) return;

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const assistantIdx = findWritableAssistantIndex(prev);
          if (assistantIdx === -1) return prev;
          const assistant = prev[assistantIdx];

          const prevResearchSteps = assistant.metadata?.researchSteps || [];
          const existingStepIdx = prevResearchSteps.findIndex(s => s.text === event.payload.text);
          const researchSteps = existingStepIdx >= 0
            ? prevResearchSteps.map((s, i) => i === existingStepIdx ? { ...s, status: event.payload.status } : s)
            : [...prevResearchSteps, { text: event.payload.text, status: event.payload.status }];

          const next = [...prev];
          next[assistantIdx] = {
            ...assistant,
            metadata: { ...assistant.metadata, researchSteps }
          };
          return next;
        });
      });

      const unlisteners = [
        unlistenChunkFirst,
        unlistenChunk,
        unlistenDone,
        unlistenError,
        unlistenStreamReset,
        unlistenResearchStep,
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
