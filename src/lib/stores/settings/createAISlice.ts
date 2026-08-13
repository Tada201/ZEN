import type { StateCreator } from "zustand";
import type { SettingsState } from "./types";
import { settingsApi } from "@/api";

export interface AiSlice {
  activeProvider: string;
  activeModel: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  reasoningEnabled: boolean;
  reasoningEffort: "low" | "medium" | "high";
  reasoningDisclosureDensity: "compact" | "balanced" | "detailed";
  streamingEnabled: boolean;
  streamSpeed: number;
  thinkingMode: boolean;
  promptCaching: boolean;
  ragEnabled: boolean;
  searchStrategy: "hybrid" | "vector" | "keyword" | "semantic" | "disabled";
  topK: number;
  webSearchProvider: "auto" | "tavily" | "exa" | "duckduckgo";
  tavilyApiKey: string;
  exaApiKey: string;
  tavilySearchDepth: "ultra-fast" | "fast" | "basic" | "advanced";
  webSearchMaxResults: number;
  deepResearchModel: string;
  deepResearchMaxRounds: number;
  deepResearchParallelAgents: number;
  deepResearchMaxSourcesPerRound: number;
  embeddingProvider: string;
  citationsEnabled: boolean;
  strictGrounding: boolean;
  enablePromptCaching: boolean;
  structuredResponseEnabled: boolean;
  selectedSchemaId: string;
  toolsEnabled: boolean;
  streamResponses: boolean;
  gpuAcceleration: boolean;
  thinkingBudget: number;
  streamingSpeed: "instant" | "typewriter";
  titleMakerEnabled: boolean;
  titleMakerModel: string;
  titleMakerProvider: string;
  titleMakerPrompt: string;
  personalityPreset: string;
  voiceInstructions: string;
  minScore: number;
  maxMessagesInMemory: number;
  messageRetentionThreshold: number;
  pinLimit: number;
  chatPlugins: Record<string, boolean>;
  providerParams: Record<string, any>;

  switchModel: (provider: string, model?: string) => Promise<void>;
  toggleChatPlugin: (pluginId: string) => void;
  updateProviderParams: (provider: string, params: any) => void;
}

const DEFAULT_CHAT_PLUGINS: Record<string, boolean> = {
  mermaid: true,
  json: true,
  diffs: true,
  maps: true,
  math: true,
};

export const createAISlice: StateCreator<SettingsState, [], [], AiSlice> = (set, get) => ({
  activeProvider: "ollama",
  activeModel: "",
  systemPrompt: "",
  temperature: 0.7,
  maxTokens: 4096,
  providerParams: {},
  reasoningEnabled: false,
  reasoningEffort: "medium",
  reasoningDisclosureDensity: "balanced",
  streamingEnabled: true,
  streamSpeed: 0.5,
  thinkingMode: false,
  promptCaching: true,
  enablePromptCaching: true,
  ragEnabled: false,
  searchStrategy: "hybrid",
  topK: 10,
  webSearchProvider: "auto",
  tavilyApiKey: "",
  exaApiKey: "",
  tavilySearchDepth: "fast",
  webSearchMaxResults: 10,
  deepResearchModel: "",
  deepResearchMaxRounds: 6,
  deepResearchParallelAgents: 3,
  deepResearchMaxSourcesPerRound: 3,
  embeddingProvider: "ollama",
  citationsEnabled: false,
  strictGrounding: false,
  structuredResponseEnabled: false,
  selectedSchemaId: "standard",
  toolsEnabled: true,
  streamResponses: true,
  gpuAcceleration: true,
  thinkingBudget: 4096,
  streamingSpeed: "instant",
  titleMakerEnabled: true,
  titleMakerModel: "",
  titleMakerProvider: "",
  titleMakerPrompt: "",
  personalityPreset: "neutral",
  voiceInstructions: "",
  minScore: 0.5,
  maxMessagesInMemory: 100,
  messageRetentionThreshold: 30,
  pinLimit: 10,
  chatPlugins: { ...DEFAULT_CHAT_PLUGINS },

  switchModel: async (provider: string, model?: string) => {
    // Provider and model are one selection. Never leave a model from the
    // previous provider active while the provider picker is changing.
    const providerModels = get().availableModelsByProvider[provider] || [];
    const currentModel = get().activeModel;
    const nextModel = model !== undefined
      ? model
      : providerModels.some(candidate => candidate.id === currentModel)
        ? currentModel
        : providerModels[0]?.id || '';

    // Direct set() keeps the chat picker responsive while persistence runs.
    set({ activeProvider: provider, activeModel: nextModel });

    // Persist changes to SQLite backend (best-effort)
    try {
      const updates: Record<string, string> = {
        active_provider: provider,
        active_model: nextModel,
      };
      await settingsApi.setSettings(updates);
    } catch (e) {
      console.warn("[AISlice] Failed to persist active model/provider to SQLite:", e);
    }
  },

  toggleChatPlugin: (pluginId: string) => {
    const { chatPlugins = DEFAULT_CHAT_PLUGINS } = get();
    const currentPlugins = chatPlugins || DEFAULT_CHAT_PLUGINS;
    set({
      chatPlugins: {
        ...currentPlugins,
        [pluginId]: !currentPlugins[pluginId],
      },
    });
  },

  updateProviderParams: (provider: string, params: any) => {
    const { providerParams = {} } = get();
    const currentParams = providerParams || {};
    const updatedParams = {
      ...currentParams,
      [provider]: {
        ...(currentParams[provider] || {}),
        ...params
      }
    };
    set((state) => ({
      providerParams: updatedParams,
      activeSettings: {
        ...state.activeSettings,
        providerParams: updatedParams
      },
      isDirty: true
    }));
  },
});
