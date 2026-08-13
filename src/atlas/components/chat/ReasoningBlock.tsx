import { useState, useEffect, useRef, useMemo, memo, useCallback, useDeferredValue } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  createDisclosureState,
  toggleDisclosure,
  transitionDisclosure,
  type DisclosureLifecycleStatus,
} from "./executionDisclosure";
import { splitReasoningSections, type ReasoningSection } from "./reasoningSections";
import { ChevronDown } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from "rehype-katex";
import 'katex/dist/katex.min.css';
import { useSettingsStore } from "@/lib/stores/useSettingsStore";

type ReasoningDisclosureDensity = "compact" | "balanced" | "detailed";

const REASONING_DENSITY_STYLES: Record<ReasoningDisclosureDensity, {
  summary: string;
  header: string;
  panel: string;
  content: string;
}> = {
  compact: {
    summary: "min-h-6 px-1.5 py-0.5",
    header: "px-2 py-1",
    panel: "max-h-[180px] px-2 py-2",
    content: "text-[12px] leading-5",
  },
  balanced: {
    summary: "min-h-7 px-2 py-1",
    header: "px-3 py-1.5",
    panel: "max-h-[260px] px-3 py-2.5",
    content: "text-[12.5px] leading-6",
  },
  detailed: {
    summary: "min-h-8 px-3 py-1.5",
    header: "px-4 py-2",
    panel: "max-h-[420px] px-4 py-3",
    content: "text-[13px] leading-7",
  },
};

function normalizeReasoningDisclosureDensity(value: unknown): ReasoningDisclosureDensity {
  return value === "compact" || value === "detailed" ? value : "balanced";
}

interface ReasoningBlockProps {
  content: string;
  isThinking?: boolean;
  className?: string;
  defaultOpen?: boolean;
  sections?: ReasoningSection[];
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
  sections,
  density,
}: {
  content: string;
  isThinking: boolean;
  sections?: ReasoningSection[];
  density: ReasoningDisclosureDensity;
}) {
  // Streaming reasoning is intentionally rendered as text. Markdown/math
  // parsing is deferred until the block is stable, avoiding a full growing
  // document parse on every token while preserving rich rendering on
  // completion.
  const normalizedContent = useMemo(() => {
    if (isThinking) return "";
    const resolvedSections = sections?.length ? sections : splitReasoningSections(content);
    return resolvedSections
      .map((section) => `### ${section.title}\n\n${normalizeMathMarkdown(section.content)}`)
      .join("\n\n");
  }, [content, isThinking, sections]);
  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath], []);
  const rehypePlugins = useMemo(() => [rehypeKatex] as any, []);

  if (!content) return null;

  if (isThinking) {
    return (
      <div className={cn(
        "reasoning-stream whitespace-pre-wrap break-words text-muted-foreground",
        REASONING_DENSITY_STYLES[density].content,
      )}>
        {content}
      </div>
    );
  }

  return (
    <div className={cn(
      "reasoning-markdown max-w-none text-foreground",
      REASONING_DENSITY_STYLES[density].content,
    )}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          img: () => null,
          h1: ({ children }) => <h1 className="text-[14px] font-semibold leading-5 text-foreground">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[13px] font-semibold leading-5 text-foreground">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[12.5px] font-semibold leading-5 text-foreground">{children}</h3>,
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-primary pl-3 text-muted-foreground">{children}</blockquote>,
          hr: () => <hr className="my-3 border-border" />,
          pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-sm border border-border bg-muted px-3 py-2 text-[11.5px] leading-5">{children}</pre>,
          code({ className, children }) {
            const isBlock = /language-/.test(className || "");
            return <code className={cn("font-mono", !isBlock && "rounded-sm bg-muted px-1 py-0.5 text-[11.5px]")}>{children}</code>;
          },
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          a: ({ href, children }) => {
            const safeHref = href && /^(https?:|mailto:)/i.test(href) ? href : undefined;
            return safeHref ? <a href={safeHref} className="text-primary underline underline-offset-2">{children}</a> : <span>{children}</span>;
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
});

export const ReasoningBlock = memo(function ReasoningBlock({ content, isThinking = false, className, defaultOpen, sections }: ReasoningBlockProps) {
  const configuredDensity = useSettingsStore((state) => state.reasoningDisclosureDensity);
  const density = normalizeReasoningDisclosureDensity(configuredDensity);
  const densityStyles = REASONING_DENSITY_STYLES[density];
  const resolvedDefaultOpen = defaultOpen ?? density === "detailed";

  // Reasoning uses the user's density preference for its initial disclosure:
  // compact and balanced stay summary-first, while detailed opens unspecified
  // completed blocks for auditability. Explicit caller choices still win. The
  // live timer, pulse dot, and "Thinking…" label read `isThinking` directly,
  // while the disclosure lifecycle stays terminal so completion cannot steal
  // control from a user who is reading the panel.
  const disclosureStatus: DisclosureLifecycleStatus = "completed";
  const disclosureStateRef = useRef(createDisclosureState(disclosureStatus, resolvedDefaultOpen));
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
    <div
      className={cn("execution-reasoning my-2 max-w-full", className)}
      data-reasoning-density={density}
    >
      <Collapsible
        open={expanded}
        onOpenChange={handleToggle}
        className={cn(
          "execution-reasoning-card overflow-hidden",
          expanded && "execution-reasoning-card--expanded",
        )}
      >
        <CollapsibleTrigger
          aria-label={expanded ? "Collapse reasoning details" : "Expand reasoning details"}
          className={cn(
            "execution-reasoning-summary group/reasoning flex w-full items-center justify-between gap-3 text-left outline-none transition-colors hover:bg-muted",
            densityStyles.summary,
            expanded && "border-b border-border",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative flex h-4 w-3 shrink-0 items-center justify-center">
              <div className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors duration-200",
                isThinking ? "bg-primary motion-safe:animate-pulse motion-reduce:transition-none" : "bg-muted-foreground",
              )} />
            </div>
            <span className={cn(
              "truncate text-[12px] font-medium tracking-tight",
              isThinking ? "font-semibold text-foreground" : "text-muted-foreground",
            )}>
              {displayLabel}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground" aria-hidden="true">·</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {isThinking ? "live" : detailLabel}
            </span>
            <span className="sr-only">{isThinking ? "Preparing the answer" : detailLabel}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isThinking && (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatThoughtDuration(elapsedMs)}
              </span>
            )}
            <ChevronDown className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              !expanded && "-rotate-90",
            )} />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="overflow-hidden">
            <div className={cn(
              "flex items-center justify-between border-b border-border bg-muted",
              densityStyles.header,
            )}>
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Reasoning notes
              </span>
              <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {isThinking ? "live" : "complete"}
              </span>
            </div>
            <div className={cn("overflow-y-auto", densityStyles.panel)}>
              <MemoReasoningContent
                content={displayContent}
                isThinking={isThinking}
                sections={sections}
                density={density}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});
