import React, { useState, useEffect, useRef } from "react";
import { Terminal as TerminalIcon, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalLog {
  id: string;
  command: string;
  output: string;
  exitCode?: number;
  timestamp: number;
}

export function Terminal({ logs, onCommand }: { logs: TerminalLog[], onCommand?: (cmd: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && onCommand) {
      onCommand(input.trim());
      setInput("");
    }
  };

  return (
    <div className="h-full bg-black/90 font-mono text-[12px] overflow-hidden flex flex-col">
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-white/20 italic select-none">
            <TerminalIcon className="h-8 w-8 mb-2 opacity-10" />
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1">Terminal Session Ready</p>
            <p className="text-[9px] opacity-40">Type a command below or ask the AI</p>
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="space-y-1 group">
                <div className="flex items-center gap-2 text-white/40">
                  <span className="text-green-500 font-bold">$</span>
                  <span className="text-white/80">{log.command}</span>
                  <div className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {log.exitCode === 0 ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : log.exitCode != null ? (
                      <XCircle className="h-3 w-3 text-red-500" />
                    ) : (
                      <Clock className="h-3 w-3 text-yellow-500 animate-pulse" />
                    )}
                    <span className="text-[10px] tabular-nums">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>
                {log.output && (
                  <pre className="pl-5 text-white/60 whitespace-pre-wrap break-all leading-relaxed border-l border-white/5 ml-1">
                    {log.output}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Interactive Input */}
      <div className="p-2 border-t border-white/5 bg-black/40">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-1">
          <span className="text-green-500 font-bold">$</span>
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type command..."
            className="flex-1 bg-transparent border-none outline-none text-white/90 placeholder:text-white/10"
            autoComplete="off"
            spellCheck={false}
          />
        </form>
      </div>
    </div>
  );
}
