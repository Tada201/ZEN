import { useState, useEffect, useRef, useMemo, memo, useCallback, useDeferredValue } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from "rehype-katex";
import 'katex/dist/katex.min.css';

interface ReasoningBlockProps {
  content: string;
  isThinking?: boolean;
  className?: string;
  defaultOpen?: boolean;
}

function normalizeMathMarkdown(content: string): string {
  return content
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_match, math) => `\n$$\n${math.trim()}\n$$\n`)
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_match, math) => `$${math.trim()}$`)
    .replace(
      /(^|\n)\s*\[\s*\n([\s\S]*?\\begin\{(?:aligned|align|equation|gather|matrix|pmatrix|bmatrix|cases)\}[\s\S]*?)\n\s*\]\s*(?=\n|$)/g,
      (_match, prefix, math) => `${prefix}$$\n${math.trim()}\n$$`,
    )
    .replace(
      /\$\$\n([\s\S]*?)\n\$\$/g,
      (_match, math) => `$$\n${math.replace(/\\\s*\n/g, "\\\\\n").trim()}\n$$`,
    );
}

function formatThoughtDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
}

const MemoReasoningContent = memo(function MemoReasoningContent({ content }: { content: string }) {
  const normalizedContent = useMemo(() => normalizeMathMarkdown(content.trim()), [content]);
  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath], []);
  const rehypePlugins = useMemo(() => [rehypeKatex] as any, []);

  if (!content) return null;

  return (
    <div className="font-mono text-[12px] leading-[1.65] text-muted-foreground prose prose-invert max-w-none prose-p:my-2 prose-p:first:mt-0 prose-p:last:mb-0 prose-pre:my-2 prose-pre:bg-muted prose-pre:p-2 prose-code:px-1 prose-code:bg-muted prose-code:rounded-sm prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-a:text-muted-foreground prose-a:underline">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          img: () => null,
          code({ className, children }) {
            const isBlock = /language-/.test(className || '');
            return <code className={cn("font-mono bg-muted rounded px-1 py-0.5", isBlock ? "block my-2 p-2" : "")}>{children}</code>;
          }
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
});

export const ReasoningBlock = memo(function ReasoningBlock({ content, isThinking = false, className, defaultOpen = false }: ReasoningBlockProps) {
  const [expanded, setExpanded] = useState(defaultOpen || isThinking);
  const [userToggled, setUserToggled] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completedDuration, setCompletedDuration] = useState<number | null>(null);
  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Use deferred content during streaming so ReactMarkdown re-parses at idle time
  const deferredContent = useDeferredValue(content);
  const displayContent = isThinking ? deferredContent : content;

  const thoughts = content.split('\n').filter(t => t.trim().length > 0);
  const stepsCount = thoughts.length;
  const charCount = content.trim().length;

  const clearCollapseTimeout = useCallback(() => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
  }, []);

  // Track elapsed time while thinking; auto-collapse 1s after thinking stops.
  useEffect(() => {
    if (isThinking) {
      clearCollapseTimeout();
      setExpanded(true);
      startTimeRef.current = Date.now();
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedMs(Date.now() - startTimeRef.current);
        }
      }, 100);
      return () => clearInterval(interval);
    }

    // When thinking stops, capture final duration and schedule collapse.
    if (startTimeRef.current) {
      const finalMs = Date.now() - startTimeRef.current;
      setElapsedMs(finalMs);
      setCompletedDuration(finalMs);
      startTimeRef.current = null;
    }

    if (!isThinking && !defaultOpen && !userToggled) {
      collapseTimeoutRef.current = setTimeout(() => {
        setExpanded(false);
      }, 1000);
    }

    return clearCollapseTimeout;
  }, [isThinking, userToggled, defaultOpen, clearCollapseTimeout]);

  const handleToggle = useCallback((next: boolean) => {
    setUserToggled(true);
    setExpanded(next);
  }, []);

  const displayLabel = useMemo(() => {
    if (isThinking) return "Thinking...";
    if (completedDuration !== null) return `Thought for ${formatThoughtDuration(completedDuration)}`;
    return "Reasoning";
  }, [isThinking, completedDuration]);

  const detailLabel = stepsCount > 1
    ? `${stepsCount} notes`
    : charCount > 0
      ? `${Math.max(1, Math.ceil(charCount / 280))} note`
      : "No details";

  if (!content) return null;

  return (
    <div className={cn("thought-block my-2 max-w-full", className)}>
      <Collapsible
        open={expanded}
        onOpenChange={handleToggle}
        className="border border-border bg-card rounded-lg overflow-hidden shadow-sm"
      >
        <CollapsibleTrigger
          aria-label={expanded ? "Collapse reasoning details" : "Expand reasoning details"}
          className={cn(
            "group/reasoning flex min-h-8 w-full items-center justify-between px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-muted",
            expanded && "border-b border-border bg-muted"
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors duration-200",
                isThinking ? "bg-primary motion-safe:animate-pulse" : "bg-muted-foreground"
              )} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn(
                  "truncate text-[12.5px] font-medium tracking-tight",
                  isThinking ? "animate-text-shimmer font-semibold" : "text-muted-foreground"
                )}>
                  {displayLabel}
                </span>
                {isThinking && (
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {formatThoughtDuration(elapsedMs)}
                  </span>
                )}
              </div>
              <span className="block truncate text-[10.5px] leading-4 text-muted-foreground">
                {isThinking ? "Preparing the answer" : detailLabel}
              </span>
            </div>
          </div>

          <ChevronDown className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            !expanded && "-rotate-90"
          )} />
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-3.5 py-2 bg-muted">
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-[0.18em]",
                isThinking ? "animate-text-shimmer" : "text-muted-foreground"
              )}>
                Reasoning
              </span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {isThinking ? "live" : "complete"}
              </span>
            </div>
            <div className="max-h-[260px] overflow-y-auto px-3.5 pt-2 pb-4">
              <MemoReasoningContent content={displayContent} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});
