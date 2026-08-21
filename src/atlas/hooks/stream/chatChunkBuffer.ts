import { useChatStore } from "@/lib/stores/useChatStore";
import type { Message, Step } from "../../components/chat/types";
import { findWritableAssistantIndex } from "./messageTarget";
import { filterToolProtocolStream, stripToolProtocolText } from "@/atlas/lib/toolProtocolText";

export interface ChunkBuffer {
  delta: string;
  type: string;
  messageId?: string;
}

export interface ChunkApplyOptions {
  isThinking?: boolean;
  messageId?: string;
}

interface InlineThinkSplit {
  segments: Array<{ type: "text" | "thought"; content: string }>;
  open: boolean;
  pending: string;
}

export function normalizeChatChunkType(type?: string): string {
  return type === "reasoning" ? "thought" : type || "text";
}

// Every text/reasoning step gets a stable id at creation so React keys by
// identity, not list index. A tool card inserted between two text runs then
// keeps each run mounted instead of remounting and splitting mid-character
// (see getExecutionStepKey). Runtime-owned parts already carry `runtime:<id>`;
// this covers the legacy chunk-buffer and chat:done finalization paths.
let localStepSeq = 0;
function mintStepId(prefix: string): string {
  localStepSeq += 1;
  return `local:${prefix}:${localStepSeq}`;
}

const firstChunkTypesMap = new Map<string, Set<string>>();

/**
 * Use the backend assistant ID whenever it exists. Chat-only keys are kept for
 * legacy orchestrator events that predate message identity. Do not key this by
 * React's temporary assistant ID: it is replaced by the persisted row later.
 */
export function chunkTrackingKey(chatId: string, messageId?: string): string {
  return `${chatId}:${messageId || "chat"}`;
}

export function markFirstChunkTypeSent(chatId: string, chunkType: string, messageId?: string): boolean {
  const key = chunkTrackingKey(chatId, messageId);
  let typeSet = firstChunkTypesMap.get(key);
  if (!typeSet) {
    typeSet = new Set<string>();
    firstChunkTypesMap.set(key, typeSet);
  }
  if (typeSet.has(chunkType)) return false;
  typeSet.add(chunkType);
  return true;
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

function applyDeltaSegment(message: Message, delta: string, chunkType: string, options?: ChunkApplyOptions): Message {
  const prevSteps: Step[] = message.steps || [];

  if (chunkType === "thought") {
    const lastStepIdx = prevSteps.length - 1;
    const lastStep = prevSteps[lastStepIdx];
    const steps = lastStep && lastStep.type === "reasoning"
      ? prevSteps.map((s, i) => i === lastStepIdx ? { ...s, content: (s.content || "") + delta } : s)
      : [...prevSteps, { type: "reasoning" as const, content: delta, eventId: mintStepId("reasoning") }];

    return {
      ...message,
      reasoning: (message.reasoning || "") + delta,
      isThinking: options?.isThinking ?? message.status === "sending",
      steps,
    };
  }

  const lastStepIdx = prevSteps.length - 1;
  const lastStep = prevSteps[lastStepIdx];
  const steps = lastStep && lastStep.type === "text"
    ? prevSteps.map((s, i) => i === lastStepIdx ? { ...s, content: (s.content || "") + delta } : s)
    : [...prevSteps, { type: "text" as const, content: delta, eventId: mintStepId("text") }];

  return {
    ...message,
    content: message.content + delta,
    ...(options?.isThinking === undefined ? {} : { isThinking: options.isThinking }),
    steps,
  };
}

function applyBufferedDelta(message: Message, delta: string, chunkType: string, options?: ChunkApplyOptions): Message {
  if (chunkType === "thought") {
    return applyDeltaSegment(message, delta, chunkType, options);
  }

  const protocolState = message.metadata as { toolProtocolPending?: string } | undefined;
  const protocol = filterToolProtocolStream(delta, protocolState?.toolProtocolPending || "");
  const visibleDelta = protocol.visible;
  if (!visibleDelta) {
    return {
      ...message,
      metadata: { ...message.metadata, toolProtocolPending: protocol.pending },
    };
  }

  const inlineState = message.metadata as { inlineThinkOpen?: boolean; inlineThinkPending?: string } | undefined;
  const thinkState = Boolean(inlineState?.inlineThinkOpen);
  const thinkPending = inlineState?.inlineThinkPending || "";
  const split = splitInlineThinkTags(visibleDelta, thinkState, thinkPending);

  if (!thinkState && !thinkPending && !split.open && !split.pending && split.segments.length === 1 && split.segments[0]?.type === "text") {
    const next = applyDeltaSegment(message, visibleDelta, chunkType, options);
    return { ...next, metadata: { ...next.metadata, toolProtocolPending: protocol.pending } };
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
      toolProtocolPending: protocol.pending,
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

// The canonical id for the tail text `chat:done` may add beyond what streamed
// live. Stable (not freshly minted) so re-running finalization reconciles the
// SAME row instead of appending a duplicate / remounting a new React identity.
const FINAL_TAIL_EVENT_ID = "local:final-tail";

function nextTailSequence(steps: Step[]): number {
  let max = -1;
  for (const step of steps) {
    const sequence = step.sequence
      ?? (step.type === "tool-call" ? step.toolCall?.sequence : undefined)
      ?? step.metadata?.sequence;
    if (typeof sequence === "number" && Number.isFinite(sequence) && sequence > max) max = sequence;
  }
  return max + 1;
}

function reconcileFinalTextSteps(steps: Step[], finalContent: string): Step[] {
  const textStepLengths = steps
    .filter((step) => step.type === "text")
    .map((step) => (step.content || "").length);

  if (textStepLengths.length === 0) {
    return finalContent
      ? [...steps, { type: "text", content: finalContent, eventId: FINAL_TAIL_EVENT_ID, sequence: nextTailSequence(steps) }]
      : steps;
  }

  const nextSteps: Step[] = [];
  let contentOffset = 0;
  let textStepIndex = 0;

  for (const step of steps) {
    if (step.type !== "text") {
      nextSteps.push(step);
      continue;
    }

    const streamedLength = textStepLengths[textStepIndex] || 0;
    const reconciledContent = finalContent.slice(contentOffset, contentOffset + streamedLength);
    contentOffset += streamedLength;
    textStepIndex += 1;

    if (reconciledContent) {
      nextSteps.push({ ...step, content: reconciledContent });
    }
  }

  // chat:done is the canonical response boundary. If the provider's final
  // payload contains text that was not delivered in a live chunk, reconcile it
  // as ONE stable, sequenced tail part rather than an anonymous per-call row:
  // a fixed eventId keeps its React identity across re-finalization, and an
  // explicit end sequence lets orderSteps place it after the tool timeline
  // deterministically instead of relying on the array-index fallback (R4).
  const missingTail = finalContent.slice(contentOffset);
  if (missingTail) {
    const existingTailIdx = nextSteps.findIndex(
      (step) => step.type === "text" && step.eventId === FINAL_TAIL_EVENT_ID,
    );
    if (existingTailIdx !== -1) {
      nextSteps[existingTailIdx] = { ...nextSteps[existingTailIdx], content: missingTail };
    } else {
      nextSteps.push({ type: "text", content: missingTail, eventId: FINAL_TAIL_EVENT_ID, sequence: nextTailSequence(steps) });
    }
  }

  return nextSteps;
}

export function replaceTextStepsWithContent(message: Message, content: string): Message {
  const safeContent = stripToolProtocolText(content);
  const extracted = splitInlineThinkContent(safeContent);
  const hasInlineThinkTags = /<\/?(?:think|thought)>/i.test(safeContent);
  const normalizedContent = hasInlineThinkTags ? extracted.content : safeContent;
  const normalizedReasoning = extracted.reasoning;
  const steps = message.steps || [];
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
    return [{ type: "reasoning" as const, content: normalizedReasoning, eventId: mintStepId("reasoning") }, ...nextSteps];
  };

  const hasExecutionTimeline = steps.some((step) => step.type !== "text" && step.type !== "reasoning");

  if (hasExecutionTimeline) {
    // Keep the streamed execution order, but reconcile every text step against
    // the canonical chat:done content. This prevents a partial final response
    // from remaining visible when the transition or IPC batching dropped a
    // late text chunk.
    const streamedSteps = steps.map((step) => step.type === "text"
      ? { ...step, content: stripToolProtocolText(step.content || "") }
      : step);
    const updatedSteps = reconcileFinalTextSteps(streamedSteps, normalizedContent)
      .filter((step) => step.type !== "text" || Boolean(step.content?.trim()));
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

  const textStep: Step = { type: "text", content: normalizedContent, eventId: mintStepId("text") };
  const firstTextIndex = steps.findIndex((step) => step.type === "text");
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

export function applyBufferedDeltaToChat(chatId: string, delta: string, chunkType: string, options?: ChunkApplyOptions) {
  useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
    const assistantIdx = findWritableAssistantIndex(prev, chatId, options?.messageId);
    if (assistantIdx === -1) return prev;

    // chat:done carries canonical final text. Do not duplicate it if a late
    // text chunk arrives, but still accept a late thought chunk so the
    // reasoning ledger is complete.
    const target = prev[assistantIdx];
    if (target.status !== "sending" && chunkType !== "thought" && target.content.trim()) return prev;

    const next = [...prev];
    next[assistantIdx] = applyBufferedDelta(next[assistantIdx], delta, chunkType, options);
    return next;
  });
}

export function applyBufferedDeltaToMessage(message: Message, delta: string, chunkType: string, options?: ChunkApplyOptions): Message {
  return applyBufferedDelta(message, delta, chunkType, options);
}

export function clearChunkTrackingForChat(
  chatId: string,
  chunkBuffers: Record<string, ChunkBuffer>,
  firstChunkDeltas: Record<string, ChunkBuffer>,
) {
  delete chunkBuffers[chatId];
  for (const key of Object.keys(firstChunkDeltas)) {
    if (key === chatId || key.startsWith(`${chatId}:`)) delete firstChunkDeltas[key];
  }
  for (const key of firstChunkTypesMap.keys()) {
    if (key === chatId || key.startsWith(`${chatId}:`)) firstChunkTypesMap.delete(key);
  }
  firstChunkTypesMap.delete(chatId);
}
