import React, { Suspense, useMemo } from "react";
import {
  Check, Copy, FileText, Code2, AlertTriangle, ChevronRight, RefreshCcw, Zap, X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type ChatStatusPhase } from "@/api/chatStatus";
import type { Message, ArtifactData, Step } from "./types";
import type { SettingsTabId } from "@/lib/features/frontendFeatures";
import type { ParsedCard } from "./assistantMessageParts";
import { groupAssistantSteps, groupToolCalls, legacyMessageToActionStep, shouldShowPostToolWorking } from "./assistantMessageParts";
import { MarkdownContent } from "./MarkdownContent";
import { ReasoningBlock } from "./ReasoningBlock";
import { useCopy } from "./CodeBlock";
import { StreamingSkeleton } from "./StreamingSkeleton";
import {
  AgentActionStep,
  ResearchTimeline,
} from "./AssistantMessageTrace";
import { AgentExecutionTrace } from "./AgentExecutionTrace";

const PremiumCard = React.lazy(() => import("../genui/PremiumCard").then(m => ({ default: m.PremiumCard })));
const OpenUIRenderer = React.lazy(() => import("../OpenUIRenderer").then(m => ({ default: m.OpenUIRenderer })));

const CardFallback = () => (
  <div className="h-24 w-64 rounded-xl border border-border/30 bg-card/20" aria-hidden="true" />
);

// Chat-status phases (agent_streaming, tool_call_ready, tool_call_streaming, ...)
// duplicate the tool execution trace, so none render as their own timeline row.
// Clarification/approval/error surface through their own step kinds, not here.
const VISIBLE_CHAT_STATUS_PHASES: ReadonlySet<ChatStatusPhase> = new Set([]);


function isVisibleChatStatusStep(step: Step) {
  const phase = step.metadata?.phase;
  return step.kind !== "chat_status" || (typeof phase === "string" && VISIBLE_CHAT_STATUS_PHASES.has(phase as ChatStatusPhase));
}

function isVisibleChatActionStep(step: Step) {
  if (step.type !== "action") return true;
  if (!isVisibleChatStatusStep(step)) return false;
  
  if (step.kind === "chat_status") {
    return true;
  }

  return (
    step.kind === "clarification_request"
  );
}

function shouldShowToolGroupInTimeline(
  step: { type: "tool-group"; toolCalls: Array<{ status: string }> },
  isStreaming: boolean,
  hasAssistantAnswer: boolean,
) {
  if (step.toolCalls.length === 0) return false;
  const hasActionableTool = step.toolCalls.some((tool) =>
    tool.status === "running" || tool.status === "awaiting_approval" || tool.status === "error"
  );
  if (hasActionableTool) return true;
  return isStreaming && !hasAssistantAnswer;
}

function RenderPremiumCard({ card }: { card: ParsedCard }) {
  return (
    <Suspense fallback={<CardFallback />}>
      <PremiumCard type={card.type} data={card.data} />
    </Suspense>
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
  const groupedSteps = useMemo(() => {
    const legacyStep = legacyMessageToActionStep(message);
    return groupAssistantSteps(message.steps?.length ? message.steps : legacyStep ? [legacyStep] : undefined);
  }, [message]);

  const groupedToolCalls = useMemo(() => {
    return groupToolCalls(message.toolCalls);
  }, [message.toolCalls]);

  const executionActionSteps = useMemo<Step[]>(() => {
    return groupedSteps
      .filter((step) => step.type === "action")
      .map((step) => step as Step);
  }, [groupedSteps]);

  const hasAssistantAnswerText = useMemo(() => {
    return Boolean(
      message.content?.trim() ||
      groupedSteps.some((step) =>
        step.type === "text" && Boolean((step.cleanText || step.content || "").trim())
      )
    );
  }, [groupedSteps, message.content]);

  const visibleGroupedSteps = useMemo(() => {
    return groupedSteps.filter((step) => {
      if (step.type === "tool-group") {
        return shouldShowToolGroupInTimeline(step, message.status === "sending", hasAssistantAnswerText);
      }
      return step.type !== "action" || isVisibleChatActionStep(step as Step);
    });
  }, [groupedSteps, hasAssistantAnswerText, message.status]);

  const showPostToolWorking = useMemo(() => {
    if (visibleGroupedSteps.length > 0) {
      return shouldShowPostToolWorking(visibleGroupedSteps, message.status === "sending");
    }
    return message.status === "sending" && groupedToolCalls.length > 0 && groupedToolCalls.every(
      (tool) => tool.status === "completed" || tool.status === "error",
    );
  }, [groupedToolCalls, message.status, visibleGroupedSteps]);

  const hasVisibleAnswer = Boolean(
    message.content?.trim() ||
    message.reasoning?.trim() ||
    (message.status === "failed" && message.error?.trim()) ||
    message.artifact ||
    groupedSteps.some((step) =>
      step.type === "text"
        ? Boolean((step.cleanText || step.content || "").trim())
        : step.type === "reasoning" ||
          (step.type === "tool-group" && shouldShowToolGroupInTimeline(step, message.status === "sending", hasAssistantAnswerText))
    ) ||
    (message.status === "sending" && groupedToolCalls.length > 0)
  );
  const hasVisibleProgress = visibleGroupedSteps.some((step) => step.type === "action");

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
          wasCancelled && "animate-out fade-out slide-out-to-top-2 duration-300 fill-mode-forwards"
        )}>
        <div className="flex min-w-0 flex-col gap-2 flex-1">
          <div className="relative">
            <div className={cn("space-y-4", compact && "space-y-2")}>
              {(message.model || message.provider) && (
                <div className="flex items-center gap-2 mb-2 select-none">
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bold uppercase tracking-wider bg-primary/20 backdrop-blur-sm border-primary/20 text-primary/70 hover:bg-primary/30 transition-colors shadow-sm">
                    <Zap className="mr-1 h-3 w-3" />
                    {message.model || "Default"}
                    {message.provider && (
                      <span className="ml-1 opacity-40 border-l border-primary/20 pl-1">
                        {message.provider}
                      </span>
                    )}
                  </Badge>
                </div>
              )}

              {message.metadata?.researchSteps && message.metadata.researchSteps.length > 0 && (
                <ResearchTimeline steps={message.metadata.researchSteps} />
              )}

            {message.status === "sending" && !hasVisibleAnswer && !hasResearchProgress && !hasVisibleProgress ? (
              <StreamingSkeleton compact={compact} />
            ) : (
              <>
                {visibleGroupedSteps.length > 0 ? (
                  <div className={cn("space-y-4", compact && "space-y-2")}>
                    {visibleGroupedSteps.map((step, idx) => {
                      const stepKey = step.type === "tool-group" 
                        ? `tool-group-${idx}-${step.toolCalls.map(t => t.id).join("-")}`
                        : step.type === "action" 
                          ? `action-${step.eventId || idx}`
                          : `${step.type}-${idx}`;
                      
                      return (
                      <div key={stepKey} className="animate-in fade-in slide-in-from-top-1 duration-300">
                      {step.type === "text" ? (
                        <div className="prose-frontier">
                            <div className="flex flex-col gap-4">
                              {step.cards && step.cards.length > 0 && (
                                <div className="flex flex-wrap gap-4 my-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                  {step.cards.map((card, idx) => (
                                    <RenderPremiumCard key={idx} card={card} />
                                  ))}
                                </div>
                              )}
                              {Boolean(step.cleanText || step.content) && (
                                <MarkdownContent
                                  content={step.cleanText || step.content || ""}
                                  isThinking={false}
                                  isStreaming={message.status === "sending"}
                                  onOpenArtifact={onOpenArtifact}
                                  chatId={message.sessionId}
                                />
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
                            <AgentExecutionTrace
                              toolCalls={step.toolCalls}
                              executionSteps={executionActionSteps}
                              sessionId={message.sessionId}
                              onOpenArtifact={onOpenArtifact}
                              isStreaming={message.status === "sending"}
                              preferCompact
                            />
                          </div>
                        ) : step.type === "action" ? (
                          <AgentActionStep step={step} isStreaming={message.status === "sending"} />
                        ) : null}
                      </div>
                      );
                    })}
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

                {showPostToolWorking && (
                  <div
                    className="flex min-h-7 items-center gap-2 text-[12px] text-muted-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin text-primary/70" />
                    <span>Working on the response...</span>
                  </div>
                )}
              </>
            )}
            
             {inlineError && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 animate-in fade-in zoom-in-95 duration-200">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex flex-1 flex-col gap-2 min-w-0">
                  <div className="flex flex-col gap-1 font-sans">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-destructive">Operation Failed</span>
                      {onDismissError && (
                        <button
                          type="button"
                          onClick={() => onDismissError(message.id)}
                          className="flex items-center justify-center h-5 w-5 rounded-md text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                          aria-label="Dismiss error"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-[12px] text-destructive/80 leading-relaxed font-mono mt-0.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                      {inlineError}
                    </p>
                  </div>
                  
                  {(inlineError.toLowerCase().includes("key") || inlineError.toLowerCase().includes("auth")) && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      type="button"
                      className="w-fit h-8 text-xs font-medium border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => onOpenSettings?.("providers", message.provider)}
                    >
                      Configure {message.provider || "Provider"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {message.artifact?.type === "openui" && (
              <div className="min-w-0 overflow-visible rounded-lg border border-border/40 bg-card/20 p-3">
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
                className="flex items-center gap-4 rounded-xl border border-border/40 bg-card/40 p-4 cursor-pointer hover:bg-muted/40 transition-all group/art"
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
                  <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-mono mt-0.5">
                    {message.artifact.type} · Generated Module
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
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
                className="h-7 px-2.5 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-muted/50 border border-border hover:bg-muted gap-1.5 transition-all"
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
                  className="h-7 px-2.5 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-muted/50 border border-border hover:bg-muted gap-1.5 transition-all"
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
                  className="h-7 px-2.5 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-muted/50 border border-border hover:bg-muted gap-1.5 transition-all"
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
                className="h-7 px-3 text-[10px] font-medium border-amber-400/20 text-warning/80 hover:bg-amber-400/5 hover:text-amber-200 gap-1.5"
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
