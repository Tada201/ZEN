import React, { Suspense, useMemo, useRef } from "react";
import {
  Check, Copy, FileText, Code2, AlertTriangle, ChevronRight, RefreshCcw, Zap, X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { CHAT_STATUS_PHASES, type ChatStatusPhase } from "@/api/chatStatus";
import type { Message, ArtifactData, Step } from "./types";
import type { SettingsTabId } from "@/lib/features/frontendFeatures";
import type { ParsedCard } from "./assistantMessageParts";
import {
  groupAssistantSteps,
  groupToolCalls,
  legacyMessageToActionStep,
  parentWorkingStatusLabel,
  selectParentWorkingStatus,
  splitOnCardTokens,
} from "./assistantMessageParts";
import { MarkdownContent } from "./MarkdownContent";
import { ReasoningBlock } from "./ReasoningBlock";
import { useCopy } from "./CodeBlock";
import { StreamingSkeleton } from "./StreamingSkeleton";
import {
  AgentActionStep,
  ResearchTimeline,
} from "./AssistantMessageTrace";
import { ExecutionGroup } from "./ExecutionGroup";
import { SubagentExecutionCard } from "./SubagentExecutionCard";
import {
  FoldOutCard,
  FoldOutCardContent,
  FoldOutCardTrigger,
} from "@/components/ui/fold-out-card";

const PremiumCard = React.lazy(() => import("../genui/PremiumCard").then(m => ({ default: m.PremiumCard })));
const OpenUIRenderer = React.lazy(() => import("../OpenUIRenderer").then(m => ({ default: m.OpenUIRenderer })));

const CardFallback = () => (
  <div className="h-24 w-full rounded-xl border border-border bg-muted motion-safe:animate-pulse" aria-hidden="true" />
);

// Chat-status phases that are safe to surface as compact inline badges without
// duplicating the main tool execution trace.
const VISIBLE_CHAT_STATUS_PHASES: ReadonlySet<ChatStatusPhase> = new Set([
  CHAT_STATUS_PHASES.AgentStreaming,
  CHAT_STATUS_PHASES.ToolBatchPlanned,
  CHAT_STATUS_PHASES.ProviderReady,
  CHAT_STATUS_PHASES.ToolExecuting,
]);


function isVisibleChatStatusStep(step: Step) {
  const phase = step.metadata?.phase;
  return step.kind !== "chat_status" || (typeof phase === "string" && VISIBLE_CHAT_STATUS_PHASES.has(phase as ChatStatusPhase));
}

function isVisibleChatActionStep(step: Step) {
  if (step.type !== "action") return false;
  if (!isVisibleChatStatusStep(step)) return false;
  if (step.kind === "chat_status") {
    // Visible chat_status phases are shown only via the breathing indicator,
    // not as full timeline rows.
    return false;
  }
  return step.kind === "clarification_request";
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

function getExecutionStepKey(
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
  return `${step.type}-${index}`;
}

function shouldShowToolGroupInTimeline(
  step: { type: "tool-group"; toolCalls: Array<{ status: string }> },
  isStreaming: boolean,
  hasAssistantAnswerText: boolean,
  revealCompletedToolHistory = false,
) {
  // Completed-only tool groups are hidden once the assistant answer text
  // arrives, keeping the transcript focused on the conversation. Groups with
  // running, approval, or error states stay visible. The full execution
  // history remains available via the expandable trace and persisted steps.
  //
  // `revealCompletedToolHistory` is a persisted opt-in preference: when true,
  // completed successful groups stay visible even after the answer arrives,
  // so users who want to audit past turns don't lose them on reload.
  const hasActionableTool = step.toolCalls.some((tool) =>
    tool.status === "running" || tool.status === "awaiting_approval" || tool.status === "error"
  );
  if (hasActionableTool) return true;
  if (revealCompletedToolHistory) return true;
  return isStreaming && !hasAssistantAnswerText;
}

// Card types that pay down the most empty vertical whitespace when collapsed
// to a thin fold-out header. Aliases mirror the lowercase variants that
// PremiumCard.tsx already accepts so a single helper handles all spellings.
const FOLDABLE_CARD_TYPES: ReadonlySet<string> = new Set([
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
function getFoldOutSummary(card: ParsedCard): string {
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

function RenderPremiumCard({ card }: { card: ParsedCard }) {
  const cardType = String(card.type ?? "").toLowerCase();
  const isFoldable = FOLDABLE_CARD_TYPES.has(cardType);
  const body = (
    <Suspense fallback={<CardFallback />}>
      <PremiumCard type={card.type} data={card.data} />
    </Suspense>
  );

  if (!isFoldable) return body;

  // Fold-out chrome matches CardShell's outer tokens so the wrapper feels
  // native. The trigger's data-state-aware rounded corners (closed = full,
  // open = top only) keep the visual frame continuous across states.
  return (
    <FoldOutCard className="rounded-2xl border border-border bg-card overflow-hidden">
      <FoldOutCardTrigger className="data-[state=closed]:rounded-2xl data-[state=open]:rounded-t-2xl hover:bg-muted transition-colors">
        {getFoldOutSummary(card)}
      </FoldOutCardTrigger>
      <FoldOutCardContent>{body}</FoldOutCardContent>
    </FoldOutCard>
  );
}

/**
 * Renders a text step by interleaving LLM prose with the cards that were
 * extracted from the same step. Each card is rendered at the original offset
 * the LLM emitted it (`%%CARD_N%%` markers in `cleanText` carry the position).
 * Falls back to the legacy "all cards above the prose" arrangement when an
 * older persisted step arrives without `orderedCards`, so historical messages
 * still render correctly.
 */
function renderTextStepWithInlineCards(
  // Hand-typed shape instead of importing the full GroupedAssistantStep union
  // so this helper accepts any text-step-like object (older persisted shapes
  // included).
  step: {
    cleanText?: string;
    content?: string;
    cards?: ParsedCard[];
    orderedCards?: import("./assistantMessageParts").OrderedCard[];
  },
  isStreaming: boolean,
  onOpenArtifact: (a: ArtifactData) => void,
  chatId: string | undefined,
) {
  const orderedCards = step.orderedCards ?? [];
  const fallbackCards = step.cards ?? [];
  const prose = step.cleanText ?? step.content ?? "";

  // New path: parser emitted position markers; interleave cards inline.
  if (orderedCards.length > 0) {
    const cardList = (step.cards ?? []) as ParsedCard[];
    const segments = splitOnCardTokens(prose, cardList);
    return (
      <>
        {segments.map((segment, segIdx) => {
          if (segment.type === "card") {
            // Each card keeps its original position in the prose; the visual
            // flex-col gap still owns the vertical rhythm so cards stay
            // breathing-roomed against adjacent prose.
            return (
              <div
                key={`card-${segIdx}`}
                className="w-full animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none"
              >
                <RenderPremiumCard card={segment.card} />
              </div>
            );
          }
          if (!segment.content.trim()) return null;
          return (
            <MarkdownContent
              key={`md-${segIdx}`}
              content={segment.content}
              isThinking={false}
              isStreaming={isStreaming}
              onOpenArtifact={onOpenArtifact}
              chatId={chatId}
            />
          );
        })}
      </>
    );
  }

  // Legacy fallback for persisted message history that pre-dates Fix B.
  // Cards stacked above the prose matches the previous renderer behavior
  // exactly, so older replays still look the same to users.
  return (
    <>
      {fallbackCards.length > 0 && (
        <div className="flex flex-col gap-4 my-2 w-full animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none">
          {fallbackCards.map((card, idx) => (
            <RenderPremiumCard key={idx} card={card} />
          ))}
        </div>
      )}
      {Boolean(prose) && (
        <MarkdownContent
          content={prose}
          isThinking={false}
          isStreaming={isStreaming}
          onOpenArtifact={onOpenArtifact}
          chatId={chatId}
        />
      )}
    </>
  );
}

export function AssistantMessage({
  message,
  onOpenArtifact,
  onRetry,
  onOpenSettings,
  onDismissError,
  onRegenerate,
  compact,
}: {
  message: Message;
  onOpenArtifact: (a: ArtifactData) => void;
  onRetry?: (id: string) => void;
  onOpenSettings?: (tab: SettingsTabId, provider?: string) => void;
  onDismissError?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  compact?: boolean;
}) {
  const { copied, copy } = useCopy();
  const executionGroupKeyCacheRef = useRef(new Map<string, string>());
  const executionGroupFallbackKeyCacheRef = useRef(new Map<string, string>());
  const groupedSteps = useMemo(() => {
    const legacyStep = legacyMessageToActionStep(message);
    return groupAssistantSteps(message.steps?.length ? message.steps : legacyStep ? [legacyStep] : undefined);
  }, [message]);

  const groupedToolCalls = useMemo(() => {
    return groupToolCalls(message.toolCalls);
  }, [message.toolCalls]);

  const hasAssistantAnswerText = Boolean(message.content?.trim() || message.reasoning?.trim() || message.artifact);

  const executionActionSteps = useMemo<Step[]>(() => {
    return groupedSteps
      .filter((step) => step.type === "action")
      .map((step) => step as Step);
  }, [groupedSteps]);

  // Persisted appearance preference: when true, completed successful tool
  // groups stay visible in the timeline even after the assistant answer
  // arrives. Defaults to false so the transcript stays focused on the
  // conversation. Read from the settings store so it survives reloads.
  const revealCompletedToolHistory = useSettingsStore((s) => s.revealCompletedToolHistory);

  const visibleGroupedSteps = useMemo(() => {
    return groupedSteps.filter((step) => {
      if (step.type === "tool-group") {
        return shouldShowToolGroupInTimeline(step, message.status === "sending", hasAssistantAnswerText, revealCompletedToolHistory);
      }
      return step.type !== "action" || isVisibleChatActionStep(step as Step);
    });
  }, [groupedSteps, revealCompletedToolHistory]);

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
          (step.type === "tool-group" && shouldShowToolGroupInTimeline(step, message.status === "sending", hasAssistantAnswerText, revealCompletedToolHistory))
    ) ||
    (message.status === "sending" && groupedToolCalls.length > 0)
  );
  const hasVisibleProgress = visibleGroupedSteps.some((step) => step.type === "action");

  // Chat-status steps are intentionally excluded from the visible timeline,
  // so derive the latest compact phase from the grouped source rather than the
  // filtered render list. This keeps the live phase reachable without adding a
  // second chat-status row.
  const latestChatStatusPhase = useMemo<string | undefined>(() => {
    if (message.status !== "sending") return undefined;
    for (let i = groupedSteps.length - 1; i >= 0; i -= 1) {
      const step = groupedSteps[i];
      if (step.type === "action" && step.kind === "chat_status") {
        const phase = step.metadata?.phase;
        return typeof phase === "string" ? phase : undefined;
      }
    }
    return undefined;
  }, [groupedSteps, message.status]);

  const hasActiveReasoning = message.status === "sending" &&
    visibleGroupedSteps[visibleGroupedSteps.length - 1]?.type === "reasoning";
  const hasActiveExecution = visibleGroupedSteps.some((step) =>
    step.type === "tool-group" && step.toolCalls.some((tool) =>
      tool.status === "running" || tool.status === "awaiting_approval" || tool.status === "error",
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
  const hasResearchProgress = Boolean(message.metadata?.researchSteps?.length);
  const wasCancelled = message.status === "cancelled";
  const inlineError = message.status === "failed" ? message.error?.trim() : "";
  return (
    <div
      className={cn(
        "group flex w-full flex-col px-4 transition-all duration-200",
        compact ? "bg-transparent py-2" : "bg-transparent py-4"
      )}
    >
        <div className={cn(
          "mx-auto flex w-full items-start gap-0",
          compact ? "max-w-full" : "max-w-[800px]",
          wasCancelled && "animate-out fade-out slide-out-to-top-2 duration-200 fill-mode-forwards motion-reduce:animate-none"
        )}>
        <div className="flex min-w-0 flex-col gap-2 flex-1">
          <div className="relative">
            <div className={cn("space-y-4", compact && "space-y-2")}>
              {(message.model || message.provider) && (
                <div className="flex items-center gap-2 mb-2 select-none">
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground hover:bg-muted border-border transition-colors">
                    <Zap className="mr-1 h-3 w-3" />
                    {message.model || "Default"}
                    {message.provider && (
                      <span className="ml-1 text-muted-foreground border-l border-border pl-1">
                        {message.provider}
                      </span>
                    )}
                  </Badge>
                </div>
              )}

              {message.metadata?.researchSteps && message.metadata.researchSteps.length > 0 && (
                <ResearchTimeline steps={message.metadata.researchSteps} />
              )}

              {parentWorkingStatus && (
                <div
                  className="flex min-h-7 items-center gap-2 text-[12px] text-muted-foreground animate-in fade-in duration-150 motion-reduce:animate-none"
                  role="status"
                  aria-live="polite"
                  data-testid="chat-status-breathing-indicator"
                  data-phase={parentWorkingStatus}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-primary motion-safe:animate-pulse"
                    aria-hidden="true"
                  />
                  <Loader2 className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin text-primary" aria-hidden="true" />
                  <span className="truncate font-sans leading-5">
                    {parentWorkingStatusLabel(parentWorkingStatus)}
                  </span>
                </div>
              )}

            {message.status === "sending" && !hasVisibleAnswer && !hasResearchProgress && !hasVisibleProgress ? (
              <StreamingSkeleton compact={compact} />
            ) : (
              <>
                {visibleGroupedSteps.length > 0 ? (
                  <div className={cn("space-y-4", compact && "space-y-2")}>
                    {(() => {
                      const groupFingerprintCounts = new Map<string, number>();
                      return visibleGroupedSteps.map((step, idx) => {
                      const stepKey = getExecutionStepKey(
                        step,
                        idx,
                        executionGroupKeyCacheRef.current,
                        executionGroupFallbackKeyCacheRef.current,
                        groupFingerprintCounts,
                      );

                      return (
                      <div key={stepKey} className="animate-in fade-in duration-150 motion-reduce:animate-none">
                      {step.type === "text" ? (
                        <div className="prose-frontier">
                          <div className="flex flex-col gap-4">
                            {renderTextStepWithInlineCards(
                              step,
                              message.status === "sending",
                              onOpenArtifact,
                              message.sessionId,
                            )}
                          </div>
                        </div>
                        ) : step.type === "reasoning" ? (
                          <ReasoningBlock 
                            content={step.content || ""} 
                            isThinking={message.status === "sending" && idx === visibleGroupedSteps.length - 1}
                          />
                        ) : step.type === "tool-group" && step.toolCalls ? (
                          <div className="space-y-1.5">
                            <ExecutionGroup
                              toolCalls={step.toolCalls}
                              executionSteps={executionActionSteps}
                              sessionId={message.sessionId}
                              onOpenArtifact={onOpenArtifact}
                            />
                          </div>
                        ) : step.type === "subagent" && step.subagent ? (
                          <SubagentExecutionCard
                            step={step}
                            childToolCalls={(message.toolCalls || []).filter(
                              (tc) => tc.traceId === step.subagent?.spawnId,
                            )}
                            sessionId={message.sessionId}
                            onOpenArtifact={onOpenArtifact}
                          />
                        ) : step.type === "action" ? (
                          <AgentActionStep step={step} isStreaming={message.status === "sending"} />
                        ) : null}
                      </div>
                      );
                      });
                    })()}
                  </div>
                ) : (
                  <div className="prose-frontier">
                    {/* Fallback for messages with only raw content or legacy structure */}
                    <MarkdownContent
                      content={message.content || ""}
                      isThinking={message.isThinking}
                      isStreaming={message.status === "sending"}
                      onOpenArtifact={onOpenArtifact}
                      chatId={message.sessionId}
                    />
                  </div>
                )}


              </>
            )}
            
             {inlineError && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive bg-destructive/10 p-4 animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex flex-1 flex-col gap-2 min-w-0">
                  <div className="flex flex-col gap-1 font-sans">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-destructive">Operation Failed</span>
                      {onDismissError && (
                        <button
                          type="button"
                          onClick={() => onDismissError(message.id)}
                          className="flex items-center justify-center h-5 w-5 rounded-md text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                          aria-label="Dismiss error"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-[12px] text-destructive leading-relaxed font-mono mt-0.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                      {inlineError}
                    </p>
                  </div>
                  
                  {(inlineError.toLowerCase().includes("key") || inlineError.toLowerCase().includes("auth")) && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      type="button"
                      className="w-fit h-8 text-xs font-medium border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => onOpenSettings?.("providers", message.provider)}
                    >
                      Configure {message.provider || "Provider"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {message.artifact?.type === "openui" && (
              <div className="min-w-0 overflow-visible rounded-lg border border-border bg-card p-3">
                <Suspense fallback={<CardFallback />}>
                  <OpenUIRenderer
                    content={message.artifact.content}
                    isStreaming={message.status === "sending"}
                    chatId={message.sessionId}
                  />
                </Suspense>
              </div>
            )}

            {message.artifact && message.artifact.type !== "openui" && (
              <div 
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 cursor-pointer hover:bg-muted transition-all group/art"
                onClick={() => onOpenArtifact(message.artifact!)}
              >
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover/art:scale-105",
                  "bg-primary/10 text-primary"
                )}>
                  {message.artifact.type === "code" ? <Code2 className="h-5 w-5" /> : 
                    <FileText className="h-5 w-5" />}
                </div>
                <div className="flex flex-1 flex-col min-w-0">
                  <span className="font-semibold text-[14px] truncate">{message.artifact.title}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mt-0.5">
                    {message.artifact.type} · Generated Module
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            </div>
          </div>

            {showMessageActions && (
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity mt-1.5">
              <Button
                size="sm"
                variant="ghost"
                type="button"
                className="h-7 px-2.5 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-transparent border border-border hover:bg-muted gap-1.5 transition-all"
                onClick={() => copy(message.content)}
              >
                {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                Copy
              </Button>
              {onRetry && message.status === "failed" && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  className="h-7 px-2.5 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-transparent border border-border hover:bg-muted gap-1.5 transition-all"
                  onClick={() => onRetry(message.id)}
                >
                  <RefreshCcw className="h-3 w-3" />
                  Retry
                </Button>
              )}
              {onRegenerate && message.status === "sent" && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  className="h-7 px-2.5 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-transparent border border-border hover:bg-muted gap-1.5 transition-all"
                  onClick={() => onRegenerate(message.id)}
                >
                  <RefreshCcw className="h-3 w-3" />
                  Regenerate
                </Button>
              )}
            </div>
          )}

          {(message.metadata as any)?.stopReason && (message.metadata as any).stopReason !== "complete" && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                className="h-7 px-3 text-[10px] font-medium border-warning text-warning hover:bg-warning/10 gap-1.5"
                onClick={() => onRetry?.(message.id)}
              >
                <RefreshCcw className="h-3 w-3" />
                {(message.metadata as any).stopReason === "max_tokens"
                  ? "Continue generating..."
                  : (message.metadata as any).stopReason === "tool_use"
                    ? "Continue with tools..."
                    : "Continue response..."}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
