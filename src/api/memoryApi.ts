import { callCommand } from "./tauriClient";

export interface MemoryEntry {
  id: string;
  chat_id: string;
  message_id: string;
  vector: number[];
  text: string;
  role: string;
  timestamp: number;
  metadata: string;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

export interface MemoryStats {
  total_vectors: number;
}

export const memoryApi = {
  getStats: () => callCommand<MemoryStats>("get_memory_stats"),
  getConversationMemories: (chatId: string, query: string | null, limit: number) =>
    callCommand<MemorySearchResult[]>("get_conversation_memories", { chatId, query, limit }),
  clearConversationMemories: (chatId: string | null) =>
    callCommand<void>("clear_conversation_memories", { chatId }),
};
