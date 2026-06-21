import { useChatStore } from "@/lib/stores/useChatStore";
import type { Message, Step } from "../../components/chat/types";
import { findWritableAssistantIndex } from "./messageTarget";
import { filterToolProtocolStream, stripToolProtocolText } from "@/atlas/lib/toolProtocolText";

export interface ChunkBuffer {
  delta: string;
  type: string;
}

interface InlineThinkSplit {
  segments: Array<{ type: "text" | "thought"; content: string }>;
  open: boolean;
  pending: string;
}

export function normalizeChatChunkType(type?: string): string {
  return type === "reasoning" ? "thought" : type || "text";
}

const firstChunkTypesMap = new Map<string, Set<string>>();

export function markFirstChunkTypeSent(chatId: string, chunkType: string): boolean {
  let typeSet = firstChunkTypesMap.get(chatId);
  if (!typeSet) {
    typeSet = new Set<string>();
    firstChunkTypesMap.set(chatId, typeSet);
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
    return [{ type: "reasoning" as const, content: normalizedReasoning }, ...nextSteps];
  };

  const hasExecutionTimeline = steps.some((step) => step.type !== "text" && step.type !== "reasoning");

  if (hasExecutionTimeline) {
    // The streamed steps are the chronological source of truth. Replacing the
    // first text step with the full final response moves post-tool commentary
    // ahead of tool cards when chat:done arrives.
    const updatedSteps = steps
      .map((step) => step.type === "text"
        ? { ...step, content: stripToolProtocolText(step.content || "") }
        : step)
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

  const textStep: Step = { type: "text", content: normalizedContent };
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

export function applyBufferedDeltaToChat(chatId: string, delta: string, chunkType: string, options?: { isThinking?: boolean }) {
  useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
    const assistantIdx = findWritableAssistantIndex(prev, chatId);
    if (assistantIdx === -1) return prev;

    const next = [...prev];
    next[assistantIdx] = applyBufferedDelta(next[assistantIdx], delta, chunkType, options);
    return next;
  });
}

export function applyBufferedDeltaToMessage(message: Message, delta: string, chunkType: string, options?: { isThinking?: boolean }): Message {
  return applyBufferedDelta(message, delta, chunkType, options);
}

export function clearChunkTrackingForChat(
  chatId: string,
  chunkBuffers: Record<string, ChunkBuffer>,
  firstChunkDeltas: Record<string, ChunkBuffer>,
) {
  delete chunkBuffers[chatId];
  delete firstChunkDeltas[chatId];
  firstChunkTypesMap.delete(chatId);
}
