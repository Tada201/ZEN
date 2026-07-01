import { useState, memo } from 'react';
import { toast } from 'sonner';
import { ask } from '@tauri-apps/plugin-dialog';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { cn } from '@/lib/utils/style';
import { isSecretPresentValue } from '@/api';

interface CustomProviderConfigProps {
    providerId: string;
    displayName: string;
    baseUrl: string;
    apiKey?: string;
    headers?: Record<string, string>;
}

export const CustomProviderConfig = memo(({ providerId, displayName, baseUrl, apiKey, headers = {} }: CustomProviderConfigProps) => {
    const [showKey, setShowKey] = useState(false);
    const updateCustomProvider = useSettingsStore(s => s.updateCustomProvider);
    const removeCustomProvider = useSettingsStore(s => s.removeCustomProvider);
    const toggleCustomProvider = useSettingsStore(s => s.toggleCustomProvider);
    
    // Local state to allow typing without immediate store validation interference
    const [localName, setLocalName] = useState(displayName);
    const [localUrl, setLocalUrl] = useState(baseUrl);
    const [localKey, setLocalKey] = useState(isSecretPresentValue(apiKey) ? '' : apiKey || '');
    const [keyDirty, setKeyDirty] = useState(false);
    const [headersText, setHeadersText] = useState(Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\n'));
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isPinging, setIsPinging] = useState(false);
    const runConnectionTest = useSettingsStore(s => s.testProviderConnection);
    const handlePing = async () => {
        if (isPinging) return;
        setIsPinging(true);
        try {
            await runConnectionTest(providerId);
            const nextStatus = useSettingsStore.getState().connectionStatuses[providerId];
            if (nextStatus === 'success') {
                toast.success(`Connection to ${displayName} is healthy.`);
            } else {
                toast.warning(`Handshake with ${displayName} completed but no models were returned.`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setSaveError(message);
            toast.error(`Connection to ${displayName} failed: ${message}`);
        } finally {
            setIsPinging(false);
        }
    };
    const keyPlaceholder = isSecretPresentValue(apiKey) ? 'Saved key present. Enter a new key to replace it.' : 'Optional secure key...';

    const isEnabled = useSettingsStore(s => s.customProviders.find(cp => cp.id === providerId)?.enabled ?? true);
    // @ts-ignore
    const providerError = useSettingsStore(s => s.customProviders.find(cp => cp.id === providerId)?.error);

    return (
        <div className="flex flex-col gap-4 p-4 bg-muted/20 border border-border/40 rounded-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 flex items-center gap-2">
                 <button
                    type="button"
                    onClick={handlePing}
                    disabled={isPinging}
                    className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all",
                        isPinging
                            ? "bg-muted border-border/40 text-muted-foreground/40 cursor-wait"
                            : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                    )}
                >
                    <WorkbenchIcon name={isPinging ? "lucide:loader-2" : "lucide:radio"} size={10} className={isPinging ? "animate-spin" : undefined} />
                    <span className="text-[9px] font-bold uppercase tracking-widest">{isPinging ? 'Pinging' : 'Test'}</span>
                </button>
                 <button
                    onClick={() => toggleCustomProvider(providerId)}
                    className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all",
                        isEnabled
                            ? "bg-success/10 border-emerald-500/20 text-success"
                            : "bg-muted border-border/40 text-muted-foreground/40"
                    )}
                >
                    <div className={cn(
                        "w-1 h-1 rounded-full transition-all",
                        isEnabled ? "bg-success shadow-[0_0_8px_hsl(var(--primary) / 0.4)]" : "bg-muted-foreground/20"
                    )} />
                    <span className="text-[9px] font-bold uppercase tracking-widest">{isEnabled ? 'ACTIVE' : 'OFF'}</span>
                </button>
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">Alias</label>
                    <span className="text-[11px] text-muted-foreground/60">Identifier for this local node.</span>
                </div>
                <WorkbenchInput
                    value={localName}
                    onChangeText={setLocalName}
                    onBlur={() => { void updateCustomProvider(providerId, { displayName: localName } as any).catch(error => setSaveError(String(error))); }}
                    className="max-w-lg h-9 bg-muted/20 border-border/60 rounded-lg"
                />
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">Target Endpoint</label>
                    <span className="text-[11px] text-muted-foreground/60">OpenAI-compatible completion API.</span>
                </div>
                <WorkbenchInput
                    value={localUrl}
                    onChangeText={setLocalUrl}
                    onBlur={() => { void updateCustomProvider(providerId, { baseUrl: localUrl } as any).catch(error => setSaveError(String(error))); }}
                    className={cn(
                        "max-w-lg h-9 font-mono text-xs bg-muted/20 border-border/60 rounded-lg",
                        providerError && "border-destructive/30 bg-destructive/5"
                    )}
                />
                {providerError && (
                    <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-destructive">
                        <WorkbenchIcon name="lucide:alert-circle" size={12} />
                        <span>{providerError}</span>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">Secure Key</label>
                    <span className="text-[11px] text-muted-foreground/60">Auth token if required.</span>
                </div>
                <form
                    className="relative max-w-lg group"
                    onSubmit={(event) => event.preventDefault()}
                    autoComplete="off"
                >
                    <WorkbenchInput
                        type={showKey ? "text" : "password"}
                        value={localKey}
                        placeholder={keyPlaceholder}
                        onChangeText={(value) => {
                            setLocalKey(value);
                            setKeyDirty(true);
                        }}
                        onBlur={() => {
                            if (!keyDirty) return;
                            void updateCustomProvider(providerId, { apiKey: localKey } as any).catch(error => setSaveError(String(error)));
                            setKeyDirty(false);
                        }}
                        className="w-full h-9 pr-10 font-mono text-xs bg-muted/20 border-border/60 rounded-lg"
                    />
                    <WorkbenchButton
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground/40 hover:text-foreground"
                    >
                        <WorkbenchIcon name={showKey ? "lucide:eye-off" : "lucide:eye"} size={13} />
                    </WorkbenchButton>
                </form>
            </div>

            <details className="rounded-md border border-border/40 p-3">
                <summary className="cursor-pointer text-[11px] font-medium text-foreground">Advanced headers</summary>
                <textarea
                    value={headersText}
                    onChange={(event) => setHeadersText(event.target.value)}
                    onBlur={() => {
                        try {
                            const parsed = Object.fromEntries(headersText.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
                                const separator = line.indexOf(':');
                                if (separator < 1) throw new Error(`Invalid header: ${line}`);
                                return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
                            }));
                            void updateCustomProvider(providerId, { headers: parsed }).catch(error => setSaveError(String(error)));
                            setSaveError(null);
                        } catch (error) {
                            setSaveError(error instanceof Error ? error.message : String(error));
                        }
                    }}
                    className="mt-3 min-h-20 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] outline-none"
                />
            </details>

            {saveError && <div className="rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[11px] text-destructive">{saveError}</div>}

            <div className="pt-3 border-t border-border/40 flex justify-end">
                <WorkbenchButton
                    variant="ghost"
                    className="h-8 px-3 text-[10px] font-bold text-destructive/60 hover:text-destructive hover:bg-rose-500/10"
                    onClick={async () => {
                        const confirmed = await ask('Permanently delete this custom node?', {
                            title: 'ZEN_NODE_PURGE',
                            kind: 'warning'
                        });
                        if (confirmed) {
                            try {
                                await removeCustomProvider(providerId);
                                toast.success(`Custom node "${displayName}" was purged.`);
                            } catch (error) {
                                const message = error instanceof Error ? error.message : String(error);
                                setSaveError(message);
                                toast.error(`Could not purge node: ${message}`);
                            }
                        }
                    }}
                >
                    <WorkbenchIcon name="lucide:trash-2" size={12} className="mr-2" />
                    Purge Node
                </WorkbenchButton>
            </div>
        </div>
    );
});
