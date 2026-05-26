import type { StateCreator } from "zustand";
import { isSecretPresentValue, providersApi } from "@/api";
import type { SettingsState, ProviderSlice } from "./types";
import { DIRECT_PROVIDER_URLS } from "./types";
import { ModelInfo, CustomProviderConfig, PROVIDER_KEY_MAP, PROVIDER_BASE_URL_MAP, providerOrder } from "../../types/provider";

const isLocalUrl = (url: string) => url.includes('localhost') || url.includes('127.0.0.1');

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
  nineRouterApiKey: "",
  aihubmixApiKey: "",
  ollamaBaseUrl: "http://localhost:11434",
  lmstudioBaseUrl: "http://localhost:1234",
  customProviders: [],
  agentConfigs: [],
  toolAutoApprove: [],
  
  availableModels: [],
  availableModelsByProvider: {},
  fetchingModels: false,
  connectionStatuses: {},
  testingConnections: {},

  fetchModels: async (providerOverride) => {
    if (get().fetchingModels) return [];
    const provider = providerOverride || get().activeProvider;
    
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

    set({ fetchingModels: true });
    try {
        const backendModels = (await providersApi.getAllAvailableModels(providerOverride || null))
          .map(m => ({ ...m, source: m.source || 'local' }));
        
        const customModels: ModelInfo[] = [];
        (get().customProviders || []).forEach(cp => {
            if (cp.enabled) {
                cp.customModels.forEach(m => {
                    customModels.push({
                        ...m,
                        provider: cp.id,
                        source: 'direct',
                        state: 'unloaded' as const
                    });
                });
            }
        });

        const allModels = [...backendModels, ...customModels];
        const groupedModels: Record<string, ModelInfo[]> = {};
        
        allModels.forEach(m => {
            const p = m.provider || 'custom';
            if (!groupedModels[p]) groupedModels[p] = [];
            groupedModels[p].push(m);
        });

        // Provider-specific filtered view (for per-provider settings tabs)
        const perProvider = groupedModels[provider] || [];
        
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
        set({ fetchingModels: false });
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
            const models = await providersApi.getAllAvailableModels(provider);
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
        const models = await providersApi.testProviderConnection(config);
        
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

  addCustomProvider: (config) => {
    const id = `custom-${Date.now()}`;
    const newProvider: CustomProviderConfig = {
        ...config,
        id,
        enabled: true,
        customModels: config.customModels || []
    };
    const current = get().customProviders;
    get().updateSetting({ customProviders: [...current, newProvider] } as any);
  },

  removeCustomProvider: (id) => {
    const state = get();
    const current = state.customProviders;
    
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

  updateCustomProvider: (id, updates) => {
    const current = get().customProviders;
    get().updateSetting({ 
        customProviders: current.map(cp => cp.id === id ? { ...cp, ...updates } : cp) 
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
  setAvailableModels: (models: ModelInfo[]) => set({ availableModels: models }),
});
