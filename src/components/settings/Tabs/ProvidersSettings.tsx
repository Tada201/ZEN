import React, { useState, memo, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { providerOrder, PROVIDER_KEY_MAP, PROVIDER_BASE_URL_MAP, type ProviderCatalogEntry } from '@/lib/types/provider';
import { cn } from '@/lib/utils/style';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchInput } from '@/components/settings/ui/WorkbenchInput';
import { WorkbenchSelect } from '@/components/settings/ui/WorkbenchSelect';
import { PROVIDER_ICONS } from './providers/constants';
import { ApiKeyConfig } from './providers/ApiKeyConfig';
import { EndpointConfig } from './providers/EndpointConfig';
import { ModelConfig } from './providers/ModelConfig';
import { CustomProviderConfig } from './providers/CustomProviderConfig';
import { ConnectionStatus } from './providers/ConnectionStatus';
import { ProviderParamsConfig } from './providers/ProviderParamsConfig';
import { ProviderGallery } from './providers/ProviderGallery';
import { ProviderUsagePanel } from './providers/ProviderUsagePanel';
import { providersApi } from '@/api';

const CATEGORIES = [
    { id: 'cloud', label: 'Cloud Intelligence', providers: ['opencode', 'mimo', 'openai', 'anthropic', 'google', 'xai', 'mistral', 'groq', 'perplexity', 'deepseek', 'openrouter', 'together', 'kilocode', 'aihubmix'] },
    { id: 'local', label: 'Local & Private', providers: ['ollama', 'lmstudio', 'nine_router'] },
    { id: 'custom', label: 'Custom Nodes', providers: [] },
];

export const ProvidersSettings = memo(() => {
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogEntry[]>([]);

    const customProvidersValue = useSettingsStore(s => s.customProviders);
    const customProviders = useMemo(
        () => Array.isArray(customProvidersValue) ? customProvidersValue : [],
        [customProvidersValue]
    );
    const connectionStatuses = useSettingsStore(s => s.connectionStatuses);
    const fetchModels = useSettingsStore(s => s.fetchModels);
    const fetchingModels = useSettingsStore(s => s.fetchingModels);
    const availableModelsByProvider = useSettingsStore(s => s.availableModelsByProvider);
    const addCustomProvider = useSettingsStore(s => s.addCustomProvider);
    const allProviderParams = useSettingsStore(s => s.providerParams);
    const updateProviderParams = useSettingsStore(s => s.updateProviderParams);
    const nineRouterImageModels = useSettingsStore(s => s.nineRouterImageModels);
    const nineRouterImageModelsLoading = useSettingsStore(s => s.nineRouterImageModelsLoading);
    const nineRouterImageModelsError = useSettingsStore(s => s.nineRouterImageModelsError);
    const fetchNineRouterImageModelsAction = useSettingsStore(s => s.fetchNineRouterImageModels);
    const nineRouterBaseUrl = useSettingsStore(s => s.nineRouterBaseUrl);
    const nineRouterApiKey = useSettingsStore(s => s.nineRouterApiKey);
    const lastRemovedProviderId = useSettingsStore(s => s.lastRemovedProviderId);

    useEffect(() => {
        let cancelled = false;
        void providersApi.getCatalog().then((catalog) => {
            if (!cancelled) setProviderCatalog(catalog);
        }).catch(() => {
            // The local store remains the fallback for mock/dev runtimes.
        });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (lastRemovedProviderId && selectedProviderId === lastRemovedProviderId) {
            setSelectedProviderId(null);
        }
        if (lastRemovedProviderId) {
            useSettingsStore.setState({ lastRemovedProviderId: null });
        }
    }, [lastRemovedProviderId, selectedProviderId]);

    const [isAddingCustom, setIsAddingCustom] = useState(false);
    const [addForm, setAddForm] = useState({
        displayName: '',
        baseUrl: '',
        apiKey: '',
        headersText: '',
        manualModels: '',
        testStatus: 'idle' as 'idle' | 'testing' | 'success' | 'error',
        discoveredModels: [] as any[],
        validationError: null as string | null,
    });

    // Filtered categories and providers
    const filteredCategories = useMemo(() => {
        return CATEGORIES.map(cat => {
            let providers = [];
            if (cat.id === 'custom') {
                providers = customProviders.map(cp => ({
                    id: cp.id,
                    label: cp.displayName,
                    icon: 'lucide:network',
                    isCustom: true
                }));
            } else {
                providers = providerOrder
                    .filter(p => cat.providers.includes(p.key) || (cat.id === 'cloud' && !p.isLocal && !cat.providers.includes(p.key)))
                    .map(p => ({
                        id: p.key,
                        label: p.name,
                        icon: p.icon,
                        isCustom: false
                    }));
            }

            const filtered = providers.filter(p => 
                p.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
                p.id.toLowerCase().includes(searchQuery.toLowerCase())
            );

            return { ...cat, providers: filtered };
        }).filter(cat => cat.providers.length > 0);
    }, [searchQuery, customProviders]);

    const handleProviderClick = useCallback((id: string) => {
        setSelectedProviderId(id);
        fetchModels(id);
        if (id === 'nine_router') {
            let isSafe = true;
            if (nineRouterApiKey && nineRouterApiKey.trim() !== '') {
                try {
                    const parsedUrl = new URL(nineRouterBaseUrl);
                    const host = parsedUrl.hostname.toLowerCase();
                    const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
                    const isHttps = parsedUrl.protocol === 'https:';
                    isSafe = isHttps || isLoopback;
                } catch {
                    isSafe = false;
                }
            }
            if (isSafe) {
                void fetchNineRouterImageModelsAction();
            }
        }
    }, [fetchModels, fetchNineRouterImageModelsAction, nineRouterBaseUrl, nineRouterApiKey]);

    const getProviderStatus = useCallback((id: string) => {
        const state = useSettingsStore.getState();
        const customProvider = state.customProviders.find(provider => provider.id === id);
        if (customProvider?.enabled === false) return 'disabled';
        const status = connectionStatuses[id];
        if (status === 'success') return 'active';
        if (status === 'error') return 'failed';

        const runtimeProvider = providerCatalog.find(provider => provider.id === id);
        if (runtimeProvider?.enabled === false) return 'disabled';
        if (runtimeProvider?.apiKeyPresent || runtimeProvider?.configured) return 'configured';
        
        // Check if inference params are configured
        const params = state.providerParams[id];
        if (params && Object.keys(params).length > 0) return 'configured';

        // Check if API key is configured
        const configKey = PROVIDER_KEY_MAP[id];
        if (configKey) {
            const value = (state as any)[configKey];
            if (value) return 'configured';
        }
        return 'none';
    }, [connectionStatuses, providerCatalog]);

    const handleAddFormTest = useCallback(async () => {
        if (addForm.testStatus === 'testing') return;
        setAddForm(prev => ({ ...prev, testStatus: 'testing', validationError: null }));
        try {
            const headers = Object.fromEntries(addForm.headersText.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
                const separator = line.indexOf(':');
                if (separator < 1) throw new Error(`Invalid header: ${line}`);
                return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
            }));
            const models = await providersApi.testProviderConnection({
                providerType: 'custom',
                baseUrl: addForm.baseUrl,
                apiKey: addForm.apiKey,
                displayName: addForm.displayName || 'Custom Node',
                headers,
            });
            const ok = models && models.length > 0;
            setAddForm(prev => ({
                ...prev,
                testStatus: ok ? 'success' : 'error',
                discoveredModels: models || [],
                validationError: ok ? null : 'Endpoint reachable, but no models were returned. Add model IDs manually below.',
            }));
            if (!ok) {
                toast.error('Connection succeeded but no models were returned.');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setAddForm(prev => ({ ...prev, testStatus: 'error', discoveredModels: [], validationError: message }));
            toast.error(`Custom provider test failed: ${message}`);
        }
    }, [addForm]);

    const handleAddFormRegister = useCallback(async () => {
        if (!addForm.displayName || !addForm.baseUrl) return;
        try {
            const headers = Object.fromEntries(addForm.headersText.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
                const separator = line.indexOf(':');
                if (separator < 1) throw new Error(`Invalid header: ${line}`);
                return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
            }));
            const manualModels = addForm.manualModels.split(/[\n,]/).map(id => id.trim()).filter(Boolean).map(id => ({ id, name: id, provider: '', source: 'direct', state: 'unloaded', capabilities: ['text'] }));
            if (addForm.testStatus !== 'success' && manualModels.length === 0) {
                throw new Error('Test the connection or enter at least one manual model ID.');
            }
            const newId = await addCustomProvider({
                displayName: addForm.displayName,
                baseUrl: addForm.baseUrl,
                apiKey: addForm.apiKey,
                headers,
                customModels: addForm.discoveredModels.length ? addForm.discoveredModels : manualModels,
            } as any);
            useSettingsStore.setState(state => ({
                connectionStatuses: { ...state.connectionStatuses, [newId]: 'success' },
            }));
            void useSettingsStore.getState().fetchModels(newId);
            setIsAddingCustom(false);
            setAddForm({ displayName: '', baseUrl: '', apiKey: '', headersText: '', manualModels: '', testStatus: 'idle', discoveredModels: [], validationError: null });
            toast.success(`Custom provider "${addForm.displayName}" registered.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setAddForm(prev => ({ ...prev, validationError: message }));
            toast.error(`Could not register provider: ${message}`);
        }
    }, [addForm, addCustomProvider]);

    if (isAddingCustom) {
        return (
            <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-4 mb-4 px-6 pt-4">
                    <WorkbenchButton 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg hover:bg-muted"
                        onClick={() => setIsAddingCustom(false)}
                    >
                        <WorkbenchIcon name="lucide:chevron-left" size={14} />
                    </WorkbenchButton>
                    <div className="h-9 w-9 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-center">
                        <WorkbenchIcon name="lucide:plus" size={18} className="text-primary" />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold leading-tight text-foreground">Add custom provider</h3>
                        <p className="text-xs text-muted-foreground">Connect an OpenAI-compatible endpoint</p>
                    </div>
                </div>

                <ScrollArea className="flex-1 px-8 pb-12">
                    <div className="max-w-xl space-y-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-foreground">Provider name</label>
                            <WorkbenchInput
                                value={addForm.displayName}
                                placeholder="e.g., Private Research Cluster"
                                onChangeText={(val) => setAddForm(prev => ({ ...prev, displayName: val }))}
                                className="h-11 bg-muted/40 border-border rounded-xl"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-semibold text-muted-foreground">Manual model IDs</label>
                            <textarea
                                value={addForm.manualModels}
                                onChange={(event) => setAddForm(prev => ({ ...prev, manualModels: event.target.value, validationError: null }))}
                                placeholder="model-id-one, model-id-two"
                                className="min-h-20 resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground outline-none focus:border-primary/50"
                            />
                            <p className="text-[11px] text-muted-foreground">Optional fallback when the endpoint does not expose /models.</p>
                        </div>

                        <details className="rounded-md border border-border/60 bg-muted/10 p-3">
                            <summary className="cursor-pointer text-[12px] font-medium text-foreground">Advanced headers</summary>
                            <textarea
                                value={addForm.headersText}
                                onChange={(event) => setAddForm(prev => ({ ...prev, headersText: event.target.value, testStatus: 'idle', validationError: null }))}
                                placeholder={'anthropic-version: 2023-06-01\nX-Organization: example'}
                                className="mt-3 min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground outline-none focus:border-primary/50"
                            />
                        </details>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-foreground">Endpoint URL</label>
                            <WorkbenchInput
                                value={addForm.baseUrl}
                                placeholder="https://api.domain.ai/v1"
                                onChangeText={(val) => setAddForm(prev => ({ ...prev, baseUrl: val, validationError: null }))}
                                className="h-11 font-mono text-xs bg-muted/40 border-border rounded-xl"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-foreground">API key <span className="font-normal text-muted-foreground">(optional)</span></label>
                            <form
                                onSubmit={(event) => event.preventDefault()}
                                autoComplete="off"
                            >
                                <WorkbenchInput
                                    type="password"
                                    value={addForm.apiKey}
                                    placeholder="sk-..."
                                    onChangeText={(val) => setAddForm(prev => ({ ...prev, apiKey: val }))}
                                    className="h-11 font-mono text-xs bg-muted/40 border-border rounded-xl"
                                />
                            </form>
                        </div>

                        {addForm.testStatus !== 'idle' && (
                            <div className={cn(
                                "p-3 rounded-xl border flex items-center gap-3",
                                addForm.testStatus === 'testing' && "bg-warning/5 border-warning/10 text-warning",
                                addForm.testStatus === 'success' && "bg-success/5 border-emerald-500/10 text-success",
                                addForm.testStatus === 'error' && "bg-destructive/5 border-destructive/10 text-destructive"
                            )}>
                                <WorkbenchIcon
                                    name={addForm.testStatus === 'testing' ? "lucide:loader-2" : addForm.testStatus === 'success' ? "lucide:check-circle" : "lucide:alert-circle"}
                                    size={14}
                                    className={cn(addForm.testStatus === 'testing' && "animate-spin")}
                                />
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    {addForm.testStatus === 'testing' ? 'Synchronizing Handshake...' : addForm.testStatus === 'success' ? 'Telemetry Established' : 'Connection Refused'}
                                </span>
                            </div>
                        )}
                        {addForm.validationError && (
                            <div className="rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[12px] text-destructive">
                                {addForm.validationError}
                            </div>
                        )}

                        <div className="flex gap-3 mt-10">
                            <WorkbenchButton
                                variant="secondary"
                                className="flex-1 h-10 rounded-xl font-bold bg-muted/40 border-border"
                                onClick={handleAddFormTest}
                                disabled={!addForm.baseUrl || addForm.testStatus === 'testing'}
                            >
                                {addForm.testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                            </WorkbenchButton>
                            <WorkbenchButton
                                variant="blue"
                                className="flex-1 h-10 rounded-xl font-bold"
                                onClick={handleAddFormRegister}
                                disabled={!addForm.displayName || !addForm.baseUrl || addForm.testStatus === 'testing'}
                            >
                                Register Node
                            </WorkbenchButton>
                        </div>
                    </div>
                </ScrollArea>
            </div>
        );
    }

    if (selectedProviderId) {
        const providerParams = allProviderParams[selectedProviderId] || {};
        const providerData = providerOrder.find(p => p.key === selectedProviderId) ||
                           customProviders.find(cp => cp.id === selectedProviderId);

        if (!providerData) {
            // Selected provider was deleted; return to the gallery instead of
            // dereferencing undefined metadata.
            setSelectedProviderId(null);
            return null;
        }

        const isCustom = !providerOrder.find(p => p.key === selectedProviderId);
        const displayData = isCustom ? {
            name: (providerData as any).displayName ?? (providerData as any).name ?? 'Unknown provider',
            description: 'OpenAI-compatible custom connection.',
            category: 'custom'
        } : {
            name: (providerData as any).name ?? (providerData as any).displayName ?? 'Unknown provider',
            description: (providerData as any).description ?? 'Configure this provider connection and model catalog.',
            category: (providerData as any).category ?? 'cloud'
        };

        return (
            <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-4 mb-4 px-6 pt-4">
                    <WorkbenchButton 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg hover:bg-muted"
                        onClick={() => setSelectedProviderId(null)}
                    >
                        <WorkbenchIcon name="lucide:chevron-left" size={14} />
                    </WorkbenchButton>
                    <div className="h-9 w-9 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-center shrink-0">
                        {PROVIDER_ICONS[selectedProviderId] || <WorkbenchIcon name={isCustom ? "lucide:network" : "lucide:cpu"} size={20} className="text-primary" />}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base font-bold tracking-tight text-foreground truncate leading-tight">{displayData.name}</h3>
                        <p className="text-xs text-muted-foreground">{displayData.description}</p>
                    </div>
                </div>

                <ScrollArea className="flex-1 px-8 pb-12">
                    <div className="max-w-2xl flex flex-col gap-8">
                        {isCustom ? (
                            <CustomProviderConfig
                                providerId={selectedProviderId}
                                displayName={(providerData as any).displayName ?? (providerData as any).name ?? 'Custom Node'}
                                baseUrl={(providerData as any).baseUrl ?? ''}
                                apiKey={(providerData as any).apiKey}
                                headers={(providerData as any).headers}
                                customModels={(providerData as any).customModels}
                            />
                        ) : (
                            <>
                                {(providerData as any).requiresKey && (
                                    <ApiKeyConfig
                                        providerKey={selectedProviderId}
                                        displayName={(providerData as any).name}
                                    />
                                )}
                                {(providerData as any).baseUrl || PROVIDER_BASE_URL_MAP[selectedProviderId] ? (
                                    <EndpointConfig
                                        providerKey={selectedProviderId}
                                        displayName={(providerData as any).name}
                                    />
                                ) : null}
                            </>
                        )}

                        {selectedProviderId === 'nine_router' && (
                            <div className="p-4 rounded-xl border border-border bg-muted/30 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center gap-2 border-b border-border pb-2">
                                    <WorkbenchIcon name="lucide:brush" size={14} className="text-primary" />
                                    <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Image Generation Gateway (9Router)</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Image Gen Provider</label>
                                        <WorkbenchSelect
                                            value={providerParams.imageProvider || ''}
                                            onValueChange={(val) => updateProviderParams('nine_router', { imageProvider: val })}
                                            className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
                                            options={[
                                                { value: "", label: "No provider selected (Uses 9Router default)" },
                                                { value: "openai", label: "OpenAI" },
                                                { value: "together", label: "Together AI" },
                                                { value: "siliconflow", label: "SiliconFlow" },
                                                { value: "novita", label: "Novita AI" },
                                                { value: "sdwebui", label: "Stable Diffusion WebUI" },
                                                { value: "comfyui", label: "ComfyUI" }
                                            ]}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Image Gen Model</label>
                                            <button
                                                type="button"
                                                onClick={() => void fetchNineRouterImageModelsAction(true)}
                                                className="flex items-center gap-1 text-[9px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                                                title="Refresh available models from 9Router"
                                            >
                                                <WorkbenchIcon name="lucide:refresh-cw" size={10} className={nineRouterImageModelsLoading ? 'animate-spin' : ''} />
                                                <span>{nineRouterImageModelsLoading ? 'Loading...' : 'Refresh'}</span>
                                            </button>
                                        </div>
                                        {nineRouterImageModelsLoading && nineRouterImageModels.length === 0 ? (
                                            <WorkbenchSelect
                                                value=""
                                                onValueChange={() => {}}
                                                className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
                                                options={[{ value: "", label: 'Fetching models from 9Router...' }]}
                                            />
                                        ) : nineRouterImageModelsError ? (
                                            <div className="flex flex-col gap-1.5">
                                                <div className="h-8 text-[10px] text-warning/60 bg-warning/5 border border-warning/10 rounded px-2 flex items-center">
                                                    <WorkbenchIcon name="lucide:alert-triangle" size={10} className="mr-1.5 shrink-0" />
                                                    <span className="truncate">9Router unreachable — type model manually</span>
                                                </div>
                                                <WorkbenchInput
                                                    value={providerParams.imageGenModel || ''}
                                                    placeholder="e.g., openrouter/black-forest-labs/FLUX.1-schnell"
                                                    onChangeText={(val) => updateProviderParams('nine_router', { imageGenModel: val })}
                                                    className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono px-2"
                                                />
                                            </div>
                                        ) : nineRouterImageModels.length > 0 ? (
                                            <WorkbenchSelect
                                                value={providerParams.imageGenModel || ''}
                                                onValueChange={(val) => updateProviderParams('nine_router', { imageGenModel: val })}
                                                className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
                                                options={[
                                                    { value: "", label: 'No model selected' },
                                                    ...nineRouterImageModels.map((m) => ({
                                                        value: m.id,
                                                        label: m.name || m.id,
                                                    })),
                                                ]}
                                            />
                                        ) : (
                                            <div className="flex flex-col gap-1.5">
                                                <WorkbenchInput
                                                    value={providerParams.imageGenModel || ''}
                                                    placeholder="e.g., openrouter/black-forest-labs/FLUX.1-schnell"
                                                    onChangeText={(val) => updateProviderParams('nine_router', { imageGenModel: val })}
                                                    className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono px-2"
                                                />
                                                <p className="text-[9px] text-muted-foreground/50">No models discovered. Ensure 9Router is running with image providers configured.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedProviderId === 'aihubmix' && (
                            <div className="p-4 rounded-xl border border-border bg-muted/30 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center gap-2 border-b border-border pb-2">
                                    <WorkbenchIcon name="lucide:sliders" size={14} className="text-pink-400" />
                                    <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Gateway Model Mappings</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Embeddings Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.embeddingModel || ''}
                                            onValueChange={(val) => updateProviderParams('aihubmix', { embeddingModel: val })}
                                            className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
                                            options={[
                                                { value: "", label: "No model selected" },
                                                { value: "text-embedding-3-small", label: "text-embedding-3-small" },
                                                { value: "text-embedding-3-large", label: "text-embedding-3-large" },
                                                { value: "text-embedding-ada-002", label: "text-embedding-ada-002" }
                                            ]}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Image Generator Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.imageModel || ''}
                                            onValueChange={(val) => updateProviderParams('aihubmix', { imageModel: val })}
                                            className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
                                            options={[
                                                { value: "", label: "No model selected" },
                                                { value: "dall-e-3", label: "DALL-E 3 (Premium)" },
                                                { value: "dall-e-2", label: "DALL-E 2" },
                                                { value: "midjourney", label: "Midjourney API" },
                                                { value: "flux-schnell", label: "Flux Schnell" }
                                            ]}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Speech-to-Text Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.sttModel || ''}
                                            onValueChange={(val) => updateProviderParams('aihubmix', { sttModel: val })}
                                            className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
                                            options={[
                                                { value: "", label: "No model selected" },
                                                { value: "whisper-1", label: "Whisper v1" },
                                                { value: "whisper-large-v3", label: "Whisper Large v3" }
                                            ]}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Text-to-Speech Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.ttsModel || ''}
                                            onValueChange={(val) => updateProviderParams('aihubmix', { ttsModel: val })}
                                            className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
                                            options={[
                                                { value: "", label: "No model selected" },
                                                { value: "tts-1", label: "TTS OpenAI v1" },
                                                { value: "tts-1-hd", label: "TTS OpenAI HD" }
                                            ]}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedProviderId === 'nine_router' && (
                            <div className="p-4 rounded-xl border border-border bg-muted/30 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center gap-2 border-b border-border pb-2">
                                    <WorkbenchIcon name="lucide:sliders" size={14} className="text-primary" />
                                    <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">Proxy Capabilities Config</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Embeddings Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.embeddingModel || ''}
                                            onValueChange={(val) => updateProviderParams('nine_router', { embeddingModel: val })}
                                            className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
                                            options={[
                                                { value: "", label: "No model selected" },
                                                { value: "nomic-embed-text", label: "Nomic Embed Text (Local)" },
                                                { value: "bge-large-en-v1.5", label: "BGE Large English" },
                                                { value: "text-embedding-3-small", label: "text-embedding-3-small" }
                                            ]}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Image Generator Model</label>
                                            <button
                                                type="button"
                                                onClick={() => void fetchNineRouterImageModelsAction(true)}
                                                className="flex items-center gap-1 text-[9px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                                                title="Refresh available models from 9Router"
                                            >
                                                <WorkbenchIcon name="lucide:refresh-cw" size={10} className={nineRouterImageModelsLoading ? 'animate-spin' : ''} />
                                                <span>{nineRouterImageModelsLoading ? 'Loading...' : 'Refresh'}</span>
                                            </button>
                                        </div>
                                        {nineRouterImageModelsLoading && nineRouterImageModels.length === 0 ? (
                                            <WorkbenchSelect
                                                value=""
                                                onValueChange={() => {}}
                                                className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
                                                options={[{ value: "", label: 'Fetching models from 9Router...' }]}
                                            />
                                        ) : nineRouterImageModelsError ? (
                                            <div className="flex flex-col gap-1.5">
                                                <div className="h-8 text-[10px] text-warning/60 bg-warning/5 border border-warning/10 rounded px-2 flex items-center">
                                                    <WorkbenchIcon name="lucide:alert-triangle" size={10} className="mr-1.5 shrink-0" />
                                                    <span className="truncate">9Router unreachable — type model manually</span>
                                                </div>
                                                <WorkbenchInput
                                                    value={providerParams.imageGenModel || ''}
                                                    placeholder="e.g., openrouter/black-forest-labs/FLUX.1-schnell"
                                                    onChangeText={(val) => updateProviderParams('nine_router', { imageGenModel: val })}
                                                    className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono px-2"
                                                />
                                            </div>
                                        ) : nineRouterImageModels.length > 0 ? (
                                            <WorkbenchSelect
                                                value={providerParams.imageGenModel || ''}
                                                onValueChange={(val) => updateProviderParams('nine_router', { imageGenModel: val })}
                                                className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
                                                options={[
                                                    { value: "", label: 'No model selected' },
                                                    ...nineRouterImageModels.map((m) => ({
                                                        value: m.id,
                                                        label: m.name || m.id,
                                                    })),
                                                ]}
                                            />
                                        ) : (
                                            <div className="flex flex-col gap-1.5">
                                                <WorkbenchInput
                                                    value={providerParams.imageGenModel || ''}
                                                    placeholder="e.g., openrouter/black-forest-labs/FLUX.1-schnell"
                                                    onChangeText={(val) => updateProviderParams('nine_router', { imageGenModel: val })}
                                                    className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono px-2"
                                                />
                                                <p className="text-[9px] text-muted-foreground/50">No models discovered. Ensure 9Router is running with image providers configured.</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1.5 col-span-2">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Web Search Strategy & Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.searchModel || ''}
                                            onValueChange={(val) => updateProviderParams('nine_router', { searchModel: val })}
                                            className="h-8 text-[11px] bg-muted/40 border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
                                            options={[
                                                { value: "", label: "No model selected" },
                                                { value: "kr/claude-sonnet-4.5", label: "kr/claude-sonnet-4.5 (Smart Discovery)" },
                                                { value: "perplexity/sonar", label: "perplexity/sonar (Online Agentic)" },
                                                { value: "google/gemini-2.0-flash-exp", label: "google/gemini-2.0-flash-exp" },
                                                { value: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini (Speed Optimized)" }
                                            ]}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="h-px bg-muted/50" />

                        <ProviderParamsConfig providerKey={selectedProviderId} />

                        <div className="h-px bg-muted/50" />

                        <ModelConfig
                            providerKey={selectedProviderId}
                            displayName={displayData.name}
                            requiresKey={(providerData as any).requiresKey || false}
                            isLocal={(providerData as any).isLocal || false}
                            apiKeyPresent={isCustom
                                ? Boolean((providerData as any).apiKey)
                                : Boolean((() => {
                                    const keyField = PROVIDER_KEY_MAP[selectedProviderId];
                                    return keyField ? (useSettingsStore.getState() as any)[keyField] : true;
                                })())}
                        />

                        <ProviderUsagePanel models={availableModelsByProvider[selectedProviderId] || []} />

                        <ConnectionStatus providerKey={selectedProviderId} providerName={displayData.name} />
                    </div>
                </ScrollArea>
            </div>
        );
    }

    return (
        <ProviderGallery
            filteredCategories={filteredCategories}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            getProviderStatus={getProviderStatus}
            getModelCount={(id) => availableModelsByProvider[id]?.length || 0}
            onProviderClick={handleProviderClick}
            onAddCustom={() => setIsAddingCustom(true)}
            onRefresh={() => { void fetchModels(undefined, true); }}
            refreshing={fetchingModels}
        />
    );
});

// Minimal ScrollArea component since we don't have the shadcn one handy or it might be different
const ScrollArea = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("overflow-y-auto custom-scrollbar", className)}>
        {children}
    </div>
);

export default ProvidersSettings;
