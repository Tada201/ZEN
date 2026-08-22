import { memo, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGemoji from 'remark-gemoji';
import remarkSupersub from 'remark-supersub';
import rehypeSlug from 'rehype-slug';
import 'katex/dist/katex.min.css';

interface SmoothMarkdownProps {
  content: string;
  isStreaming?: boolean;
  components?: Components;
  onComplete?: () => void;
  baseSpeed?: number;
  tickMs?: number;
  chatPlugins?: Record<string, boolean>;
  streamingSpeed?: 'instant' | 'typewriter';
}

const INSTANT_IMMEDIATE_LAG_CHARS = 180;
const TYPEWRITER_IMMEDIATE_LAG_CHARS = 24;
// 48ms is the floor for SmoothMarkdown reveal. The previous 24ms tick
// combined with subagent-driven store updates caused main-thread
// re-parses to dominate the render budget.
export const DEFAULT_TICK_MS = 48;

// Below this length a single ReactMarkdown parse is cheaper than the
// segmentation machinery, so short blocks keep the one-parse path.
const SEGMENTATION_MIN_LENGTH = 400;

const LIST_ITEM_LINE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
const LIST_CONTINUATION_LINE = /^ {2,}\S/;
const INDENTED_CODE_LINE = /^(?: {4}|\t)/;

function firstNonEmptyLine(chunk: string): string | null {
  for (const line of chunk.split('\n')) {
    if (line.trim()) return line;
  }
  return null;
}

function lastNonEmptyLine(chunk: string): string | null {
  const lines = chunk.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) return lines[i];
  }
  return null;
}

function hasOddDollarMath(chunk: string): boolean {
  let count = 0;
  let index = chunk.indexOf('$$');
  while (index !== -1) {
    count += 1;
    index = chunk.indexOf('$$', index + 2);
  }
  return count % 2 === 1;
}

/**
 * Splits streaming markdown into blank-line-separated segments so every
 * completed segment can be memoized by string identity and never re-parsed
 * while the reveal grows. Chunks that one remark parse would join into a
 * single node (loose lists, display math, indented code) stay merged, so
 * per-segment rendering matches the unsplit parse. The final segment is the
 * active tail: it re-parses per reveal step, but its length is bounded to one
 * paragraph instead of the whole message.
 */
export function segmentStreamingMarkdown(content: string): string[] {
  const chunks = content.split(/\n{2,}/);
  if (chunks.length <= 1) return chunks;

  const segments: string[] = [];
  let current = chunks[0];
  let lastLine = lastNonEmptyLine(chunks[0]);
  let mathOpen = hasOddDollarMath(chunks[0]);
  let inList = lastLine !== null && LIST_ITEM_LINE.test(lastLine);
  let inIndentedCode = lastLine !== null && INDENTED_CODE_LINE.test(lastLine);

  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i];
    const firstLine = firstNonEmptyLine(next);
    const mustMerge = mathOpen
      || (inList && firstLine !== null && (LIST_ITEM_LINE.test(firstLine) || LIST_CONTINUATION_LINE.test(firstLine)))
      || (inIndentedCode && firstLine !== null && INDENTED_CODE_LINE.test(firstLine));
    if (mustMerge) {
      current += '\n\n' + next;
    } else {
      segments.push(current);
      current = next;
    }
    if (hasOddDollarMath(next)) mathOpen = !mathOpen;
    lastLine = lastNonEmptyLine(next);
    inList = lastLine !== null && LIST_ITEM_LINE.test(lastLine);
    inIndentedCode = lastLine !== null && INDENTED_CODE_LINE.test(lastLine);
  }
  segments.push(current);
  return segments;
}

interface MarkdownSegmentProps {
  content: string;
  remarkPlugins: any;
  rehypePlugins: any;
  components?: Components;
}

// Memoized by string identity: streaming growth is append-only, so completed
// segments keep their exact string and React skips re-parsing them entirely.
const StableMarkdownSegment = memo(
  function StableMarkdownSegment({ content, remarkPlugins, rehypePlugins, components }: MarkdownSegmentProps) {
    return (
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {content}
      </ReactMarkdown>
    );
  },
  (prev, next) => prev.content === next.content
    && prev.remarkPlugins === next.remarkPlugins
    && prev.rehypePlugins === next.rehypePlugins
    && prev.components === next.components,
);

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

export function SmoothMarkdown({ 
  content, 
  isStreaming, 
  components, 
  onComplete,
  baseSpeed,
  tickMs = DEFAULT_TICK_MS,
  chatPlugins = {},
  streamingSpeed = 'instant',
}: SmoothMarkdownProps) {
  const [displayedContent, setDisplayedContent] = useState(content);
  const displayedContentRef = useRef(content);
  const targetContentRef = useRef(content);
  const completedContentRef = useRef("");
  const revealFrameRef = useRef<number | null>(null);
  // Timestamp until which a punctuation pause holds the reveal (typewriter
  // mode only). Lives in a ref so it survives the effect re-running on every
  // content delta without tearing down the rAF loop.
  const holdUntilRef = useRef(0);
  const isStreamingRef = useRef(Boolean(isStreaming));
  isStreamingRef.current = Boolean(isStreaming);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const current = displayedContentRef.current;
    const immediateLag = streamingSpeed === 'typewriter'
      ? TYPEWRITER_IMMEDIATE_LAG_CHARS
      : INSTANT_IMMEDIATE_LAG_CHARS;
    if (content !== current && !content.startsWith(current)) {
      // Reconciliation is allowed to replace only the divergent suffix. The
      // complete canonical answer must still pass through the reveal queue —
      // but only at rest: while streaming, divergence (runtime re-batch, part
      // reorder) must not shrink the visible text backward, or the reveal
      // jumps in reverse. The reveal loop snaps to the new target prefix on
      // its next frame instead.
      if (!isStreamingRef.current) {
        let commonLength = 0;
        while (commonLength < current.length && commonLength < content.length && current[commonLength] === content[commonLength]) {
          commonLength += 1;
        }
        displayedContentRef.current = content.slice(0, commonLength);
        setDisplayedContent(displayedContentRef.current);
        holdUntilRef.current = 0;
      }
    }
    targetContentRef.current = content;
    const hasPartialStreamingReveal = content.startsWith(current) && current.length > 0 && content.length - current.length > immediateLag;
    // Preserve the named guard for the completion/drain contract: a large
    // provider burst must remain queued rather than taking the final-content path.
    void hasPartialStreamingReveal;

    if (revealFrameRef.current !== null) return;

    let lastFrame = 0;
    const reveal = (timestamp: number) => {
      revealFrameRef.current = null;
      const target = targetContentRef.current;
      const currentVisible = displayedContentRef.current;
      if (target.length <= currentVisible.length && target === currentVisible) {
        if (!isStreamingRef.current && completedContentRef.current !== target) {
          completedContentRef.current = target;
          onCompleteRef.current?.();
        }
        return;
      }

      const remaining = Math.max(0, target.length - currentVisible.length);
      const elapsed = lastFrame ? Math.max(1, timestamp - lastFrame) : Math.max(16, tickMs);
      lastFrame = timestamp;

      if (streamingSpeed === 'typewriter') {
        // Punctuation cadence: hold briefly at sentence ends and paragraph
        // breaks so the reveal reads like natural pacing, not a steady
        // progress bar. Pauses only apply while the backlog is small — behind
        // a large burst (backgrounded tab, fast model) they cost more than
        // they add, mirroring the Codex revealPacing trade-off.
        if (timestamp < holdUntilRef.current) {
          revealFrameRef.current = window.requestAnimationFrame(reveal);
          return;
        }
        if (remaining < 320) {
          const at = target[currentVisible.length];
          if (at === '.' || at === '!' || at === '?') holdUntilRef.current = timestamp + 160;
          else if (at === ',' || at === ';' || at === ':') holdUntilRef.current = timestamp + 70;
          else if (at === '\n') holdUntilRef.current = timestamp + 110;
        }
      }

      const configuredSpeed = Math.max(1, baseSpeed ?? (streamingSpeed === 'typewriter' ? 8 : 96));
      const perFrame = streamingSpeed === 'typewriter'
        // Backlog-aware catch-up: a large backlog drains progressively faster
        // (up to the frame cap) instead of trickling out at base rate.
        ? Math.min(40, Math.max(1, Math.ceil(configuredSpeed * elapsed / 16) * (1 + remaining / 320)))
        // Instant mode is a single reveal layer: the runtime scheduler
        // (runScheduler.revealAgentRun, 180 chars/frame) already paces the
        // streamed text into `content`, so re-throttling it here stacks a
        // second cadence and produces the delay-then-burst stutter (R6).
        // Reveal the whole pending target in one frame; the runtime scheduler
        // stays the sole bounded reveal. The reveal loop, suffix reconciliation
        // and onComplete drain are all preserved.
        : remaining;
      const next = target.slice(0, currentVisible.length + perFrame);
      displayedContentRef.current = next;
      setDisplayedContent(next);
      revealFrameRef.current = window.requestAnimationFrame(reveal);
    };

    revealFrameRef.current = window.requestAnimationFrame(reveal);
  }, [baseSpeed, content, isStreaming, streamingSpeed, tickMs]);

  useEffect(() => () => {
    if (revealFrameRef.current !== null) window.cancelAnimationFrame(revealFrameRef.current);
  }, []);

  const displayContent = displayedContent;

  const remarkPlugins = useMemo(() => [
    chatPlugins?.gfm !== false && [remarkGfm, { singleTilde: false }],
    chatPlugins?.math !== false && remarkMath,
    remarkBreaks,
    chatPlugins?.gemoji !== false && remarkGemoji,
    chatPlugins?.supersub !== false && remarkSupersub
  ].filter(Boolean) as any, [chatPlugins?.gfm, chatPlugins?.math, chatPlugins?.gemoji, chatPlugins?.supersub]);

  const rehypePlugins = useMemo(() => [
    rehypeKatex,
    rehypeSlug
  ] as any, []);

  const normalizedContent = useMemo(
    () => normalizeMathMarkdown(displayContent),
    [displayContent],
  );

  // While streaming, completed paragraphs render as memoized segments and
  // only the active tail re-parses per reveal step. At rest (or below the
  // length threshold) the full string takes a single canonical parse so the
  // final layout is exactly the unsplit rendering.
  const segments = useMemo(() => {
    if (!isStreaming || normalizedContent.length < SEGMENTATION_MIN_LENGTH) return null;
    return segmentStreamingMarkdown(normalizedContent);
  }, [isStreaming, normalizedContent]);

  // Content-derived keys keep a segment mounted when earlier segments merge or
  // the tail re-splits — index keys remounted every shifted segment, dropping
  // rendered state mid-stream. Identical contents get a counted suffix so
  // duplicate paragraphs cannot collide.
  const segmentKeys = useMemo(() => {
    if (!segments) return null;
    const seen = new Map<string, number>();
    return segments.map((segment) => {
      const seenCount = seen.get(segment) ?? 0;
      seen.set(segment, seenCount + 1);
      return seenCount === 0 ? segment : `${segment}#${seenCount}`;
    });
  }, [segments]);

  return (
    <div
      className="smooth-markdown text-sm leading-[1.6] prose prose-invert max-w-full"
      data-streaming={isStreaming ? "true" : undefined}
    >
      {segments === null ? (
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={components}
        >
          {normalizedContent}
        </ReactMarkdown>
      ) : (
        segments.map((segment, index) => (
          <StableMarkdownSegment
            key={segmentKeys?.[index] ?? index}
            content={segment}
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={components}
          />
        ))
      )}
      {isStreaming && (
        <span className="streaming-cursor" aria-hidden="true" />
      )}
    </div>
  );
}
