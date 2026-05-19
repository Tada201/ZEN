import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal, Trash2, CircleDot, Send } from 'lucide-react';
import { cn } from '@/lib/utils/style';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

interface XTermPanelProps {
    className?: string;
}

export function XTermPanel({ className = '' }: XTermPanelProps) {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const [output, setOutput] = useState<string[]>([
        '[SYSTEM] Terminal rendering engine initialized.',
    ]);
    const [input, setInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [charMetrics, setCharMetrics] = useState({ width: 7.2, height: 18 });
    const outputRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLSpanElement>(null);
    const unlistenersRef = useRef<UnlistenFn[]>([]);
    const lastResizeRef = useRef({ cols: 0, rows: 0 });

    // Spawn PTY session on mount
    useEffect(() => {
        let cancelled = false;
        let localSessionId: string | null = null;

        async function init() {
            try {
                const id = await invoke<string>('terminal_spawn', {
                    cols: DEFAULT_COLS,
                    rows: DEFAULT_ROWS,
                    cwd: null as string | null,
                });

                if (cancelled) {
                    await invoke('terminal_kill', { id });
                    return;
                }

                localSessionId = id;
                setSessionId(id);
                setConnected(true);
                setOutput(prev => [...prev, '[SYSTEM] PTY session established.']);

                // Listen for stdout from this session
                const unlisten = await listen<string>(`terminal-stdout-${id}`, (event) => {
                    if (!cancelled) {
                        setOutput(prev => [...prev, event.payload]);
                    }
                });
                unlistenersRef.current.push(unlisten);
            } catch (err: any) {
                if (!cancelled) {
                    const msg = typeof err === 'string' ? err : err?.message || 'Unknown error';
                    setError(msg);
                    setOutput(prev => [...prev, `[ERROR] Failed to spawn PTY: ${msg}`]);
                }
            }
        }

        init();

        return () => {
            cancelled = true;
            // Clean up event listeners
            unlistenersRef.current.forEach(fn => fn());
            unlistenersRef.current = [];

            // Kill the PTY session (use local variable to avoid stale closure)
            if (localSessionId) {
                invoke('terminal_kill', { id: localSessionId }).catch(() => {});
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-scroll on new output
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output]);

    // Measure exact character dimensions on mount for accurate resize
    useEffect(() => {
        if (measureRef.current) {
            const span = measureRef.current;
            // getBoundingClientRect is synchronous — no layout thrash
            const rect = span.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setCharMetrics({
                    width: rect.width / 10, // "0123456789" is 10 chars
                    height: rect.height,
                });
            }
        }
    }, []);

    // ResizeObserver — tell the PTY when the panel dimensions change
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !sessionId) return;

        const handleResize = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            // Subtract padding (p-4 = 32px total) and account for header/footer
            const usableWidth = width - 32; // horizontal padding
            const usableHeight = height; // vertical scroll takes the rest

            const cols = Math.max(10, Math.floor(usableWidth / charMetrics.width));
            const rows = Math.max(5, Math.floor(usableHeight / charMetrics.height));

            // Only invoke if dimensions actually changed (skip duplicate events)
            const prev = lastResizeRef.current;
            if (prev.cols === cols && prev.rows === rows) return;
            lastResizeRef.current = { cols, rows };

            invoke('terminal_resize', { id: sessionId, cols, rows }).catch(() => {});
        };

        const observer = new ResizeObserver(() => {
            handleResize();
        });

        observer.observe(container);

        // Fire an initial resize so the backend matches the current layout
        handleResize();

        return () => {
            observer.disconnect();
        };
    }, [sessionId, charMetrics]);

    // Handle command submission
    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const cmd = input.trim();
        if (!cmd || !sessionId) return;

        setOutput(prev => [...prev, `$ ${cmd}`]);
        setInput('');

        try {
            await invoke('terminal_write', { id: sessionId, data: cmd + '\n' });
        } catch (err: any) {
            const msg = typeof err === 'string' ? err : err?.message || 'Write failed';
            setOutput(prev => [...prev, `[ERROR] ${msg}`]);
        }
    }, [input, sessionId]);

    // Clear output
    const handleClear = useCallback(() => {
        setOutput([]);
    }, []);

    return (
        <div
            ref={containerRef}
            className={cn(
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
                            {connected ? 'STABLE' : error ? 'ERROR' : 'CONNECTING'}
                        </span>
                    </div>
                    {sessionId && (
                        <span className="text-[7px] font-mono text-muted-foreground/30 uppercase tracking-widest ml-1">
                            SID:{sessionId.slice(0, 8)}
                        </span>
                    )}
                </div>
                <button
                    onClick={handleClear}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all"
                    title="Clear output"
                >
                    <Trash2 size={11} />
                </button>
            </div>

            {/* Terminal Output */}
            <div
                ref={outputRef}
                className="flex-1 p-4 overflow-y-auto scrollbar-thin bg-[hsl(240_6%_6%)]"
            >
                {/* Hidden measuring span — stable, not rendered visually */}
                <span
                    ref={measureRef}
                    className="absolute invisible pointer-events-none font-mono text-[11px] leading-relaxed"
                    aria-hidden="true"
                >
                    0123456789
                </span>
                <div className="space-y-0.5 font-mono text-[11px] leading-relaxed">
                    {output.map((line, i) => (
                        <div key={i} className={cn(
                            "transition-opacity duration-150",
                            line.startsWith('[SYSTEM]') ? "text-primary/60" : "",
                            line.startsWith('[ERROR]') ? "text-destructive" : "",
                            line.startsWith('$ ') ? "text-green-400/80" : "text-foreground/70"
                        )}>
                            {line}
                        </div>
                    ))}
                    {connected && (
                        <div className="flex items-center gap-1.5 text-primary/40">
                            <CircleDot size={6} className="animate-pulse" />
                            <span>session active</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Command Input */}
            <form
                onSubmit={handleSubmit}
                className="h-8 flex items-center gap-2 px-3 bg-muted/20 border-t border-border shrink-0"
            >
                <span className="text-green-500 font-mono text-[11px] font-bold">$</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={connected ? "Type a command..." : "Connecting..."}
                    disabled={!connected}
                    className="flex-1 bg-transparent border-none outline-none text-[11px] font-mono text-foreground/90 placeholder:text-muted-foreground/30"
                    autoComplete="off"
                    spellCheck={false}
                />
                <button
                    type="submit"
                    disabled={!connected || !input.trim()}
                    className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Send command"
                >
                    <Send size={11} />
                </button>
            </form>

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
