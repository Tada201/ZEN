import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
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
  baseSpeed?: number; // chars per tick
  tickMs?: number;
  chatPlugins?: Record<string, boolean>;
  streamingSpeed?: 'instant' | 'typewriter';
}

const INSTANT_IMMEDIATE_LAG_CHARS = 96;
const TYPEWRITER_IMMEDIATE_LAG_CHARS = 16;
const MAX_ANIMATED_LAG_CHARS = 1800;

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
  baseSpeed = 1,
  tickMs = 20,
  chatPlugins = {},
  streamingSpeed = 'instant',
}: SmoothMarkdownProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  const targetContentRef = useRef(content);
  const currentPosRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef(0);

  const deferredContent = useDeferredValue(displayedContent);
  const immediateLagChars = streamingSpeed === 'typewriter'
    ? TYPEWRITER_IMMEDIATE_LAG_CHARS
    : INSTANT_IMMEDIATE_LAG_CHARS;

  // Performance Fix #4: Memoize plugin arrays so ReactMarkdown doesn't
  // re-create its processing pipeline on every render tick.
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

  // Sync target content
  useEffect(() => {
    targetContentRef.current = content;

    const displayed = displayedContent;
    const hasPartialStreamingReveal = currentPosRef.current > 0
      && currentPosRef.current < content.length
      && content.startsWith(displayed);

    // If this is a stable historical message, show it immediately. If a live
    // stream just completed, keep revealing the remaining provider burst so
    // the UI does not jump from partial text to the final answer.
    if (!isStreaming) {
      if (hasPartialStreamingReveal) {
        return;
      }
      currentPosRef.current = content.length;
      setDisplayedContent(content);
      return;
    }

    const lag = content.length - currentPosRef.current;

    // For normal-speed providers, do not add artificial latency. Smooth only
    // when the provider/UI backlog is large enough to cause chunky jumps.
    if (lag > 0 && lag <= immediateLagChars) {
      currentPosRef.current = content.length;
      setDisplayedContent(content);
    }
  }, [content, displayedContent, immediateLagChars, isStreaming]);

  useEffect(() => {
    const tick = (timestamp: number) => {
      // Throttle to respect tickMs interval using rAF timing
      if (timestamp - lastTickTimeRef.current < tickMs) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTickTimeRef.current = timestamp;

      const target = targetContentRef.current;
      const current = currentPosRef.current;

      if (current < target.length) {
        const remaining = target.length - current;

        if (remaining <= immediateLagChars) {
          currentPosRef.current = target.length;
          setDisplayedContent(target);
          rafRef.current = null;
          if (!isStreaming) {
            onComplete?.();
          }
          return;
        }

        if (remaining > MAX_ANIMATED_LAG_CHARS) {
          const nextPos = target.length - MAX_ANIMATED_LAG_CHARS;
          currentPosRef.current = nextPos;
          setDisplayedContent(target.slice(0, nextPos));
        }

        // 1. Detect if we are inside a code block
        const adjustedCurrent = currentPosRef.current;
        const textBefore = target.slice(0, adjustedCurrent);
        const backtickCount = (textBefore.match(/```/g) || []).length;
        const inCodeBlock = backtickCount % 2 !== 0;

        // 2. Determine increment — more aggressive catch-up to reduce
        //    the number of intermediate ReactMarkdown re-parses
        let baseIncrement = streamingSpeed === 'typewriter'
          ? 2
          : (Math.random() > 0.85 ? 2 : 1);
        
        let speedMultiplier = 1;
        if (streamingSpeed === 'typewriter') {
          if (remaining > 2000) speedMultiplier = 24;
          else if (remaining > 1000) speedMultiplier = 14;
          else if (remaining > 400) speedMultiplier = 7;
          else if (remaining > 100) speedMultiplier = 3;
        } else {
          if (remaining > 2000) speedMultiplier = 40;
          else if (remaining > 1000) speedMultiplier = 25;
          else if (remaining > 400) speedMultiplier = 12;
          else if (remaining > 100) speedMultiplier = 6;
        }

        let increment = inCodeBlock ? 50 : Math.max(1, baseIncrement * speedMultiplier);

        // 3. Update position
        const nextPos = Math.min(adjustedCurrent + increment, target.length);
        currentPosRef.current = nextPos;
        setDisplayedContent(target.slice(0, nextPos));

        // 4. Schedule next frame
        rafRef.current = requestAnimationFrame(tick);
      } else {
        if (!isStreaming) {
          onComplete?.();
        }
        rafRef.current = null;
      }
    };

    if (!rafRef.current && currentPosRef.current < targetContentRef.current.length) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [content, immediateLagChars, isStreaming, baseSpeed, tickMs, onComplete, streamingSpeed]);

  const normalizedContent = useMemo(
    () => normalizeMathMarkdown(deferredContent),
    [deferredContent],
  );

  return (
    <div className="smooth-markdown text-sm leading-relaxed prose prose-invert max-w-none">
      <ReactMarkdown 
        remarkPlugins={remarkPlugins} 
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
