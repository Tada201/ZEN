import { memo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';

interface EndpointConfigProps {
    providerKey: string;
    displayName: string;
}

export const EndpointConfig = memo(({ providerKey, displayName }: EndpointConfigProps) => {
    const ollamaBaseUrl = useSettingsStore(s => s.ollamaBaseUrl ?? 'http://localhost:11434');
    const lmstudioBaseUrl = useSettingsStore(s => s.lmstudioBaseUrl ?? 'http://localhost:1234');
    const updateSetting = useSettingsStore(s => s.updateSetting);

    const value = providerKey === 'ollama' ? ollamaBaseUrl : lmstudioBaseUrl;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-col">
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-1">Base URL</label>
                <span className="text-[10px] text-white/30 mb-2">Endpoint address for the {displayName} inference server.</span>
            </div>
            <WorkbenchInput
                value={value}
                onChangeText={(text: string) => {
                    if (providerKey === 'ollama') updateSetting({ ollamaBaseUrl: text } as any);
                    else updateSetting({ lmstudioBaseUrl: text } as any);
                }}
                className="max-w-md h-11 font-mono text-xs bg-white/[0.02] border-white/[0.08] rounded-xl"
            />
        </div>
    );
});