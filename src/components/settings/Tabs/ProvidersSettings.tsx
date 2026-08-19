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
import { presentExecutionError } from '@/atlas/agentRuntime/executionError';
import { ConnectionStatus } from './providers/ConnectionStatus';
import { ProviderParamsConfig } from './providers/ProviderParamsConfig';
import { ProviderGallery } from './providers/ProviderGallery';
import { ProviderUsagePanel } from './providers/ProviderUsagePanel';
import { providersApi } from '@/api';

const CATEGORY_LABELS: Record<string, string> = {
    cloud: 'Cloud Intelligence',
    local: 'Local & Private',
    custom: 'Custom providers',
};

function statusLabelForDetail(status: string): string {
    if (status === 'active') return 'Connected';
    if (status === 'failed') return 'Connection failed';
    if (status === 'configured') return 'Configured';
    if (status === 'disabled') return 'Disabled';
    return 'Not configured';
}

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
        apiFormat: 'openai_chat' as 'openai_chat' | 'anthropic_messages',
        headersText: '',
        manualModels: '',
        testStatus: 'idle' as 'idle' | 'testing' | 'success' | 'error',
        discoveredModels: [] as any[],
        validationError: null as string | null,
    });

    // Filtered categories and providers
    const filteredCategories = useMemo(() => {
        const runtimeProviders = providerCatalog.map(entry => {
            const fallback = providerOrder.find(provider => provider.key === entry.id);
            return {
                id: entry.id,
                label: entry.displayName || fallback?.name || entry.id,
                description: entry.description || fallback?.description,
                icon: fallback?.icon,
                category: entry.category || fallback?.category || (entry.isLocal ? 'local' : 'cloud'),
                isLocal: entry.isLocal,
                configured: entry.configured,
                apiKeyPresent: entry.apiKeyPresent,
                isCustom: entry.category === 'custom',
            };
        });
        const fallbackProviders = providerOrder.map(provider => ({
            id: provider.key,
            label: provider.name,
            description: provider.description,
            icon: provider.icon,
            category: provider.category || (provider.isLocal ? 'local' : 'cloud'),
            isLocal: provider.isLocal,
            configured: false,
            apiKeyPresent: false,
            isCustom: false,
        }));
        const catalogProviders = providerCatalog.length > 0 ? runtimeProviders : fallbackProviders;
        const knownIds = new Set(catalogProviders.map(provider => provider.id));
        const customOnlyProviders = customProviders
            .filter(provider => !knownIds.has(provider.id))
            .map(provider => ({
                id: provider.id,
                label: provider.displayName,
                description: 'OpenAI-compatible custom connection.',
                icon: provider.icon?.trim() || 'lucide:network',
                category: 'custom',
                isLocal: false,
                configured: true,
                apiKeyPresent: Boolean(provider.apiKey),
                isCustom: true,
            }));
        const allProviders = [...catalogProviders, ...customOnlyProviders];
        const categoryIds = Array.from(new Set(allProviders.map(provider => provider.category)));
        return categoryIds.map(categoryId => {
            const providers = allProviders
                .filter(provider => provider.category === categoryId)
                .map(({ category: _category, ...provider }) => provider);

            const filtered = providers.filter(p => 
                p.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
                p.id.toLowerCase().includes(searchQuery.toLowerCase())
            );

            return {
                id: categoryId,
                label: CATEGORY_LABELS[categoryId] || `${categoryId[0]?.toUpperCase() || ''}${categoryId.slice(1)} Providers`,
                providers: filtered,
            };
        }).filter(cat => cat.providers.length > 0);
    }, [providerCatalog, searchQuery, customProviders]);

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
                displayName: addForm.displayName || 'Custom provider',
                headers,
                apiFormat: addForm.apiFormat,
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
            toast.error(`Custom provider test failed: ${presentExecutionError(err, { context: "transport" }).summary}`);
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
                apiFormat: addForm.apiFormat,
                customModels: addForm.discoveredModels.length ? addForm.discoveredModels : manualModels,
            });
            useSettingsStore.setState(state => ({
                connectionStatuses: { ...state.connectionStatuses, [newId]: 'success' },
            }));
            void useSettingsStore.getState().fetchModels(newId);
            setIsAddingCustom(false);
            setAddForm({ displayName: '', baseUrl: '', apiKey: '', apiFormat: 'openai_chat', headersText: '', manualModels: '', testStatus: 'idle', discoveredModels: [], validationError: null });
            toast.success(`Custom provider "${addForm.displayName}" registered.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setAddForm(prev => ({ ...prev, validationError: message }));
            toast.error(`Could not register provider: ${presentExecutionError(err, { context: "transport" }).summary}`);
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
                                className="h-11 bg-background border-border rounded-xl"
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

                        <details className="rounded-md border border-border bg-background p-3">
                            <summary className="cursor-pointer text-[12px] font-medium text-foreground">Advanced headers</summary>
                            <textarea
                                value={addForm.headersText}
                                onChange={(event) => setAddForm(prev => ({ ...prev, headersText: event.target.value, testStatus: 'idle', validationError: null }))}
                                placeholder={'anthropic-version: 2023-06-01\nX-Organization: example'}
                                className="mt-3 min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground outline-none focus:border-primary/50"
                            />
                        </details>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-foreground">API format</label>
                            <WorkbenchSelect
                                value={addForm.apiFormat}
                                onValueChange={(val) => setAddForm(prev => ({ ...prev, apiFormat: val as typeof prev.apiFormat, testStatus: 'idle', validationError: null }))}
                                className="h-11 bg-background border-border rounded-xl"
                                options={[
                                    { value: 'openai_chat', label: 'OpenAI Chat Completions' },
                                    { value: 'anthropic_messages', label: 'Anthropic Messages' },
                                ]}
                            />
                            <p className="text-[11px] text-muted-foreground">Wire protocol the endpoint speaks.</p>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-foreground">Endpoint URL</label>
                            <WorkbenchInput
                                value={addForm.baseUrl}
                                placeholder="https://api.domain.ai/v1"
                                onChangeText={(val) => setAddForm(prev => ({ ...prev, baseUrl: val, validationError: null }))}
                                className="h-11 font-mono text-xs bg-background border-border rounded-xl"
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
                                    className="h-11 font-mono text-xs bg-background border-border rounded-xl"
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
                                    {addForm.testStatus === 'testing' ? 'Testing connection…' : addForm.testStatus === 'success' ? 'Connection ready' : 'Connection failed'}
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
                                className="flex-1 h-10 rounded-xl font-bold bg-background border-border"
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
                                Add provider
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
                           customProviders.find(cp => cp.id === selectedProviderId) ||
                           providerCatalog.find(provider => provider.id === selectedProviderId);

        if (!providerData) {
            // Selected provider was deleted; return to the gallery instead of
            // dereferencing undefined metadata.
            setSelectedProviderId(null);
            return null;
        }

        const runtimeProvider = providerCatalog.find(provider => provider.id === selectedProviderId);
        const isCustom = Boolean(customProviders.find(provider => provider.id === selectedProviderId))
            || runtimeProvider?.category === 'custom';
        const displayData = isCustom ? {
            name: (providerData as any).displayName ?? (providerData as any).name ?? 'Unknown provider',
            description: 'OpenAI-compatible custom connection.',
            category: 'custom'
        } : {
            name: (providerData as any).name ?? (providerData as any).displayName ?? runtimeProvider?.displayName ?? 'Unknown provider',
            description: (providerData as any).description ?? runtimeProvider?.description ?? 'Configure this provider connection and model catalog.',
            category: (providerData as any).category ?? runtimeProvider?.category ?? 'cloud'
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
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="rounded border border-border px-1.5 py-0.5 uppercase tracking-[0.08em]">
                                {displayData.category}
                            </span>
                            {runtimeProvider?.baseUrl && (
                                <span className="max-w-[34rem] truncate font-mono" title={runtimeProvider.baseUrl}>
                                    {runtimeProvider.baseUrl}
                                </span>
                            )}
                            <span className={cn(
                                "rounded-full px-1.5 py-0.5",
                                getProviderStatus(selectedProviderId) === 'active' && "bg-success/10 text-success",
                                getProviderStatus(selectedProviderId) === 'failed' && "bg-destructive/10 text-destructive",
                                !['active', 'failed'].includes(getProviderStatus(selectedProviderId)) && "bg-muted text-muted-foreground"
                            )}>
                                {statusLabelForDetail(getProviderStatus(selectedProviderId))}
                            </span>
                        </div>
                    </div>
                </div>

                <ScrollArea className="flex-1 px-8 pb-12">
                    <div className="max-w-2xl flex flex-col gap-8">
                        {isCustom ? (
                            <CustomProviderConfig
                                providerId={selectedProviderId}
                                displayName={(providerData as any).displayName ?? (providerData as any).name ?? 'Custom provider'}
                                baseUrl={(providerData as any).baseUrl ?? ''}
                                apiKey={(providerData as any).apiKey}
                                headers={(providerData as any).headers}
                                apiFormat={(providerData as any).apiFormat}
                                icon={(providerData as any).icon}
                                customModels={(providerData as any).customModels}
                            />
                        ) : (
                            <>
                                {((providerData as any).requiresKey || runtimeProvider?.requiresKey) && (
                                    <ApiKeyConfig
                                        providerKey={selectedProviderId}
                                        displayName={displayData.name}
                                        settingKey={runtimeProvider?.apiKeyKey}
                                        initialPresent={runtimeProvider?.apiKeyPresent}
                                    />
                                )}
                                {(providerData as any).baseUrl || PROVIDER_BASE_URL_MAP[selectedProviderId] ? (
                                    <EndpointConfig
                                        providerKey={selectedProviderId}
                                        displayName={displayData.name}
                                        settingKey={runtimeProvider?.baseUrlKey}
                                        initialValue={runtimeProvider?.baseUrl || (providerData as any).baseUrl || ''}
                                    />
                                ) : null}
                            </>
                        )}

                        {selectedProviderId === 'nine_router' && (
                            <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                                            className="h-8 text-[11px] bg-background border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
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
                                                className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
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
                                                className="h-8 text-[11px] bg-background border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
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
                                                    className="h-8 text-[11px] bg-background border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono px-2"
                                                />
                                            </div>
                                        ) : nineRouterImageModels.length > 0 ? (
                                            <WorkbenchSelect
                                                value={providerParams.imageGenModel || ''}
                                                onValueChange={(val) => updateProviderParams('nine_router', { imageGenModel: val })}
                                                className="h-8 text-[11px] bg-background border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
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
                                                    className="h-8 text-[11px] bg-background border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono px-2"
                                                />
                                                <p className="text-[9px] text-muted-foreground">No models discovered. Ensure 9Router is running with image providers configured.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedProviderId === 'nine_router' && (
                            <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                                            className="h-8 text-[11px] bg-background border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
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
                                                className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
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
                                                className="h-8 text-[11px] bg-background border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
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
                                                    className="h-8 text-[11px] bg-background border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono px-2"
                                                />
                                            </div>
                                        ) : nineRouterImageModels.length > 0 ? (
                                            <WorkbenchSelect
                                                value={providerParams.imageGenModel || ''}
                                                onValueChange={(val) => updateProviderParams('nine_router', { imageGenModel: val })}
                                                    className="h-8 text-[11px] bg-background border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
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
                                                    className="h-8 text-[11px] bg-background border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono px-2"
                                                />
                                                <p className="text-[9px] text-muted-foreground">No models discovered. Ensure 9Router is running with image providers configured.</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1.5 col-span-2">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Web Search Strategy & Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.searchModel || ''}
                                            onValueChange={(val) => updateProviderParams('nine_router', { searchModel: val })}
                                            className="h-8 text-[11px] bg-background border-border rounded focus:outline-none focus:border-primary/50 text-primary font-mono"
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
                            requiresKey={Boolean((providerData as any).requiresKey || runtimeProvider?.requiresKey)}
                            isLocal={Boolean((providerData as any).isLocal || runtimeProvider?.isLocal)}
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
