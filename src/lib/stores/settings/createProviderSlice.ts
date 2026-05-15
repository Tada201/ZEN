import type { StateCreator } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { SettingsState, CustomProviderConfig, ProviderSlice, ProviderConnectionStatus } from "./types";


/**
 * Known cloud provider model lists by provider.
 * These are filtered by whether an API key is configured.
 */
const KNOWN_MODELS: Record<string, Array<{ id: string; name: string; contextWindow?: number }>> = {
  openai: [
    { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000 },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000 },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", contextWindow: 128000 },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", contextWindow: 16385 },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", contextWindow: 256000 },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", contextWindow: 200000 },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", contextWindow: 200000 },
    { id: "claude-3-opus-20240229", name: "Claude 3 Opus", contextWindow: 200000 },
  ],
  google: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1048576 },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", contextWindow: 1048576 },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", contextWindow: 1048576 },
  ],
  groq: [
    { id: "llama3-70b-8192", name: "Llama 3 70B", contextWindow: 8192 },
    { id: "llama3-8b-8192", name: "Llama 3 8B", contextWindow: 8192 },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", contextWindow: 32768 },
  ],
  mistral: [
    { id: "mistral-large-latest", name: "Mistral Large", contextWindow: 128000 },
    { id: "mistral-small-latest", name: "Mistral Small", contextWindow: 32000 },
    { id: "codestral-latest", name: "Codestral", contextWindow: 32000 },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek V3", contextWindow: 65536 },
    { id: "deepseek-reasoner", name: "DeepSeek R1", contextWindow: 65536 },
  ],
  openrouter: [
    { id: "openrouter/auto", name: "OpenRouter Auto", contextWindow: 128000 },
  ],
  together: [
    { id: "mistralai/Mixtral-8x22B-Instruct-v0.1", name: "Mixtral 8x22B", contextWindow: 65536 },
  ],
  perplexity: [
    { id: "llama-3.1-sonar-small-128k-online", name: "Sonar Small", contextWindow: 128000 },
    { id: "llama-3.1-sonar-large-128k-online", name: "Sonar Large", contextWindow: 128000 },
  ],
};

export const createProviderSlice: StateCreator<SettingsState, [], [], ProviderSlice> = (set, get) => ({
  // API Keys
  openaiApiKey: "",
  anthropicApiKey: "",
  googleApiKey: "",
  geminiApiKey: "",
  qwenApiKey: "",
  xaiApiKey: "",
  kilocodeApiKey: "",
  groqApiKey: "",
  mistralApiKey: "",
  deepseekApiKey: "",
  openrouterApiKey: "",
  togetherApiKey: "",
  perplexityApiKey: "",
  // Local providers
  ollamaBaseUrl: "http://localhost:11434",
  lmstudioBaseUrl: "http://localhost:1234",
  // Custom providers
  customProviders: [],
  // Agent configs
  agentConfigs: [],
  // Connection statuses
  connectionStatuses: {},
  // Available models (populated by fetchModels)
  availableModels: [],
  availableModelsByProvider: {},
  fetchingModels: false,
  // Tool settings
  toolSettings: {},
  toolAutoApprove: [],

  /**
   * Fetch available models from all configured providers.
   *
   * - Cloud providers: checks if API key exists → uses known model list
   * - Local providers (Ollama, LM Studio): makes HTTP request to fetch live models
   * - Custom providers: attempts live fetch from configured endpoint
   * - Persists models via updateSetting for cross-session availability
   */
  fetchModels: async () => {
    set({ fetchingModels: true });
    const state = get();
    const allModels: Array<{ id: string; name: string; provider: string; contextWindow?: number }> = [];
    const providersToFetch: Array<{ provider: string; baseUrl: string; apiKey?: string }> = [];

    // Cloud providers: check API keys and add known models
    for (const [provider, keyField] of Object.entries({
      openai: "openaiApiKey",
      anthropic: "anthropicApiKey",
      google: "googleApiKey",
      groq: "groqApiKey",
      mistral: "mistralApiKey",
      deepseek: "deepseekApiKey",
      openrouter: "openrouterApiKey",
      together: "togetherApiKey",
      perplexity: "perplexityApiKey",
    } as Record<string, keyof ProviderSlice>)) {
      const apiKey = state[keyField] as string;
      if (apiKey && apiKey.length > 0) {
        const knownModels = KNOWN_MODELS[provider];
        if (knownModels) {
          for (const m of knownModels) {
            allModels.push({ ...m, provider });
          }
        }
      }
    }

    // Local providers: try to fetch live model lists
    if (state.ollamaBaseUrl) {
      providersToFetch.push({ provider: "ollama", baseUrl: state.ollamaBaseUrl });
    }
    if (state.lmstudioBaseUrl) {
      providersToFetch.push({ provider: "lmstudio", baseUrl: state.lmstudioBaseUrl });
    }

    // Fetch local provider models in parallel
    const results = await Promise.allSettled(
      providersToFetch.map(async ({ provider, baseUrl }) => {
        const cleanUrl = baseUrl.replace(/\/+$/, "");
        const models = await fetchLocalProviderModels(provider, cleanUrl);
        return models.map((m) => ({ ...m, provider }));
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allModels.push(...result.value);
      }
    }

    // Custom providers
    for (const cp of state.customProviders) {
      if (cp.enabled && cp.baseUrl) {
        try {
          const models = await fetchLocalProviderModels("custom", cp.baseUrl, cp.apiKey);
          for (const m of models) {
            allModels.push({ ...m, provider: cp.id });
          }
        } catch {
          // Silently skip unreachable custom providers
        }
      }
    }

    const byProvider: Record<string, string[]> = {};
    for (const model of allModels) {
      byProvider[model.provider] = [...(byProvider[model.provider] || []), model.id];
    }
    set({ availableModels: allModels, availableModelsByProvider: byProvider, fetchingModels: false });
  },

  /**
   * Test connectivity to a provider.
   *
   * - Local providers (Ollama, LM Studio): HTTP GET to /api/tags or /v1/models
   * - Cloud providers: lightweight API validation call with API key
   * - Custom providers: HTTP GET to their base URL's models endpoint
   *
   * Returns true if the connection was successful.
   */
  testProviderConnection: async (provider: string, baseUrl?: string, apiKey?: string): Promise<boolean> => {
    const state = get();

    // Set testing status
    set((s) => ({
      connectionStatuses: {
        ...s.connectionStatuses,
        [provider]: { status: "testing" },
      },
    }));

    const startTime = performance.now();

    try {
      let connected = false;
      let endpoint = "";

      switch (provider) {
        case "ollama":
        case "lmstudio": {
          const url = baseUrl || (provider === "ollama" ? state.ollamaBaseUrl : state.lmstudioBaseUrl);
          const cleanUrl = url.replace(/\/+$/, "");
          endpoint = provider === "ollama" ? `${cleanUrl}/api/tags` : `${cleanUrl}/v1/models`;
          const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
          connected = res.ok;
          break;
        }
        case "openai": {
          const key = apiKey || state.openaiApiKey;
          endpoint = "https://api.openai.com/v1/models";
          const res = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(5000),
          });
          connected = res.ok;
          break;
        }
        case "anthropic": {
          const key = apiKey || state.anthropicApiKey;
          endpoint = "https://api.anthropic.com/v1/messages";
          // Anthropic uses a lightweight ping to validate the key
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ model: "claude-3-haiku-20240307", max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
            signal: AbortSignal.timeout(5000),
          });
          connected = res.status === 400 || res.ok; // 400 means valid key but invalid request
          break;
        }
        case "google": {
          const key = apiKey || state.googleApiKey;
          endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
          const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
          connected = res.ok;
          break;
        }
        case "groq": {
          const key = apiKey || state.groqApiKey;
          endpoint = "https://api.groq.com/openai/v1/models";
          const res = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(5000),
          });
          connected = res.ok;
          break;
        }
        case "mistral": {
          const key = apiKey || state.mistralApiKey;
          endpoint = "https://api.mistral.ai/v1/models";
          const res = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(5000),
          });
          connected = res.ok;
          break;
        }
        case "deepseek": {
          const key = apiKey || state.deepseekApiKey;
          endpoint = "https://api.deepseek.com/v1/models";
          const res = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(5000),
          });
          connected = res.ok;
          break;
        }
        case "openrouter": {
          const key = apiKey || state.openrouterApiKey;
          endpoint = "https://openrouter.ai/api/v1/models";
          const res = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(5000),
          });
          connected = res.ok;
          break;
        }
        case "together": {
          const key = apiKey || state.togetherApiKey;
          endpoint = "https://api.together.xyz/v1/models";
          const res = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(5000),
          });
          connected = res.ok;
          break;
        }
        case "perplexity": {
          const key = apiKey || state.perplexityApiKey;
          endpoint = "https://api.perplexity.ai/models";
          const res = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(5000),
          });
          connected = res.ok;
          break;
        }
        case "custom": {
          if (!baseUrl) throw new Error("Custom provider requires a base URL");
          const cleanUrl = baseUrl.replace(/\/+$/, "");
          endpoint = `${cleanUrl}/v1/models`;
          const headers: Record<string, string> = {};
          if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
          const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(5000) });
          connected = res.ok;
          break;
        }
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }

      const latency = Math.round(performance.now() - startTime);

      set((s) => ({
        connectionStatuses: {
          ...s.connectionStatuses,
          [provider]: { status: connected ? "connected" : "failed", latency, error: connected ? undefined : "Connection rejected" },
        },
      }));

      // Save connection test results to backend
      await invoke("set_setting", { key: `connection.${provider}.status`, value: connected ? "connected" : "failed" });
      await invoke("set_setting", { key: `connection.${provider}.latency`, value: String(latency) });

      return connected;
    } catch (err) {
      const latency = Math.round(performance.now() - startTime);
      const errorMsg = err instanceof Error ? err.message : "Connection failed";

      set((s) => ({
        connectionStatuses: {
          ...s.connectionStatuses,
          [provider]: { status: "failed", latency, error: errorMsg },
        },
      }));

      await invoke("set_setting", { key: `connection.${provider}.status`, value: "failed" });
      return false;
    }
  },

  setConnectionStatus: (provider: string, status: ProviderConnectionStatus) => {
    set((s) => ({
      connectionStatuses: { ...s.connectionStatuses, [provider]: status },
    }));
  },

  setAvailableModels: (models) => {
    set({ availableModels: models });
  },

  addCustomProvider: (config: CustomProviderConfig) => {
    const { customProviders } = get();
    set({ customProviders: [...customProviders, config] });
  },

  removeCustomProvider: (id: string) => {
    const { customProviders } = get();
    set({ customProviders: customProviders.filter((p) => p.id !== id) });
  },

  toggleCustomProvider: (id: string) => {
    const { customProviders } = get();
    set({
      customProviders: customProviders.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p
      ),
    });
  },

  updateCustomProvider: (id: string, config: Partial<CustomProviderConfig>) => {
    const { customProviders } = get();
    set({
      customProviders: customProviders.map((p) =>
        p.id === id ? { ...p, ...config } : p
      ),
    });
  },
});

/**
 * Fetch model list from a local provider's API endpoint via the Rust backend.
 * This bypasses browser CORS restrictions and uses the backend's provider implementation.
 */
async function fetchLocalProviderModels(
  provider: string,
  baseUrl: string,
  apiKey?: string
): Promise<Array<{ id: string; name: string; contextWindow?: number }>> {
  try {
    const models = await invoke<any[]>("discover_models", {
      provider,
      baseUrl: baseUrl || undefined,
      apiKey: apiKey || undefined,
    });
    
    return models.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      contextWindow: m.context_window || 8192,
    }));
  } catch (err) {
    console.warn(`Failed to discover models for ${provider}:`, err);
    return [];
  }
}
