import { memo, useCallback } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { ModelInPageSelector } from '@/components/settings/ui/ModelInPageSelector';

interface ModelConfigProps {
    providerKey: string;
    displayName: string;
    requiresKey: boolean;
    isLocal: boolean;
    apiKeyPresent: boolean;
}

export const ModelConfig = memo(({ providerKey, displayName, requiresKey, isLocal, apiKeyPresent }: ModelConfigProps) => {
    const activeModel = useSettingsStore(s => (s as unknown as Record<string, unknown>).activeModel as string || '');
    const availableModelsByProvider = useSettingsStore(s => (s as unknown as Record<string, unknown>).availableModelsByProvider as Record<string, string[]> || {});
    const switchModel = useSettingsStore(s => s.switchModel as (key: string, model: string) => void);

    const providerModels = availableModelsByProvider[providerKey] || [];
    const currentModel = activeModel || providerModels[0] || '';

    const handleModelChange = useCallback((newModel: string) => {
        if (switchModel) {
            switchModel(providerKey, newModel);
        }
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
        <div className="flex flex-col gap-2 pt-2">
            <div className="flex flex-col">
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-1">Active Identifier</label>
                <span className="text-[10px] text-white/30 mb-2">Select the specific model architecture for this node.</span>
            </div>
            <div className="w-full max-w-lg">
                {providerModels.length === 0 ? (
                    <div className="px-4 py-6 bg-slate-900/20 border border-white/5 rounded-xl text-center">
                        <span className="text-[11px] text-slate-500 leading-relaxed">{getEmptyHint()}</span>
                    </div>
                ) : (
                    <ModelInPageSelector
                        models={providerModels}
                        selectedModel={currentModel}
                        onSelect={handleModelChange}
                        disabled={false}
                    />
                )}
            </div>
        </div>
    );
});