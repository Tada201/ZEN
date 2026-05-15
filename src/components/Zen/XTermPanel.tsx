import { useEffect, useRef, useState } from 'react';
import { Terminal, Trash2, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils/style';

interface XTermPanelProps {
    className?: string;
}

export function XTermPanel({ className = '' }: XTermPanelProps) {
    const [connected, setConnected] = useState(false);
    const [output, setOutput] = useState<string[]>([
        '[SYSTEM] Terminal rendering engine initialized.',
        '[SYSTEM] Backend not connected - running in preview mode.',
    ]);
    const outputRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            setOutput(prev => [...prev, '[SYSTEM] PTY backend not available in browser mode.']);
            setOutput(prev => [...prev, '[SYSTEM] Set TAURI_BACKEND_URL to enable real terminal.']);
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output]);

    return (
        <div className={cn(
            "flex flex-col h-full bg-background border border-border rounded-lg overflow-hidden shadow-2xl",
            className
        )}>
            {/* Header Bar */}
            <div className="h-9 flex items-center justify-between px-4 bg-muted/30 border-b border-border shrink-0">
                <div className="flex items-center gap-2.5">
                    <Terminal size={12} className="text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">NEXUS_SHELL</span>
                    <div className="w-[1px] h-3 bg-border" />
                    <div className="flex items-center gap-1.5">
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            connected ? "bg-success shadow-[0_0_6px_var(--color-success)]" : "bg-warning animate-pulse"
                        )} />
                        <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">
                            {connected ? 'STABLE' : 'PREVIEW'}
                        </span>
                    </div>
                </div>
                <button
                    onClick={() => setOutput([])}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all"
                    title="Purge Stream"
                >
                    <Trash2 size={11} />
                </button>
            </div>

            {/* Terminal Output */}
            <div
                ref={outputRef}
                className="flex-1 p-4 overflow-y-auto scrollbar-thin bg-[hsl(240_6%_6%)]"
            >
                <div className="space-y-0.5 font-mono text-[11px] leading-relaxed">
                    {output.map((line, i) => (
                        <div key={i} className={cn(
                            "transition-opacity duration-150",
                            line.includes('[SYSTEM]') ? "text-primary/60" : "text-foreground/70",
                            line.includes('[ERROR]') ? "text-destructive" : "",
                            line.includes('[WARN]') ? "text-warning" : ""
                        )}>
                            {line}
                        </div>
                    ))}
                    <div className="flex items-center gap-1.5 text-primary/40">
                        <CircleDot size={6} className="animate-pulse" />
                        <span>waiting for input...</span>
                    </div>
                </div>
            </div>

            {/* Status Footer */}
            <div className="h-7 flex items-center justify-between px-4 bg-muted/20 border-t border-border shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-[8px] font-mono text-muted-foreground/50 uppercase tracking-widest">
                        UTF-8
                    </span>
                    <div className="w-[1px] h-2.5 bg-border" />
                    <span className="text-[8px] font-mono text-muted-foreground/50 uppercase tracking-widest">
                        115200 Bd
                    </span>
                </div>
                <span className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-widest">
                    PTY v1.0
                </span>
            </div>
        </div>
    );
}