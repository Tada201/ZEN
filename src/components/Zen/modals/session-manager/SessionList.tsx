import { memo } from 'react';
import { useChatStore } from '@/lib/stores/useChatStore';
import { useSessionManagerUIStore } from '@/lib/stores/useSessionManagerUIStore';
import { cn } from '@/lib/utils/style';
import { MessageSquare, Pin, Archive, Trash2, Filter } from 'lucide-react';
import { SESSION_CATEGORIES } from './types';

interface SessionListProps {
    className?: string;
}

export const SessionList = memo(function SessionList({ className }: SessionListProps) {
    const sessions = useChatStore(s => s.sessions);
    const archivedSessions = useChatStore(s => s.archivedSessions);
    const selectedCategory = useSessionManagerUIStore(s => s.selectedCategory);
    const selectedSessionId = useSessionManagerUIStore(s => s.selectedSessionId);
    const setSelectedSessionId = useSessionManagerUIStore(s => s.setSelectedSessionId);
    const searchQuery = useSessionManagerUIStore(s => s.searchQuery);

    const categoryConfig = SESSION_CATEGORIES.find(c => c.id === selectedCategory);

    const allVisible = selectedCategory === 'ARCHIVED' ? archivedSessions : sessions;

    const filtered = allVisible.filter(s => {
        const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        switch (selectedCategory) {
            case 'PINNED': return s.isPinned;
            case 'ACTIVE': return !s.isPinned;
            default: return true;
        }
    });

    return (
        <aside className={cn('flex flex-col bg-card/50 overflow-hidden', className)}>
            {/* List Header */}
            <div className="h-10 flex items-center justify-between px-6 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                    {categoryConfig && <categoryConfig.icon size={12} className="text-primary opacity-60" />}
                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground">
                        {categoryConfig?.label || 'Sessions'}
                    </span>
                </div>
                <button className="text-muted-foreground hover:text-foreground">
                    <Filter size={12} />
                </button>
            </div>

            {/* Scroll Area */}
            <div className="flex-1 overflow-y-auto py-2">
                {filtered.length > 0 ? (
                    <div className="flex flex-col px-2 gap-0.5">
                        {filtered.map((session) => (
                            <div
                                key={session.id}
                                onClick={() => setSelectedSessionId(session.id)}
                                className={cn(
                                    "group flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all",
                                    selectedSessionId === session.id
                                        ? "bg-primary/10 border border-primary/20 shadow-[0_0_10px_rgba(167,139,250,0.05)]"
                                        : "hover:bg-muted/50 border border-transparent"
                                )}
                            >
                                <div className={cn(
                                    "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                    selectedSessionId === session.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
                                )}>
                                    <MessageSquare size={14} />
                                </div>

                                <div className="flex-1 flex flex-col min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={cn(
                                            "text-[11px] font-bold truncate",
                                            selectedSessionId === session.id ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                                        )}>
                                            {session.title || 'Untitled Session'}
                                        </span>
                                        {session.isPinned && <Pin size={8} className="text-primary" />}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[8px] font-mono text-muted-foreground/60 uppercase tracking-tighter">
                                            {new Date(session.updatedAt).toLocaleDateString()}
                                        </span>
                                        <span className="text-[8px] text-muted-foreground/30">•</span>
                                        <span className="text-[8px] font-mono text-muted-foreground/60 uppercase">
                                            {session.model || 'ENGINE_01'}
                                        </span>
                                    </div>
                                </div>

                                {/* Hover Actions */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors">
                                        <Archive size={10} />
                                    </button>
                                    <button className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 px-8 text-center opacity-40">
                        <MessageSquare size={24} className="mb-4 text-muted-foreground" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Empty Records</span>
                    </div>
                )}
            </div>
        </aside>
    );
});
