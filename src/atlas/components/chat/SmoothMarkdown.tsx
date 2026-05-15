import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

interface SmoothMarkdownProps {
  content: string;
  isStreaming?: boolean;
  components?: Components;
  onComplete?: () => void;
  baseSpeed?: number; // chars per tick
  tickMs?: number;
}

export function SmoothMarkdown({ 
  content, 
  isStreaming, 
  components, 
  onComplete,
  baseSpeed = 1,
  tickMs = 20
}: SmoothMarkdownProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  const targetContentRef = useRef(content);
  const currentPosRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
    const tick = () => {
      const target = targetContentRef.current;
      const current = currentPosRef.current;

      if (current < target.length) {
        // 1. Detect if we are inside a code block
        const textBefore = target.slice(0, current);
        const backtickCount = (textBefore.match(/```/g) || []).length;
        const inCodeBlock = backtickCount % 2 !== 0;

        // 2. Determine increment size with organic variability
        const remaining = target.length - current;
        let baseIncrement = Math.random() > 0.85 ? 2 : 1; 
        
        let speedMultiplier = 1;
        if (remaining > 1000) speedMultiplier = 15;
        else if (remaining > 400) speedMultiplier = 8;
        else if (remaining > 100) speedMultiplier = 4;

        let increment = inCodeBlock ? 30 : Math.max(1, baseIncrement * speedMultiplier);

        // 3. Update position
        const nextPos = Math.min(current + increment, target.length);
        currentPosRef.current = nextPos;
        setDisplayedContent(target.slice(0, nextPos));

        // 4. Organic timing jitter
        const jitter = Math.floor(Math.random() * 10);
        timerRef.current = setTimeout(tick, tickMs + jitter);
      } else {
        if (!isStreaming) {
          onComplete?.();
        }
        timerRef.current = null;
      }
    };

    if (!timerRef.current && currentPosRef.current < targetContentRef.current.length) {
      tick();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [content, isStreaming, baseSpeed, tickMs, onComplete]);

  return (
    <ReactMarkdown 
      remarkPlugins={[
        [remarkGfm, { singleTilde: false }], 
        remarkMath, 
        remarkBreaks, 
        remarkGemoji, 
        remarkSupersub
      ]} 
      rehypePlugins={[
        rehypeKatex, 
        rehypeHighlight, 
        rehypeSlug, 
        [rehypeAutolinkHeadings, { behavior: 'wrap' }]
      ]}
      components={components}
    >
      {displayedContent}
    </ReactMarkdown>
  );
}
