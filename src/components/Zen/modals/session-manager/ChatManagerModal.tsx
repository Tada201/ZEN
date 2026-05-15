import { useSessionManagerUIStore } from '@/lib/stores/useSessionManagerUIStore';
import { useUIStore } from '@/lib/stores/useUIStore';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Settings } from 'lucide-react';
import { SessionActivityBar } from './SessionActivityBar';
import { SessionList } from './SessionList';
import { SessionMainContent } from './SessionMainContent';
import { SessionInspector } from './SessionInspector';
import { SessionStatusBar } from './SessionStatusBar';

export function ChatManagerModal() {
    const chatManagerOpen = useUIStore(s => s.chatManagerOpen);
    const toggleChatManager = useUIStore(s => s.toggleChatManager);
    const searchQuery = useSessionManagerUIStore(s => s.searchQuery);
    const setSearchQuery = useSessionManagerUIStore(s => s.setSearchQuery);

    return (
        <Dialog.Root open={chatManagerOpen} onOpenChange={toggleChatManager}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] h-[90vh] max-w-7xl bg-background border border-border rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-200">

                    {/* Header */}
                    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card">
                        <div className="flex items-center gap-6 flex-1">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary-glow)]" />
                                <h1 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Session Intelligence Manager</h1>
                            </div>

                            {/* Global Search */}
                            <div className="relative max-w-md w-full">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground opacity-40" />
                                <input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search indexed neural links..."
                                    className="w-full bg-muted border border-border rounded-lg pl-10 pr-4 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/30 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                                <Settings size={18} />
                            </button>
                            <Dialog.Close className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                <X size={18} />
                            </Dialog.Close>
                        </div>
                    </header>

                    {/* Main Workspace */}
                    <div className="flex-1 flex overflow-hidden">
                        <SessionActivityBar />
                        <SessionList className="w-80 border-r border-border" />
                        <SessionMainContent className="flex-1" />
                        <SessionInspector className="w-72 border-l border-border" />
                    </div>

                    <SessionStatusBar />
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
