import React, { Suspense, useMemo, memo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Components } from "react-markdown";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { extractInlineThoughtBlocks, type ArtifactData } from "./types";
import { CodeBlock } from "./CodeBlock";
import { ReasoningBlock } from "./ReasoningBlock";
import { FileTree } from "./FileTree";
import { splitMarkdownIntoBlocks, type MarkdownBlock } from "./markdown-utils";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { isSafeGeneratedHref } from "@/lib/security/generatedLinks";
import {
  MarkdownErrorBoundary,
  flattenChildren,
  normalizeCodeLanguage,
  parseYoutubeId,
  YoutubePreview,
  ImageGallery,
  extractImagesFromChildren,
  stripCodeFence,
  removeAlertTag
} from "./MarkdownHelperComponents";

const MermaidDiagram = React.lazy(() => import("./MermaidDiagram").then(m => ({ default: m.MermaidDiagram })));
const ChartBlock = React.lazy(() => import("./ChartBlock").then(m => ({ default: m.ChartBlock })));
const OpenUIRenderer = React.lazy(() => import("../OpenUIRenderer").then(m => ({ default: m.OpenUIRenderer })));
const SmoothMarkdown = React.lazy(() => import("./SmoothMarkdown").then(m => ({ default: m.SmoothMarkdown })));

const RichBlockFallback = () => (
  <div
    className="my-6 h-24 animate-pulse rounded-xl border border-border/30 bg-card/20"
    aria-hidden="true"
  >
    <div className="m-6 h-3 w-2/3 rounded-full bg-muted/40" />
    <div className="mx-6 mt-3 h-3 w-1/2 rounded-full bg-muted/30" />
  </div>
);
const MemoizedMarkdownBlock = memo(function MemoizedMarkdownBlock({
  block,
  isStreaming,
  components,
  onOpenArtifact,
  chatId,
}: {
  block: MarkdownBlock;
  isStreaming: boolean;
  components: Components;
  onOpenArtifact?: (a: ArtifactData) => void;
  chatId?: string;
}) {
  // Code blocks: render with specialized support outside ReactMarkdown
  if (block.type === 'code') {
    const codeStr = stripCodeFence(block.content);
    const langMatch = block.content.match(/^```([^\s`]*)/);
    const lang = normalizeCodeLanguage(langMatch ? langMatch[1] : block.language);

    if (lang === 'openui') {
      return (
        <div className="my-6 overflow-visible">
          <Suspense fallback={<RichBlockFallback />}>
            <OpenUIRenderer content={codeStr} isStreaming={isStreaming} chatId={chatId} />
          </Suspense>
        </div>
      );
    }
    if (lang === 'mermaid') {
      return (
        <Suspense fallback={<RichBlockFallback />}>
          <MermaidDiagram code={codeStr} isStreaming={isStreaming} />
        </Suspense>
      );
    }
    if (lang === 'chart') {
      return (
        <Suspense fallback={<RichBlockFallback />}>
          <ChartBlock content={codeStr} isStreaming={isStreaming} />
        </Suspense>
      );
    }
    if (lang === 'tree') {
      return <FileTree content={codeStr} />;
    }
    return (
      <CodeBlock language={lang || 'text'} code={codeStr} onOpenArtifact={onOpenArtifact} />
    );
  }

  const chatPlugins = useSettingsStore(useShallow(s => s.chatPlugins));
  const streamingSpeed = useSettingsStore(s => s.streamingSpeed ?? 'instant');

  // Text blocks: render through ReactMarkdown via SmoothMarkdown
  return (
    <MarkdownErrorBoundary content={block.content}>
      <div className="prose-frontier relative">
        <Suspense fallback={<RichBlockFallback />}>
          <SmoothMarkdown
            content={block.content}
            isStreaming={isStreaming}
            components={components}
            chatPlugins={chatPlugins}
            streamingSpeed={streamingSpeed}
          />
        </Suspense>
      </div>
    </MarkdownErrorBoundary>
  );
}, (prev, next) => {
  return prev.block.content === next.block.content
    && prev.isStreaming === next.isStreaming
    && prev.onOpenArtifact === next.onOpenArtifact;
});

export function MarkdownContent({
  content,
  reasoning,
  isThinking,
  isStreaming,
  onOpenArtifact,
  chatId,
}: {
  content: string;
  reasoning?: string;
  isThinking?: boolean;
  isStreaming?: boolean;
  onOpenArtifact?: (a: ArtifactData) => void;
  chatId?: string;
}) {
  // 1. Extract thought blocks (handles both native reasoning and inline tags).
  let thought: string | null = reasoning || null;
  let mainContent = content;

  if (!thought) {
    const extracted = extractInlineThoughtBlocks(content);
    thought = extracted.reasoning || null;
    mainContent = extracted.content;
  }

  // 2. Split main content into memoizable blocks
  const blocks = useMemo(
    () => splitMarkdownIntoBlocks(mainContent, !!isStreaming),
    [mainContent, isStreaming]
  );

  // 3. Build stable components reference for markdown rendering
  const components: Components = useMemo(() => ({
    code({ className, children }) {
      const match = /language-([\w-]+)/.exec(className || "");
      const codeStr = flattenChildren(children).replace(/\n$/, "");
      if (match) {
        const lang = normalizeCodeLanguage(match[1]);
        // These are now primarily handled at the block level, but keep
        // as fallback for inline parsing edge cases
        if (lang === "openui") {
          return (
            <div className="my-6 overflow-visible">
              <Suspense fallback={<RichBlockFallback />}>
                <OpenUIRenderer content={codeStr} isStreaming={isStreaming} chatId={chatId} />
              </Suspense>
            </div>
          );
        }
        if (lang === "mermaid") {
          return (
            <Suspense fallback={<RichBlockFallback />}>
              <MermaidDiagram code={codeStr} isStreaming={isStreaming} />
            </Suspense>
          );
        }
        if (lang === "chart") {
          return (
            <Suspense fallback={<RichBlockFallback />}>
              <ChartBlock content={codeStr} isStreaming={isStreaming} />
            </Suspense>
          );
        }
        if (lang === "tree") {
          return <FileTree content={codeStr} />;
        }
        return (
          <CodeBlock language={match[1]} code={codeStr} onOpenArtifact={onOpenArtifact} />
        );
      }
      return (
        <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[0.9em] text-foreground/80">
          {children}
        </code>
      );
    },
    pre({ children }) {
      return <div className="my-4">{children}</div>;
    },
    a({ href, children }) {
      if (children && typeof children === 'string' && /^\d+$/.test(children)) {
        return (
          <span className="cite-pill">
            {children}
          </span>
        );
      }
      // YouTube link preview
      const ytId = parseYoutubeId(href || "");
      if (ytId) { return <YoutubePreview videoId={ytId} />; }
      if (!isSafeGeneratedHref(href)) {
        return <span>{children}</span>;
      }
      return (
        <a href={href} target="_blank" rel="noreferrer"
          className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors">
          {children}
        </a>
      );
    },
    h1: ({ children }) => <h1 className="mb-4 mt-8 text-2xl font-bold tracking-tight text-foreground">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-3 mt-6 text-xl font-semibold tracking-tight text-foreground/90">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-2 mt-5 text-lg font-semibold text-foreground/80">{children}</h3>,
    h4: ({ children }) => <h4 className="mb-2 mt-4 text-base font-semibold text-foreground/70">{children}</h4>,
    h5: ({ children }) => <h5 className="mb-2 mt-3 text-sm font-semibold text-foreground/60">{children}</h5>,
    h6: ({ children }) => <h6 className="mb-2 mt-2 text-xs font-semibold text-foreground/50">{children}</h6>,
    p: ({ children }) => {
      const galleryImages = extractImagesFromChildren(children);
      if (galleryImages) return <ImageGallery images={galleryImages} />;
      return <p className="mb-4 last:mb-0">{children}</p>;
    },
    ul: ({ children }) => <ul className="mb-4 ml-6 list-disc space-y-2">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 ml-6 list-decimal space-y-2">{children}</ol>,
    li: ({ children }) => <li className="pl-1">{children}</li>,
    img: ({ src, alt }) => {
      if (!src) return null;
      if (!isSafeGeneratedHref(src)) {
        return <span className="text-muted-foreground italic text-xs">[Image: {alt || src}]</span>;
      }
      return (
        <img src={src} alt={alt || ""} className="my-4 max-w-full rounded-lg border border-border/30" />
      );
    },
    blockquote: ({ children }) => {
      const text = flattenChildren(children).trim();
      const match = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);

      if (match) {
        const type = match[1].toUpperCase();
        let colorClass = "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400";
        let icon = "ℹ️";
        let title = "Note";

        if (type === "TIP") { colorClass = "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"; icon = "💡"; title = "Tip"; }
        if (type === "IMPORTANT") { colorClass = "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400"; icon = "✨"; title = "Important"; }
        if (type === "WARNING") { colorClass = "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"; icon = "⚠️"; title = "Warning"; }
        if (type === "CAUTION") { colorClass = "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400"; icon = "🛑"; title = "Caution"; }

        const cleanChildren = removeAlertTag(children);

        return (
          <Alert className={`my-6 border-l-4 rounded-r-lg ${colorClass}`}>
            <AlertTitle className="flex items-center gap-2 font-bold mb-1">
              <span>{icon}</span>
              <span>{title}</span>
            </AlertTitle>
            <AlertDescription className="text-current opacity-90">
              {cleanChildren}
            </AlertDescription>
          </Alert>
        );
      }

      return (
        <blockquote className="my-6 border-l-2 border-primary/20 pl-4 italic text-muted-foreground/80 bg-primary/5 py-2 rounded-r-lg">
          {children}
        </blockquote>
      );
    },
    table: ({ children }) => (
      <div className="my-6 overflow-hidden rounded-xl border border-border/40 bg-card/30 shadow-sm">
        <ScrollArea className="w-full">
          <Table className="w-full text-[13px] border-collapse">{children}</Table>
        </ScrollArea>
      </div>
    ),
    thead: ({ children }) => <TableHeader>{children}</TableHeader>,
    tbody: ({ children }) => <TableBody>{children}</TableBody>,
    tr: ({ children }) => <TableRow>{children}</TableRow>,
    th: ({ children }) => <TableHead>{children}</TableHead>,
    td: ({ children }) => <TableCell>{children}</TableCell>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    hr: () => <hr className="my-8 border-border/20" />,
  }), [onOpenArtifact, chatId, isStreaming]);

  return (
    <div className="space-y-6">
      {thought && (
        <ReasoningBlock content={thought} isThinking={isThinking} />
      )}
      {blocks.length > 0 && (
        <div className="space-y-6">
          {blocks.map((block) => (
            <MemoizedMarkdownBlock
              key={block.id}
              block={block}
              isStreaming={Boolean(isStreaming && block.id.endsWith('streaming'))}
              components={components}
              onOpenArtifact={onOpenArtifact}
              chatId={chatId}
            />
          ))}
        </div>
      )}
      {!mainContent && isStreaming && (
        <div className="flex items-center gap-2 opacity-50 py-4" aria-live="polite">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" />
          </div>
          <span className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase">
            Generating response
          </span>
        </div>
      )}
    </div>
  );
}
