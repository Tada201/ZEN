import { useState, useCallback } from 'react';
import { useChatStore } from '@/lib/stores/useChatStore';
import {
    MessageSquare,
    Folder,
    Library,
    Archive,
    FileText,
    Search,
    PlusCircle,
    Cpu
} from 'lucide-react';
import { FolderTree } from './Sidebar/FolderTree';
import { ArchiveView } from './Sidebar/ArchiveView';
import { SearchModal } from './Sidebar/SearchModal';
import { TemplatesView } from './Sidebar/TemplatesView';
import { KnowledgeView } from './Sidebar/KnowledgeView';
import { cn } from '@/lib/utils/style';

type SidebarTab = 'sessions' | 'folders' | 'knowledge' | 'archive' | 'templates';

const TAB_CONFIG: Record<SidebarTab, { icon: any; label: string }> = {
    sessions: { icon: MessageSquare, label: 'Sessions' },
    folders: { icon: Folder, label: 'Folders' },
    knowledge: { icon: Library, label: 'Knowledge' },
    archive: { icon: Archive, label: 'Archive' },
    templates: { icon: FileText, label: 'Templates' },
};

export function Sidebar() {
    const [activeTab, setActiveTab] = useState<SidebarTab>('sessions');
    const [searchTerm, setSearchTerm] = useState('');
    const sessions = useChatStore(s => s.sessions);
    const folders = useChatStore(s => s.folders);
    const activeSessionId = useChatStore(s => s.activeSessionId);
    const setActiveSession = useChatStore(s => s.setActiveSession);
    const deleteSession = useChatStore(s => s.deleteSession);
    const pinSession = useChatStore(s => s.pinSession);
    const addSession = useChatStore(s => s.addSession);
    const toggleSearch = useChatStore(s => s.toggleSearch);

    const handleNewSession = useCallback(() => {
        const now = Date.now();
        addSession({
            id: String(now),
            title: 'New Chat',
            model: '',
            systemPrompt: '',
            createdAt: now,
            updatedAt: now
        });
    }, [addSession]);

    const renderContent = () => {
        switch (activeTab) {
            case 'sessions':
            case 'folders':
                return (
                    <FolderTree
                        sessions={sessions}
                        folders={folders}
                        activeSessionId={activeSessionId}
                        collapsed={false}
                        searchTerm={searchTerm}
                        onSelectSession={setActiveSession}
                        onTogglePin={pinSession}
                        onDeleteChat={deleteSession}
                    />
                );
            case 'knowledge':
                return <KnowledgeView />;
            case 'archive':
                return <ArchiveView />;
            case 'templates':
                return <TemplatesView />;
        }
    };

    return (
        <div className="flex flex-col h-full w-[var(--sidebar-expanded-width)] bg-background border-r border-border select-none">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                    Navigator
                </h2>
                <div className="flex items-center gap-1">
                    <button
                        onClick={toggleSearch}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                        <Search size={14} className="text-muted-foreground" />
                    </button>
                    <button
                        onClick={handleNewSession}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                        <PlusCircle size={14} className="text-primary" />
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="px-3 py-2">
                <div className="relative group">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground opacity-50" />
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search sessions..."
                        className="w-full bg-muted/50 border border-border rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/10 transition-colors"
                    />
                </div>
            </div>

            {/* Tab Bar */}
            <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border">
                {(Object.keys(TAB_CONFIG) as SidebarTab[]).map((tab) => {
                    const Icon = TAB_CONFIG[tab].icon;
                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all',
                                activeTab === tab
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                            )}
                        >
                            <Icon size={10} />
                            <span>{TAB_CONFIG[tab].label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto py-2">
                {renderContent()}
            </div>

            {/* Footer Status */}
            <div className="px-4 py-3 border-t border-border">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Cpu size={12} className="text-primary" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[11px] font-medium leading-none text-foreground">Local Station</span>
                        <span className="text-[9px] text-muted-foreground mt-0.5 font-mono uppercase tracking-wider">Node: VN-HCMC-01</span>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse shadow-[0_0_8px_var(--color-success)]" />
                        <span className="text-[9px] font-mono text-muted-foreground">Online</span>
                    </div>
                </div>
            </div>

            {/* Search Modal */}
            <SearchModal />
        </div>
    );
}
