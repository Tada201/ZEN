import React, { useCallback } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import type { ModelInfo } from '@/lib/types/provider';

const EMPTY_ARRAY: ModelInfo[] = [];

interface ModelConfigProps {
    providerKey: string;
    displayName: string;
    requiresKey: boolean;
    isLocal: boolean;
    apiKeyPresent: boolean;
}

export const ModelConfig = React.memo(({ providerKey, displayName, requiresKey, isLocal, apiKeyPresent }: ModelConfigProps) => {
    const activeModel = useSettingsStore(s => s.activeModel);
    const providerModels = useSettingsStore(s => s.availableModelsByProvider[providerKey] || EMPTY_ARRAY);
    const fetchingModels = useSettingsStore(s => s.fetchingModels);
    const switchModel = useSettingsStore(s => s.switchModel);

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
                <span className="text-[11px] text-muted-foreground/60">Select the model architecture for this node.</span>
            </div>
            {fetchingModels ? <p className="text-xs text-muted-foreground">Discovering models...</p> : null}
            {providerModels.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {providerModels.map((model) => {
                        const selected = model.id === activeModel;
                        return (
                            <button
                                key={model.id}
                                type="button"
                                onClick={() => handleModelChange(model.id)}
                                className={`min-h-24 border p-3 text-left transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.18] hover:bg-white/[0.04]'}`}
                                aria-pressed={selected}
                                disabled={requiresKey && !apiKeyPresent}
                            >
                                <div className="line-clamp-2 font-mono text-xs font-semibold text-foreground">{model.name || model.id}</div>
                                <div className="mt-2 truncate font-mono text-[10px] text-muted-foreground" title={model.id}>{model.id}</div>
                                {model.capabilities?.length ? <div className="mt-2 truncate text-[10px] text-muted-foreground">{model.capabilities.join(' · ')}</div> : null}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <p className="rounded border border-dashed border-white/[0.10] px-3 py-4 text-xs text-muted-foreground">{getEmptyHint()}</p>
            )}
        </div>
    );
});
