import React, { Suspense, useEffect, useId, useState } from "react";
import type { Components } from "react-markdown";
import type { MarkdownBlock } from "./markdown-utils";
import { MarkdownErrorBoundary } from "./MarkdownHelperComponents";
import { useReducedMotion } from "@/lib/motion";

const SmoothMarkdown = React.lazy(() => import("./SmoothMarkdown").then((module) => ({ default: module.SmoothMarkdown })));

function safeSummary(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "More details";
}

function DetailsFallback() {
  const reducedMotion = useReducedMotion();
  return (
    <div className={`mt-3 h-16 rounded-md border border-border bg-muted ${reducedMotion ? "" : "animate-pulse"}`} aria-hidden="true">
      <div className="m-3 h-2.5 w-2/3 rounded-full bg-border" />
      <div className="mx-3 mt-2 h-2.5 w-1/2 rounded-full bg-border" />
    </div>
  );
}

export function MarkdownDetails({
  block,
  isStreaming,
  components,
  chatPlugins,
  streamingSpeed,
}: {
  block: MarkdownBlock;
  isStreaming: boolean;
  components: Components;
  chatPlugins: Record<string, boolean>;
  streamingSpeed: "instant" | "typewriter";
}) {
  const [isOpen, setIsOpen] = useState(Boolean(block.initiallyOpen || isStreaming));
  const generatedId = useId().replace(/[^a-zA-Z0-9_-]/g, "-");
  const summary = safeSummary(block.summary || "More details");
  const contentId = `markdown-details-${generatedId}`;

  useEffect(() => {
    if (isStreaming) setIsOpen(true);
  }, [isStreaming]);

  return (
    <details
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="markdown-details my-4 rounded-lg border border-border bg-card"
    >
      <summary
        aria-controls={contentId}
        className="markdown-details-summary cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {summary}
      </summary>
      <div id={contentId} role="region" aria-label={`${summary} content`} className="markdown-details-content border-t border-border px-3 py-3">
        <MarkdownErrorBoundary content={block.content}>
          <Suspense fallback={<DetailsFallback />}>
            <div className="prose-frontier">
              <SmoothMarkdown
                content={block.content}
                isStreaming={isStreaming}
                components={components}
                chatPlugins={chatPlugins}
                streamingSpeed={streamingSpeed}
              />
            </div>
          </Suspense>
        </MarkdownErrorBoundary>
      </div>
    </details>
  );
}
