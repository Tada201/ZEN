import { useMemo } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SourceEditorProps {
  content: string;
  language?: string;
  className?: string;
  maxHeight?: string;
}

export function SourceEditor({ content, className, maxHeight = "500px" }: SourceEditorProps) {
  const lines = useMemo(() => content.split("\n"), [content]);

  const highlightLine = (line: string) => {
    // Basic regex-based highlighting for OpenUI Lang
    const tokens = line.split(/(\s+|=|"(?:\\.|[^"\\])*"|\(|\)|\[|\]|,)/g);
    
    return tokens.map((token, i) => {
      if (!token) return null;
      
      if (/^"(?:\\.|[^"\\])*"$/.test(token)) {
        return <span key={i} className="text-emerald-400">{token}</span>; // Strings
      }
      if (/^root$/.test(token)) {
        return <span key={i} className="text-violet-400 font-bold">{token}</span>; // Entry point
      }
      if (/^[A-Z]\w+$/.test(token)) {
        return <span key={i} className="text-blue-400">{token}</span>; // Components
      }
      if (/^=$/.test(token)) {
        return <span key={i} className="text-slate-500">{token}</span>; // Assignment
      }
      if (/^[\(\)\[\],]$/.test(token)) {
        return <span key={i} className="text-slate-500">{token}</span>; // Punctuation
      }
      if (/^\w+$/.test(token)) {
        return <span key={i} className="text-slate-300">{token}</span>; // Variable names
      }
      return <span key={i}>{token}</span>;
    });
  };

  return (
    <div className={cn("flex flex-col bg-slate-950 border border-white/5 rounded-xl overflow-hidden shadow-2xl", className)}>
      <ScrollArea className="w-full" style={{ maxHeight }}>
        <div className="flex min-w-full">
          {/* Line Numbers */}
          <div 
            className="shrink-0 select-none bg-slate-900/50 border-r border-white/5 px-3 py-4 text-right font-mono text-[11px] leading-6 text-slate-600 min-w-[3rem]"
            aria-hidden="true"
          >
            {lines.map((_, i) => (
              <div key={i} className="h-6">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code Area */}
          <pre className="flex-1 px-5 py-4 font-mono text-[13px] leading-6 text-slate-300 selection:bg-violet-500/30 overflow-visible">
            <code>
              {lines.map((line, i) => (
                <div key={i} className="h-6 whitespace-pre hover:bg-white/5 transition-colors px-1 -mx-1 rounded">
                  {highlightLine(line) || " "}
                </div>
              ))}
            </code>
          </pre>
        </div>
        <ScrollBar orientation="horizontal" className="bg-white/5" />
        <ScrollBar orientation="vertical" className="bg-white/5" />
      </ScrollArea>
    </div>
  );
}
