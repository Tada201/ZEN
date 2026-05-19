import React, { useCallback } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { ModelInPageSelector } from '@/components/settings/ui/ModelInPageSelector';

const EMPTY_ARRAY: any[] = [];

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
            <div className="w-full max-w-lg">
                <ModelInPageSelector
                    models={providerModels as any[]}
                    selectedModelId={activeModel}
                    onModelSelect={handleModelChange}
                    fetching={fetchingModels}
                    status={fetchingModels ? 'warning' : (providerModels.length === 0 ? 'missing' : 'ready')}
                    emptyHint={getEmptyHint()}
                    disabled={requiresKey && !apiKeyPresent}
                />
            </div>
        </div>
    );
});