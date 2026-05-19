import { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGemoji from 'remark-gemoji';
import remarkSupersub from 'remark-supersub';
import rehypeSlug from 'rehype-slug';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

interface SmoothMarkdownProps {
  content: string;
  isStreaming?: boolean;
  components?: Components;
  onComplete?: () => void;
  baseSpeed?: number; // chars per tick
  tickMs?: number;
  chatPlugins?: Record<string, boolean>;
}

export function SmoothMarkdown({ 
  content, 
  isStreaming, 
  components, 
  onComplete,
  baseSpeed = 1,
  tickMs = 20,
  chatPlugins = {}
}: SmoothMarkdownProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  const targetContentRef = useRef(content);
  const currentPosRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef(0);

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
    rehypeHighlight, 
    rehypeSlug
  ] as any, []);

  // Sync target content
  useEffect(() => {
    targetContentRef.current = content;
    
    // CRITICAL: If not actively streaming, jump to the end immediately
    // This prevents "re-typing" on page reload or session switch
    if (!isStreaming) {
      currentPosRef.current = content.length;
      setDisplayedContent(content);
    }
  }, [content, isStreaming]);

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
        // 1. Detect if we are inside a code block
        const textBefore = target.slice(0, current);
        const backtickCount = (textBefore.match(/```/g) || []).length;
        const inCodeBlock = backtickCount % 2 !== 0;

        // 2. Determine increment — more aggressive catch-up to reduce
        //    the number of intermediate ReactMarkdown re-parses
        const remaining = target.length - current;
        let baseIncrement = Math.random() > 0.85 ? 2 : 1; 
        
        let speedMultiplier = 1;
        if (remaining > 2000) speedMultiplier = 40;
        else if (remaining > 1000) speedMultiplier = 25;
        else if (remaining > 400) speedMultiplier = 12;
        else if (remaining > 100) speedMultiplier = 6;

        let increment = inCodeBlock ? 50 : Math.max(1, baseIncrement * speedMultiplier);

        // 3. Update position
        const nextPos = Math.min(current + increment, target.length);
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
  }, [content, isStreaming, baseSpeed, tickMs, onComplete]);

  return (
    <ReactMarkdown 
      remarkPlugins={remarkPlugins} 
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {displayedContent}
    </ReactMarkdown>
  );
}
