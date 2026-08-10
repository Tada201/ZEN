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
import { useReducedMotion } from "@/lib/motion";
import { isSafeGeneratedHref } from "@/lib/security/generatedLinks";
import { toAssetUrl } from "@/lib/utils/assetUrl";
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
import { ExternalLink, Download } from "lucide-react";
import { AppDialog } from "@/components/ui/AppDialog";
import { chatApi } from "@/api/chatApi";
import { toast } from "sonner";
import { useState, useCallback } from "react";

function InteractiveImage({ src, alt }: { src: string; alt: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const resolvedSrc = toAssetUrl(src);

  const handleExport = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(true);
    const toastId = toast.loading("Saving image to workspace...");
    try {
      const savedPath = await chatApi.exportImageToWorkspace(src);
      toast.success(`Image saved to workspace: ${savedPath}`, { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to export image: ${err?.message || err}`, { id: toastId });
    } finally {
      setExporting(false);
    }
  }, [src]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="block my-4 shrink-0 relative overflow-hidden rounded-lg border border-border hover:border-primary transition-all duration-200 group"
      >
        <img
          src={resolvedSrc}
          alt={alt}
          className="max-w-full rounded-lg hover:scale-[1.01] transition-transform duration-200"
          loading="lazy"
        />
      </button>

      <AppDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={alt || "Image Preview"}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] rounded text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Download size={12} />
              <span>{exporting ? "Saving..." : "Export to Workspace"}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="border border-border px-3 py-1.5 text-[11px] rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>
        }
      >
        <div className="relative flex items-center justify-center min-h-[300px] p-2">
          <img
            src={resolvedSrc}
            alt={alt}
            className="max-h-[60vh] max-w-full object-contain rounded-md"
          />
        </div>
      </AppDialog>
    </>
  );
}

// ── References grid component ──────────────────────────────────────────────

interface ReferenceItem {
  number: number;
  title: string;
  url: string;
}

function ReferencesGrid({ items }: { items: ReferenceItem[] }) {
  return (
    <div className="my-6">
      <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground/90">
        References
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((ref) => (
          <a
            key={ref.number}
            href={ref.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-[13px] leading-snug transition-all hover:border-border hover:bg-muted hover:shadow-sm"
          >
            <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {ref.number}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-foreground">{ref.title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{ref.url}</span>
            </span>
            <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </div>
  );
}

/// Parse a markdown ## References section into structured items.
/// Returns the items and the content with the references section removed.
function parseReferencesSection(content: string): {
  clean: string;
  items: ReferenceItem[] | null;
} {
  // Match ## References heading followed by a blank line and numbered list items
  const refMatch = content.match(
    /## References\n\n((?:\d+\.\s+[^\n]+(?:\n|$))+)/
  );
  if (!refMatch) return { clean: content, items: null };

  const items: ReferenceItem[] = refMatch[1]
    .trim()
    .split('\n')
    .map((line) => {
      const numMatch = line.match(/^(\d+)\.\s+/);
      const number = numMatch ? parseInt(numMatch[1], 10) : 0;
      const text = line.replace(/^\d+\.\s+/, '').trim();
      const linkMatch = text.match(/^\[(.+?)\]\((.+?)\)$/);
      if (linkMatch) {
        return { number, title: linkMatch[1], url: linkMatch[2] };
      }
      // Fallback: use the whole text as both title and url
      return { number, title: text, url: text };
    })
    .filter((item) => item.number > 0);

  if (items.length === 0) return { clean: content, items: null };

  // Remove the references section from the content (heading + list)
  const clean = content.replace(
    /## References\n\n(?:\d+\.\s+[^\n]+(?:\n|$))+/,
    ''
  );

  return { clean, items };
}

const MermaidDiagram = React.lazy(() => import("./MermaidDiagram").then(m => ({ default: m.MermaidDiagram })));
const ChartBlock = React.lazy(() => import("./ChartBlock").then(m => ({ default: m.ChartBlock })));
const OpenUIRenderer = React.lazy(() => import("../OpenUIRenderer").then(m => ({ default: m.OpenUIRenderer })));
const SmoothMarkdown = React.lazy(() => import("./SmoothMarkdown").then(m => ({ default: m.SmoothMarkdown })));

const RichBlockFallback = () => {
  const reducedMotion = useReducedMotion();
  return (<div
    className={`my-6 h-24 rounded-xl border border-border bg-card ${reducedMotion ? "" : "animate-pulse"}`}
    aria-hidden="true"
  >
    <div className="m-6 h-3 w-2/3 rounded-full bg-muted" />
    <div className="mx-6 mt-3 h-3 w-1/2 rounded-full bg-muted" />
  </div>);
};
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

  // Short, plain streaming deltas do not need a markdown tree. Keep the
  // heuristic deliberately strict so links, emphasis, code, and headings still
  // use the normal renderer; the stable wrapper keeps the transition calm when
  // the stream later becomes rich markdown.
  const isPlainShortText = Boolean(
    isStreaming &&
    mainContent.length <= 240 &&
    !/[#*_`\[\]|]/.test(mainContent) &&
    !mainContent.includes("```"),
  );

  // 2a. Parse & extract ## References section for compact grid rendering
  const { clean: refStrippedContent, items: refItems } = useMemo(
    () => isPlainShortText ? { clean: mainContent, items: null } : parseReferencesSection(mainContent),
    [isPlainShortText, mainContent]
  );

  // 2b. Split main content into memoizable blocks (with references removed)
  const blocks = useMemo(
    () => isPlainShortText ? [] : splitMarkdownIntoBlocks(refStrippedContent, !!isStreaming),
    [isPlainShortText, refStrippedContent, isStreaming]
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
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">
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
    h2: ({ children }) => <h2 className="mb-3 mt-6 text-xl font-semibold tracking-tight text-foreground">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-2 mt-5 text-lg font-semibold text-foreground">{children}</h3>,
    h4: ({ children }) => <h4 className="mb-2 mt-4 text-base font-semibold text-foreground">{children}</h4>,
    h5: ({ children }) => <h5 className="mb-2 mt-3 text-sm font-semibold text-muted-foreground">{children}</h5>,
    h6: ({ children }) => <h6 className="mb-2 mt-2 text-xs font-semibold text-muted-foreground">{children}</h6>,
    p: ({ children }) => {
      const galleryImages = extractImagesFromChildren(children);
      if (galleryImages) return <ImageGallery images={galleryImages} />;
      return <p className="mb-2 last:mb-0">{children}</p>;
    },
    ul: ({ children }) => <ul className="mb-2 ml-6 list-disc space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 ml-6 list-decimal space-y-1">{children}</ol>,
    li: ({ children }) => <li className="pl-1">{children}</li>,
    img: ({ src, alt }) => {
      if (!src) return null;
      if (!isSafeGeneratedHref(src)) {
        console.warn("isSafeGeneratedHref rejected URL: ", src);
        return <span className="text-muted-foreground italic text-xs">[Image: {alt || src}]</span>;
      }
      return (
        <InteractiveImage src={src} alt={alt || ""} />
      );
    },
    blockquote: ({ children }) => {
      const text = flattenChildren(children).trim();
        const match = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);

        if (match) {
          const type = match[1].toUpperCase();
          let colorClass = "border-primary/40 bg-primary/40 text-blue-950 dark:text-primary-foreground";
          let icon = "ℹ️";
          let title = "Note";

          if (type === "TIP") { colorClass = "border-green-500/40 bg-green-500/40 text-green-950 dark:text-green-100"; icon = "💡"; title = "Tip"; }
          if (type === "IMPORTANT") { colorClass = "border-primary/40 bg-primary/40 text-purple-950 dark:text-purple-100"; icon = "✨"; title = "Important"; }
          if (type === "WARNING") { colorClass = "border-warning/40 bg-warning/40 text-amber-950 dark:text-amber-100"; icon = "⚠️"; title = "Warning"; }
          if (type === "CAUTION") { colorClass = "border-rose-500/40 bg-rose-500/40 text-rose-950 dark:text-rose-100"; icon = "🛑"; title = "Caution"; }

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
        <blockquote className="my-6 border-l-2 border-primary pl-4 italic text-muted-foreground bg-muted py-2 rounded-r-lg">
          {children}
        </blockquote>
      );
    },
    table: ({ children }) => (
      <div className="my-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
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
    hr: () => <hr className="my-8 border-border" />,
  }), [onOpenArtifact, chatId, isStreaming]);

  return (
    <div className="space-y-6">
      {thought && (
        <ReasoningBlock content={thought} isThinking={isThinking} />
      )}
      {isPlainShortText ? (
        <div className="whitespace-pre-wrap break-words text-foreground">{mainContent}</div>
      ) : (
        <div className="space-y-6">
          {(blocks.length > 0 ? blocks : [{ id: "fallback-single-block", type: "text", content: refStrippedContent, isComplete: !isStreaming, index: 0 } as any]).map((block) => (
            <MemoizedMarkdownBlock
              key={block.id}
              block={block}
              isStreaming={Boolean(isStreaming && !block.isComplete)}
              components={components}
              onOpenArtifact={onOpenArtifact}
              chatId={chatId}
            />
          ))}
        </div>
      )}
      {/* Two-column References grid (always shown, even if blocks are empty) */}
      {refItems && refItems.length > 0 && (
        <ReferencesGrid items={refItems} />
      )}
      {!mainContent && isStreaming && (
        <div className="flex items-center gap-2 py-4" aria-live="polite">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
          </div>
          <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
            Generating response
          </span>
        </div>
      )}
    </div>
  );
}
