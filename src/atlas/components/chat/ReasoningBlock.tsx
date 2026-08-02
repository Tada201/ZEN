import { useState, useEffect, useRef, useMemo, memo, useCallback, useDeferredValue } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  createDisclosureState,
  toggleDisclosure,
  transitionDisclosure,
} from "./executionDisclosure";
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

const MemoReasoningContent = memo(function MemoReasoningContent({
  content,
  isThinking,
}: {
  content: string;
  isThinking: boolean;
}) {
  // Streaming reasoning is intentionally rendered as text. Markdown/math
  // parsing is deferred until the block is stable, avoiding a full growing
  // document parse on every token while preserving rich rendering on
  // completion.
  const normalizedContent = useMemo(
    () => (isThinking ? "" : normalizeMathMarkdown(content.trim())),
    [content, isThinking],
  );
  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath], []);
  const rehypePlugins = useMemo(() => [rehypeKatex] as any, []);

  if (!content) return null;

  if (isThinking) {
    return (
      <div className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.65] text-muted-foreground">
        {content}
      </div>
    );
  }

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
  const disclosureStatus = isThinking ? "running" : "completed";
  const disclosureStateRef = useRef(createDisclosureState(disclosureStatus, defaultOpen || isThinking));
  const [expanded, setExpanded] = useState(disclosureStateRef.current.open);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completedDuration, setCompletedDuration] = useState<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Use deferred content during streaming so ReactMarkdown re-parses at idle time
  const deferredContent = useDeferredValue(content);
  const displayContent = isThinking ? deferredContent : content;

  const stepsCount = useMemo(() => {
    let count = 0;
    let lineStart = 0;
    for (let index = 0; index <= content.length; index += 1) {
      if (index !== content.length && content[index] !== "\n") continue;
      if (content.slice(lineStart, index).trim()) count += 1;
      lineStart = index + 1;
    }
    return count;
  }, [content]);
  const charCount = content.trim().length;

  // Keep the disclosure open while thinking without coupling that behavior to
  // the timer lifecycle. Toggling the panel must never restart elapsed time.
  useEffect(() => {
    const nextState = transitionDisclosure(disclosureStateRef.current, disclosureStatus);
    disclosureStateRef.current = nextState;
    setExpanded((previous) => previous === nextState.open ? previous : nextState.open);
  }, [disclosureStatus]);

  // Track elapsed time while thinking. The displayed duration is rounded to
  // seconds, so a one-second cadence avoids unnecessary render churn while
  // keeping the live status responsive. This effect intentionally depends only
  // on the lifecycle phase so disclosure toggles cannot reset the clock.
  useEffect(() => {
    if (isThinking) {
      startTimeRef.current ??= Date.now();
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedMs(Date.now() - startTimeRef.current);
        }
      }, 1000);
      return () => clearInterval(interval);
    }

    // When thinking stops, capture the final duration but leave the disclosure
    // state alone. A user may be reading the reasoning that just completed;
    // summary-first behavior still applies to initially loaded history.
    if (startTimeRef.current) {
      const finalMs = Date.now() - startTimeRef.current;
      setElapsedMs(finalMs);
      setCompletedDuration(finalMs);
      startTimeRef.current = null;
    }
  }, [isThinking]);

  const handleToggle = useCallback((next: boolean) => {
    disclosureStateRef.current = toggleDisclosure(disclosureStateRef.current, next);
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
    <div className={cn("execution-reasoning my-2 max-w-full", className)}>
      <Collapsible
        open={expanded}
        onOpenChange={handleToggle}
        className="execution-reasoning-card overflow-hidden rounded-md border border-border bg-card shadow-sm"
      >
        <CollapsibleTrigger
          aria-label={expanded ? "Collapse reasoning details" : "Expand reasoning details"}
          className={cn(
            "group/reasoning flex min-h-8 w-full items-center justify-between px-2.5 py-1.5 text-left outline-none transition-colors motion-reduce:transition-none hover:bg-muted",
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
                  isThinking ? "font-semibold text-foreground" : "text-muted-foreground"
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
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
            !expanded && "-rotate-90"
          )} />
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-3.5 py-2 bg-muted">
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-[0.18em]",
                isThinking ? "text-foreground" : "text-muted-foreground"
              )}>
                Reasoning
              </span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {isThinking ? "live" : "complete"}
              </span>
            </div>
            <div className="max-h-[260px] overflow-y-auto px-3.5 pt-2 pb-4">
              <MemoReasoningContent content={displayContent} isThinking={isThinking} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});
