import React, { useCallback, useMemo, useState } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import type { ModelInfo } from '@/lib/types/provider';

const EMPTY_ARRAY: ModelInfo[] = [];

function dedupeModelsById(models: ModelInfo[]): ModelInfo[] {
    const seen = new Map<string, ModelInfo>();
    for (const model of models) {
        if (!model || typeof model.id !== 'string' || model.id.length === 0) continue;
        if (!seen.has(model.id)) seen.set(model.id, model);
    }
    return Array.from(seen.values());
}

interface ModelConfigProps {
    providerKey: string;
    displayName: string;
    requiresKey: boolean;
    isLocal: boolean;
    apiKeyPresent: boolean;
}

export const ModelConfig = React.memo(({ providerKey, displayName, requiresKey, isLocal, apiKeyPresent }: ModelConfigProps) => {
    const activeModel = useSettingsStore(s => s.activeModel);
    const activeProvider = useSettingsStore(s => s.activeProvider);
    const providerModels = useSettingsStore(s => s.availableModelsByProvider[providerKey] || EMPTY_ARRAY);
    const fetchingModels = useSettingsStore(s => s.fetchingModels);
    const fetchModels = useSettingsStore(s => s.fetchModels);
    const switchModel = useSettingsStore(s => s.switchModel);
    const [query, setQuery] = useState('');

    const dedupedModels = useMemo(() => dedupeModelsById(providerModels), [providerModels]);
    const visibleModels = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return dedupedModels;
        return dedupedModels.filter(model =>
            [model.name, model.displayName, model.id, model.description, ...(model.capabilities || [])]
                .filter(Boolean)
                .some(value => String(value).toLowerCase().includes(normalizedQuery))
        );
    }, [dedupedModels, query]);

    const handleModelChange = useCallback((newModel: string) => {
        switchModel(providerKey, newModel);
    }, [switchModel, providerKey]);

    const getEmptyHint = () => {
        if (requiresKey && !apiKeyPresent) {
            return `Enter your ${displayName} API key to discover available models.`;
        }
        if (isLocal) {
            return `Ensure ${displayName} is active and reachable via the configured endpoint.`;
        }
        if (apiKeyPresent) {
            return `Protocol failure: Could not synchronize with ${displayName} model catalog.`;
        }
        return 'No models discovered. Verify configurations or initiate Global Sync.';
    };

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex flex-col">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">Active Identifier</label>
                <span className="text-[11px] text-muted-foreground">Select the model used by this provider.</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[10px] tabular-nums text-muted-foreground">
                    {dedupedModels.length} discovered model{dedupedModels.length === 1 ? '' : 's'}
                </div>
                <div className="flex items-center gap-2">
                    {dedupedModels.length > 0 && (
                        <div className="relative w-full sm:w-52">
                            <WorkbenchIcon name="lucide:search" size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                placeholder="Filter models"
                                aria-label={`Filter ${displayName} models`}
                                className="h-7 w-full rounded-lg border border-border bg-background pl-7 pr-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
                            />
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => { void fetchModels(providerKey, true); }}
                        disabled={fetchingModels || (requiresKey && !apiKeyPresent)}
                        className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        title="Refresh this provider's model catalog"
                    >
                        <WorkbenchIcon name="lucide:refresh-cw" size={11} className={fetchingModels ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>
            {fetchingModels ? <p className="text-xs text-muted-foreground">Discovering models...</p> : null}
            {dedupedModels.length > 0 && visibleModels.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {visibleModels.map((model) => {
                        const selected = activeProvider === providerKey && model.id === activeModel;
                        return (
                            <button
                                key={model.id}
                                type="button"
                                onClick={() => handleModelChange(model.id)}
                                className={`min-h-24 border p-3 text-left transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/40 hover:bg-muted'}`}
                                aria-pressed={selected}
                                disabled={requiresKey && !apiKeyPresent}
                            >
                                <div className="line-clamp-2 font-mono text-xs font-semibold text-foreground">{model.name || model.id}</div>
                                <div className="mt-2 truncate font-mono text-[10px] text-muted-foreground" title={model.id}>{model.id}</div>
                                <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                                    {model.contextWindow ? <span>{formatContextWindow(model.contextWindow)} context</span> : null}
                                    {model.maxTokens ? <span>{formatContextWindow(model.maxTokens)} output</span> : null}
                                    {model.supportsReasoning ? <span className="text-primary/80">reasoning</span> : null}
                                </div>
                                {model.capabilities?.length ? <div className="mt-1 truncate text-[10px] text-muted-foreground">{model.capabilities.join(' · ')}</div> : null}
                            </button>
                        );
                    })}
                </div>
            ) : dedupedModels.length > 0 ? (
                <p className="rounded border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">No models match “{query}”.</p>
            ) : (
                <p className="rounded border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">{getEmptyHint()}</p>
            )}
        </div>
    );
});

function formatContextWindow(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return String(value);
}
