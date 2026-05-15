import React, { useState, useEffect, useCallback } from 'react';
import { useChatStore } from '@/lib/stores/useChatStore';
import { Search, MessageSquare, PlusCircle, FileText, X, Command } from 'lucide-react';
import { cn } from '@/lib/utils/style';

export function SearchModal() {
    const isSearchOpen = useChatStore(s => s.isSearchOpen);
    const toggleSearch = useChatStore(s => s.toggleSearch);
    const sessions = useChatStore(s => s.sessions);
    const setActiveSession = useChatStore(s => s.setActiveSession);

    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filtered = query.trim() === ''
        ? []
        : sessions.filter(s => s.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

    const handleClose = useCallback(() => {
        setQuery('');
        toggleSearch();
    }, [toggleSearch]);

    const handleSelect = (id: string) => {
        setActiveSession(id);
        handleClose();
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                toggleSearch();
            }
            if (isSearchOpen) {
                if (e.key === 'Escape') handleClose();
                if (e.key === 'ArrowDown') setSelectedIndex(s => Math.min(s + 1, filtered.length - 1));
                if (e.key === 'ArrowUp') setSelectedIndex(s => Math.max(s - 1, 0));
                if (e.key === 'Enter' && filtered[selectedIndex]) handleSelect(filtered[selectedIndex].id);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSearchOpen, toggleSearch, handleClose, filtered, selectedIndex]);

    if (!isSearchOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] px-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-[560px] bg-popover border border-border rounded-xl shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5),0_0_0_1px_var(--color-border)] overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
                    <Search size={18} className="text-muted-foreground opacity-40" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                        placeholder="Search sessions, commands, or documentation..."
                        className="flex-1 bg-transparent border-none outline-none text-[13px] text-foreground placeholder:text-muted-foreground/40"
                    />
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted border border-border">
                        <span className="text-[10px] font-bold text-muted-foreground">ESC</span>
                    </div>
                </div>

                {/* Results */}
                <div className="max-h-[380px] overflow-y-auto p-2">
                    {query.trim() === '' ? (
                        <div className="py-8 flex flex-col items-center gap-3 text-center">
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                <Command size={16} className="text-muted-foreground opacity-30" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Global Search</span>
                                <p className="text-[10px] text-muted-foreground/40 leading-relaxed px-12">
                                    Type to search across neural links, archived records, and system templates.
                                </p>
                            </div>
                        </div>
                    ) : filtered.length > 0 ? (
                        <div className="flex flex-col gap-1">
                            {filtered.map((session, i) => (
                                <div
                                    key={session.id}
                                    onClick={() => handleSelect(session.id)}
                                    onMouseEnter={() => setSelectedIndex(i)}
                                    className={cn(
                                        'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all',
                                        selectedIndex === i ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <MessageSquare size={14} className={selectedIndex === i ? 'text-primary' : 'opacity-40'} />
                                    <div className="flex flex-col flex-1 overflow-hidden">
                                        <span className="text-[12px] font-bold truncate">{session.title}</span>
                                        <span className="text-[9px] font-mono opacity-60 uppercase tracking-tighter">
                                            Session ID: {session.id} • {new Date(session.updatedAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {selectedIndex === i && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary/20">
                                            <span className="text-[9px] font-bold uppercase tracking-widest">Select</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 flex flex-col items-center gap-2 text-center">
                            <X size={20} className="text-destructive opacity-20" />
                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">No Matches Found</span>
                        </div>
                    )}
                </div>

                {/* Footer Tips */}
                <div className="px-4 py-3 bg-muted/30 border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-muted border border-border shadow-sm">
                                <PlusCircle size={8} className="text-muted-foreground" />
                            </div>
                            <span className="text-[9px] text-muted-foreground font-medium">New Session</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-muted border border-border shadow-sm">
                                <FileText size={8} className="text-muted-foreground" />
                            </div>
                            <span className="text-[9px] text-muted-foreground font-medium">Templates</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-[9px] text-muted-foreground/40 font-mono italic">ZEN SEARCH v1.0</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
