import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { useUIStore } from '@/lib/stores/useUIStore';
import '@/styles/model-selector.css';

interface ModelInfo {
    id: string;
    name: string;
    displayName: string;
    provider: string;
    description?: string;
    supportsVision?: boolean;
    supportsTools?: boolean;
    isFree?: boolean;
}

const MOCK_MODELS: ModelInfo[] = [
    { id: 'gpt-4o', name: 'gpt-4o', displayName: 'GPT-4o', provider: 'openai', description: 'Smartest model for complex reasoning', supportsVision: true, supportsTools: true },
    { id: 'gpt-4o-mini', name: 'gpt-4o-mini', displayName: 'GPT-4o Mini', provider: 'openai', description: 'Fast, efficient model', supportsVision: true, supportsTools: true },
    { id: 'claude-3-5-sonnet', name: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', provider: 'anthropic', description: 'Exceptional coding and analysis', supportsVision: true, supportsTools: true },
    { id: 'claude-3-haiku', name: 'claude-3-haiku', displayName: 'Claude 3 Haiku', provider: 'anthropic', description: 'Lightweight and fast', supportsTools: true },
    { id: 'gemini-1.5-pro', name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', provider: 'google', description: 'Deep reasoning and 2M context', supportsVision: true, supportsTools: true },
    { id: 'llama-3-70b', name: 'llama-3-70b', displayName: 'Llama 3 70B', provider: 'ollama', description: 'High-performance local model', supportsTools: true },
    { id: 'deepseek-v3', name: 'deepseek-v3', displayName: 'DeepSeek v3', provider: 'deepseek', description: 'Highly capable open-weight model', supportsTools: true },
];

export function ModelSelector() {
    const { activeModel, activeProvider, setActiveModel, setActiveProvider } = useUIStore();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ left: 0, top: 0 });

    const handleToggle = useCallback(() => {
        if (!open && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setCoords({ left: rect.left, top: rect.bottom + 4 });
        }
        setOpen(v => !v);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current?.contains(e.target as Node) || popoverRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const filteredModels = useMemo(() => {
        return MOCK_MODELS.filter(m => 
            m.displayName.toLowerCase().includes(search.toLowerCase()) || 
            m.provider.toLowerCase().includes(search.toLowerCase())
        );
    }, [search]);

    const activeDisplay = useMemo(() => {
        return MOCK_MODELS.find(m => m.name === activeModel)?.displayName || activeModel;
    }, [activeModel]);

    const groupedModels = useMemo(() => {
        const groups: Record<string, ModelInfo[]> = {};
        filteredModels.forEach(m => {
            if (!groups[m.provider]) groups[m.provider] = [];
            groups[m.provider].push(m);
        });
        return groups;
    }, [filteredModels]);

    return (
        <div className="relative inline-block" ref={containerRef}>
            <WorkbenchButton
                variant="ghost"
                size="sm"
                onClick={handleToggle}
                className="flex items-center gap-2 px-3 h-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
            >
                <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="text-[10px] font-mono opacity-40 uppercase hidden sm:inline">{activeProvider}</span>
                    <span className="text-[10px] font-mono opacity-20 hidden sm:inline">/</span>
                    <span className="text-[11px] font-bold truncate max-w-[120px]">{activeDisplay}</span>
                </div>
                <WorkbenchIcon name="lucide:chevron-down" size={12} className="opacity-30" />
            </WorkbenchButton>

            {open && createPortal(
                <div
                    ref={popoverRef}
                    className="model-selector__popover"
                    style={{ position: 'fixed', top: coords.top, left: coords.left }}
                >
                    <div className="model-selector__search-wrapper">
                        <WorkbenchIcon name="lucide:search" size={12} className="model-selector__search-icon" />
                        <input
                            autoFocus
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search models..."
                            className="model-selector__input"
                        />
                    </div>

                    <div className="model-selector__list custom-scrollbar pr-1">
                        {Object.entries(groupedModels).map(([provider, models]) => (
                            <div key={provider}>
                                <div className="model-selector__label">{provider}</div>
                                {models.map(model => (
                                    <div
                                        key={model.id}
                                        className="model-selector__item"
                                        data-selected={activeModel === model.name}
                                        onClick={() => {
                                            setActiveModel(model.name);
                                            setActiveProvider(model.provider);
                                            setOpen(false);
                                        }}
                                    >
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold">{model.displayName}</span>
                                                {model.supportsVision && <span className="model-selector__badge border-sky-500/30 text-sky-400 bg-sky-500/5">VLM</span>}
                                                {model.supportsTools && <span className="model-selector__badge border-emerald-500/30 text-emerald-400 bg-emerald-500/5">TOOLS</span>}
                                            </div>
                                            {model.description && <span className="text-[10px] opacity-40 line-clamp-1">{model.description}</span>}
                                        </div>
                                        {activeModel === model.name && <WorkbenchIcon name="lucide:check" size={12} className="text-primary" />}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    <div className="p-2 border-t border-white/5 bg-white/5 flex items-center justify-between text-[9px] font-mono opacity-40 px-3">
                        <span>{MOCK_MODELS.length} MODELS AVAILABLE</span>
                        <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            CORE_SYNC_OK
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
