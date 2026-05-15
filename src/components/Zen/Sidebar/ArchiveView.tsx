import React from 'react';
import { useChatStore } from '@/lib/stores/useChatStore';
import { Archive, MessageSquare, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/style';

export function ArchiveView() {
    const archivedSessions = useChatStore(s => s.archivedSessions);
    const restoreSession = useChatStore(s => s.restoreSession);
    const deleteSessionPermanent = useChatStore(s => s.deleteSessionPermanent);

    if (archivedSessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 border border-border">
                    <Archive size={18} className="text-muted-foreground opacity-20" />
                </div>
                <h3 className="text-[11px] font-bold text-foreground uppercase tracking-widest mb-1">
                    Archive Empty
                </h3>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                    No decommissioned records found in cold storage.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1 px-2">
            <div className="flex items-center gap-2 px-2 py-2 mb-2">
                <Archive size={12} className="text-primary opacity-60" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    Cold Storage ({archivedSessions.length})
                </span>
            </div>

            {archivedSessions.map((session) => (
                <div
                    key={session.id}
                    className="group flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border/50 hover:border-primary/20 transition-all"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <MessageSquare size={12} className="text-muted-foreground opacity-40" />
                            <span className="text-[11px] font-bold text-foreground truncate max-w-[140px]">
                                {session.title || 'Untitled Session'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => restoreSession(session.id)}
                                title="Restore Session"
                                className="p-1.5 rounded bg-background hover:bg-primary/10 text-muted-foreground hover:text-primary border border-border transition-colors"
                            >
                                <RotateCcw size={10} />
                            </button>
                            <button
                                onClick={() => deleteSessionPermanent(session.id)}
                                title="Delete Permanently"
                                className="p-1.5 rounded bg-background hover:bg-destructive/10 text-muted-foreground hover:text-destructive border border-border transition-colors"
                            >
                                <Trash2 size={10} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-tighter">
                            Archived: {new Date(session.updatedAt).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-1">
                            <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                            <span className="text-[8px] font-mono text-muted-foreground uppercase">Off-line</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
