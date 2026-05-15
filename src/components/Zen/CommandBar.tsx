import { useCallback } from 'react';
import { useUIStore } from '@/lib/stores/useUIStore';
import { useChatStore } from '@/lib/stores/useChatStore';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { cn } from '@/lib/utils/style';
import { Button } from '@/components/ui/button';
import { PanelLeft, PlusCircle, PanelRight, Settings, Wifi, WifiOff } from 'lucide-react';

export function CommandBar() {
    const toggleSidebar = useUIStore(s => s.toggleSidebar);
    const toggleSettings = useUIStore(s => s.toggleSettings);
    const toggleRightPanel = useUIStore(s => s.toggleRightPanel);
    const activeProvider = useUIStore(s => s.activeProvider);

    const activeModel = useSettingsStore(s => s.activeModel);

    const addSession = useChatStore(s => s.addSession);
    const setActiveSession = useChatStore(s => s.setActiveSession);

    const handleNewSession = useCallback(() => {
        const newSession = {
            id: crypto.randomUUID(),
            title: 'New Session',
            model: activeModel,
            systemPrompt: null,
            folderId: null,
            pinned: false,
            flagged: false,
            archived: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        addSession(newSession);
        setActiveSession(newSession.id);
    }, [activeModel, addSession, setActiveSession]);

    return (
        <header className="h-10 border-b border-white/5 bg-slate-950/80 backdrop-blur-sm flex items-center px-4 gap-4 shrink-0">
            {/* Left: Sidebar toggle + Logo */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleSidebar}
                    title="Toggle Sidebar"
                    className="press w-8 h-8"
                >
                    <PanelLeft size={14} />
                </Button>
                <span className="text-[11px] font-black tracking-[0.3em] text-primary uppercase">ZEN</span>
                <span className="text-[9px] font-mono text-muted-foreground">v0.1.0</span>
            </div>

            {/* Center: Model indicator */}
            <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-2 px-3 py-1 rounded bg-white/5 border border-white/5">
                    <div className="h-1.5 w-1.5 rounded-full bg-[hsl(160_84%_39%)] animate-pulse" />
                    <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                        {activeModel}
                    </span>
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNewSession}
                    title="New Session"
                    className="press h-8 gap-1.5 px-3"
                >
                    <PlusCircle size={12} />
                    <span className="text-[9px] font-black uppercase tracking-wider">NEW</span>
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleRightPanel}
                    title="Toggle Panels"
                    className="press w-8 h-8"
                >
                    <PanelRight size={12} />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleSettings}
                    title="Settings"
                    className="press w-8 h-8"
                >
                    <Settings size={12} />
                </Button>

                {/* Connection status */}
                <div className={cn(
                    "flex items-center gap-1.5 ml-2 px-2 py-1 rounded text-[8px] font-mono uppercase tracking-wider",
                    activeProvider ? "text-[hsl(160_84%_39%)]" : "text-destructive"
                )}>
                    {activeProvider ? <Wifi size={10} /> : <WifiOff size={10} />}
                    <span>{activeProvider ? 'ONLINE' : 'OFFLINE'}</span>
                </div>
            </div>
        </header>
    );
}