import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '@/lib/stores/useUIStore';
import { useChatStore } from '@/lib/stores/useChatStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command';

interface Session {
    id: string;
    title: string;
    model?: string;
    systemPrompt?: string;
    createdAt: number | string;
    updatedAt: number | string;
}

interface PaletteItem {
    id: string;
    type: 'command' | 'skill' | 'setting' | 'action' | 'session';
    name: string;
    description: string;
    shortcut?: string;
    session?: Session;
    tabId?: string;
    rowId?: string;
}

const SETTINGS_ITEMS: PaletteItem[] = [
    { id: 'settings-general', type: 'setting', name: 'General', description: 'App startup and behavior settings', tabId: 'general' },
    { id: 'settings-appearance', type: 'setting', name: 'Appearance', description: 'Theme, visual effects, and glassmorphism', tabId: 'appearance' },
    { id: 'settings-chat', type: 'setting', name: 'Chat', description: 'System prompt, temperature, and streaming', tabId: 'chat' },
    { id: 'settings-audio', type: 'setting', name: 'Audio', description: 'Voice input, synthesis, and feedback', tabId: 'audio' },
    { id: 'settings-providers', type: 'setting', name: 'Providers', description: 'Configure AI model providers', tabId: 'providers' },
    { id: 'settings-models', type: 'setting', name: 'Models', description: 'Default models and routing', tabId: 'models' },
    { id: 'settings-agents', type: 'setting', name: 'Agents', description: 'Orchestrator and agent configs', tabId: 'agents' },
    { id: 'settings-intelligence', type: 'setting', name: 'Intelligence', description: 'RAG, embedding, and search settings', tabId: 'intelligence' },
    { id: 'settings-terminal', type: 'setting', name: 'Terminal', description: 'Shell and execution settings', tabId: 'terminal' },
    { id: 'settings-workspace', type: 'setting', name: 'Workspace', description: 'Working directory and paths', tabId: 'workspace' },
    { id: 'settings-system', type: 'setting', name: 'System', description: 'Hardware and data integration', tabId: 'system' },
    { id: 'settings-gui', type: 'setting', name: 'GUI', description: 'Theme selector and CSS injection', tabId: 'gui' },
];

const BUILT_IN_ITEMS: PaletteItem[] = [
    { id: 'action-new-chat', type: 'action', name: 'New Investigation', description: 'Start a new conversation', shortcut: 'Ctrl+N' },
    { id: 'action-voice', type: 'action', name: 'Voice Mode', description: 'Toggle voice input/output', shortcut: 'Ctrl+Shift+V' },
    { id: 'action-terminal', type: 'action', name: 'Toggle Terminal', description: 'Open/close terminal panel', shortcut: 'Ctrl+`' },
    { id: 'action-map', type: 'action', name: 'Toggle Map', description: 'Open/close operational map', shortcut: 'Ctrl+M' },
    { id: 'action-swarm', type: 'action', name: 'Swarm View', description: 'Open multi-agent swarm orchestrator', shortcut: 'Ctrl+Shift+S' },
];

export function CommandPalette() {
    const { isCommandPaletteOpen, setCommandPaletteOpen, setSettingsOpen, setActiveSettingsTab } = useUIStore();
    const { sessions, setActiveSession, addSession } = useChatStore();
    const [query, setQuery] = useState('');
    const [sessionsList, setSessionsList] = useState<Session[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (sessions && sessions.length > 0) {
            setSessionsList(sessions);
        }
    }, [sessions]);

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCommandPaletteOpen(!isCommandPaletteOpen);
            }
        };
        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, [isCommandPaletteOpen, setCommandPaletteOpen]);

    useEffect(() => {
        if (isCommandPaletteOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery('');
        }
    }, [isCommandPaletteOpen]);

    const handleNewChat = useCallback(async () => {
        setCommandPaletteOpen(false);
        try {
            const chat = await invoke<Session>('create_chat', { title: 'New Session', model: null });
            addSession({ id: chat.id, title: chat.title, model: chat.model ?? '', systemPrompt: chat.systemPrompt ?? '', createdAt: Date.now(), updatedAt: Date.now() });
            setActiveSession(chat.id);
        } catch {
            const now = Date.now();
            const id = `local-${now}`;
            addSession({ id, title: 'New Session', model: '', systemPrompt: '', createdAt: now, updatedAt: now });
            setActiveSession(id);
        }
    }, [setCommandPaletteOpen, addSession, setActiveSession]);

    const handleSetting = useCallback((tabId: string) => {
        setCommandPaletteOpen(false);
        setActiveSettingsTab(tabId);
        setSettingsOpen(true);
    }, [setCommandPaletteOpen, setActiveSettingsTab, setSettingsOpen]);

    const handleSessionSwitch = useCallback((sessionId: string) => {
        setCommandPaletteOpen(false);
        setActiveSession(sessionId);
    }, [setCommandPaletteOpen, setActiveSession]);

    const filteredItems = query.trim()
        ? [...BUILT_IN_ITEMS, ...SETTINGS_ITEMS].filter(item =>
            item.name.toLowerCase().includes(query.toLowerCase()) ||
            item.description.toLowerCase().includes(query.toLowerCase())
        )
        : BUILT_IN_ITEMS;

    const filteredSessions = query.trim()
        ? sessionsList
            .filter(s => (typeof s.title === 'string' ? s.title : 'Untitled').toLowerCase().includes(query.toLowerCase()))
            .slice(0, 10)
            .map(s => ({
                id: `session-${s.id}`,
                type: 'session' as const,
                name: typeof s.title === 'string' ? s.title : 'Untitled',
                description: `Session · ${new Date(s.createdAt || s.updatedAt).toLocaleDateString()}`,
                session: s,
            }))
        : [];

    const handleSelectSession = useCallback((item: PaletteItem) => {
        if (item.session) handleSessionSwitch(item.session.id);
    }, [handleSessionSwitch]);

    const executeItem = useCallback((item: PaletteItem) => {
        if (item.id === 'action-new-chat') handleNewChat();
        else if (item.id === 'action-voice') useUIStore.getState().toggleVoiceMode();
        else if (item.type === 'setting' && item.tabId) handleSetting(item.tabId);
        else if (item.type === 'session') handleSelectSession(item);
    }, [handleNewChat, handleSetting, handleSelectSession]);

    return (
        <CommandDialog open={isCommandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
            <CommandInput
                ref={inputRef}
                placeholder="Search commands, sessions, settings..."
                value={query}
                onValueChange={setQuery}
            />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>

                {filteredSessions.length > 0 && (
                    <>
                        <CommandGroup heading="SESSIONS">
                            {filteredSessions.map(item => (
                                <CommandItem key={item.id} onSelect={() => executeItem(item)}>
                                    <WorkbenchIcon name="lucide:message-square" size={14} className="mr-2" />
                                    <div className="flex flex-col">
                                        <span>{item.name}</span>
                                        <span className="text-[10px] text-zinc-500">{item.description}</span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandSeparator />
                    </>
                )}

                <CommandGroup heading="ACTIONS">
                    {filteredItems.filter(i => i.type === 'action').map(item => (
                        <CommandItem key={item.id} onSelect={() => executeItem(item)}>
                            <WorkbenchIcon name="lucide:zap" size={14} className="mr-2" />
                            <span>{item.name}</span>
                            {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                        </CommandItem>
                    ))}
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup heading="SETTINGS">
                    {filteredItems.filter(i => i.type === 'setting').map(item => (
                        <CommandItem key={item.id} onSelect={() => executeItem(item)}>
                            <WorkbenchIcon name="lucide:settings" size={14} className="mr-2" />
                            <div className="flex flex-col">
                                <span>{item.name}</span>
                                <span className="text-[10px] text-zinc-500">{item.description}</span>
                            </div>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}