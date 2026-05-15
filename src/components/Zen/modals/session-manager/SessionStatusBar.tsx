import { useChatStore } from '@/lib/stores/useChatStore';
import { useSessionManagerUIStore } from '@/lib/stores/useSessionManagerUIStore';
import { cn } from '@/lib/utils/style';
import { Cpu, Globe, Database, Signal } from 'lucide-react';

export function SessionStatusBar() {
    const sessions = useChatStore(s => s.sessions);
    const archivedSessions = useChatStore(s => s.archivedSessions);
    const selectedSessionId = useSessionManagerUIStore(s => s.selectedSessionId);

    return (
        <footer className="h-9 border-t border-border bg-card flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <Database size={12} className="text-primary opacity-60" />
                    <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Storage:</span>
                    <span className="text-[9px] font-mono font-bold text-foreground">{sessions.length + archivedSessions.length} Nodes</span>
                </div>
                <div className="w-[1px] h-3 bg-border" />
                <div className="flex items-center gap-2">
                    <Signal size={12} className="text-success opacity-60" />
                    <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Protocol:</span>
                    <span className="text-[9px] font-mono font-bold text-foreground">STABLE</span>
                </div>
                {selectedSessionId && (
                    <>
                        <div className="w-[1px] h-3 bg-border" />
                        <div className="flex items-center gap-2">
                            <Cpu size={12} className="text-primary opacity-60" />
                            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Selected:</span>
                            <span className="text-[9px] font-mono font-bold text-primary truncate max-w-[150px]">{selectedSessionId}</span>
                        </div>
                    </>
                )}
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Zone:</span>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted border border-border">
                        <Globe size={10} className="text-muted-foreground" />
                        <span className="text-[8px] font-bold text-foreground">LOCAL_HOST_01</span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-[0_0_8px_var(--color-success)]" />
                    <span className="text-[9px] font-mono text-muted-foreground uppercase">Linked</span>
                </div>
            </div>
        </footer>
    );
}
