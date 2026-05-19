import { useMemo } from "react";
import { 
  Copy, Check, FileText, Code2, AlertTriangle, ChevronRight, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Message, ArtifactData, normalizeVercelMessage } from "./types";
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

  // Single-pass regex: collect all card matches and their positions
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

  // Build clean text in one pass by skipping matched regions
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

  // Also clean up any unclosed trailing <card> tags so they don't render raw JSON text to user during streaming
  if (cleanText.includes('<card>')) {
    const idx = cleanText.indexOf('<card>');
    cleanText = cleanText.substring(0, idx).trim();
  }

  return { cards, cleanText };
}

export function MessageItem({
  message: rawMessage,
  onOpenArtifact,
  onRetry,
  onOpenSettings,
  compact,
}: {
  message: Message;
  onOpenArtifact: (a: ArtifactData) => void;
  onRetry?: (id: string) => void;
  onOpenSettings?: (tab: any, provider?: string) => void;
  isStreaming?: boolean;
  compact?: boolean;
}) {
  const { copied, copy } = useCopy();
  const message = useMemo(() => normalizeVercelMessage(rawMessage), [rawMessage]);
  const isAssistant = message.role === "assistant";

  // Group consecutive steps of the same type and pre-parse card tags to avoid repeats on streaming tokens
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

    // Pre-parse cards and cleanText for all text steps inside useMemo
    return grouped.map(step => {
      if (step.type === "text") {
        const { cards, cleanText } = parseCardTags(step.content || "");
        return { ...step, cards, cleanText };
      }
      return step;
    });
  }, [message.steps]);

  // Memoize card tag parsing on main content
  const mainContentCards = useMemo(() => {
    return parseCardTags(message.content || "");
  }, [message.content]);

  // Memoize legacy tool call operations grouping
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
        isAssistant ? (compact ? "bg-transparent py-2" : "bg-transparent py-4") : (compact ? "bg-transparent py-1" : "bg-transparent py-2"),
        "hover:bg-white/[0.015]"
      )}
    >
      <div className={cn(
        "mx-auto flex w-full items-start gap-0",
        compact ? "max-w-full" : "max-w-[800px]",
        !isAssistant && "justify-end"
      )}>
        {/* Content Area */}
        <div className={cn(
          "flex min-w-0 flex-col gap-2",
          isAssistant ? "flex-1" : "max-w-[85%]"
        )}>
          <div className="relative">
            {isAssistant ? (
              <div className={cn("space-y-6", compact && "space-y-3")}>
                {/* Model & Provider Badge */}
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

                {/* Streaming Skeleton for preparing messages */}
                {message.status === "sending" && !message.content && !message.steps?.length ? (
                  <StreamingSkeleton compact={compact} />
                ) : (
                  <>
                    {/* Interleaved Steps or Legacy Grouped View */}
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
                        {/* Legacy Grouped View (Fallback) */}
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

                        {/* Main Content (Fallback) */}
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
                
                {/* Error Message */}
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

                {/* Inline Artifact Shortcut */}
                {message.artifact && message.artifact.type !== "openui" && (
                  <div 
                    className="flex items-center gap-4 rounded-xl border border-border/40 bg-card/40 p-4 cursor-pointer hover:bg-muted/40 transition-all group/art"
                    onClick={() => onOpenArtifact(message.artifact!)}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 group-hover/art:scale-105 transition-transform">
                      {message.artifact.type === "code" ? <Code2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
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
            ) : (
              <div className="flex items-end gap-3 group/user">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 opacity-0 group-hover/user:opacity-100 transition-opacity mb-1 shrink-0"
                  onClick={() => copy(message.content)}
                  title="Copy message"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
                <div className="rounded-2xl border border-primary/20 bg-primary/10 px-5 py-3 shadow-md text-[14px] leading-relaxed text-foreground/90 font-medium ring-1 ring-primary/5">
                  {message.content}
                </div>
              </div>
            )}
          </div>
          
          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className={cn(
              "mt-2 flex flex-wrap gap-2",
              !isAssistant && "justify-end pr-11"
            )}>
              {message.attachments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-1.5 text-xs shadow-sm"
                >
                  {a.type === "image" ? (
                    <div className="h-10 w-10 overflow-hidden rounded border border-border">
                      <img src={a.data} alt={a.name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-muted/50">
                      {a.type === "pdf" ? <FileText className="h-4 w-4 text-red-500" /> : <Paperclip className="h-4 w-4" />}
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="font-medium truncate max-w-[120px]">{a.name}</span>
                    <span className="text-[10px] opacity-40 uppercase tracking-tighter">{a.type}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Action Menu (Assistant only - user copy is moved next to bubble) */}
          {isAssistant && (
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
          )}
        </div>
      </div>
    </div>
  );
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

function Paperclip(props: any) {
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
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

