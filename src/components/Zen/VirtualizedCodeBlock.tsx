import React, { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils/style';

interface VirtualizedCodeBlockProps {
  code: string;
  highlightedHtml?: string;
  className?: string;
}

export function VirtualizedCodeBlock({ code, highlightedHtml, className }: VirtualizedCodeBlockProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => code.split('\n'), [code]);
  const highlightedLines = useMemo(() => highlightedHtml ? highlightedHtml.split('\n') : null, [highlightedHtml]);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      className={cn(
        'h-[400px] overflow-auto border border-border bg-card rounded-lg font-mono text-[12px]',
        className
      )}
    >
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
              height: '24px',
              whiteSpace: 'pre',
              padding: '0 0.75rem',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {highlightedLines ? (
              <span dangerouslySetInnerHTML={{ __html: highlightedLines[virtualRow.index] || ' ' }} />
            ) : (
              <span className="text-foreground">{lines[virtualRow.index] || ' '}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}