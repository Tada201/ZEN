import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
    Terminal, Trash2, CircleDot, Send, History, Cpu, HardDrive, 
    ArrowDownUp, X, Plus, Copy, Check, Sliders
} from 'lucide-react';
import { cn } from '@/lib/utils/style';
import { terminalApi } from '@/api';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';

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
        try {
            const cols = lastResizeRef.current.cols || DEFAULT_COLS;
            const rows = lastResizeRef.current.rows || DEFAULT_ROWS;
            
            const id = await terminalApi.spawn(cols, rows, null);

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
            const unlisten = await listen<string>(`terminal-stdout-${id}`, (event) => {
                setSessions(prev => prev.map(s => {
                    if (s.id === id) {
                        return { ...s, output: [...s.output, event.payload] };
                    }
                    return s;
                }));
            });

            listenersMapRef.current[id] = unlisten;
        } catch (err: any) {
            const msg = typeof err === 'string' ? err : err?.message || 'Unknown error';
            console.error("Failed to spawn session:", msg);
        }
    }, [sessions.length]);

    // Initial session setup
    useEffect(() => {
        if (sessions.length === 0) {
            spawnNewSession('Shell 1');
        }

        return () => {
            // Clean up all active listeners
            Object.keys(listenersMapRef.current).forEach(id => {
                listenersMapRef.current[id]();
                terminalApi.kill(id).catch(() => {});
            });
            listenersMapRef.current = {};
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Format individual log lines with tactical syntax coloring
    const renderFormattedLine = (line: string) => {
        if (line.startsWith('[SYSTEM]')) {
            return (
                <span className="text-primary font-mono tracking-wider font-semibold">
                    {line}
                </span>
            );
        }
        if (line.startsWith('[ERROR]')) {
            return (
                <span className="text-destructive font-mono font-semibold">
                    {line}
                </span>
            );
        }
        if (line.startsWith('$ ')) {
            const cmd = line.slice(2);
            return (
                <span className="font-mono">
                    <span className="text-primary/70 font-semibold">$</span>{' '}
                    <span className="text-foreground font-bold">{cmd}</span>
                </span>
            );
        }

        // Tokenize and colorize common developer terms
        const words = line.split(/(\s+)/);
        return words.map((word, idx) => {
            const lword = word.toLowerCase();
            if (lword.includes('success') || lword.includes('succeeded') || lword.includes('stable')) {
                return <span key={idx} className="text-success font-bold">{word}</span>;
            }
            if (lword.includes('fail') || lword.includes('failed') || lword.includes('error')) {
                return <span key={idx} className="text-destructive font-bold">{word}</span>;
            }
            if (lword.includes('warn') || lword.includes('warning') || lword.includes('alert')) {
                return <span key={idx} className="text-warning font-semibold">{word}</span>;
            }
            if (lword.includes('info') || lword.includes('debug')) {
                return <span key={idx} className="text-muted-foreground/80">{word}</span>;
            }
            if (lword.startsWith('http://') || lword.startsWith('https://')) {
                return <span key={idx} className="text-primary underline cursor-pointer hover:opacity-85">{word}</span>;
            }
            return <span key={idx} className="text-foreground/80">{word}</span>;
        });
    };

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
                    <div className="flex items-center bg-muted/40 p-0.5 rounded-full border border-border">
                        {sessions.map((session) => {
                            const isActive = session.id === activeSessionId;
                            return (
                                <button
                                    key={session.id}
                                    onClick={() => setActiveSessionId(session.id)}
                                    className={cn(
                                        "px-3 py-1 text-[9px] font-bold font-mono uppercase tracking-wider rounded-full transition-all select-none flex items-center gap-1.5 press",
                                        isActive 
                                            ? "bg-background text-primary border border-border shadow-sm" 
                                            : "text-muted-foreground hover:text-foreground border border-transparent"
                                    )}
                                >
                                    <span className={cn(
                                        "w-1 h-1 rounded-full shrink-0",
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
                        onClick={() => spawnNewSession()}
                        className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/60 transition-all ml-1 press"
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
                            "p-1 rounded-full text-muted-foreground hover:text-foreground transition-all border press",
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
                                    <div key={idx} className="transition-all hover:bg-muted/10 px-1.5 py-[1px] rounded">
                                        {renderFormattedLine(line)}
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
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground font-mono text-[9px] gap-2 select-none uppercase tracking-widest">
                                <Terminal size={14} className="animate-pulse" />
                                <span>No active session</span>
                            </div>
                        )}
                    </div>

                    {/* Floating word wrap / scroll status alerts */}
                    {(scrollLock || !wordWrap) && (
                        <div className="absolute right-4 bottom-14 flex items-center gap-2 select-none">
                            {scrollLock && (
                                <span className="px-1.5 py-0.5 rounded bg-warning/10 border border-warning/20 text-warning text-[8px] font-mono uppercase tracking-widest">
                                    SCROLL_LOCK
                                </span>
                            )}
                            {!wordWrap && (
                                <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary text-[8px] font-mono uppercase tracking-widest">
                                    NO_WRAP
                                </span>
                            )}
                        </div>
                    )}

                    {/* Rounded Capsule Input Field */}
                    <div className="p-3 bg-background border-t border-border shrink-0">
                        <form
                            onSubmit={handleSubmit}
                            className="flex items-center gap-2.5 px-4 h-9.5 bg-muted/20 border border-border/80 rounded-full focus-within:border-primary/30 focus-within:bg-muted/30 focus-within:ring-4 focus-within:ring-primary/5 transition-all select-none"
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
                                    className="p-1.5 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-all press"
                                    title="Send command"
                                >
                                    <Send size={11} />
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Right Side: Collapsible Tuning & Telemetry Control Drawer */}
                {showDrawer && (
                    <div className="w-56 shrink-0 h-full border-l border-border bg-card/95 backdrop-blur-md flex flex-col overflow-y-auto select-none scrollbar-none z-10">
                        {/* Drawer Header */}
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/20">
                            <div className="flex items-center gap-1.5">
                                <Sliders size={11} className="text-primary" />
                                <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">TELEMETRY & CTRL</span>
                            </div>
                            <button 
                                onClick={() => setShowDrawer(false)}
                                className="text-muted-foreground/60 hover:text-foreground p-0.5 rounded-full hover:bg-muted transition-all"
                            >
                                <X size={11} />
                            </button>
                        </div>

                        {/* Telemetry & Metrics block */}
                        <div className="p-4 space-y-4 border-b border-border">
                            <span className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest block select-none">SYSTEM TELEMETRY</span>
                            
                            {/* CPU Load Indicator */}
                            <div className="space-y-2 select-none">
                                <div className="flex justify-between text-[8px] font-mono text-muted-foreground/80">
                                     <span className="flex items-center gap-1"><Cpu size={9} /> CPU LOAD</span>
                                    <span className="text-primary font-bold">{simulatedMetrics.cpu}%</span>
                                </div>
                                <Progress value={simulatedMetrics.cpu} className="h-1.5 bg-muted" />
                            </div>

                            {/* MEM footprint Indicator */}
                            <div className="space-y-2 select-none">
                                <div className="flex justify-between text-[8px] font-mono text-muted-foreground/80">
                                    <span className="flex items-center gap-1"><HardDrive size={9} /> SHELL MEM</span>
                                    <span className="text-primary font-bold">{simulatedMetrics.mem} MB</span>
                                </div>
                                <Progress value={(simulatedMetrics.mem / 256) * 100} className="h-1.5 bg-muted" />
                            </div>

                            {/* Network Speed Indicators */}
                            <div className="flex items-center justify-between text-[8px] font-mono text-muted-foreground/80 select-none">
                                <span className="flex items-center gap-1"><ArrowDownUp size={9} /> SPEED NET</span>
                                <span className="text-muted-foreground/60">
                                    RX <strong className="text-success font-semibold">{simulatedMetrics.rx} KB/s</strong> | TX <strong className="text-primary font-semibold">{simulatedMetrics.tx} KB/s</strong>
                                </span>
                            </div>
                        </div>

                        {/* Interactive Console Controls */}
                        <div className="p-4 space-y-3.5 border-b border-border select-none">
                            <span className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest block">CONSOLE ACTIONS</span>
                            
                            {/* Word Wrap Toggle */}
                            <div className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-muted/20 border border-border text-[9px] font-mono text-muted-foreground transition-all">
                                <span>Word Wrap Logs</span>
                                <Switch checked={wordWrap} onCheckedChange={setWordWrap} />
                            </div>

                            {/* Scroll Lock Toggle */}
                            <div className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-muted/20 border border-border text-[9px] font-mono text-muted-foreground transition-all">
                                <span>Scroll Lock Alert</span>
                                <Switch checked={scrollLock} onCheckedChange={setScrollLock} />
                            </div>

                            {/* Copy All Logs Button */}
                            <button
                                onClick={handleCopyLogs}
                                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-full bg-muted/30 hover:bg-muted/60 border border-border text-[9px] font-mono text-muted-foreground hover:text-foreground transition-all press"
                            >
                                <span>Export Log History</span>
                                {copiedActive ? (
                                    <Check size={11} className="text-success" />
                                ) : (
                                    <Copy size={11} className="text-muted-foreground/60" />
                                )}
                            </button>

                            {/* Clear Log Buffer */}
                            <button
                                onClick={handleClear}
                                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-full bg-muted/30 hover:bg-destructive/5 hover:border-destructive/20 border border-border text-[9px] font-mono text-muted-foreground hover:text-destructive transition-all press"
                            >
                                <span>Clear Screen Buffer</span>
                                <Trash2 size={11} className="text-muted-foreground/60 group-hover:text-destructive" />
                            </button>
                        </div>

                        {/* Recent Command History */}
                        <div className="p-4 space-y-3 select-none flex-grow bg-card/10">
                            <div className="flex items-center gap-1.5">
                                <History size={11} className="text-muted-foreground/60" />
                                <span className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest block">COMMAND HISTORY</span>
                            </div>
                            
                            <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-none pr-1">
                                {commandHistory.length > 0 ? (
                                    commandHistory.map((cmd, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setInput(cmd)}
                                            className="w-full text-left truncate px-3.5 py-2 rounded-full bg-muted/20 hover:bg-primary/10 hover:border-primary/30 border border-border text-[9.5px] font-mono text-muted-foreground hover:text-primary transition-all select-none press"
                                            title="Click to load command"
                                        >
                                            {cmd}
                                        </button>
                                    ))
                                ) : (
                                    <div className="text-[8px] font-mono text-muted-foreground/40 italic select-none text-center py-4">
                                        No recent commands
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Status Telemetry Footer Bar */}
            <div className="h-6 flex items-center justify-between px-4 bg-background border-t border-border shrink-0 select-none">
                <div className="flex items-center gap-3">
                    <span className="text-[7.5px] font-mono text-muted-foreground/50 uppercase tracking-widest">
                        ENCODE: UTF-8
                    </span>
                    <div className="w-[1px] h-2.5 bg-border" />
                    <span className="text-[7.5px] font-mono text-muted-foreground/50 uppercase tracking-widest">
                        BAUD: 115200 BD
                    </span>
                    {activeSession && (
                        <>
                            <div className="w-[1px] h-2.5 bg-border" />
                            <span className="text-[7.5px] font-mono text-muted-foreground/75 uppercase tracking-widest">
                                GRID: {lastResizeRef.current.cols}x{lastResizeRef.current.rows}
                            </span>
                        </>
                    )}
                </div>
                <span className="text-[7.5px] font-mono text-muted-foreground/50 uppercase tracking-widest">
                    SHELL CORE v1.2-TAURI
                </span>
            </div>
        </div>
    );
}
