import { useEffect, useMemo, useRef, useState } from 'react';
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
      // complete canonical answer must still pass through the reveal queue.
      let commonLength = 0;
      while (commonLength < current.length && commonLength < content.length && current[commonLength] === content[commonLength]) {
        commonLength += 1;
      }
      displayedContentRef.current = content.slice(0, commonLength);
      setDisplayedContent(displayedContentRef.current);
      holdUntilRef.current = 0;
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

  return (
    <div
      className="smooth-markdown text-sm leading-[1.6] prose prose-invert max-w-full"
      data-streaming={isStreaming ? "true" : undefined}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
      {isStreaming && (
        <span className="streaming-cursor" aria-hidden="true" />
      )}
    </div>
  );
}
