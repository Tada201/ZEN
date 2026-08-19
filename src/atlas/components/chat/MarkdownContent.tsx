import React, { Suspense, useMemo, memo, useId } from "react";
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
import { prepareMarkdownFootnotes } from "./markdownFootnotes";
import { MarkdownDetails } from "./MarkdownDetails";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { useReducedMotion } from "@/lib/motion";
import { isSafeGeneratedHref } from "@/lib/security/generatedLinks";
import { normalizeBrowserPreviewUrl } from "@/lib/security/browserPreviewUrl";
import { useUIStore } from "@/lib/stores/useUIStore";
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
import { useCallback } from "react";
import { InteractiveImage } from "./MarkdownImage";
import { ReferencesGrid, parseReferencesSection } from "./MarkdownReferences";

const MermaidDiagram = React.lazy(() => import("./MermaidDiagram").then(m => ({ default: m.MermaidDiagram })));
const ChartBlock = React.lazy(() => import("./ChartBlock").then(m => ({ default: m.ChartBlock })));
const OpenUIRenderer = React.lazy(() => import("../OpenUIRenderer").then(m => ({ default: m.OpenUIRenderer })));
const SmoothMarkdown = React.lazy(() => import("./SmoothMarkdown").then(m => ({ default: m.SmoothMarkdown })));

const RichBlockFallback = () => {
  const reducedMotion = useReducedMotion();
  return (<div
    className={`my-3 h-20 rounded-lg border border-border bg-card ${reducedMotion ? "" : "animate-pulse"}`}
    aria-hidden="true"
  >
    <div className="m-3 h-3 w-2/3 rounded-full bg-muted" />
    <div className="mx-3 mt-2 h-3 w-1/2 rounded-full bg-muted" />
  </div>);
};
const MemoizedMarkdownBlock = memo(function MemoizedMarkdownBlock({
  block,
  isStreaming,
  components,
  onOpenArtifact,
  chatId,
  messageId,
  allowGenerativeUI,
}: {
  block: MarkdownBlock;
  isStreaming: boolean;
  components: Components;
  onOpenArtifact?: (a: ArtifactData) => void;
  chatId?: string;
  messageId?: string;
  allowGenerativeUI: boolean;
}) {
  const chatPlugins = useSettingsStore(useShallow(s => s.chatPlugins));
  const streamingSpeed = useSettingsStore(s => s.streamingSpeed ?? 'instant');

  if (block.type === 'details') {
    return (
      <MarkdownDetails
        block={block}
        isStreaming={isStreaming}
        components={components}
        chatPlugins={chatPlugins}
        streamingSpeed={streamingSpeed}
      />
    );
  }

  // Code blocks: render with specialized support outside ReactMarkdown
  if (block.type === 'code') {
    const codeStr = stripCodeFence(block.content);
    const langMatch = block.content.match(/^```([^\s`]*)/);
    const lang = normalizeCodeLanguage(langMatch ? langMatch[1] : block.language);

    if (lang === 'openui' && allowGenerativeUI) {
      return (
        <div className="my-3 overflow-visible">
          <Suspense fallback={<RichBlockFallback />}>
            <OpenUIRenderer content={codeStr} isStreaming={isStreaming} chatId={chatId} />
          </Suspense>
        </div>
      );
    }
    if (lang === 'mermaid') {
      return (
        <Suspense fallback={<RichBlockFallback />}>
          <MermaidDiagram code={codeStr} isStreaming={isStreaming} chatId={chatId} messageId={messageId} />
        </Suspense>
      );
    }
    if (lang === 'chart') {
      return (
        <Suspense fallback={<RichBlockFallback />}>
          <ChartBlock content={codeStr} isStreaming={isStreaming} chatId={chatId} messageId={messageId} />
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
    && prev.onOpenArtifact === next.onOpenArtifact
    && prev.allowGenerativeUI === next.allowGenerativeUI;
});

export function MarkdownContent({
  content,
  reasoning,
  isThinking,
  isStreaming,
  onOpenArtifact,
  chatId,
  messageId,
  allowGenerativeUI = false,
}: {
  content: string;
  reasoning?: string;
  isThinking?: boolean;
  isStreaming?: boolean;
  onOpenArtifact?: (a: ArtifactData) => void;
  chatId?: string;
  /** Backend message id used to persist self-healing diagram repairs. */
  messageId?: string;
  /** Render OpenUI only when the originating turn explicitly enabled it. */
  allowGenerativeUI?: boolean;
}) {
  const footnoteScope = useId().replace(/[^a-zA-Z0-9_-]/g, "-");

  // 1. Extract thought blocks (handles both native reasoning and inline tags).
  let thought: string | null = reasoning || null;
  let mainContent = content;

  if (!thought) {
    const extracted = extractInlineThoughtBlocks(content);
    thought = extracted.reasoning || null;
    mainContent = extracted.content;
  }

  // Plain streaming prose does not need a markdown tree. Keep the heuristic
  // syntax-based instead of length-based: long ordinary answers should not
  // re-parse through remark/rehype on every token. Rich markdown still takes
  // the normal renderer as soon as it contains structural syntax.
  const isPlainShortText = Boolean(
    isStreaming &&
    mainContent.length <= 240 &&
    !/[#*_`\[\]|]/.test(mainContent) &&
    !/(?:https?:\/\/|www\.)\S+/i.test(mainContent) &&
    !mainContent.includes("```"),
  );

  // 2a. Rewrite footnotes before block splitting so references and their
  // definitions stay in the same memoized Markdown pipeline as prose.
  const preparedMainContent = useMemo(
    () => prepareMarkdownFootnotes(mainContent, footnoteScope),
    [footnoteScope, mainContent],
  );

  // 2b. Parse & extract ## References section for compact grid rendering
  const { clean: refStrippedContent, items: refItems } = useMemo(
    () => isPlainShortText
      ? { clean: preparedMainContent.content, items: null }
      : parseReferencesSection(preparedMainContent.content),
    [isPlainShortText, preparedMainContent.content],
  );

  // 2b. Split main content into memoizable blocks (with references removed)
  const blocks = useMemo(
    () => isPlainShortText ? [] : splitMarkdownIntoBlocks(refStrippedContent, !!isStreaming),
    [isPlainShortText, refStrippedContent, isStreaming]
  );

  // 3. Build stable components reference for markdown rendering
  const openBrowserPreview = useUIStore((state) => state.openBrowserPreview);
  const activeChatId = useUIStore((state) => state.activeChatId);
  const openLinkInBrowserPreview = useCallback((href: string) => {
    const previewChatId = chatId || activeChatId;
    if (!previewChatId) return false;
    const previewUrl = normalizeBrowserPreviewUrl(href);
    if (!previewUrl || previewUrl === "about:blank") return false;
    openBrowserPreview(previewChatId, previewUrl);
    return true;
  }, [activeChatId, chatId, openBrowserPreview]);

  const components: Components = useMemo(() => ({
    code({ className, children }) {
      const match = /language-([\w-]+)/.exec(className || "");
      const codeStr = flattenChildren(children).replace(/\n$/, "");
      if (match) {
        const lang = normalizeCodeLanguage(match[1]);
        // These are now primarily handled at the block level, but keep
        // as fallback for inline parsing edge cases
        if (lang === "openui" && allowGenerativeUI) {
          return (
            <div className="my-3 overflow-visible">
              <Suspense fallback={<RichBlockFallback />}>
                <OpenUIRenderer content={codeStr} isStreaming={isStreaming} chatId={chatId} />
              </Suspense>
            </div>
          );
        }
        if (lang === "mermaid") {
          return (
            <Suspense fallback={<RichBlockFallback />}>
              <MermaidDiagram code={codeStr} isStreaming={isStreaming} chatId={chatId} messageId={messageId} />
            </Suspense>
          );
        }
        if (lang === "chart") {
          return (
            <Suspense fallback={<RichBlockFallback />}>
              <ChartBlock content={codeStr} isStreaming={isStreaming} chatId={chatId} messageId={messageId} />
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
      return <div className="my-2">{children}</div>;
    },
    a({ href, title, children }) {
      const footnotePrefix = `#${footnoteScope}-fn-`;
      const isScopedFootnoteLink = typeof href === "string" && href.startsWith(footnotePrefix);
      const footnoteTargetId = isScopedFootnoteLink ? href.slice(1) : "";

      if (isScopedFootnoteLink && title === "footnote-target") {
        return (
          <span
            id={footnoteTargetId}
            tabIndex={-1}
            className="markdown-footnote-target scroll-mt-20 outline-none"
          />
        );
      }

      if (isScopedFootnoteLink && title?.startsWith("footnote-ref:")) {
        const referenceId = title.slice("footnote-ref:".length);
        return (
          <sup id={referenceId} tabIndex={-1} className="markdown-footnote-ref mx-0.5 align-super text-[10px] leading-none">
            <a
              href={href}
              aria-label={`Footnote ${String(children)}`}
              onClick={() => window.requestAnimationFrame(() => document.getElementById(footnoteTargetId)?.focus({ preventScroll: true }))}
              className="rounded px-0.5 font-medium text-primary underline-offset-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {children}
            </a>
          </sup>
        );
      }

      if (isScopedFootnoteLink && title === "footnote-backlink") {
        return (
          <a
            href={href}
            aria-label="Back to footnote reference"
            onClick={() => window.requestAnimationFrame(() => document.getElementById(footnoteTargetId)?.focus({ preventScroll: true }))}
            className="markdown-footnote-backlink mr-1 rounded px-1 text-[11px] font-medium text-primary no-underline hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {children}
          </a>
        );
      }

      if (children && typeof children === 'string' && /^\d+$/.test(children)) {
        return (
          <span className="cite-pill">
            {children}
          </span>
        );
      }
      // YouTube link preview
      const ytId = parseYoutubeId(href || "");
      if (ytId) { return <YoutubePreview videoId={ytId} onOpenLink={openLinkInBrowserPreview} />; }
      if (!isSafeGeneratedHref(href)) {
        return <span>{children}</span>;
      }
      return (
        <a href={href} target="_blank" rel="noreferrer"
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (href && openLinkInBrowserPreview(href)) event.preventDefault();
          }}
          className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors">
          {children}
        </a>
      );
    },
    h1: ({ children }) => <h1 className="mb-3 mt-5 text-xl font-bold tracking-tight text-foreground">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-semibold tracking-tight text-foreground">{children}</h2>,
    h3: ({ children }) => {
      const isFootnotesHeading = flattenChildren(children).trim().toLowerCase() === "footnotes";
      return (
        <h3 className={`mb-1.5 mt-3 text-base font-semibold text-foreground${isFootnotesHeading ? " markdown-footnotes-heading" : ""}`}>
          {children}
        </h3>
      );
    },
    h4: ({ children }) => <h4 className="mb-1.5 mt-3 text-base font-semibold text-foreground">{children}</h4>,
    h5: ({ children }) => <h5 className="mb-1 mt-2 text-sm font-semibold text-muted-foreground">{children}</h5>,
    h6: ({ children }) => <h6 className="mb-1 mt-1.5 text-xs font-semibold text-muted-foreground">{children}</h6>,
    p: ({ children }) => {
      const galleryImages = extractImagesFromChildren(children);
      if (galleryImages) return <ImageGallery images={galleryImages} />;
      return <p className="mb-2 last:mb-0">{children}</p>;
    },
    ul: ({ children, className }) => {
      const isTaskList = className?.includes("contains-task-list");
      return <ul className={`mb-1.5 space-y-0.5 ${isTaskList ? "ml-0 list-none" : "ml-5 list-disc"}${className ? ` ${className}` : ""}`}>{children}</ul>;
    },
    ol: ({ children, className }) => <ol className={`mb-1.5 ml-5 list-decimal space-y-0.5${className ? ` ${className}` : ""}`}>{children}</ol>,
    li: ({ children, className }) => {
      const isTaskItem = className?.includes("task-list-item");
      return <li className={`${isTaskItem ? "list-none" : "pl-0.5"}${className ? ` ${className}` : ""}`}>{children}</li>;
    },
    input: ({ checked, ...props }) => (
      <input
        {...props}
        type="checkbox"
        checked={Boolean(checked)}
        readOnly
        aria-label={checked ? "Completed task" : "Incomplete task"}
        className="mr-2 align-[-2px] accent-primary"
      />
    ),
    del: ({ children }) => <del className="text-muted-foreground">{children}</del>,
    sup: ({ children }) => <sup className="text-[0.75em]">{children}</sup>,
    sub: ({ children }) => <sub className="text-[0.75em]">{children}</sub>,
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
          let colorClass = "border-primary bg-muted text-foreground";
          let icon = "ℹ️";
          let title = "Note";

          if (type === "TIP") { colorClass = "border-success bg-muted text-foreground"; icon = "💡"; title = "Tip"; }
          if (type === "IMPORTANT") { colorClass = "border-primary bg-muted text-foreground"; icon = "✨"; title = "Important"; }
          if (type === "WARNING") { colorClass = "border-warning bg-muted text-foreground"; icon = "⚠️"; title = "Warning"; }
          if (type === "CAUTION") { colorClass = "border-destructive bg-muted text-foreground"; icon = "🛑"; title = "Caution"; }

        const cleanChildren = removeAlertTag(children);

        return (
          <Alert className={`my-3 border-l-4 rounded-r-md ${colorClass}`}>
            <AlertTitle className="flex items-center gap-2 font-bold mb-1">
              <span>{icon}</span>
              <span>{title}</span>
            </AlertTitle>
            <AlertDescription className="text-current">
              {cleanChildren}
            </AlertDescription>
          </Alert>
        );
      }

      return (
        <blockquote className="my-3 border-l-2 border-primary pl-3 italic text-muted-foreground bg-muted py-1.5 rounded-r-md">
          {children}
        </blockquote>
      );
    },
    table: ({ children }) => (
      <div className="my-3 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
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
    hr: () => <hr className="my-4 border-border" />,
  }), [allowGenerativeUI, chatId, footnoteScope, isStreaming, messageId, onOpenArtifact, openLinkInBrowserPreview]);

  return (
    <div className="space-y-3">
      {thought && (
        <ReasoningBlock content={thought} isThinking={isThinking} />
      )}
      {isPlainShortText ? (
        <div className="max-w-full whitespace-pre-wrap break-words leading-[1.6] text-foreground">{mainContent}</div>
      ) : (
        <div className="space-y-3">
          {(blocks.length > 0 ? blocks : [{ id: "fallback-single-block", type: "text", content: refStrippedContent, isComplete: !isStreaming, index: 0 } as any]).map((block) => (
            <MemoizedMarkdownBlock
              key={block.id}
              block={block}
              isStreaming={Boolean(isStreaming && !block.isComplete)}
              components={components}
              onOpenArtifact={onOpenArtifact}
              chatId={chatId}
              messageId={messageId}
              allowGenerativeUI={allowGenerativeUI}
            />
          ))}
        </div>
      )}
      {/* Two-column References grid (always shown, even if blocks are empty) */}
      {refItems && refItems.length > 0 && (
        <ReferencesGrid items={refItems} onOpenLink={openLinkInBrowserPreview} />
      )}
      {!mainContent && isStreaming && (
        <div className="flex items-center gap-2 py-4" aria-live="polite">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-[execution-status-pulse_1.4s_ease-in-out_infinite] motion-reduce:animate-none" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-[execution-status-pulse_1.4s_ease-in-out_infinite] [animation-delay:200ms] motion-reduce:animate-none" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-[execution-status-pulse_1.4s_ease-in-out_infinite] [animation-delay:400ms] motion-reduce:animate-none" />
          </div>
          <span className="text-[11px] font-mono tracking-widest text-muted-foreground uppercase">
            Generating response
          </span>
        </div>
      )}
    </div>
  );
}
