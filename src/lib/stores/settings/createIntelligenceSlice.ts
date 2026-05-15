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

  // ─── Actions ──────────────────────────────────────────────────────────
  updateIntelligenceConfig: (config) =>
    set((state) => ({
      intelligenceConfig: { ...state.intelligenceConfig, ...config },
    })),

  setEmbeddingModel: (embeddingModel) => set({ embeddingModel }),

  setChunkSize: (chunkSize) => set({ chunkSize }),

  setChunkOverlap: (chunkOverlap) => set({ chunkOverlap }),
});
