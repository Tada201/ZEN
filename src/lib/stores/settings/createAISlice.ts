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
  streamingEnabled: boolean;
  streamSpeed: number;
  thinkingMode: boolean;
  promptCaching: boolean;
  ragEnabled: boolean;
  searchStrategy: "hybrid" | "vector" | "keyword" | "semantic" | "disabled";
  topK: number;
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
  streamingEnabled: true,
  streamSpeed: 0.5,
  thinkingMode: false,
  promptCaching: true,
  enablePromptCaching: true,
  ragEnabled: false,
  searchStrategy: "hybrid",
  topK: 10,
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
  personalityPreset: "neutral",
  voiceInstructions: "",
  minScore: 0.5,
  maxMessagesInMemory: 100,
  messageRetentionThreshold: 30,
  pinLimit: 10,
  chatPlugins: { ...DEFAULT_CHAT_PLUGINS },

  switchModel: async (provider: string, model?: string) => {
    // Direct set() so activeProvider/activeModel update immediately
    set({ activeProvider: provider });
    if (model) {
      set({ activeModel: model });
    }

    // Persist changes to SQLite backend (best-effort)
    try {
      const updates: Record<string, string> = {
        active_provider: provider,
      };
      if (model) {
        updates.active_model = model;
      }
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
    set({
      providerParams: {
        ...currentParams,
        [provider]: {
          ...(currentParams[provider] || {}),
          ...params
        }
      }
    });
  },
});
