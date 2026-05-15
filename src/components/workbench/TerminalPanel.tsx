import { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, ShieldCheck, Cpu, Zap, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils/style';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export function TerminalPanel() {
    const [lines, setLines] = useState<string[]>([
        "ZEN TERMINAL v2.0.4 - SECURE SHELL ACTIVE",
        "[SYSTEM] Initializing PTY session...",
    ]);
    const [input, setInput] = useState('');
    const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const setupTerminal = async () => {
            try {
                // 1. Spawn PTY and get session ID
                const sessionId = await invoke<string>('terminal_spawn', { 
                  cols: 120,
                  rows: 40,
                  cwd: null
                });
                
                setActiveTerminalId(sessionId);

                // 2. Listen for stdout using the correct session ID
                unlisten = await listen<string>(`terminal:output:${sessionId}`, (event) => {
                    setLines(prev => [...prev, event.payload]);
                });

                setLines(prev => [...prev, "[SYSTEM] Shell session established."]);
            } catch (err) {
                console.error("Terminal spawn error:", err);
                setLines(prev => [...prev, `[ERROR] Failed to spawn shell: ${err}`]);
            }
        };

        setupTerminal();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [lines]);

    const handleCommand = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !activeTerminalId) return;

        try {
            await invoke('terminal_write', { id: activeTerminalId, data: input + '\n' });
            setInput('');
        } catch (err) {
            console.error("Write error:", err);
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-black overflow-hidden font-mono text-xs">
            {/* Terminal Header */}
            <header className="h-10 bg-slate-900/80 border-b border-white/10 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-emerald-500">
                        <TerminalIcon size={14} />
                        <span className="font-bold tracking-widest text-[10px] uppercase">Nexus Shell</span>
                    </div>
                    <div className="flex items-center gap-4 opacity-40">
                        <div className="flex items-center gap-1.5">
                            <ShieldCheck size={10} />
                            <span className="text-[9px]">ENCRYPTED</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Cpu size={10} />
                            <span className="text-[9px]">PTY-01</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 opacity-40">
                    <Zap size={10} className="text-yellow-500" />
                    <span className="text-[9px]">Latency: 12ms</span>
                    <button className="hover:text-white transition-colors">
                        <Maximize2 size={12} />
                    </button>
                </div>
            </header>

            {/* Scroll Area */}
            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-1"
            >
                {lines.map((line, i) => (
                    <div key={i} className={cn(
                        "break-all",
                        line.startsWith('>') ? "text-white" : 
                        line.includes('[SYSTEM]') ? "text-blue-400" :
                        line.includes('[AUTH]') ? "text-emerald-400" :
                        "text-slate-500"
                    )}>
                        {line}
                    </div>
                ))}
                
                <form onSubmit={handleCommand} className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold shrink-0">&gt;</span>
                    <input 
                        autoFocus
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="flex-1 bg-transparent border-none outline-none text-white focus:ring-0 p-0"
                        spellCheck={false}
                        autoComplete="off"
                    />
                </form>
            </div>

            {/* Terminal Footer */}
            <footer className="h-6 bg-slate-900/40 border-t border-white/5 flex items-center px-4 shrink-0 gap-6 opacity-30">
                <span className="text-[9px]">UTF-8</span>
                <span className="text-[9px]">ZSH</span>
                <span className="text-[9px]">COLUMNS: 120</span>
                <span className="text-[9px]">ROWS: 40</span>
            </footer>
        </div>
    );
}
