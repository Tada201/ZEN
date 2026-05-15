import React, { useState } from 'react';
import {
    MessageSquare,
    Pin,
    Bookmark,
    Archive,
    Trash2,
    Folder as FolderIcon,
    FolderOpen,
    ChevronUp,
    ChevronDown,
    Plus
} from 'lucide-react';
import { cn } from '@/lib/utils/style';
import { Session, ChatFolder } from '@/lib/types/chat';

interface FolderTreeProps {
    sessions: Session[];
    folders: ChatFolder[];
    activeSessionId: string | null;
    collapsed: boolean;
    searchTerm: string;
    onSelectSession: (id: string) => void;
    onTogglePin: (id: string) => void;
    onDeleteChat: (id: string) => void;
}

export function FolderTree({
    sessions,
    folders,
    activeSessionId,
    collapsed,
    searchTerm,
    onSelectSession,
    onTogglePin,
    onDeleteChat
}: FolderTreeProps) {
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));

    const toggleFolder = (id: string) => {
        const next = new Set(expandedFolders);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedFolders(next);
    };

    const filteredSessions = sessions.filter(s =>
        s.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const pinnedSessions = filteredSessions.filter(s => s.isPinned);
    const unpinnedSessions = filteredSessions.filter(s => !s.isPinned);

    const renderSession = (session: Session) => (
        <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={cn(
                'group flex items-center gap-2 px-3 py-1.5 mx-2 rounded-md cursor-pointer transition-all',
                activeSessionId === session.id
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
        >
            <MessageSquare size={12} className={cn(
                'shrink-0',
                activeSessionId === session.id ? 'text-primary' : 'opacity-40'
            )} />

            <span className="flex-1 text-[11px] font-medium truncate">
                {session.title || 'Untitled Session'}
            </span>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.stopPropagation(); onTogglePin(session.id); }}
                    className={cn(
                        'p-1 rounded hover:bg-primary/20 transition-colors',
                        session.isPinned ? 'text-primary' : 'text-muted-foreground'
                    )}
                >
                    <Pin size={10} className={session.isPinned ? 'fill-current' : ''} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDeleteChat(session.id); }}
                    className="p-1 rounded hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors"
                >
                    <Trash2 size={10} />
                </button>
            </div>
        </div>
    );

    if (collapsed) {
        return (
            <div className="flex flex-col items-center gap-4 py-4">
                <Bookmark size={14} className="text-muted-foreground opacity-40" />
                <Archive size={14} className="text-muted-foreground opacity-40" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Pinned Section */}
            {pinnedSessions.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 px-4 mb-1">
                        <Pin size={10} className="text-primary opacity-60" />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Pinned</span>
                    </div>
                    {pinnedSessions.map(renderSession)}
                </div>
            )}

            {/* Recent Section */}
            <div className="flex flex-col gap-1">
                <div
                    onClick={() => toggleFolder('root')}
                    className="flex items-center justify-between px-4 py-1 cursor-pointer hover:bg-muted/50 group"
                >
                    <div className="flex items-center gap-2">
                        {expandedFolders.has('root') ? (
                            <FolderOpen size={10} className="text-primary opacity-60" />
                        ) : (
                            <FolderIcon size={10} className="text-primary opacity-60" />
                        )}
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Recent</span>
                    </div>
                    {expandedFolders.has('root') ? (
                        <ChevronUp size={10} className="text-muted-foreground opacity-0 group-hover:opacity-60" />
                    ) : (
                        <ChevronDown size={10} className="text-muted-foreground opacity-0 group-hover:opacity-60" />
                    )}
                </div>

                {expandedFolders.has('root') && (
                    <div className="flex flex-col gap-0.5 mt-1">
                        {unpinnedSessions.length > 0 ? (
                            unpinnedSessions.map(renderSession)
                        ) : (
                            <div className="px-8 py-2 text-[10px] text-muted-foreground/40 italic">
                                No sessions found
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Archive Prompt (if empty) */}
            {sessions.length === 0 && !searchTerm && (
                <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <Plus size={16} className="text-muted-foreground opacity-40" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-foreground">Zero State</span>
                        <p className="text-[10px] text-muted-foreground leading-relaxed px-4">
                            Initialize a new neural link to begin processing.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
