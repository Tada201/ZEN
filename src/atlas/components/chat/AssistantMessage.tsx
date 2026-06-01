import React, { Suspense, useMemo } from "react";
import { 
  Check, Copy, FileText, Code2, AlertTriangle, ChevronRight, RefreshCcw, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Message, ArtifactData, Step } from "./types";
import type { SettingsTabId } from "@/lib/features/frontendFeatures";
import type { ParsedCard } from "./assistantMessageParts";
import { groupAssistantSteps, groupToolCalls, legacyMessageToActionStep, parseCardTags } from "./assistantMessageParts";
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

const CardFallback = () => (
  <div className="h-24 w-64 rounded-xl border border-border/30 bg-card/20" aria-hidden="true" />
);

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
  compact,
}: {
  message: Message;
  onOpenArtifact: (a: ArtifactData) => void;
  onRetry?: (id: string) => void;
  onOpenSettings?: (tab: SettingsTabId, provider?: string) => void;
  compact?: boolean;
}) {
  const { copied, copy } = useCopy();
  const groupedSteps = useMemo(() => {
    const legacyStep = legacyMessageToActionStep(message);
    return groupAssistantSteps(message.steps?.length ? message.steps : legacyStep ? [legacyStep] : undefined);
  }, [message]);

  const mainContentCards = useMemo(() => {
    return parseCardTags(message.content || "");
  }, [message.content]);

  const groupedToolCalls = useMemo(() => {
    return groupToolCalls(message.toolCalls);
  }, [message.toolCalls]);

  const executionActionSteps = useMemo<Step[]>(() => {
    return groupedSteps
      .filter((step) => step.type === "action" && (step.kind !== "chat_status" || step.metadata?.phase === "tool_call_streaming" || step.metadata?.phase === "tool_call_ready"))
      .map((step) => step as Step);
  }, [groupedSteps]);

  const visibleGroupedSteps = useMemo(() => {
    return groupedSteps.filter((step) => step.type !== "action" || step.kind !== "chat_status" || step.metadata?.phase === "tool_call_streaming" || step.metadata?.phase === "tool_call_ready");
  }, [groupedSteps]);

  const hasVisibleAnswer = Boolean(
    message.content?.trim() ||
    message.reasoning?.trim() ||
    message.error ||
    message.artifact ||
    groupedSteps.some((step) =>
      step.type === "text"
        ? Boolean((step.cleanText || step.content || "").trim())
        : step.type === "reasoning" || step.type === "tool-group"
    ) ||
    groupedToolCalls.length > 0
  );
  const hasVisibleProgress = visibleGroupedSteps.some((step) => step.type === "action");

  const hasOnlyLiveProgress =
    !hasVisibleAnswer &&
    groupedSteps.length > 0 &&
    groupedSteps.every((step) =>
      step.type === "action" &&
      (step.kind === "orchestrator_progress" || step.kind === "chat_status")
    );

  const showMessageActions = hasVisibleAnswer && !hasOnlyLiveProgress;
  const hasResearchProgress = Boolean(message.metadata?.researchSteps?.length);

  return (
    <div
      className={cn(
        "group flex w-full flex-col px-4 transition-all duration-200",
        compact ? "bg-transparent py-2" : "bg-transparent py-4",
        "hover:bg-white/[0.015]"
      )}
    >
      <div className={cn(
        "mx-auto flex w-full items-start gap-0",
        compact ? "max-w-full" : "max-w-[800px]"
      )}>
        <div className="flex min-w-0 flex-col gap-2 flex-1">
          <div className="relative">
            <div className={cn("space-y-4", compact && "space-y-2")}>
            {(message.model || message.provider) && (
                <div className="flex items-center gap-2 mb-2 select-none">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bold uppercase tracking-wider bg-primary/5 border-primary/10 text-primary/60 hover:bg-primary/10 transition-colors">
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
                    {visibleGroupedSteps.map((step, idx) => (
                      <div key={idx} className="animate-in fade-in slide-in-from-top-1 duration-300">
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
                              {step.cleanText && (
                                <MarkdownContent
                                  content={step.cleanText}
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
                            isThinking={message.status === "sending" && idx === groupedSteps.length - 1}
                          />
                        ) : step.type === "tool-group" && step.toolCalls ? (
                          <AgentExecutionTrace 
                            toolCalls={step.toolCalls}
                            executionSteps={executionActionSteps}
                            sessionId={message.sessionId}
                            onOpenArtifact={onOpenArtifact}
                            isStreaming={message.status === "sending"}
                          />
                        ) : step.type === "action" ? (
                          <AgentActionStep step={step} isStreaming={message.status === "sending"} />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={cn("space-y-4", compact && "space-y-2")}>
                    {groupedToolCalls.length > 0 && (
                      <AgentExecutionTrace 
                        toolCalls={groupedToolCalls}
                        executionSteps={executionActionSteps}
                        sessionId={message.sessionId}
                        onOpenArtifact={onOpenArtifact}
                        isStreaming={message.status === "sending"}
                      />
                    )}

                    <div className="prose-frontier">
                      <div className="flex flex-col gap-4">
                        {mainContentCards.cards.length > 0 && (
                          <div className="flex flex-wrap gap-4 my-2 animate-in fade-in slide-in-from-top-2 duration-300">
                            {mainContentCards.cards.map((card, idx) => (
                              <RenderPremiumCard key={idx} card={card} />
                            ))}
                          </div>
                        )}
                        {(mainContentCards.cleanText || message.reasoning || message.isThinking) && (
                          <MarkdownContent
                            content={mainContentCards.cleanText}
                            reasoning={message.reasoning}
                            isThinking={message.isThinking}
                            isStreaming={message.status === "sending"}
                            onOpenArtifact={onOpenArtifact}
                            chatId={message.sessionId}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            
             {message.error && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 animate-in fade-in zoom-in-95 duration-200">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-col gap-1 font-sans">
                    <span className="text-xs font-semibold text-destructive">Operation Failed</span>
                    <p className="text-[12px] text-destructive/80 leading-relaxed font-mono mt-0.5">
                      {message.error}
                    </p>
                  </div>
                  
                  {(message.error.toLowerCase().includes("key") || message.error.toLowerCase().includes("auth")) && (
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

            {message.artifact && (
              <div 
                className="flex items-center gap-4 rounded-xl border border-border/40 bg-card/40 p-4 cursor-pointer hover:bg-muted/40 transition-all group/art"
                onClick={() => onOpenArtifact(message.artifact!)}
              >
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover/art:scale-105",
                  message.artifact.type === "openui" 
                    ? "bg-purple-500/10 text-purple-500"
                    : "bg-blue-500/10 text-blue-500"
                )}>
                  {message.artifact.type === "code" ? <Code2 className="h-5 w-5" /> : 
                    message.artifact.type === "openui" ? <Zap className="h-5 w-5" /> :
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
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
              <Button
                size="sm"
                variant="ghost"
                type="button"
                className="h-7 px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 gap-1.5"
                onClick={() => copy(message.content)}
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                Copy
              </Button>
              {onRetry && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  className="h-7 px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 gap-1.5"
                  onClick={() => onRetry(message.id)}
                >
                  <RefreshCcw className="h-3 w-3" />
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
