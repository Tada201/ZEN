import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Check, Copy, FileText, Code2, AlertTriangle, ChevronRight, Zap,
  ThumbsUp, ThumbsDown, ArrowRightLeft, Bot, HelpCircle, ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Message, ArtifactData } from "./types";
import { MarkdownContent } from "./MarkdownContent";
import { ReasoningBlock } from "./ReasoningBlock";
import { ToolCallCard } from "../ToolCallCard";
import { useCopy } from "./CodeBlock";
import { StreamingSkeleton } from "./StreamingSkeleton";
import { PremiumCard } from "../genui/PremiumCard";

interface ParsedCard {
  type: string;
  data: any;
  raw: string;
}

function parseCardTags(text: string): { cards: ParsedCard[]; cleanText: string } {
  const cards: ParsedCard[] = [];
  
  if (!text || typeof text !== 'string') {
    return { cards, cleanText: text || '' };
  }

  const regex = /<card>\s*([\s\S]*?)\s*<\/card>/gi;
  let match;
  const replacements: { start: number; end: number }[] = [];

  while ((match = regex.exec(text)) !== null) {
    const rawTag = match[0];
    const jsonContent = match[1];

    try {
      const parsed = JSON.parse(jsonContent.trim());
      if (parsed && typeof parsed === 'object') {
        cards.push({
          type: parsed.type || parsed.card || 'unknown',
          data: parsed.data || parsed,
          raw: rawTag
        });
        replacements.push({ start: match.index, end: match.index + rawTag.length });
      }
    } catch (e) {
      // Partial JSON during stream - skip until complete
    }
  }

  let cleanText: string;
  if (replacements.length > 0) {
    const parts: string[] = [];
    let lastEnd = 0;
    for (const { start, end } of replacements) {
      parts.push(text.slice(lastEnd, start));
      lastEnd = end;
    }
    parts.push(text.slice(lastEnd));
    cleanText = parts.join('').trim();
  } else {
    cleanText = text;
  }

  if (cleanText.includes('<card>')) {
    const idx = cleanText.indexOf('<card>');
    const afterCard = cleanText.substring(idx + 6).trimStart();
    if (afterCard.startsWith('{') || afterCard.startsWith('[')) {
      cleanText = cleanText.substring(0, idx).trim();
    } else {
      cleanText = cleanText.replace('<card>', '');
    }
  }

  return { cards, cleanText };
}

function RotateCcw(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
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
  onOpenSettings?: (tab: any, provider?: string) => void;
  compact?: boolean;
}) {
  const { copied, copy } = useCopy();

  const groupedSteps = useMemo(() => {
    if (!message.steps || message.steps.length === 0) return [];
    
    const grouped: any[] = [];
    message.steps.filter(Boolean).forEach((step) => {
      const last = grouped[grouped.length - 1];
      if (last && last.type === "text" && step.type === "text") {
        last.content = (last.content || "") + (step.content || "");
      } else if (last && last.type === "reasoning" && step.type === "reasoning") {
        last.content = (last.content || "").trim() + "\n" + (step.content || "").trim();
      } else {
        grouped.push({ ...step });
      }
    });

    return grouped.map(step => {
      if (step.type === "text") {
        const { cards, cleanText } = parseCardTags(step.content || "");
        return { ...step, cards, cleanText };
      }
      return step;
    });
  }, [message.steps]);

  const mainContentCards = useMemo(() => {
    return parseCardTags(message.content || "");
  }, [message.content]);

  const groupedToolCalls = useMemo(() => {
    if (!message.toolCalls || message.toolCalls.length === 0) return [];
    
    const grouped: any[] = [];
    message.toolCalls.forEach((tc) => {
      const prev = grouped[grouped.length - 1];
      if (prev && prev.name === tc.name && prev.status === 'error' && tc.status !== 'error') {
        prev.retries = (prev.retries || 0) + 1;
        prev.status = tc.status;
        prev.output = tc.output;
        prev.id = tc.id;
      } else {
        grouped.push({ ...tc, retries: 0 });
      }
    });
    return grouped;
  }, [message.toolCalls]);

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
            {message.kind === "agent_handoff" && message.metadata?.handoff && (
              <div className="flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 mb-3">
                <ArrowRightLeft className="h-4 w-4 text-blue-400 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-blue-300">
                    Agent {message.metadata.handoff.fromAgent} handed off to Agent {message.metadata.handoff.toAgent}
                  </span>
                  {message.metadata.handoff.reason && (
                    <span className="text-[10px] text-blue-400/70">{message.metadata.handoff.reason}</span>
                  )}
                </div>
              </div>
            )}
            {message.kind === "agent_spawn" && message.metadata?.spawn && (
              <div className="flex items-center gap-3 rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3 mb-3">
                <Bot className="h-4 w-4 text-purple-400 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-purple-300">
                    Agent {message.metadata.spawn.parentAgent} spawned Agent {message.metadata.spawn.childAgent}
                  </span>
                  {message.metadata.spawn.task && (
                    <span className="text-[10px] text-purple-400/70">{message.metadata.spawn.task}</span>
                  )}
                </div>
              </div>
            )}
            {message.kind === "approval_request" && message.metadata?.approvalRequest && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 mb-3">
                <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-amber-300">
                    Approval Required: {message.metadata.approvalRequest.tool_name}
                  </span>
                  {message.metadata.approvalRequest.context?.description && (
                    <span className="text-[10px] text-amber-400/80">
                      {message.metadata.approvalRequest.context.description}
                    </span>
                  )}
                  {message.metadata.approvalRequest.context?.risk_level && (
                    <span className={cn(
                      "text-[10px] font-medium uppercase tracking-wider mt-0.5",
                      message.metadata.approvalRequest.context.risk_level === "critical" && "text-red-400",
                      message.metadata.approvalRequest.context.risk_level === "high" && "text-orange-400",
                      message.metadata.approvalRequest.context.risk_level === "medium" && "text-amber-400",
                      message.metadata.approvalRequest.context.risk_level === "low" && "text-green-400",
                    )}>
                      Risk: {message.metadata.approvalRequest.context.risk_level}
                    </span>
                  )}
                </div>
              </div>
            )}
            {message.kind === "clarification_request" && message.metadata?.clarificationRequest && (
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-4 py-3 mb-3 italic">
                <HelpCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-amber-300">Clarification Needed</span>
                  <span className="text-xs text-amber-400/80 italic">{message.metadata.clarificationRequest.question}</span>
                  {message.metadata.clarificationRequest.options && message.metadata.clarificationRequest.options.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {message.metadata.clarificationRequest.options.map((opt: any) => (
                        <span key={opt.id} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                          {opt.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className={cn("space-y-6", compact && "space-y-3")}>
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

            {message.status === "sending" && !message.content && !message.steps?.length ? (
              <StreamingSkeleton compact={compact} />
            ) : (
              <>
                {groupedSteps.length > 0 ? (
                  <div className={cn("space-y-6", compact && "space-y-3")}>
                    {groupedSteps.map((step, idx) => (
                      <div key={idx} className="animate-in fade-in slide-in-from-top-1 duration-300">
                        {step.type === "text" ? (
                          <div className="prose-frontier">
                            <div className="flex flex-col gap-4">
                              {step.cards && step.cards.length > 0 && (
                                <div className="flex flex-wrap gap-4 my-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                  {step.cards.map((card: any, idx: number) => (
                                    <PremiumCard key={idx} type={card.type} data={card.data} />
                                  ))}
                                </div>
                              )}
                              {step.cleanText && (
                                <MarkdownContent
                                  content={step.cleanText}
                                  isThinking={false}
                                  isStreaming={message.status === "sending"}
                                  onOpenArtifact={onOpenArtifact}
                                />
                              )}
                            </div>
                          </div>
                        ) : step.type === "reasoning" ? (
                          <ReasoningBlock 
                            content={step.content || ""} 
                            isThinking={message.status === "sending" && idx === groupedSteps.length - 1}
                          />
                        ) : step.toolCall ? (
                          <ToolCallCard
                            toolCall={step.toolCall}
                            className="my-2 w-full"
                            onViewArtifact={onOpenArtifact}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupedToolCalls.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/20">
                            Agent Operations
                          </span>
                          <div className="h-px flex-1 bg-border/20" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {groupedToolCalls.map((tc, idx) => (
                            <ToolCallCard
                                key={`${tc.id}-${idx}`}
                                toolCall={tc}
                                className="my-0 w-full ml-0 pl-0 max-w-full"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="prose-frontier">
                      <div className="flex flex-col gap-4">
                        {mainContentCards.cards.length > 0 && (
                          <div className="flex flex-wrap gap-4 my-2 animate-in fade-in slide-in-from-top-2 duration-300">
                            {mainContentCards.cards.map((card: any, idx: number) => (
                              <PremiumCard key={idx} type={card.type} data={card.data} />
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
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-destructive uppercase tracking-widest">Operation Failed</span>
                    <p className="text-[12px] text-destructive/80 leading-relaxed font-mono">
                      {message.error}
                    </p>
                  </div>
                  
                  {(message.error.toLowerCase().includes("key") || message.error.toLowerCase().includes("auth")) && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-fit h-8 text-[11px] font-bold uppercase tracking-wider border-destructive/30 text-destructive hover:bg-destructive/10"
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
            {message.kind === "approval_request" && (() => {
              const toolCallId = message.metadata?.approvalRequest?.tool_call_id as string | undefined;
              const resolveApproval = (approved: boolean) => {
                if (!toolCallId) return;
                invoke("resolve_tool_approval", { toolCallId, approved }).catch((e) =>
                  console.error("resolve_tool_approval failed:", e)
                );
              };
              return (
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[11px] font-bold uppercase tracking-wider border-destructive/30 text-destructive hover:bg-destructive/10 gap-1.5"
                    onClick={() => resolveApproval(false)}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                    Deny
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-[11px] font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
                    onClick={() => resolveApproval(true)}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                </div>
              );
            })()}

          {/* Action Menu (Assistant only) */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 gap-1.5"
              onClick={() => copy(message.content)}
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              Copy
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 gap-1.5"
              onClick={() => onRetry?.(message.id)}
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
