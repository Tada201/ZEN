import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
    Terminal, CircleDot, Send, X, Plus, Sliders
} from 'lucide-react';
import { cn } from '@/lib/utils/style';
import { terminalApi } from '@/api';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { XTermStatusFooter } from './XTermStatusFooter';
import { XTermTelemetryDrawer } from './XTermTelemetryDrawer';
import { renderFormattedTerminalLine } from './terminalLineFormatting';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

interface Session {
    id: string;
    name: string;
    output: string[];
    connected: boolean;
    error: string | null;
    spawnTime: number;
}

interface XTermPanelProps {
    className?: string;
}

export function XTermPanel({ className = '' }: XTermPanelProps) {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [showDrawer, setShowDrawer] = useState(false);
    const [commandHistory, setCommandHistory] = useState<string[]>([
        'git status',
        'npm run dev',
        'npx tsc --noEmit',
        'dir'
    ]);
    const [wordWrap, setWordWrap] = useState(true);
    const [scrollLock, setScrollLock] = useState(false);
    const [spawnError, setSpawnError] = useState<string | null>(null);
    const [pendingSpawnName, setPendingSpawnName] = useState<string | null>(null);
    
    // Telemetry indicators
    const [ticks, setTicks] = useState(0);
    const [copiedActive, setCopiedActive] = useState(false);
    const [simulatedMetrics, setSimulatedMetrics] = useState({ cpu: 4, mem: 124, rx: 1.2, tx: 0.8 });

    const [input, setInput] = useState('');
    const outputRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLSpanElement>(null);
    const [charMetrics, setCharMetrics] = useState({ width: 7.2, height: 18 });
    const lastResizeRef = useRef({ cols: 0, rows: 0 });
    const listenersMapRef = useRef<Record<string, UnlistenFn>>({});

    // Find active session
    const activeSession = useMemo(() => {
        return sessions.find(s => s.id === activeSessionId) || null;
    }, [sessions, activeSessionId]);

    // Live clock ticks for uptime
    useEffect(() => {
        const timer = setInterval(() => {
            setTicks(t => t + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Telemetry fluctuation simulator
    useEffect(() => {
        const timer = setInterval(() => {
            setSimulatedMetrics(prev => ({
                cpu: Math.max(2, Math.min(98, Math.floor(prev.cpu + (Math.random() * 6 - 3)))),
                mem: Math.max(100, Math.min(256, Math.floor(prev.mem + (Math.random() * 4 - 2)))),
                rx: Math.max(0.1, parseFloat((prev.rx + (Math.random() * 1.2 - 0.6)).toFixed(1))),
                tx: Math.max(0.1, parseFloat((prev.tx + (Math.random() * 0.8 - 0.4)).toFixed(1))),
            }));
        }, 1500);
        return () => clearInterval(timer);
    }, []);

    // Spawn new session
    const spawnNewSession = useCallback(async (customName?: string) => {
        setSpawnError(null);
        setPendingSpawnName(null);
        try {
            const cols = lastResizeRef.current.cols || DEFAULT_COLS;
            const rows = lastResizeRef.current.rows || DEFAULT_ROWS;
            
            const id = await terminalApi.spawn(cols, rows, null, true);

            const name = customName || `Shell ${sessions.length + 1}`;
            const newSession: Session = {
                id,
                name,
                output: [
                    '[SYSTEM] Terminal rendering engine initialized.',
                    '[SYSTEM] PTY session established.'
                ],
                connected: true,
                error: null,
                spawnTime: Date.now()
            };

            setSessions(prev => [...prev, newSession]);
            setActiveSessionId(id);

            // Listen for stdout
            const unlisten = await listen<string>(`terminal:output:${id}`, (event) => {
                setSessions(prev => prev.map(s => {
                    if (s.id === id) {
                        return { ...s, output: [...s.output, event.payload] };
                    }
                    return s;
                }));
            });

            listenersMapRef.current[id] = unlisten;
        } catch (err: unknown) {
            const msg = typeof err === 'string' ? err : err instanceof Error ? err.message : 'Unknown error';
            setSpawnError(msg);
            console.error("Failed to spawn session:", msg);
        }
    }, [sessions.length]);

    const requestSpawn = useCallback((customName?: string) => {
        setSpawnError(null);
        setPendingSpawnName(customName || `Shell ${sessions.length + 1}`);
    }, [sessions.length]);

    useEffect(() => {
        return () => {
            // Clean up all active listeners
            Object.keys(listenersMapRef.current).forEach(id => {
                listenersMapRef.current[id]();
                terminalApi.kill(id).catch(() => {});
            });
            listenersMapRef.current = {};
        };
    }, []);

    // Close session
    const closeSession = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        
        // Don't close if it is the last session remaining
        if (sessions.length <= 1) return;

        if (listenersMapRef.current[id]) {
            listenersMapRef.current[id]();
            delete listenersMapRef.current[id];
        }

        try {
            await terminalApi.kill(id);
        } catch (err) {}

        setSessions(prev => prev.filter(s => s.id !== id));

        // Switch tabs if active session closed
        if (activeSessionId === id) {
            const remaining = sessions.filter(s => s.id !== id);
            setActiveSessionId(remaining[remaining.length - 1].id);
        }
    }, [sessions, activeSessionId]);

    // Trigger Resize
    const triggerActiveResize = useCallback(() => {
        if (!activeSessionId) return;
        const container = containerRef.current;
        if (!container) return;

        const width = container.clientWidth;
        const height = container.clientHeight;
        
        // Account for control drawer taking 220px (w-56)
        const usableWidth = width - (showDrawer ? 220 : 0) - 32;
        const usableHeight = height - 110; // offset headers, footers, and tabs

        const cols = Math.max(10, Math.floor(usableWidth / charMetrics.width));
        const rows = Math.max(5, Math.floor(usableHeight / charMetrics.height));

        const prev = lastResizeRef.current;
        if (prev.cols === cols && prev.rows === rows) return;
        lastResizeRef.current = { cols, rows };

        terminalApi.resize(activeSessionId, cols, rows).catch(() => {});
    }, [activeSessionId, showDrawer, charMetrics]);

    // Trigger resize on state alterations
    useEffect(() => {
        triggerActiveResize();
    }, [activeSessionId, showDrawer, triggerActiveResize]);

    // ResizeObserver
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver(() => {
            triggerActiveResize();
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, [triggerActiveResize]);

    // Measure exact character dimensions
    useEffect(() => {
        if (measureRef.current) {
            const rect = measureRef.current.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setCharMetrics({
                    width: rect.width / 10,
                    height: rect.height,
                });
            }
        }
    }, []);

    // Auto-scroll logic
    useEffect(() => {
        if (outputRef.current && !scrollLock) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [activeSession?.output, scrollLock]);

    // Command Submit
    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const cmd = input.trim();
        if (!cmd || !activeSessionId) return;

        // Register in command history
        setCommandHistory(prev => {
            const clean = prev.filter(c => c !== cmd);
            return [cmd, ...clean].slice(0, 30);
        });

        setSessions(prev => prev.map(s => {
            if (s.id === activeSessionId) {
                return { ...s, output: [...s.output, `$ ${cmd}`] };
            }
            return s;
        }));
        setInput('');

        try {
            await terminalApi.write(activeSessionId, cmd + '\n');
        } catch (err: any) {
            const msg = typeof err === 'string' ? err : err?.message || 'Write failed';
            setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                    return { ...s, output: [...s.output, `[ERROR] ${msg}`] };
                }
                return s;
            }));
        }
    }, [input, activeSessionId]);

    // Copy Logs
    const handleCopyLogs = useCallback(() => {
        if (!activeSession) return;
        const text = activeSession.output.join('\n');
        navigator.clipboard.writeText(text);
        setCopiedActive(true);
        setTimeout(() => setCopiedActive(false), 2000);
    }, [activeSession]);

    // Clear Buffer
    const handleClear = useCallback(() => {
        if (!activeSessionId) return;
        setSessions(prev => prev.map(s => {
            if (s.id === activeSessionId) {
                return { ...s, output: [] };
            }
            return s;
        }));
    }, [activeSessionId]);

    // Format active uptime clock
    const uptimeStr = useMemo(() => {
        if (!activeSession) return '00:00:00';
        const elapsed = Math.floor((Date.now() - activeSession.spawnTime) / 1000);
        const hrs = Math.floor(elapsed / 3600).toString().padStart(2, '0');
        const mins = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        return `${hrs}:${mins}:${secs}`;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticks, activeSession]);

    return (
        <div
            ref={containerRef}
            className={cn(
                "flex flex-col h-full bg-background overflow-hidden select-none",
                className
            )}>
            
            {/* Header Tabs Navigation Bar - Low Profile Segmented Pill Design */}
            <div className="h-10 flex items-center justify-between px-4 bg-background border-b border-border shrink-0 select-none">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
                    <span className="text-[9px] font-black tracking-widest text-muted-foreground/60 uppercase mr-1 select-none">
                        PTY SESSIONS:
                    </span>
                    
                    {/* Segmented Pill Container */}
                    <div className="flex items-center border border-border bg-black/30">
                        {sessions.map((session) => {
                            const isActive = session.id === activeSessionId;
                            return (
                                <button
                                    key={session.id}
                                    onClick={() => setActiveSessionId(session.id)}
                                    className={cn(
                                        "px-3 py-1 text-[9px] font-bold font-mono uppercase tracking-wider transition-all select-none flex items-center gap-1.5 press border-r border-border/70 last:border-r-0",
                                        isActive 
                                            ? "bg-primary/10 text-primary" 
                                            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                                    )}
                                >
                                    <span className={cn(
                                        "h-1.5 w-1.5 shrink-0",
                                        session.connected ? "bg-success" : "bg-warning animate-pulse"
                                    )} />
                                    <span className="truncate max-w-[70px]">{session.name}</span>
                                    
                                    {sessions.length > 1 && (
                                        <X
                                            size={8}
                                            onClick={(e) => closeSession(session.id, e)}
                                            className="text-muted-foreground/60 hover:text-foreground ml-0.5 shrink-0 transition-colors"
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Spawn Tab Plus button */}
                    <button
                        onClick={() => requestSpawn()}
                        className="p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-all ml-1 press"
                        title="Spawn new shell session"
                    >
                        <Plus size={11} />
                    </button>
                </div>

                {/* Right Header Side Controls */}
                <div className="flex items-center gap-3 font-mono">
                    <span className="text-[8px] text-muted-foreground/60 uppercase tracking-widest hidden sm:inline select-none">
                        UPTIME: {uptimeStr}
                    </span>
                    <button
                        onClick={() => setShowDrawer(!showDrawer)}
                        className={cn(
                            "p-1 text-muted-foreground hover:text-foreground transition-all border press",
                            showDrawer ? "bg-muted border-border text-primary" : "border-transparent hover:bg-muted/60"
                        )}
                        title="Tuning & Telemetry Drawer"
                    >
                        <Sliders size={12} />
                    </button>
                </div>
            </div>

            {/* Main Section layout: Terminal Log on Left, Drawer on Right */}
            <div className="flex-grow flex overflow-hidden w-full relative">
                
                {/* Left Side: Active Terminal Container */}
                <div className="flex-1 flex flex-col h-full bg-background/40 relative overflow-hidden">
                    
                    {/* Subtle Sci-Fi Mesh Glow Overlay */}
                    <div 
                        className="absolute inset-0 pointer-events-none opacity-[0.01]"
                        style={{
                            backgroundImage: 'radial-gradient(circle at 50% 50%, var(--color-primary) 0%, transparent 80%)',
                        }}
                    />

                    {/* Hidden Measuring span to scale character cols/rows properly */}
                    <span
                        ref={measureRef}
                        className="absolute invisible pointer-events-none font-mono text-[11px] leading-relaxed"
                        aria-hidden="true"
                    >
                        0123456789
                    </span>

                    {/* Output Scroll area */}
                    <div
                        ref={outputRef}
                        className="flex-1 p-4 overflow-y-auto scrollbar-thin relative"
                    >
                        {activeSession ? (
                            <div className={cn(
                                "font-mono text-[11px] leading-relaxed space-y-0.5",
                                wordWrap ? "break-all whitespace-pre-wrap" : "whitespace-pre overflow-x-auto"
                            )}>
                                {activeSession.output.map((line, idx) => (
                                    <div key={idx} className="transition-all hover:bg-muted/10 px-1.5 py-[1px]">
                                        {renderFormattedTerminalLine(line)}
                                    </div>
                                ))}
                                {activeSession.connected && (
                                    <div className="flex items-center gap-1.5 text-primary/45 px-1 pt-1.5 text-[9.5px] tracking-widest select-none uppercase">
                                        <CircleDot size={6} className="animate-pulse text-success" />
                                        <span>terminal session ready</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
                                <Terminal size={14} className="animate-pulse" />
                                <span className="text-xs font-medium text-foreground">No active terminal session</span>
                                <span className="max-w-xs text-xs leading-relaxed">Start a shell only when you need it. Zen will ask for explicit approval before opening the process.</span>
                                {spawnError && <span className="max-w-sm text-xs text-destructive">{spawnError}</span>}
                                {!pendingSpawnName ? (
                                    <button type="button" onClick={() => requestSpawn('Shell 1')} className="border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/15">Open terminal</button>
                                ) : (
                                    <div className="max-w-sm border border-amber-400/25 bg-amber-400/10 p-3 text-left">
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Approve interactive shell</div>
                                        <div className="mt-1 text-xs text-zinc-300">This opens a terminal in the active workspace with your user permissions.</div>
                                        <div className="mt-3 flex gap-2">
                                            <button type="button" onClick={() => spawnNewSession(pendingSpawnName)} className="border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">Approve</button>
                                            <button type="button" onClick={() => setPendingSpawnName(null)} className="border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Floating word wrap / scroll status alerts */}
                    {(scrollLock || !wordWrap) && (
                        <div className="absolute right-4 bottom-14 flex items-center gap-2 select-none">
                            {scrollLock && (
                                <span className="px-1.5 py-0.5 bg-warning/10 border border-warning/20 text-warning text-[8px] font-mono uppercase tracking-widest">
                                    SCROLL_LOCK
                                </span>
                            )}
                            {!wordWrap && (
                                <span className="px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary text-[8px] font-mono uppercase tracking-widest">
                                    NO_WRAP
                                </span>
                            )}
                        </div>
                    )}

                    {pendingSpawnName && activeSession && (
                        <div className="border-t border-amber-400/20 bg-amber-400/10 px-3 py-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Approve interactive shell</div>
                                    <div className="truncate text-xs text-zinc-300">Open {pendingSpawnName} in the active workspace with your user permissions.</div>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <button type="button" onClick={() => spawnNewSession(pendingSpawnName)} className="border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">Approve</button>
                                    <button type="button" onClick={() => setPendingSpawnName(null)} className="border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Command Input */}
                    <div className="p-3 bg-background border-t border-border shrink-0">
                        <form
                            onSubmit={handleSubmit}
                            className="flex h-10 items-center gap-2.5 border border-border/80 bg-black/40 px-3 transition-all focus-within:border-primary/40 focus-within:bg-black/60 select-none"
                        >
                            {/* Dynamic styled path prompt */}
                            <div className="flex items-center gap-1.5 text-primary font-mono text-[10px] font-bold select-none shrink-0">
                                <span>zen@workspace</span>
                                <span className="text-muted-foreground/60">/</span>
                                <span className="text-primary/80 font-medium">zen</span>
                                <span className="text-primary font-black">$</span>
                            </div>

                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={activeSession?.connected ? "Submit CLI commands here..." : "Shell connecting..."}
                                disabled={!activeSession?.connected}
                                className="flex-1 bg-transparent border-none outline-none text-[10.5px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:ring-0 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
                                autoComplete="off"
                                spellCheck={false}
                            />

                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    type="submit"
                                    disabled={!activeSession?.connected || !input.trim()}
                                    className="p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-all press"
                                    title="Send command"
                                >
                                    <Send size={11} />
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {showDrawer && (
                    <XTermTelemetryDrawer
                        metrics={simulatedMetrics}
                        wordWrap={wordWrap}
                        scrollLock={scrollLock}
                        copiedActive={copiedActive}
                        commandHistory={commandHistory}
                        onWordWrapChange={setWordWrap}
                        onScrollLockChange={setScrollLock}
                        onCopyLogs={handleCopyLogs}
                        onClear={handleClear}
                        onLoadCommand={setInput}
                        onClose={() => setShowDrawer(false)}
                    />
                )}
            </div>

            <XTermStatusFooter
                hasActiveSession={Boolean(activeSession)}
                cols={lastResizeRef.current.cols}
                rows={lastResizeRef.current.rows}
            />
        </div>
    );
}
