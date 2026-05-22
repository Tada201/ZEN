import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { useShallow } from "zustand/react/shallow";
import { providerOrder, PROVIDER_KEY_MAP } from "@/lib/types/provider";
import { Session, Message, ChatFolder } from "../../components/chat/types";
import { type Model } from "../../components/ModelSettingsContent";

// Backend response types
interface BackendChat {
  id: string;
  title?: string;
  model?: string;
  createdAt: string | number;
  updatedAt: string | number;
  pinned?: number;
  folderId?: string | null;
  isArchived?: number;
}

interface BackendFolder {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  createdAt: string | number;
  updatedAt: string | number;
}

interface BackendMessage {
  id: string;
  chatId: string;
  role: string;
  content: string;
  toolCalls?: string;
  createdAt: string | number;
  model?: string;
  isComplete?: number;
}

interface SearchResult {
  chatId: string;
  chatTitle: string;
  messageId: string;
  messageContent: string;
  role: string;
  rank: number;
  timestamp: string;
}

export const mapChatToSession = (chat: BackendChat): Session => ({
  id: chat.id,
  title: chat.title || "No Title",
  model: chat.model || "No Model",
  systemPrompt: "",
  createdAt: new Date(chat.createdAt).getTime(),
  updatedAt: new Date(chat.updatedAt).getTime(),
  pinned: chat.pinned === 1,
  folderId: chat.folderId,
  archived: chat.isArchived === 1,
});

export const mapChatFolderToFolder = (f: BackendFolder): ChatFolder => ({
  id: f.id,
  name: f.name,
  color: f.color,
  icon: f.icon,
  createdAt: new Date(f.createdAt).getTime(),
  updatedAt: new Date(f.updatedAt).getTime(),
});

export const mapDbMessageToMessage = (msg: BackendMessage): Message => ({
  id: msg.id,
  sessionId: msg.chatId,
  role: msg.role as Message["role"],
  content: msg.content,
  attachments: [],
  toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls) : [],
  createdAt: new Date(msg.createdAt).getTime(),
  model: msg.model,
  status: msg.isComplete === 1 ? "sent" : "sending",
});

const EMPTY_ARRAY: Message[] = [];

export function useChatQueries() {
  const {
    activeSessionId: currentSessionId,
    setActiveSession: setCurrentSessionId,
    messages,
    setMessages,
    setSessionMessages,
    isSessionStreaming,
  } = useChatStore(useShallow(state => ({
    activeSessionId: state.activeSessionId,
    setActiveSession: state.setActiveSession,
    messages: state.sessionMessages[state.activeSessionId ?? ''] ?? EMPTY_ARRAY,
    setMessages: state.setMessages,
    setSessionMessages: state.setSessionMessages,
    isSessionStreaming: state.streamingChats[state.activeSessionId ?? ''] ?? false,
  })));

  const [search, setSearch] = useState("");

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const chats = await invoke<BackendChat[]>("get_chats");
      return chats.map(mapChatToSession);
    },
  });

  const { data: archivedSessions = [] } = useQuery({
    queryKey: ["archived-sessions"],
    queryFn: async () => {
      const chats = await invoke<BackendChat[]>("list_archived_chats");
      return chats.map(mapChatToSession);
    },
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: async () => {
      const fds = await invoke<BackendFolder[]>("list_chat_folders");
      return fds.map(mapChatFolderToFolder);
    },
  });

  const rawStoreModels = useSettingsStore(useShallow((s) => s.availableModels));
  const modelsLoading = useSettingsStore((s) => s.fetchingModels);
  const hasAttemptedFetch = useRef(false);

  useEffect(() => {
    if (!rawStoreModels.length && !modelsLoading && !hasAttemptedFetch.current) {
      hasAttemptedFetch.current = true;
      const store = useSettingsStore.getState() as any;
      if (typeof store.fetchModels === "function") {
        const activeProvider = store.activeProvider || "";
        let targetProvider = "";
        const activeInfo = providerOrder.find(p => p.key === activeProvider);
        
        if (activeInfo?.requiresKey) {
          const configKey = PROVIDER_KEY_MAP[activeProvider];
          if (configKey && store[configKey]) {
            targetProvider = activeProvider;
          }
        }

        if (!targetProvider) {
          for (const p of providerOrder) {
            if (p.requiresKey) {
              const configKey = PROVIDER_KEY_MAP[p.key];
              if (configKey && store[configKey]) {
                targetProvider = p.key;
                break;
              }
            }
          }
        }

        if (!targetProvider && activeProvider) {
          targetProvider = activeProvider;
        }

        if (!targetProvider) {
          targetProvider = "ollama";
        }

        store.fetchModels(targetProvider);
      }
    }
  }, [rawStoreModels.length, modelsLoading]);

  const models: Model[] = useMemo(() => {
    return rawStoreModels.map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      provider: m.provider || "openai",
      description: m.description || "",
      category: (m.category || "Balanced") as "Smart" | "Fast" | "Balanced",
      capabilities: m.capabilities || ["text"],
      available: m.available !== false,
      contextWindow: m.contextWindow,
    }));
  }, [rawStoreModels]);

  const { data: fetchedMessages, isFetching: isMessagesFetching } = useQuery({
    queryKey: ["messages", currentSessionId],
    queryFn: async () => {
      const msgs = await invoke<BackendMessage[]>("get_messages", { chatId: currentSessionId });
      return msgs.map(mapDbMessageToMessage);
    },
    enabled: !!currentSessionId,
  });

  useEffect(() => {
    if (fetchedMessages && currentSessionId && !isSessionStreaming) {
      const currentMessages = useChatStore.getState().sessionMessages[currentSessionId] ?? [];
      if (isMessagesFetching || fetchedMessages.length < currentMessages.length) return;
      const merged = fetchedMessages.map(msg => {
        const existing = currentMessages.find(m => m.id === msg.id);
        return existing?.artifact ? { ...msg, artifact: existing.artifact } : msg;
      });
      setSessionMessages(currentSessionId, merged);
    } else if (!currentSessionId) {
      setMessages([]);
    }
  }, [fetchedMessages, currentSessionId, isSessionStreaming, isMessagesFetching, setSessionMessages, setMessages]);

  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      setCurrentSessionId(sessions[0].id);
    }
  }, [sessions, currentSessionId]);

  const { data: searchResults = [] } = useQuery({
    queryKey: ["search-sessions", search],
    queryFn: async () => {
      if (!search || search.length < 2) return [];
      const results = await invoke<SearchResult[]>("search_chats", { query: search });
      return results;
    },
    enabled: search.length >= 2,
  });

  return {
    sessions,
    archivedSessions,
    folders,
    currentSessionId,
    setCurrentSessionId,
    messages,
    setMessages,
    search,
    setSearch,
    searchResults,
    models,
    modelsLoading,
  };
}
