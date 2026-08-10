import React, { useState, useCallback } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { SettingsState } from '@/lib/stores/settings/types';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { PROVIDER_KEY_MAP } from '@/lib/types/provider';
import { isSecretPresentValue } from '@/api';
import { toast } from 'sonner';
import { settingsApi } from '@/api/settingsApi';

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

    const handleRemove = useCallback(async () => {
        const target = PROVIDER_KEY_MAP[providerKey];
        if (!target) return;
        await settingsApi.deleteSecret(target.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
        updateSetting({ [target]: '' } as any);
        toast.success(`${displayName} key removed.`);
        fetchModels(providerKey);
    }, [applyChanges, displayName, fetchModels, providerKey, updateSetting]);

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
            <div className="flex max-w-2xl items-center gap-2">
              <div className="relative min-w-0 flex-1">
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
              {isSecretPresentValue(apiKey) && (
                <WorkbenchButton
                  type="button"
                  variant="ghost"
                  onClick={() => void handleRemove()}
                  className="h-9 shrink-0 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <WorkbenchIcon name="lucide:key-round-off" size={13} className="mr-1.5" />
                  Remove key
                </WorkbenchButton>
              )}
            </div>
        </form>
    );
});
