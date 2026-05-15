import { useState, useEffect, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils/style";
import { ChevronDown } from "lucide-react";

interface ReasoningBlockProps {
  content: string;
  isThinking?: boolean;
  className?: string;
  defaultOpen?: boolean;
}

export function ReasoningBlock({ content, isThinking, className, defaultOpen = false }: ReasoningBlockProps) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const thoughts = content.split('\n').filter(t => t.trim().length > 0).map(t => t.trim().replace(/^[?\-\*]\s*/, ''));
  
  if (!content) return null;

  return (
    <div className={cn("thought-block group/thought border-none bg-transparent p-0 my-4", className)}>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="w-full text-left outline-none group">
          <div className="flex items-center gap-3 py-1">
            {/* Ping / Status Dot */}
            <div className="relative flex items-center justify-center shrink-0">
              <div className={cn(
                "w-2 h-2 rounded-full transition-colors duration-500",
                isThinking ? "bg-primary/80" : "bg-muted-foreground/30"
              )} />
            </div>

            <span className={cn(
              "text-sm font-medium tracking-tight",
              isThinking ? "text-primary/60" : "text-muted-foreground/60"
            )}>
              {isThinking ? "Thinking..." : "Reasoning process"}
            </span>

            <ElapsedTimer running={isThinking} />

            <div className="ml-auto flex items-center gap-3">
              <span className="font-mono text-[10px] text-muted-foreground/20 uppercase tracking-[0.2em]">
                {thoughts.length} steps
              </span>
              <ChevronDown className={cn(
                "w-4 h-4 text-muted-foreground/30 transition-transform duration-300",
                !expanded && "-rotate-90"
              )} />
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="relative mt-4 space-y-0.5">
            {thoughts.map((thought, index) => (
              <ThoughtItem
                key={index}
                text={thought}
                index={index}
                isLast={index === thoughts.length - 1}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function ElapsedTimer({ running }: { running?: boolean }) {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (running) {
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running]);

  if (!running && seconds === 0) return null;

  return (
    <span className="text-[11px] font-mono text-muted-foreground/30">
      {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}s
    </span>
  );
}

function ThoughtItem({ text, index, isLast }: { text: string; index: number; isLast: boolean }) {
  return (
    <div
      className="flex gap-3 items-stretch opacity-0 animate-in fade-in slide-in-from-top-1 fill-mode-forwards"
      style={{
        animationDelay: `${index * 100}ms`,
      }}
    >
      {/* Left column: dot + connecting line */}
      <div className="flex flex-col items-center shrink-0 w-1.5">
        <div
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-[14px] shrink-0"
        />
        {!isLast && (
          <div className="flex-1 w-[1px] min-h-[8px] mt-1 bg-gradient-to-b from-muted-foreground/20 to-transparent" />
        )}
      </div>

      {/* Right column: thought text */}
      <div className={cn(
        "font-mono text-[13px] leading-relaxed py-2",
        isLast ? "pb-0" : "pb-2",
        "text-muted-foreground/50"
      )}>
        {text}
      </div>
    </div>
  );
}
