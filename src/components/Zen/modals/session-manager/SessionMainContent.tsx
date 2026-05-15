import { useEffect, useState, useMemo, useCallback } from 'react';
import { useChatStore } from '@/lib/stores/useChatStore';
import { useSessionManagerUIStore } from '@/lib/stores/useSessionManagerUIStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/style';
import {
    Database,
    Terminal,
    RotateCcw,
    Archive,
    Trash2,
    RefreshCcw,
    Info
} from 'lucide-react';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface SessionMainContentProps {
    className?: string;
}

export function SessionMainContent({ className = '' }: SessionMainContentProps) {
    const selectedSessionId = useSessionManagerUIStore(s => s.selectedSessionId);
    const setSelectedSessionId = useSessionManagerUIStore(s => s.setSelectedSessionId);
    const selectedCategory = useSessionManagerUIStore(s => s.selectedCategory);
    const sessions = useChatStore(s => s.sessions);
    const archivedSessions = useChatStore(s => s.archivedSessions);
    const deleteSession = useChatStore(s => s.deleteSession);
    const archiveSession = useChatStore(s => s.archiveSession);
    const unarchiveSession = useChatStore(s => s.unarchiveSession);

    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);

    const allSessions = useMemo(() => [...sessions, ...archivedSessions], [sessions, archivedSessions]);
    const selectedSession = useMemo(
        () => allSessions.find(s => s.id === selectedSessionId) || null,
        [allSessions, selectedSessionId]
    );

    useEffect(() => {
        if (selectedSessionId) {
            setLoadingMessages(true);
            setTimeout(() => {
                setMessages([
                    {
                        id: '1',
                        role: 'user',
                        content: 'Show me the system architecture.',
                        timestamp: (selectedSession?.createdAt ?? Date.now()) + 1000,
                    },
                    {
                        id: '2',
                        role: 'assistant',
                        content: 'The system uses a modular architecture with separate layers for UI, state management, and backend communication.',
                        timestamp: (selectedSession?.createdAt ?? Date.now()) + 2000,
                    },
                ]);
                setLoadingMessages(false);
            }, 300);
        } else {
            setMessages([]);
        }
    }, [selectedSessionId, selectedSession?.createdAt]);

    const handleDelete = useCallback(() => {
        if (!selectedSessionId) return;
        deleteSession(selectedSessionId);
        setSelectedSessionId(null);
    }, [selectedSessionId, deleteSession, setSelectedSessionId]);

    const handleArchive = useCallback(() => {
        if (!selectedSessionId) return;
        archiveSession(selectedSessionId);
        setSelectedSessionId(null);
    }, [selectedSessionId, archiveSession, setSelectedSessionId]);

    const handleUnarchive = useCallback(() => {
        if (!selectedSessionId) return;
        unarchiveSession(selectedSessionId);
        setSelectedSessionId(null);
    }, [selectedSessionId, unarchiveSession, setSelectedSessionId]);

    if (!selectedSessionId) {
        return (
            <div className={cn("flex-1 flex flex-col items-center justify-center bg-muted/20 p-12 text-center overflow-hidden relative", className)}>
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(var(--color-primary) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                />
                <div className="relative z-10 space-y-6 max-w-md">
                    <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/20 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(167,139,250,0.05)]">
                        <Database size={32} className="text-primary/40" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-[13px] font-black uppercase tracking-[0.2em] text-foreground">Session Lifecycle Control</h3>
                        <p className="text-[10px] text-muted-foreground leading-relaxed font-medium uppercase tracking-tight">
                            Select a session from the index to manage lifecycle and review logs.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("flex-1 flex flex-col h-full bg-muted/10 overflow-hidden", className)}>
            {/* Header */}
            <header className="h-10 border-b border-border flex items-center justify-between px-6 bg-card flex-shrink-0">
                <div className="flex items-center gap-3">
                    <Terminal size={12} className="text-primary opacity-60" />
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest">LOG_STREAM</span>
                        <span className="text-border font-mono text-[9px]">::</span>
                        <h2 className="text-[10px] font-bold text-foreground uppercase tracking-tight">
                            {selectedSession?.title}
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {selectedCategory === 'ARCHIVED' ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleUnarchive}
                            className="h-7 px-3 gap-1.5 text-success border-success/20 bg-success/5 hover:bg-success/10 text-[9px] font-bold uppercase tracking-widest"
                        >
                            <RotateCcw size={11} />
                            Restore
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleArchive}
                            className="h-7 px-3 gap-1.5 text-warning border-warning/20 bg-warning/5 hover:bg-warning/10 text-[9px] font-bold uppercase tracking-widest"
                        >
                            <Archive size={11} />
                            Archive
                        </Button>
                    )}

                    <div className="w-[1px] h-4 bg-border mx-1" />

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDelete}
                        className="h-7 px-3 gap-1.5 text-destructive border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-[9px] font-bold uppercase tracking-widest"
                    >
                        <Trash2 size={11} />
                        Purge
                    </Button>
                </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
                {loadingMessages ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <RefreshCcw size={28} className="text-primary/40 animate-spin" />
                        <span className="text-[9px] text-muted-foreground font-mono uppercase tracking-[0.3em]">Processing...</span>
                    </div>
                ) : (
                    <div className="max-w-3xl mx-auto space-y-6">
                        {messages.map(msg => (
                            <div
                                key={msg.id}
                                className={cn(
                                    "p-5 rounded-lg border flex flex-col gap-3 transition-all hover:border-border/80",
                                    msg.role === 'user'
                                        ? "bg-muted/30 border-border"
                                        : "bg-primary/[0.02] border-primary/10"
                                )}
                            >
                                <div className="flex items-center justify-between opacity-50">
                                    <div className="flex items-center gap-2">
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full",
                                            msg.role === 'user' ? "bg-muted-foreground" : "bg-primary shadow-[0_0_8px_var(--color-primary-glow)]"
                                        )} />
                                        <span className="text-[8px] font-black uppercase tracking-[0.2em] font-mono text-foreground">
                                            {msg.role}
                                        </span>
                                    </div>
                                    <span className="text-[8px] font-mono tabular-nums text-muted-foreground">
                                        {new Date(msg.timestamp).toLocaleString()}
                                    </span>
                                </div>
                                <div className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
                                    {msg.content}
                                </div>
                            </div>
                        ))}

                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3 opacity-20">
                                <Info size={40} />
                                <p className="text-[9px] uppercase tracking-[0.4em] font-bold">End of stream</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
