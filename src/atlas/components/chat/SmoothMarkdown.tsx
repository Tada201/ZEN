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
const DEFAULT_TICK_MS = 24;

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
  const completedContentRef = useRef("");

  useEffect(() => {
    const isAppendOnlyUpdate = content.startsWith(displayedContent);
    const lag = Math.max(0, content.length - displayedContent.length);
    const immediateLag = streamingSpeed === 'typewriter'
      ? TYPEWRITER_IMMEDIATE_LAG_CHARS
      : INSTANT_IMMEDIATE_LAG_CHARS;
    const hasPartialStreamingReveal = isAppendOnlyUpdate && displayedContent.length > 0 && lag > immediateLag;

    if (!isAppendOnlyUpdate) {
      setDisplayedContent(content);
      return;
    }

    if (lag <= 0) {
      if (!isStreaming && completedContentRef.current !== content) {
        completedContentRef.current = content;
        onComplete?.();
      }
      return;
    }

    if (isStreaming && !hasPartialStreamingReveal) {
      setDisplayedContent(content);
      return;
    }

    // When chat:done arrives, keep revealing the remaining provider burst
    // instead of replacing the visible text with the full answer at once.
    const timer = window.setInterval(() => {
      setDisplayedContent((current) => {
        if (!content.startsWith(current)) return content;
        const remaining = content.length - current.length;
        if (remaining <= 0) {
          window.clearInterval(timer);
          return current;
        }

        const configuredSpeed = Math.max(1, baseSpeed ?? (streamingSpeed === 'typewriter' ? 8 : 96));
        const adaptiveCatchup = streamingSpeed === 'typewriter'
          ? Math.min(40, Math.max(configuredSpeed, Math.ceil(remaining / 40)))
          : Math.min(180, Math.max(configuredSpeed, Math.ceil(remaining / 10)));
        return content.slice(0, current.length + adaptiveCatchup);
      });
    }, Math.max(16, tickMs));

    return () => window.clearInterval(timer);
  }, [baseSpeed, content, displayedContent, isStreaming, onComplete, streamingSpeed, tickMs]);

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
