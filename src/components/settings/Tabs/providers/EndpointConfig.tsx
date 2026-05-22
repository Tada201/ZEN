import React from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { PROVIDER_BASE_URL_MAP } from '@/lib/types/provider';
import { SettingsState } from '@/lib/stores/settings/types';

interface EndpointConfigProps {
    providerKey: string;
    displayName: string;
}

export const EndpointConfig = React.memo(({ providerKey, displayName }: EndpointConfigProps) => {
    const updateSetting = useSettingsStore(s => s.updateSetting);
    const applyChanges = useSettingsStore(s => s.applyChanges);
    const fetchModels = useSettingsStore(s => s.fetchModels);
    const value = useSettingsStore(s => {
        const target = PROVIDER_BASE_URL_MAP[providerKey];
        return target ? (s[target as keyof SettingsState] as string) : '';
    });

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex flex-col">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">Base URL</label>
                <span className="text-[11px] text-muted-foreground/60">Endpoint address for {displayName}.</span>
            </div>
            <WorkbenchInput
                value={value}
                onChangeText={(text: string) => {
                    const target = PROVIDER_BASE_URL_MAP[providerKey];
                    if (target) {
                        updateSetting({ [target]: text } as any);
                    }
                }}
                onBlur={async () => {
                    await applyChanges();
                    fetchModels(providerKey);
                }}
                className="max-w-lg h-9 font-mono text-xs bg-muted/20 border-border/60 rounded-lg"
            />
        </div>
    );
});