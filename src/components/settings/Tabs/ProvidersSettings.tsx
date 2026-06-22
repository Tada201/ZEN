import React, { useState, memo, useCallback, useMemo } from 'react';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';
import { providerOrder, PROVIDER_KEY_MAP } from '@/lib/types/provider';
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
    { id: 'cloud', label: 'Cloud Intelligence', providers: ['opencode', 'openai', 'anthropic', 'google', 'xai', 'mistral', 'groq', 'perplexity', 'deepseek', 'openrouter', 'together', 'kilo', 'aihubmix'] },
    { id: 'local', label: 'Local & Private', providers: ['ollama', 'lmstudio', 'nine_router'] },
    { id: 'custom', label: 'Custom Nodes', providers: [] },
];

export const ProvidersSettings = memo(() => {
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

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
    }, [fetchModels]);

    const getProviderStatus = useCallback((id: string) => {
        const state = useSettingsStore.getState();
        const status = connectionStatuses[id];
        if (status === 'success') return 'active';
        if (status === 'error') return 'failed';
        
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
    }, [connectionStatuses]);

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
            setAddForm(prev => ({ 
                ...prev, 
                testStatus: models && models.length > 0 ? 'success' : 'error',
                discoveredModels: models || []
            }));
        } catch (err) {
            setAddForm(prev => ({ ...prev, testStatus: 'error', discoveredModels: [], validationError: err instanceof Error ? err.message : String(err) }));
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
            await addCustomProvider({
                displayName: addForm.displayName,
                baseUrl: addForm.baseUrl,
                apiKey: addForm.apiKey,
                headers,
                customModels: addForm.discoveredModels.length ? addForm.discoveredModels : manualModels,
            } as any);
            setIsAddingCustom(false);
            setAddForm({ displayName: '', baseUrl: '', apiKey: '', headersText: '', manualModels: '', testStatus: 'idle', discoveredModels: [], validationError: null });
        } catch (err) {
            setAddForm(prev => ({ ...prev, validationError: err instanceof Error ? err.message : String(err) }));
        }
    }, [addForm, addCustomProvider]);

    if (isAddingCustom) {
        return (
            <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-4 mb-4 px-6 pt-4">
                    <WorkbenchButton 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg hover:bg-white/[0.05]"
                        onClick={() => setIsAddingCustom(false)}
                    >
                        <WorkbenchIcon name="lucide:chevron-left" size={14} />
                    </WorkbenchButton>
                    <div className="h-9 w-9 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-center justify-center">
                        <WorkbenchIcon name="lucide:plus" size={18} className="text-blue-400" />
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
                                className="h-11 bg-white/[0.03] border-white/[0.08] rounded-xl"
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
                                className="h-11 font-mono text-xs bg-white/[0.03] border-white/[0.08] rounded-xl"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-foreground">API key <span className="font-normal text-muted-foreground">(optional)</span></label>
                            <WorkbenchInput
                                type="password"
                                value={addForm.apiKey}
                                placeholder="sk-..."
                                onChangeText={(val) => setAddForm(prev => ({ ...prev, apiKey: val }))}
                                className="h-11 font-mono text-xs bg-white/[0.03] border-white/[0.08] rounded-xl"
                            />
                        </div>

                        {addForm.testStatus !== 'idle' && (
                            <div className={cn(
                                "p-3 rounded-xl border flex items-center gap-3",
                                addForm.testStatus === 'testing' && "bg-amber-500/5 border-amber-500/10 text-amber-400",
                                addForm.testStatus === 'success' && "bg-emerald-500/5 border-emerald-500/10 text-emerald-400",
                                addForm.testStatus === 'error' && "bg-red-500/5 border-red-500/10 text-red-400"
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
                            <div className="rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-300">
                                {addForm.validationError}
                            </div>
                        )}

                        <div className="flex gap-3 mt-10">
                            <WorkbenchButton
                                variant="secondary"
                                className="flex-1 h-10 rounded-xl font-bold bg-white/[0.03] border-white/[0.08]"
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
        
        const isCustom = !providerOrder.find(p => p.key === selectedProviderId);
        const displayData = isCustom ? {
            name: (providerData as any).displayName,
            category: 'custom'
        } : {
            name: (providerData as any).name,
            category: (providerData as any).category
        };

        return (
            <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-4 mb-4 px-6 pt-4">
                    <WorkbenchButton 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg hover:bg-white/[0.05]"
                        onClick={() => setSelectedProviderId(null)}
                    >
                        <WorkbenchIcon name="lucide:chevron-left" size={14} />
                    </WorkbenchButton>
                    <div className="h-9 w-9 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-center justify-center shrink-0">
                        {PROVIDER_ICONS[selectedProviderId] || <WorkbenchIcon name={isCustom ? "lucide:network" : "lucide:cpu"} size={20} className="text-blue-400" />}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base font-bold tracking-tight text-white/90 truncate leading-tight">{displayData.name}</h3>
                        <p className="text-xs text-muted-foreground">Provider configuration</p>
                    </div>
                </div>

                <ScrollArea className="flex-1 px-8 pb-12">
                    <div className="max-w-2xl flex flex-col gap-8">
                        {isCustom ? (
                            <CustomProviderConfig
                                providerId={selectedProviderId}
                                displayName={(providerData as any).displayName}
                                baseUrl={(providerData as any).baseUrl}
                                apiKey={(providerData as any).apiKey}
                                headers={(providerData as any).headers}
                            />
                        ) : (
                            <>
                                {(providerData as any).requiresKey && (
                                    <ApiKeyConfig
                                        providerKey={selectedProviderId}
                                        displayName={(providerData as any).name}
                                    />
                                )}
                                {(providerData as any).isLocal && (
                                    <EndpointConfig
                                        providerKey={selectedProviderId}
                                        displayName={(providerData as any).name}
                                    />
                                )}
                            </>
                        )}

                        {selectedProviderId === 'aihubmix' && (
                            <div className="p-4 rounded-xl border border-white/[0.04] bg-white/[0.02] flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center gap-2 border-b border-white/[0.04] pb-2">
                                    <WorkbenchIcon name="lucide:sliders" size={14} className="text-pink-400" />
                                    <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Gateway Model Mappings</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Embeddings Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.embeddingModel || ''}
                                            onValueChange={(val) => updateProviderParams('aihubmix', { embeddingModel: val })}
                                            className="h-8 text-[11px] bg-white/[0.03] border-white/[0.08] rounded focus:outline-none focus:border-blue-500/50 text-blue-400 font-mono"
                                            options={[
                                                { value: "", label: "No model selected" },
                                                { value: "text-embedding-3-small", label: "text-embedding-3-small" },
                                                { value: "text-embedding-3-large", label: "text-embedding-3-large" },
                                                { value: "text-embedding-ada-002", label: "text-embedding-ada-002" }
                                            ]}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Image Generator Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.imageModel || ''}
                                            onValueChange={(val) => updateProviderParams('aihubmix', { imageModel: val })}
                                            className="h-8 text-[11px] bg-white/[0.03] border-white/[0.08] rounded focus:outline-none focus:border-blue-500/50 text-blue-400 font-mono"
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
                                        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Speech-to-Text Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.sttModel || ''}
                                            onValueChange={(val) => updateProviderParams('aihubmix', { sttModel: val })}
                                            className="h-8 text-[11px] bg-white/[0.03] border-white/[0.08] rounded focus:outline-none focus:border-blue-500/50 text-blue-400 font-mono"
                                            options={[
                                                { value: "", label: "No model selected" },
                                                { value: "whisper-1", label: "Whisper v1" },
                                                { value: "whisper-large-v3", label: "Whisper Large v3" }
                                            ]}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Text-to-Speech Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.ttsModel || ''}
                                            onValueChange={(val) => updateProviderParams('aihubmix', { ttsModel: val })}
                                            className="h-8 text-[11px] bg-white/[0.03] border-white/[0.08] rounded focus:outline-none focus:border-blue-500/50 text-blue-400 font-mono"
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
                            <div className="p-4 rounded-xl border border-white/[0.04] bg-white/[0.02] flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center gap-2 border-b border-white/[0.04] pb-2">
                                    <WorkbenchIcon name="lucide:sliders" size={14} className="text-blue-400" />
                                    <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Proxy Capabilities Config</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Embeddings Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.embeddingModel || ''}
                                            onValueChange={(val) => updateProviderParams('nine_router', { embeddingModel: val })}
                                            className="h-8 text-[11px] bg-white/[0.03] border-white/[0.08] rounded focus:outline-none focus:border-blue-500/50 text-blue-400 font-mono"
                                            options={[
                                                { value: "", label: "No model selected" },
                                                { value: "nomic-embed-text", label: "Nomic Embed Text (Local)" },
                                                { value: "bge-large-en-v1.5", label: "BGE Large English" },
                                                { value: "text-embedding-3-small", label: "text-embedding-3-small" }
                                            ]}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Image Generator Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.imageModel || ''}
                                            onValueChange={(val) => updateProviderParams('nine_router', { imageModel: val })}
                                            className="h-8 text-[11px] bg-white/[0.03] border-white/[0.08] rounded focus:outline-none focus:border-blue-500/50 text-blue-400 font-mono"
                                            options={[
                                                { value: "", label: "No model selected" },
                                                { value: "flux", label: "Flux (Local Standard)" },
                                                { value: "dall-e-3", label: "DALL-E 3 (Cloud Fallback)" },
                                                { value: "stable-diffusion-xl", label: "SDXL (Local)" }
                                            ]}
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1.5 col-span-2">
                                        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Web Search Strategy & Model</label>
                                        <WorkbenchSelect
                                            value={providerParams.searchModel || ''}
                                            onValueChange={(val) => updateProviderParams('nine_router', { searchModel: val })}
                                            className="h-8 text-[11px] bg-white/[0.03] border-white/[0.08] rounded focus:outline-none focus:border-blue-500/50 text-blue-400 font-mono"
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

                        <div className="h-px bg-white/[0.04]" />

                        <ProviderParamsConfig providerKey={selectedProviderId} />

                        <div className="h-px bg-white/[0.04]" />

                        <ModelConfig
                            providerKey={selectedProviderId}
                            displayName={displayData.name}
                            requiresKey={(providerData as any).requiresKey || false}
                            isLocal={(providerData as any).isLocal || false}
                            apiKeyPresent={true} // Simplified for now
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
            onRefresh={() => { void fetchModels(); }}
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
