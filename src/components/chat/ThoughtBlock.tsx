import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils/style';

interface ThoughtBlockProps {
  content: string;
  isThinking?: boolean;
}

/**
 * High-fidelity "Thought Block" for displaying agent reasoning.
 * Features a premium shimmer animation and collapsible state.
 */
export function ThoughtBlock({ content, isThinking }: ThoughtBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="group my-3 overflow-hidden rounded-xl border border-border/40 bg-muted/10 transition-all hover:bg-muted/20">
      {/* Header */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary",
            isThinking && "animate-pulse"
          )}>
            <Sparkles size={10} />
          </div>
          <span className={cn(isThinking && "premium-shimmer")}>
            {isThinking ? 'Reasoning...' : 'Thought Process'}
          </span>
        </div>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 text-[13px] leading-relaxed text-muted-foreground/80 border-t border-border/20">
          <div className="animate-in fade-in slide-in-from-top-1 duration-300">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
