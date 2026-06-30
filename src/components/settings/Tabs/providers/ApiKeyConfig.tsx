import React, { useState, useCallback } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { SettingsState } from '@/lib/stores/settings/types';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { PROVIDER_KEY_MAP } from '@/lib/types/provider';
import { isSecretPresentValue } from '@/api';

interface ApiKeyConfigProps {
    providerKey: string;
    displayName: string;
}

export const ApiKeyConfig = React.memo(({ providerKey, displayName }: ApiKeyConfigProps) => {
    const [showKey, setShowKey] = useState(false);
    
    // Select specific API key based on provider
    const apiKey = useSettingsStore(s => {
        const target = PROVIDER_KEY_MAP[providerKey];
        return target ? (s[target as keyof SettingsState] as string) : '';
    });

    const updateSetting = useSettingsStore(s => s.updateSetting);
    const applyChanges = useSettingsStore(s => s.applyChanges);
    const fetchModels = useSettingsStore(s => s.fetchModels);

    const visibleApiKey = isSecretPresentValue(apiKey) ? '' : apiKey;
    const placeholder = isSecretPresentValue(apiKey) ? 'Saved key present. Enter a new key to replace it.' : 'Enter secure API key...';

    const handleUpdate = useCallback((text: string) => {
        const target = PROVIDER_KEY_MAP[providerKey];
        if (target) {
            updateSetting({ [target]: text } as any);
        }
    }, [providerKey, updateSetting]);

    const handleBlur = useCallback(async () => {
        await applyChanges();
        fetchModels(providerKey);
    }, [providerKey, applyChanges, fetchModels]);

    return (
        <form
            className="flex flex-col gap-2.5"
            onSubmit={(event) => event.preventDefault()}
            autoComplete="off"
        >
            <div className="flex flex-col">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">API Key</label>
                <span className="text-[11px] text-muted-foreground/60">Required for authentication to {displayName}.</span>
            </div>
            <div className="relative max-w-lg">
                <WorkbenchInput
                    type={showKey ? "text" : "password"}
                    value={visibleApiKey}
                    placeholder={placeholder}
                    onChangeText={handleUpdate}
                    onBlur={handleBlur}
                    className="w-full h-9 pr-10 font-mono text-xs bg-muted/20 border-border/60 focus:border-primary/40 transition-all rounded-lg"
                />
                <WorkbenchButton
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground/40 hover:text-foreground"
                >
                    <WorkbenchIcon name={showKey ? "lucide:eye-off" : "lucide:eye"} size={13} />
                </WorkbenchButton>
            </div>
        </form>
    );
});
