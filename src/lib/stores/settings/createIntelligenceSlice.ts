import { StateCreator } from "zustand";
import type { SettingsState } from "./types";
import type { IntelligenceConfig } from "../../../components/settings/types";

/**
 * Default intelligence configuration matching the canonical IntelligenceConfig type.
 */
const DEFAULT_INTELLIGENCE_CONFIG: IntelligenceConfig = {
  ragEnabled: false,
  citationsEnabled: false,
  topK: 5,
  searchStrategy: "vector",
  strictGrounding: false,
  summarizationEnabled: true,
  summarizationModel: "llama3.2:1b",
  semanticRecallEnabled: true,
  maxRecalledMessages: 5,
  driftThreshold: 0.3,
};

/**
 * Default embedding model.
 */
const DEFAULT_EMBEDDING_MODEL = "all-MiniLM-L6-v2";

/**
 * Slice interface for RAG / knowledge / intelligence settings.
 *
 * Manages:
 * - Intelligence configuration (RAG enabled/disabled, citations, search strategy, grounding)
 * - Embedding model selection
 * - Document chunking parameters (size and overlap)
 */
export interface IntelligenceSlice {
  intelligenceConfig: IntelligenceConfig;
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;

  memoryEnabled: boolean;
  memoryMaxTurns: number;
  memorySummarizationEnabled: boolean;
  memorySummarizationModel: string;
  memorySemanticRecallEnabled: boolean;
  memoryMaxRecalledMessages: number;
  memoryDriftThreshold: number;

  updateIntelligenceConfig: (config: Partial<IntelligenceConfig>) => void;
  setEmbeddingModel: (model: string) => void;
  setChunkSize: (size: number) => void;
  setChunkOverlap: (overlap: number) => void;
}

/**
 * Creates the Intelligence slice for the composed settings store.
 */
export const createIntelligenceSlice: StateCreator<
  SettingsState,
  [],
  [],
  IntelligenceSlice
> = (set) => ({
  // ─── State ────────────────────────────────────────────────────────────
  intelligenceConfig: { ...DEFAULT_INTELLIGENCE_CONFIG },
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
  chunkSize: 512,
  chunkOverlap: 64,

  memoryEnabled: true,
  memoryMaxTurns: 20,
  memorySummarizationEnabled: DEFAULT_INTELLIGENCE_CONFIG.summarizationEnabled,
  memorySummarizationModel: DEFAULT_INTELLIGENCE_CONFIG.summarizationModel,
  memorySemanticRecallEnabled: DEFAULT_INTELLIGENCE_CONFIG.semanticRecallEnabled,
  memoryMaxRecalledMessages: DEFAULT_INTELLIGENCE_CONFIG.maxRecalledMessages,
  memoryDriftThreshold: DEFAULT_INTELLIGENCE_CONFIG.driftThreshold,

  // ─── Actions ──────────────────────────────────────────────────────────
  updateIntelligenceConfig: (config) =>
    set((state) => {
      const newConfig = { ...state.intelligenceConfig, ...config };
      const result: Record<string, any> = { intelligenceConfig: newConfig };

      const memoryKeyMap: Record<string, string> = {
        summarizationEnabled: "memorySummarizationEnabled",
        summarizationModel: "memorySummarizationModel",
        semanticRecallEnabled: "memorySemanticRecallEnabled",
        maxRecalledMessages: "memoryMaxRecalledMessages",
        driftThreshold: "memoryDriftThreshold",
      };

      for (const key of Object.keys(memoryKeyMap)) {
        if (key in config) {
          result[memoryKeyMap[key]] = (newConfig as any)[key];
        }
      }

      return result;
    }),

  setEmbeddingModel: (embeddingModel) => set({ embeddingModel }),

  setChunkSize: (chunkSize) => set({ chunkSize }),

  setChunkOverlap: (chunkOverlap) => set({ chunkOverlap }),
});
