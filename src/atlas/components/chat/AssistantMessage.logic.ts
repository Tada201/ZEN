import { CHAT_STATUS_PHASES, type ChatStatusPhase } from "@/api/chatStatus";
import type { Message, Step, ToolCall } from "./types";
import type { ParsedCard } from "./assistantMessageParts";
import {
  selectParentWorkingStatus,
  type GroupedAssistantStep,
  type ParentWorkingStatus,
} from "./assistantMessageParts";
import { splitReasoningSections, type ReasoningSection } from "@/atlas/components/chat/reasoningSections";

type ReasoningGroupedStep = GroupedAssistantStep & { type: "reasoning"; reasoningSections?: ReasoningSection[] };

/**
 * Coalesce reasoning that a provider streamed *after* the answer text back into
 * the pre-answer reasoning block. Some models emit a trailing "Result" thought
 * once the answer is written; rendered verbatim it becomes a stray reasoning
 * card below the answer, which buries the answer (Multigrid reasoning-UX
 * "Never: put reasoning after the answer in reading order") and fragments a
 * single logical reasoning stream (cf. claude-code#30762). Reasoning is always
 * a pre-answer footnote here.
 *
 * Only applied to a settled turn: while streaming, the trailing reasoning may
 * still be the live "Thinking…" block and must keep its own identity. The fold
 * also runs on reload, so live and hydrated shapes match.
 */
function foldPostAnswerReasoning(
  steps: GroupedAssistantStep[],
  isStreaming: boolean,
): GroupedAssistantStep[] {
  if (isStreaming) return steps;

  let lastTextIndex = -1;
  steps.forEach((step, index) => {
    if (step.type === "text" && Boolean((step.cleanText || step.content || "").trim())) {
      lastTextIndex = index;
    }
  });
  if (lastTextIndex === -1) return steps;

  const hasTrailingReasoning = steps.some((step, index) => step.type === "reasoning" && index > lastTextIndex);
  if (!hasTrailingReasoning) return steps;

  const result: GroupedAssistantStep[] = [];
  let priorReasoningIndex = -1;
  steps.forEach((step, index) => {
    if (step.type === "reasoning" && index > lastTextIndex) {
      if (priorReasoningIndex !== -1) {
        const prior = result[priorReasoningIndex] as ReasoningGroupedStep;
        const combined = [prior.content, (step as ReasoningGroupedStep).content]
          .map((value) => (value || "").trim())
          .filter(Boolean)
          .join("\n");
        result[priorReasoningIndex] = {
          ...prior,
          content: combined,
          reasoningSections: splitReasoningSections(combined),
        };
        return;
      }
      // No earlier reasoning to merge into: keep the block but relocate it just
      // above the answer so reasoning never reads after the answer.
      result.splice(Math.max(0, lastTextIndex), 0, step);
      priorReasoningIndex = result.indexOf(step);
      return;
    }
    result.push(step);
    if (step.type === "reasoning") priorReasoningIndex = result.length - 1;
  });
  return result;
}


// Tool-lifecycle status phases (planned / executing / preparing / ready) are
// NOT surfaced as timeline rows: they duplicate the tool card, which already
// shows the tool name, args, live spinner, and result — matching the Codex
// trace where each tool is a single expandable block, not a status log. The
// transient parent phase is still conveyed once by the breathing indicator
// (selectParentWorkingStatus reads it straight from the grouped steps).
export const VISIBLE_CHAT_STATUS_PHASES: ReadonlySet<ChatStatusPhase> = new Set<ChatStatusPhase>([
  CHAT_STATUS_PHASES.AgentStreaming,
]);

export function isVisibleChatStatusStep(step: Step) {
  const phase = step.metadata?.phase;
  return step.kind !== "chat_status" || (typeof phase === "string" && VISIBLE_CHAT_STATUS_PHASES.has(phase as ChatStatusPhase));
}

export function isVisibleChatActionStep(step: Step) {
  if (step.type !== "action") return false;
  if (!isVisibleChatStatusStep(step)) return false;
  if (step.kind === "approval_request") return true;
  if (step.kind === "clarification_request") return true;
  if (step.kind === "chat_status") return true;
  return false;
}

type ExecutionToolIdentity = {
  id?: string;
  toolBatchId?: string;
  batchId?: string;
  executionId?: string;
  runId?: string;
  messageId?: string;
  name?: string;
  startTime?: number;
};

export function getExecutionStepKey(
  step: {
    type: string;
    eventId?: string;
    toolCalls?: ExecutionToolIdentity[];
  },
  index: number,
  groupKeyCache?: Map<string, string>,
  groupFallbackKeyCache?: Map<string, string>,
  groupFingerprintCounts?: Map<string, number>,
) {
  if (step.type === "tool-group") {
    const tools = step.toolCalls ?? [];
    const toolIds = tools.map((tool) => tool.id).filter((id): id is string => Boolean(id));
    const rememberedKey = toolIds
      .map((id) => groupKeyCache?.get(id))
      .find((key): key is string => Boolean(key));
    const stableTool = [...tools]
      .sort((left, right) => (left.startTime ?? Number.MAX_SAFE_INTEGER) - (right.startTime ?? Number.MAX_SAFE_INTEGER))[0];
    // Prefer an explicit batch/execution identity for a group that has one,
    // but remember the first assigned key by child ID. This prevents a late
    // batch identity or newly merged child from remounting the live group.
    // A stable start-time/name fallback avoids using the visible list index
    // when providers omit IDs on the first streamed update.
    // The fallback fingerprint intentionally uses only immutable group shape.
    // Timestamps and canonical IDs may arrive later, so they must not change
    // the lookup key used to preserve the first rendered React identity.
    const baseFingerprint = [...new Set(tools.map((tool) => `name:${tool.name || "tool"}`))]
      .sort()
      .join("|") || `index:${index}`;
    const occurrence = groupFingerprintCounts
      ? (groupFingerprintCounts.get(baseFingerprint) || 0)
      : 0;
    groupFingerprintCounts?.set(baseFingerprint, occurrence + 1);
    const fallbackFingerprint = `${baseFingerprint}#${occurrence}`;
    const rememberedFallbackKey = groupFallbackKeyCache?.get(fallbackFingerprint);
    const canonicalIdentity = stableTool?.toolBatchId
      || stableTool?.batchId
      || stableTool?.executionId
      || stableTool?.runId
      || stableTool?.messageId
      || stableTool?.id;
    // Once a group has rendered, its fingerprint key wins before later
    // metadata. A provider may attach a timestamp or batch ID after the first
    // delta; the base fingerprint preserves the row without remounting it.
    const identity = rememberedKey
      || rememberedFallbackKey
      || canonicalIdentity
      || fallbackFingerprint;
    const key = rememberedKey || rememberedFallbackKey || `tool-group-${identity}`;
    groupFallbackKeyCache?.set(fallbackFingerprint, key);
    toolIds.forEach((id) => groupKeyCache?.set(id, key));
    return key;
  }
  if (step.type === "action" && step.eventId) return `action-${step.eventId}`;
  if (step.type === "subagent" && step.eventId) return `subagent-${step.eventId}`;
  // Text/reasoning steps carry a stable id minted at creation (runtime part id
  // or a locally minted `local:` id). Keying by that id — never the visible
  // list index — keeps React identity fixed when a tool card is inserted
  // between text runs, so the streamed prose above/below a tool no longer
  // remounts and splits mid-character.
  if (step.eventId) return `${step.type}-${step.eventId}`;
  return `${step.type}-${index}`;
}

export function shouldShowToolGroupInTimeline(
  step: { type: "tool-group"; toolCalls: Array<{ status: string }> },
  _isStreaming: boolean,
  _hasAssistantAnswerText: boolean,
) {
  // Execution cards are durable timeline elements — they stay mounted after
  // completion so live streaming and hydrated reloads produce the same visible
  // shape. Actionable tools (running/awaiting_approval/error) short-circuit;
  // completed groups also remain, so there is no hidden state.
  const hasActionableTool = step.toolCalls.some((tool) =>
    tool.status === "running" || tool.status === "awaiting_approval" || tool.status === "error"
  );
  if (hasActionableTool) return true;
  return true;
}

// Card types that pay down the most empty vertical whitespace when collapsed
// to a thin fold-out header. Aliases mirror the lowercase variants that
// PremiumCard.tsx already accepts so a single helper handles all spellings.
export const FOLDABLE_CARD_TYPES: ReadonlySet<string> = new Set([
  // weather-ish
  "weather", "forecast",
  // nutrition
  "nutrition", "food",
  // charts
  "chart", "graph", "data_visualization",
  // comparison
  "comparison", "compare", "plans",
  // code + diff
  "code_snippet", "code_block", "snippet",
  "diff", "code_diff", "patch",
  // terminal
  "terminal", "shell_command", "cmd_exec",
  // academic citation
  "citation", "reference", "paper",
  // world time
  "world_time", "time", "clock",
]);

/**
 * Projects a card payload into a single-line header suitable for the
 * collapsed fold-out header. Falls back to the card type slug when the
 * shape is unfamiliar so every foldable card still gets a meaningful
 * preview (no empty / broken header).
 */
export function getFoldOutSummary(card: ParsedCard): string {
  const t = String(card.type ?? "").toLowerCase();
  const data = ((card.data ?? {}) as Record<string, unknown>);
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = data[key];
      if (value != null && value !== "") return String(value);
    }
    return "";
  };
  switch (t) {
    case "weather":
    case "forecast": {
      const loc = pick("location", "city") || "Weather";
      const temp = pick("temperature", "temp");
      const cond = pick("condition", "description");
      return cond ? `${loc} · ${temp}° · ${cond}` : `${loc} · ${temp}°`;
    }
    case "nutrition":
    case "food": {
      const name = pick("name", "title") || "Nutrition Facts";
      const cal = pick("calories");
      return cal ? `${name} · ${cal} cal` : name;
    }
    case "chart":
    case "graph":
    case "data_visualization": {
      return pick("title", "name") || "Data visualization";
    }
    case "comparison":
    case "compare":
    case "plans": {
      return pick("title", "name") || "Comparing options";
    }
    case "code_snippet":
    case "code_block":
    case "snippet": {
      const fn = pick("filename");
      const lang = pick("language") || "code";
      const lc = pick("lineCount");
      const lcSuffix = lc ? ` · ${lc} lines` : "";
      return fn ? `${fn} · ${lang}${lcSuffix}` : `${lang} snippet${lcSuffix}`;
    }
    case "diff":
    case "code_diff":
    case "patch": {
      const fn = pick("filename") || "diff";
      const adds = pick("additions") || "0";
      const dels = pick("deletions") || "0";
      return `${fn} (+${adds}/−${dels})`;
    }
    case "terminal":
    case "shell_command":
    case "cmd_exec": {
      const sh = pick("shell") || "bash";
      const cmd = pick("command") || "";
      const trimmed = cmd.length > 80 ? `${cmd.slice(0, 77)}…` : cmd;
      return trimmed ? `${sh} · ${trimmed}` : sh;
    }
    case "citation":
    case "reference":
    case "paper": {
      const title = pick("title", "name").slice(0, 80) || "Citation";
      const year = pick("year");
      const authorsRaw = Array.isArray(data.authors) ? (data.authors as unknown[]) : [];
      const authors = authorsRaw.length
        ? `${String(authorsRaw[0])}${authorsRaw.length > 1 ? " et al." : ""}`
        : "";
      return [title, year, authors].filter(Boolean).join(" · ");
    }
    case "world_time":
    case "time":
    case "clock": {
      const title = pick("title") || "World Clock";
      const clocks = Array.isArray(data.clocks) ? data.clocks : [];
      const cities = clocks.map((c: { city?: string; name?: string }) => c.city || c.name).filter(Boolean).join(", ");
      return cities ? `${title} · ${cities}` : title;
    }
    default:
      return t || "Card";
  }
}

/**
 * Pure view-state derivation for an assistant message. Everything the
 * component needs to decide what to render — grouped steps to show, whether
 * an answer exists, which live phase owns the parent breathing indicator, and
 * whether message actions should appear — is computed here from the message
 * and its grouped projections. The component keeps only the refs needed to
 * preserve React row identity (`getExecutionStepKey` caches) and the JSX.
 */
export interface AssistantMessageViewState {
  executionActionSteps: Step[];
  visibleGroupedSteps: GroupedAssistantStep[];
  hasVisibleTextStep: boolean;
  hasVisibleAnswer: boolean;
  hasVisibleProgress: boolean;
  latestChatStatusPhase: string | undefined;
  hasActiveReasoning: boolean;
  hasActiveExecution: boolean;
  hasActiveDelegation: boolean;
  hasResponseText: boolean;
  hasTerminalToolGroup: boolean;
  parentWorkingStatus: ParentWorkingStatus | undefined;
  hasOnlyLiveProgress: boolean;
  showMessageActions: boolean;
}

export function deriveAssistantMessageViewState({
  message,
  groupedSteps,
  groupedToolCalls,
}: {
  message: Message;
  groupedSteps: GroupedAssistantStep[];
  groupedToolCalls: ToolCall[];
}): AssistantMessageViewState {
  const hasAssistantAnswerText = Boolean(message.content?.trim() || message.reasoning?.trim() || message.artifact);

  // Reasoning is always a pre-answer footnote: fold any trailing reasoning back
  // above the answer before deriving the visible timeline.
  const orderedSteps = foldPostAnswerReasoning(groupedSteps, message.status === "sending");

  const executionActionSteps = orderedSteps
    .filter((step) => step.type === "action")
    .map((step) => step as Step);

  const visibleGroupedSteps = orderedSteps.filter((step) => {
    if (step.type === "tool-group") {
      return shouldShowToolGroupInTimeline(step, message.status === "sending", hasAssistantAnswerText);
    }
    return step.type !== "action" || isVisibleChatActionStep(step as Step);
  });

  const hasVisibleTextStep = visibleGroupedSteps.some((step) =>
    step.type === "text" && Boolean((step.cleanText || step.content || "").trim()),
  );

  const hasVisibleAnswer = Boolean(
    message.content?.trim() ||
    message.reasoning?.trim() ||
    (message.status === "failed" && message.error?.trim()) ||
    message.artifact ||
    groupedSteps.some((step) =>
      step.type === "text"
        ? Boolean((step.cleanText || step.content || "").trim())
        : step.type === "reasoning" ||
          step.type === "subagent" ||
          (step.type === "tool-group" && shouldShowToolGroupInTimeline(step, message.status === "sending", hasAssistantAnswerText))
    ) ||
    (message.status === "sending" && groupedToolCalls.length > 0)
  );

  const hasVisibleProgress = visibleGroupedSteps.some((step) => step.type === "action");

  // Chat-status steps are intentionally excluded from the visible timeline,
  // so derive the latest compact phase from the grouped source rather than the
  // filtered render list. This keeps the live phase reachable without adding a
  // second chat-status row.
  const latestChatStatusPhase = (() => {
    if (message.status !== "sending") return undefined;
    for (let i = groupedSteps.length - 1; i >= 0; i -= 1) {
      const step = groupedSteps[i];
      if (step.type === "action" && step.kind === "chat_status") {
        const phase = step.metadata?.phase;
        return typeof phase === "string" ? phase : undefined;
      }
    }
    return undefined;
  })();

  const hasActiveReasoning = message.status === "sending" &&
    visibleGroupedSteps[visibleGroupedSteps.length - 1]?.type === "reasoning";
  const hasActiveExecution = visibleGroupedSteps.some((step) =>
    step.type === "tool-group" && step.toolCalls.some((tool) =>
      (tool.status === "running" && tool.recoveryState !== "stale") ||
      tool.status === "awaiting_approval" ||
      tool.status === "error",
    ),
  );
  const hasActiveDelegation = visibleGroupedSteps.some((step) =>
    step.type === "subagent" &&
    (step.subagent?.status === "running" || step.subagent?.status === "failed" || step.subagent?.status === "cancelled"),
  );
  const hasResponseText = Boolean(
    message.content?.trim() ||
    groupedSteps.some((step) => step.type === "text" && Boolean((step.cleanText || step.content || "").trim())),
  );
  const hasTerminalToolGroup = groupedSteps.some((step) =>
    step.type === "tool-group" &&
    step.toolCalls.length > 0 &&
    step.toolCalls.every((tool) => tool.status === "completed" || tool.status === "error"),
  );
  const parentWorkingStatus = selectParentWorkingStatus({
    isStreaming: message.status === "sending",
    chatStatusPhase: latestChatStatusPhase,
    hasActiveReasoning,
    hasActiveExecution,
    hasActiveDelegation,
    // Once response text has started, it owns the parent phase even if a
    // provider leaves a stale phase as the latest chat-status event. A terminal
    // tool group is retained as useful evidence for the post-tool transition,
    // while direct text streaming also takes the same quiet parent path.
    hasPendingResponse: hasResponseText && (hasTerminalToolGroup || !hasActiveReasoning),
  });

  const hasOnlyLiveProgress =
    !hasVisibleAnswer &&
    groupedSteps.length > 0 &&
    groupedSteps.every((step) =>
      step.type === "action" && !isVisibleChatActionStep(step as Step)
    );

  const showMessageActions = hasVisibleAnswer && !hasOnlyLiveProgress;

  return {
    executionActionSteps,
    visibleGroupedSteps,
    hasVisibleTextStep,
    hasVisibleAnswer,
    hasVisibleProgress,
    latestChatStatusPhase,
    hasActiveReasoning,
    hasActiveExecution,
    hasActiveDelegation,
    hasResponseText,
    hasTerminalToolGroup,
    parentWorkingStatus,
    hasOnlyLiveProgress,
    showMessageActions,
  };
}
