import type { StateCreator } from "zustand";
import type { SettingsState } from "./types";

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

  switchModel: (provider: string, model?: string) => Promise<void>;
  toggleChatPlugin: (pluginId: string) => void;
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
  },

  toggleChatPlugin: (pluginId: string) => {
    const { chatPlugins } = get();
    set({
      chatPlugins: {
        ...chatPlugins,
        [pluginId]: !chatPlugins[pluginId],
      },
    });
  },
});
