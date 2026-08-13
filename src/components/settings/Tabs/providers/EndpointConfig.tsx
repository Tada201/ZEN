import React, { useState } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { PROVIDER_BASE_URL_MAP } from '@/lib/types/provider';
import { SettingsState } from '@/lib/stores/settings/types';
import { settingsApi } from '@/api/settingsApi';

interface EndpointConfigProps {
    providerKey: string;
    displayName: string;
    settingKey?: string;
    initialValue?: string;
}

export const EndpointConfig = React.memo(({ providerKey, displayName, settingKey, initialValue = '' }: EndpointConfigProps) => {
    const updateSetting = useSettingsStore(s => s.updateSetting);
    const applyChanges = useSettingsStore(s => s.applyChanges);
    const fetchModels = useSettingsStore(s => s.fetchModels);
    const mappedValue = useSettingsStore(s => {
        const target = PROVIDER_BASE_URL_MAP[providerKey];
        return target ? (s[target as keyof SettingsState] as string) : '';
    });
    const [runtimeValue, setRuntimeValue] = useState(initialValue);
    const target = PROVIDER_BASE_URL_MAP[providerKey];
    const value = target ? mappedValue : runtimeValue;

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex flex-col">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">Base URL</label>
                <span className="text-[11px] text-muted-foreground">Endpoint address for {displayName}.</span>
            </div>
            <WorkbenchInput
                value={value}
                onChangeText={(text: string) => {
                    if (target) {
                        updateSetting({ [target]: text } as any);
                    } else {
                        setRuntimeValue(text);
                    }
                }}
                onBlur={async () => {
                    if (target) {
                        await applyChanges();
                    } else if (settingKey) {
                        await settingsApi.setSetting(settingKey, value);
                    }
                    fetchModels(providerKey);
                }}
                        className="h-9 max-w-lg rounded-lg border border-border bg-background font-mono text-xs"
            />
        </div>
    );
});
