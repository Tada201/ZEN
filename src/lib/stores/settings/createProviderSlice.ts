import type { StateCreator } from "zustand";
import { isSecretPresentValue, providersApi, SECRET_PRESENT_VALUE, settingsApi } from "@/api";
import type { SettingsState, ProviderSlice } from "./types";
import { DIRECT_PROVIDER_URLS } from "./types";
import { ModelInfo, CustomProviderConfig, PROVIDER_KEY_MAP, PROVIDER_BASE_URL_MAP, providerOrder } from "../../types/provider";

const isLocalUrl = (url: string) => url.includes('localhost') || url.includes('127.0.0.1');
const MODEL_CACHE_KEY = 'zen:model-catalog:v1';
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
let modelFetchGeneration = 0;

function readCachedModels(): ModelInfo[] {
    if (typeof window === 'undefined') return [];
    try {
        const cached = JSON.parse(localStorage.getItem(MODEL_CACHE_KEY) || 'null') as { models?: ModelInfo[] } | null;
        return Array.isArray(cached?.models) ? cached.models.map(normalizeModelInfo) : [];
    } catch {
        return [];
    }
}

function isModelCacheFresh(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const cached = JSON.parse(localStorage.getItem(MODEL_CACHE_KEY) || 'null') as { timestamp?: number } | null;
        return typeof cached?.timestamp === 'number' && Date.now() - cached.timestamp < MODEL_CACHE_TTL_MS;
    } catch {
        return false;
    }
}

function writeCachedModels(models: ModelInfo[]) {
    if (typeof window === 'undefined' || models.length === 0) return;
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), models }));
}

const customProviderApiKeySetting = (id: string) => `${id}_api_key`;
const customProviderBaseUrlSetting = (id: string) => `${id}_base_url`;
type BackendModelInfo = ModelInfo & {
    maxContextLength?: number;
    supportsVision?: boolean;
    supportsTools?: boolean;
};

function metadataApiKey(value: string | undefined): string {
    return value && value.trim() ? SECRET_PRESENT_VALUE : "";
}

function normalizeProviderBaseUrl(value: string) {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Endpoint must use HTTP or HTTPS.');
    url.pathname = url.pathname.replace(/\/(models|chat\/completions)\/?$/, '').replace(/\/$/, '');
    return url.toString().replace(/\/$/, '');
}

function customProviderId(name: string, existingIds: Set<string>) {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
    let id = `custom-${base}`;
    let suffix = 2;
    while (existingIds.has(id)) id = `custom-${base}-${suffix++}`;
    return id;
}

async function syncCustomProviderBackendSettings(id: string, baseUrl?: string, apiKey?: string, headers?: Record<string, string>) {
    const settings: Record<string, string> = {};
    if (baseUrl !== undefined) settings[customProviderBaseUrlSetting(id)] = baseUrl;
    if (apiKey !== undefined && !isSecretPresentValue(apiKey)) {
        settings[customProviderApiKeySetting(id)] = apiKey;
    }
    if (headers !== undefined) settings[`${id}_headers`] = JSON.stringify(headers);
    if (Object.keys(settings).length === 0) return;
    await settingsApi.setSettings(settings);
}

function normalizeModelInfo(model: BackendModelInfo): ModelInfo {
    const capabilities = new Set(model.capabilities?.length ? model.capabilities : ["text"]);
    if (model.supportsVision) capabilities.add("vision");
    if (model.supportsTools) capabilities.add("tools");
    if (model.supportsReasoning) capabilities.add("reasoning");

    return {
        ...model,
        contextWindow: model.contextWindow ?? model.maxContextLength,
        capabilities: Array.from(capabilities),
    };
}

function groupModelsByProvider(models: ModelInfo[]): Record<string, ModelInfo[]> {
    return models.reduce<Record<string, ModelInfo[]>>((grouped, model) => {
        const provider = model.provider || "custom";
        grouped[provider] = [...(grouped[provider] || []), model];
        return grouped;
    }, {});
}

export const createProviderSlice: StateCreator<SettingsState, [], [], ProviderSlice> = (set, get) => ({
  openaiApiKey: "",
  anthropicApiKey: "",
  googleApiKey: "",
  groqApiKey: "",
  mistralApiKey: "",
  deepseekApiKey: "",
  openrouterApiKey: "",
  togetherApiKey: "",
  perplexityApiKey: "",
  geminiApiKey: "",
  qwenApiKey: "",
  xaiApiKey: "",
  kilocodeApiKey: "",
  nvidiaApiKey: "",
  nineRouterBaseUrl: "http://localhost:20128/v1",
  opencodeBaseUrl: "https://opencode.ai/zen/v1",
  nineRouterApiKey: "",
  aihubmixApiKey: "",
  ollamaBaseUrl: "http://localhost:11434",
  lmstudioBaseUrl: "http://localhost:1234",
  customProviders: [],
  agentConfigs: [],
  toolAutoApprove: [],
  
  availableModels: readCachedModels(),
  availableModelsByProvider: groupModelsByProvider(readCachedModels()),
  fetchingModels: false,
  connectionStatuses: {},
  testingConnections: {},

  fetchModels: async (providerOverride) => {
    const provider = providerOverride || get().activeProvider;
    const cachedProviderModels = get().availableModelsByProvider[provider] || [];
    if (!providerOverride && isModelCacheFresh() && get().availableModels.length > 0) {
        // Keep Atomic-style immediate hydration, then let explicit refreshes
        // invalidate or replace the cache instead of flashing an empty picker.
        return cachedProviderModels.map(model => model.id);
    }
    
    // Safety check: Don't fetch from cloud providers without an API key to avoid 401 noise
    const providerInfo = providerOrder.find(p => p.key === provider);
    if (providerInfo?.requiresKey) {
        const configKey = PROVIDER_KEY_MAP[provider];
        const key = configKey ? (get() as any)[configKey] : "";
        if (!key && !isSecretPresentValue(key)) {
            console.debug(`[fetchModels] Skipping ${provider} - No API key configured`);
            return [];
        }
    }

    const requestGeneration = ++modelFetchGeneration;
    set({ fetchingModels: true });
    try {
        const backendModels = (await providersApi.getAllAvailableModels(providerOverride || null))
          .map(m => normalizeModelInfo({ ...m, source: m.source || 'local' }));
        
        const customModels: ModelInfo[] = [];
        (get().customProviders || []).forEach(cp => {
            if (cp.enabled) {
                cp.customModels.forEach(m => {
                    customModels.push(normalizeModelInfo({
                        ...m,
                        provider: cp.id,
                        source: 'direct',
                        state: 'unloaded' as const
                    }));
                });
            }
        });

        const fetchedModels = [...backendModels, ...customModels];
        const allModels = providerOverride
            ? [
                ...get().availableModels.filter(model => model.provider !== providerOverride),
                ...fetchedModels,
              ]
            : fetchedModels;
        const groupedModels = groupModelsByProvider(allModels);

        // Provider-specific filtered view (for per-provider settings tabs)
        const perProvider = groupedModels[provider] || [];
        
        if (requestGeneration !== modelFetchGeneration) {
            return (groupedModels[provider] || []).map(model => model.id);
        }
        writeCachedModels(allModels);
        set({ 
            availableModels: allModels,
            availableModelsByProvider: groupedModels,
            fetchingModels: false 
        });

        return perProvider.map(m => m.id);
    } catch (err) {
        // Only log if it's not a common/expected error like 401 during setup
        const errMsg = String(err);
        if (!errMsg.includes('401') && !errMsg.includes('Unauthorized')) {
            console.error('Failed to fetch models:', err);
        }
        if (requestGeneration === modelFetchGeneration) set({ fetchingModels: false });
        return [];
    }
  },

  testProviderConnection: async (providerOverride) => {
    const state = get();
    const provider = providerOverride || state.activeProvider;
    
    if (state.testingConnections[provider]) {
        return;
    }

    set(s => ({ 
        connectionStatuses: { ...s.connectionStatuses, [provider]: 'idle' },
        testingConnections: { ...s.testingConnections, [provider]: true } 
    }));

    let baseUrl = '';
    let apiKey = '';
    let displayName = provider.charAt(0).toUpperCase() + provider.slice(1);
    let headers: Record<string, string> | undefined = undefined;

    const customProvider = (state.customProviders || []).find(cp => cp.id === provider);
    if (customProvider) {
        baseUrl = customProvider.baseUrl;
        apiKey = customProvider.apiKey;
        displayName = customProvider.displayName;
        headers = customProvider.headers;
    } else {
        const keyField = PROVIDER_KEY_MAP[provider];
        const urlField = PROVIDER_BASE_URL_MAP[provider];
        if (keyField) {
            apiKey = (state as any)[keyField] || '';
        }
        if (urlField) {
            baseUrl = (state as any)[urlField] || '';
        } else {
            baseUrl = DIRECT_PROVIDER_URLS[provider] || '';
        }
    }

    const isLocal = provider === 'ollama' || provider === 'lmstudio' || isLocalUrl(baseUrl);
    if (!isLocal && !apiKey && !customProvider) {
        set(s => ({ 
            connectionStatuses: { ...s.connectionStatuses, [provider]: 'error' },
            testingConnections: { ...s.testingConnections, [provider]: false } 
        }));
        return;
    }

        if (isSecretPresentValue(apiKey)) {
        try {
            const models = (await providersApi.getAllAvailableModels(provider)).map(normalizeModelInfo);
            set(s => ({
                availableModelsByProvider: { ...s.availableModelsByProvider, [provider]: models },
                connectionStatuses: { ...s.connectionStatuses, [provider]: models.length > 0 ? 'success' : 'error' },
                testingConnections: { ...s.testingConnections, [provider]: false },
            }));
        } catch {
            set(s => ({
                connectionStatuses: { ...s.connectionStatuses, [provider]: 'error' },
                testingConnections: { ...s.testingConnections, [provider]: false },
            }));
        }
        return;
    }

    const config = {
        providerType: provider,
        baseUrl: baseUrl,
        apiKey: apiKey as string,
        displayName: displayName,
        headers
    };
    
    try {
        const models = (await providersApi.testProviderConnection(config)).map(normalizeModelInfo);
        
        if (customProvider && models && models.length > 0) {
            const updatedCustomProviders = state.customProviders.map(cp =>
                cp.id === provider ? { ...cp, customModels: models } : cp
            );
            state.updateSetting({ customProviders: updatedCustomProviders } as any);
            set(s => ({
                availableModelsByProvider: { ...s.availableModelsByProvider, [provider]: models }
            }));
        }

        const success = models && models.length > 0;
        set(s => ({ 
            connectionStatuses: { ...s.connectionStatuses, [provider]: success ? 'success' : 'error' },
            testingConnections: { ...s.testingConnections, [provider]: false } 
        }));
    } catch (err) {
        set(s => ({ 
            connectionStatuses: { ...s.connectionStatuses, [provider]: 'error' },
            testingConnections: { ...s.testingConnections, [provider]: false } 
        }));
    }
  },

  addCustomProvider: async (config) => {
    const current = get().customProviders;
    if (current.some(provider => provider.displayName.trim().toLowerCase() === config.displayName.trim().toLowerCase())) {
        throw new Error(`A provider named "${config.displayName}" already exists.`);
    }
    const id = customProviderId(config.displayName, new Set(current.map(provider => provider.id)));
    const baseUrl = normalizeProviderBaseUrl(config.baseUrl);
    await syncCustomProviderBackendSettings(id, baseUrl, config.apiKey, config.headers || {});
    const newProvider: CustomProviderConfig = {
        ...config,
        id,
        baseUrl,
        apiKey: metadataApiKey(config.apiKey),
        enabled: true,
        customModels: config.customModels || []
    };
    get().updateSetting({ customProviders: [...current, newProvider] } as any);
    return id;
  },

  removeCustomProvider: async (id) => {
    const state = get();
    const current = state.customProviders;
    await syncCustomProviderBackendSettings(id, "", "", {});
    
    if (state.activeProvider === id) {
        const fallback = providerOrder.find(p => {
            const configKey = PROVIDER_KEY_MAP[p.key];
            if (!configKey) return true;
            if (configKey.endsWith('ApiKey')) return !!(state as any)[configKey];
            return true;
        })?.key || 'ollama';

        state.updateSetting({ activeProvider: fallback, activeModel: '' } as any);
    }
    
    state.updateSetting({ customProviders: current.filter(cp => cp.id !== id) } as any);
  },

  toggleCustomProvider: (id) => {
    const state = get();
    const current = state.customProviders;
    const providerToToggle = current.find(cp => cp.id === id);
    
    if (!providerToToggle) return;

    const willBeEnabled = !providerToToggle.enabled;

    if (!willBeEnabled && state.activeProvider === id) {
        const fallback = providerOrder.find(p => {
            const configKey = PROVIDER_KEY_MAP[p.key];
            if (!configKey) return true;
            if (configKey.endsWith('ApiKey')) return !!(state as any)[configKey];
            return true;
        })?.key || 'ollama';

        state.updateSetting({ 
            activeProvider: fallback,
            activeModel: '' 
        } as any);
    }

    state.updateSetting({ 
        customProviders: current.map(cp => cp.id === id ? { ...cp, enabled: willBeEnabled } : cp) 
    } as any);
  },

  updateCustomProvider: async (id, updates) => {
    const current = get().customProviders;
    const normalizedUpdates = {
        ...updates,
        ...(updates.baseUrl !== undefined ? { baseUrl: normalizeProviderBaseUrl(updates.baseUrl) } : {}),
    };
    if (normalizedUpdates.baseUrl !== undefined || normalizedUpdates.apiKey !== undefined || normalizedUpdates.headers !== undefined) {
        await syncCustomProviderBackendSettings(id, normalizedUpdates.baseUrl, normalizedUpdates.apiKey, normalizedUpdates.headers);
    }
    const publicUpdates = {
        ...normalizedUpdates,
        ...(normalizedUpdates.apiKey !== undefined
            ? { apiKey: isSecretPresentValue(normalizedUpdates.apiKey) ? SECRET_PRESENT_VALUE : metadataApiKey(normalizedUpdates.apiKey) }
            : {}),
    };
    get().updateSetting({ 
        customProviders: current.map(cp => cp.id === id ? { ...cp, ...publicUpdates } : cp)
    } as any);
  },

  syncModelCatalog: async () => {
    await get().fetchModels();
  },

  setDiscoveryMode: (enabled) => get().updateSetting({ discoveryMode: enabled } as any),
  setProviderError: (error) => set({ error } as any),
  setConnectionStatus: (provider: string, status: any) => set(s => ({
    connectionStatuses: { ...s.connectionStatuses, [provider]: status.status as any }
  })),
  setAvailableModels: (models: ModelInfo[]) => {
    const normalizedModels = models.map(normalizeModelInfo);
    set({
        availableModels: normalizedModels,
        availableModelsByProvider: groupModelsByProvider(normalizedModels),
    });
  },
});
