import React, { Suspense, useMemo, useRef } from "react";
import {
  Check, Copy, FileText, Code2, AlertTriangle, ChevronRight, RefreshCcw, Zap, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Message, ArtifactData } from "./types";
import type { SettingsTabId } from "@/lib/features/frontendFeatures";
import type { ParsedCard } from "./assistantMessageParts";
import {
  groupAssistantSteps,
  groupToolCalls,
  legacyMessageToActionStep,
  parentWorkingStatusLabel,
  splitOnCardTokens,
} from "./assistantMessageParts";
import {
  deriveAssistantMessageViewState,
  getExecutionStepKey,
  getFoldOutSummary,
  FOLDABLE_CARD_TYPES,
} from "./AssistantMessage.logic";
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
import { buildDelegationTree } from "@/atlas/agentRuntime/delegationTree";
import {
  FoldOutCard,
  FoldOutCardContent,
  FoldOutCardTrigger,
} from "@/components/ui/fold-out-card";
import { useReducedMotion } from "@/lib/motion";
import { presentExecutionError } from "@/atlas/agentRuntime/executionError";

const PremiumCard = React.lazy(() => import("../genui/PremiumCard").then(m => ({ default: m.PremiumCard })));
const OpenUIRenderer = React.lazy(() => import("../OpenUIRenderer").then(m => ({ default: m.OpenUIRenderer })));

const CardFallback = () => {
  const reducedMotion = useReducedMotion();
  return (
    <div
      className={cn(
        "h-24 w-full rounded-xl border border-border bg-muted",
        !reducedMotion && "animate-pulse",
      )}
      aria-hidden="true"
    />
  );
};


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
  messageId: string | undefined,
  allowGenerativeUI: boolean,
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
                className="w-full"
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
              messageId={messageId}
              allowGenerativeUI={allowGenerativeUI}
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
        <div
          className="flex flex-col gap-2 my-1 w-full"
        >
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
          messageId={messageId}
          allowGenerativeUI={allowGenerativeUI}
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
  isLast,
  compact,
}: {
  message: Message;
  onOpenArtifact: (a: ArtifactData) => void;
  onRetry?: (id: string) => void;
  onOpenSettings?: (tab: SettingsTabId, provider?: string) => void;
  onDismissError?: (id: string) => void;
  isLast?: boolean;
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

  const delegationTree = useMemo(() => {
    return buildDelegationTree(message.steps, message.toolCalls);
  }, [message.steps, message.toolCalls]);

  // OpenUI is a per-turn capability, not a renderer-wide content heuristic.
  // Missing/legacy capability metadata is intentionally treated as disabled.
  const allowGenerativeUI = message.generativeUI === 1;

  const view = useMemo(
    () => deriveAssistantMessageViewState({ message, groupedSteps, groupedToolCalls, delegationTree }),
    [message, groupedSteps, groupedToolCalls, delegationTree],
  );
  const {
    executionActionSteps,
    visibleGroupedSteps,
    hasVisibleTextStep,
    hasVisibleAnswer,
    hasVisibleProgress,
    parentWorkingStatus,
    showMessageActions,
  } = view;
  const hasResearchProgress = Boolean(message.metadata?.researchSteps?.length);
  const rawInlineError = message.status === "failed" ? message.error?.trim() : "";
  const errorPresentation = rawInlineError
    ? presentExecutionError(rawInlineError, {
        context: "assistant",
        category: message.metadata?.errorCategory,
        recoverable: message.metadata?.recoverable === true,
      })
    : null;
  const inlineError = errorPresentation?.summary || "";
  const technicalError = message.metadata?.errorTechnicalDetails || errorPresentation?.technicalDetails || "";
  const tracePersistencePresentation = message.metadata?.tracePersistence === "failed"
    ? presentExecutionError(message.metadata.tracePersistenceError || "Trace checkpoint failed", {
        context: "persistence",
        category: "persistence",
        recoverable: true,
      })
    : null;
  return (
    <div
      className={cn(
        "group flex w-full flex-col px-3",
        compact ? "bg-transparent py-0.5" : "bg-transparent py-1"
      )}
    >
        <div
          className={cn(
          "mx-auto flex w-full items-start gap-0",
          compact ? "max-w-full" : "max-w-[800px]"
        )}>
        <div className="flex min-w-0 flex-col gap-1 flex-1">
          <div className="relative">
            <div className={cn("space-y-1", compact && "space-y-0.5")}>
              {(message.model || message.provider) && (
                <div className="flex items-center gap-1.5 mb-1 select-none">
                  <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-bold uppercase tracking-wider bg-muted text-muted-foreground hover:bg-muted border-border transition-colors">
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
                  className="flex min-h-6 items-center gap-1.5 text-[12px] text-muted-foreground"
                  role="status"
                  aria-live="polite"
                  data-testid="chat-status-breathing-indicator"
                  data-phase={parentWorkingStatus}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-primary animate-[execution-status-pulse_1.4s_ease-in-out_infinite] motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  <span className="truncate font-sans leading-5">
                    {parentWorkingStatusLabel(parentWorkingStatus)}
                  </span>
                </div>
              )}

            {message.recoveryState === "recovered" && (
              <div className="mb-2 flex items-start gap-1.5 rounded-md border border-warning bg-muted px-2 py-1.5 text-[12px]" role="status">
                <span className="font-medium text-warning">Recovered after reload</span>
                <span className="text-muted-foreground">This execution was interrupted. The saved trace remains available for review.</span>
              </div>
            )}

            {message.status === "cancelled" && (
              <div className="mb-2 flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1.5 text-[12px]" role="status">
                <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-muted-foreground">Stopped</span>
                <span className="text-muted-foreground">This response was interrupted.</span>
              </div>
            )}

            {message.status === "paused" && (
              <div className="mb-2 flex items-center gap-1.5 rounded-md border border-warning bg-muted px-2 py-1.5 text-[12px]" role="status" aria-live="polite">
                <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                <span className="font-medium text-warning">Paused</span>
                <span className="text-muted-foreground">Execution is waiting at a safe boundary.</span>
              </div>
            )}

            {tracePersistencePresentation && (
              <div className="mb-2 flex items-start gap-1.5 rounded-md border border-warning bg-muted px-2 py-1.5 text-[12px]" role="status">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                <div className="min-w-0">
                  <span className="font-medium text-warning">{tracePersistencePresentation.title}</span>
                  <span className="ml-1 text-muted-foreground">{tracePersistencePresentation.summary}</span>
                  <div className="text-[11px] text-muted-foreground">Next: {tracePersistencePresentation.actionLabel}</div>
                </div>
              </div>
            )}

            {message.status === "sending" && !hasVisibleAnswer && !hasResearchProgress && !hasVisibleProgress ? (
              <StreamingSkeleton compact={compact} />
            ) : (
              <>
                {visibleGroupedSteps.length > 0 ? (
                  <>
                    <div className={cn("space-y-1", compact && "space-y-0.5")}>
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
                      <div
                        key={stepKey}
                        className="animate-in fade-in duration-150 motion-reduce:transition-none"
                      >
                      {step.type === "text" ? (
                        <div className="prose-frontier">
                          <div className="flex flex-col gap-1">
                            {renderTextStepWithInlineCards(
                              step,
                              message.status === "sending",
                              onOpenArtifact,
                              message.sessionId,
                              message.id,
                              allowGenerativeUI,
                            )}
                          </div>
                        </div>
                        ) : step.type === "reasoning" ? (
                          <ReasoningBlock 
                            content={step.content || ""}
                            sections={step.reasoningSections}
                            isThinking={message.status === "sending" && idx === visibleGroupedSteps.length - 1}
                          />
                        ) : step.type === "tool-group" && step.toolCalls ? (
                          <div className="space-y-1">
                            <ExecutionGroup
                              toolCalls={step.toolCalls}
                              executionSteps={executionActionSteps}
                              sessionId={message.sessionId}
                              messageId={message.id}
                              onOpenArtifact={onOpenArtifact}
                              preferCompact
                            />
                          </div>
                        ) : step.type === "subagent" && step.subagent ? (
                          <SubagentExecutionCard
                            step={step}
                            childToolCalls={message.toolCalls || []}
                            childAgents={delegationTree.childrenByParent.get(step.subagent.spawnId) || []}
                            delegation={delegationTree.nodes.get(step.subagent.spawnId)}
                            delegationTree={delegationTree}
                            messageId={message.id}
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
                    {message.content?.trim() && !hasVisibleTextStep && (
                      <div className="prose-frontier mt-1">
                        <MarkdownContent
                          content={message.content}
                          isThinking={message.isThinking}
                          isStreaming={message.status === "sending"}
                          onOpenArtifact={onOpenArtifact}
                          chatId={message.sessionId}
                          messageId={message.id}
                          allowGenerativeUI={allowGenerativeUI}
                        />
                        </div>
                    )}
                  </>
                ) : (
                  <div className="prose-frontier">
                    {/* Fallback for messages with only raw content or legacy structure */}
                    <MarkdownContent
                      content={message.content || ""}
                      isThinking={message.isThinking}
                      isStreaming={message.status === "sending"}
                      onOpenArtifact={onOpenArtifact}
                      chatId={message.sessionId}
                      messageId={message.id}
                      allowGenerativeUI={allowGenerativeUI}
                    />
                  </div>
                )}


              </>
            )}
            
             {inlineError && (
              <div
                className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3"
              >
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                  <div className="flex flex-col gap-1 font-sans">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-destructive">{errorPresentation?.title || "Operation failed"}</span>
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
                    <p className="text-[12px] text-destructive leading-relaxed mt-0.5">
                      {inlineError}
                    </p>
                    {errorPresentation && errorPresentation.action !== "none" && (
                      <div className="text-[11px] text-muted-foreground">Next: {errorPresentation.actionLabel}</div>
                    )}
                    {technicalError && technicalError !== inlineError && (
                      <details className="mt-1 rounded-md border border-destructive/20 bg-background px-2 py-1">
                        <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground">
                          Technical details
                        </summary>
                        <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-muted-foreground">
                          {technicalError}
                        </pre>
                      </details>
                    )}
                  </div>
                  
                  {errorPresentation?.action === "configure_provider" && (
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

            {allowGenerativeUI && message.artifact?.type === "openui" && (
              <div className="min-w-0 overflow-visible rounded-md border border-border bg-card p-2">
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
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3 cursor-pointer hover:bg-muted transition-all group/art"
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
                  <span className="text-[11px] text-muted-foreground uppercase tracking-widest font-mono mt-0.5">
                    {message.artifact.type} · Generated Module
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            </div>
          </div>

            {showMessageActions && (
            <div className={cn(
              "flex items-center gap-1 transition-opacity [@media(pointer:coarse)]:opacity-100 [@media(pointer:coarse)]:pointer-events-auto mt-1",
              isLast
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
            )}>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                className="h-7 px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-transparent border border-border hover:bg-muted gap-1.5 transition-all"
                onClick={() => copy(message.content)}
              >
                {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                Copy
              </Button>
              {onRetry && message.status === "failed" && errorPresentation?.retryable !== false && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  className="h-7 px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-transparent border border-border hover:bg-muted gap-1.5 transition-all"
                  onClick={() => onRetry(message.id)}
                >
                  <RefreshCcw className="h-3 w-3" />
                  Retry
                </Button>
              )}
            </div>
          )}

          {(message.metadata as any)?.stopReason && (message.metadata as any).stopReason !== "complete" && (
            <div className="mt-1">
              <Button
                size="sm"
                variant="outline"
                type="button"
                className="h-7 px-3 text-[11px] font-medium border-warning text-warning hover:bg-warning/10 gap-1.5"
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
