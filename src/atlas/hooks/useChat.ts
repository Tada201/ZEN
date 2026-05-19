import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useStreamingChat } from "./useStreamingChat";
import { Session, Message, Attachment, ChatFolder } from "../components/chat/types";
import { type Model } from "../components/ModelSettingsContent";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { useShallow } from "zustand/react/shallow";
import { providerOrder, PROVIDER_KEY_MAP } from "@/lib/types/provider";
import { extendedLibrary } from "../components/genui";
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib";

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

// Helper to bridge backend Chat to frontend Session
const mapChatToSession = (chat: BackendChat): Session => ({
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

const mapChatFolderToFolder = (f: BackendFolder): ChatFolder => ({
  id: f.id,
  name: f.name,
  color: f.color,
  icon: f.icon,
  createdAt: new Date(f.createdAt).getTime(),
  updatedAt: new Date(f.updatedAt).getTime(),
});

// Helper to bridge backend Message to frontend Message
const mapDbMessageToMessage = (msg: BackendMessage): Message => ({
  id: msg.id,
  sessionId: msg.chatId,
  role: msg.role as Message["role"],
  content: msg.content,
  attachments: [], // Attachments are handled via metadata or separate query in full impl
  toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls) : [],
  artifact: null,
  createdAt: new Date(msg.createdAt).getTime(),
  model: msg.model,
  status: msg.isComplete === 1 ? "sent" : "sending",
});

export function useChat() {
  const queryClient = useQueryClient();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [search, setSearch] = useState("");
  
  const [selectedModelId, setSelectedModelId] = useState<string>("No Model");
  const [selectedProvider, setSelectedProvider] = useState<string>("openai");
  
  const { isStreaming, abortStream } = useStreamingChat(currentSessionId, setMessages);

  // --- Queries ---

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

  // Models come from the settings store (ProviderSlice) which handles
  // KNOWN_MODELS for cloud providers + dynamic discovery for local/custom.
  const rawStoreModels = useSettingsStore(useShallow((s) => s.availableModels));
  const modelsLoading = useSettingsStore((s) => s.fetchingModels);
  const hasAttemptedFetch = useRef(false);

  // Fetch models on mount if not already present
  useEffect(() => {
    if (!rawStoreModels.length && !modelsLoading && !hasAttemptedFetch.current) {
      hasAttemptedFetch.current = true;
      const store = useSettingsStore.getState() as any;
      if (typeof store.fetchModels === "function") {
        // Determine which provider to fetch models for.
        // Priority:
        //   1. If activeProvider is a cloud provider with configured key → use it
        //   2. Scan ALL cloud providers for a configured key → use the first found
        //   3. Fall back to activeProvider (likely local: ollama/lmstudio)
        //   4. Ultimate fallback → ollama
        const activeProvider = store.activeProvider || "";
        
        let targetProvider = "";
        const activeInfo = providerOrder.find(p => p.key === activeProvider);
        
        // Priority 1: activeProvider is cloud with configured key
        if (activeInfo?.requiresKey) {
          const configKey = PROVIDER_KEY_MAP[activeProvider];
          if (configKey && store[configKey]) {
            targetProvider = activeProvider;
          }
        }

        // Priority 2: Scan all cloud providers for configured API keys
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

        // Priority 3: Fall back to activeProvider (likely local)
        if (!targetProvider && activeProvider) {
          targetProvider = activeProvider;
        }

        // Priority 4: Ultimate fallback
        if (!targetProvider) {
          targetProvider = "ollama";
        }

        console.debug(`[useChat] Initial model fetch for provider: ${targetProvider}`);
        store.fetchModels(targetProvider);
      }
    }
  }, [rawStoreModels.length, modelsLoading]);

  interface StoreModel {
  id: string;
  name?: string;
  provider?: string;
  description?: string;
  category?: string;
  capabilities?: string[];
  available?: boolean;
  contextWindow?: number;
}

const models: Model[] = useMemo(() => {
  return rawStoreModels.map((m: StoreModel) => ({
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

  const { data: fetchedMessages } = useQuery({
    queryKey: ["messages", currentSessionId],
    queryFn: async () => {
      const msgs = await invoke<BackendMessage[]>("get_messages", { chatId: currentSessionId });
      return msgs.map(mapDbMessageToMessage);
    },
    enabled: !!currentSessionId,
  });

  // Sync messages local state with query data
  useEffect(() => {
    if (fetchedMessages) {
      setMessages(fetchedMessages);
    } else if (!currentSessionId) {
      setMessages([]);
    }
  }, [fetchedMessages, currentSessionId]);

  // Auto-select first session if none selected
  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      setCurrentSessionId(sessions[0].id);
    }
  }, [sessions, currentSessionId]);

  // --- Mutations ---

  const createSessionMutation = useMutation({
    mutationFn: (title?: string) => invoke<BackendChat>("create_chat", { 
      title: title || "No Conversation", 
      model: selectedModelId === "No Model" ? null : selectedModelId 
    }),
    onSuccess: (chat) => {
      console.log("[useChat] Session created successfully:", chat);
      const session = mapChatToSession(chat);
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => [session, ...(prev || [])]);
      setCurrentSessionId(session.id);
    },
    onError: (err) => {
      console.error("[useChat] Failed to create session:", err);
      toast.error("Failed to create session");
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => invoke("delete_chat", { chatId: id }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => prev?.filter((s) => s.id !== id));
      queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) => prev?.filter((s) => s.id !== id));
      if (currentSessionId === id) setCurrentSessionId(null);
      toast.success("Session deleted");
    },
    onError: () => toast.error("Failed to delete session"),
  });

  const renameSessionMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => invoke("update_chat_title", { chatId: id, title }),
    onSuccess: (_, { id, title }) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => 
        prev?.map(s => s.id === id ? { ...s, title } : s)
      );
      toast.success("Session renamed");
    }
  });

  const pinSessionMutation = useMutation({
    mutationFn: (id: string) => invoke("toggle_pin_chat", { chatId: id }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => 
        prev?.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s)
      );
    }
  });

  const archiveSessionMutation = useMutation({
    mutationFn: (id: string) => invoke("archive_chat", { chatId: id }),
    onSuccess: (_, id) => {
      const session = sessions.find(s => s.id === id);
      if (session) {
        queryClient.setQueryData<Session[]>(["sessions"], (prev) => prev?.filter(s => s.id !== id));
        queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) => [{ ...session, archived: true }, ...(prev || [])]);
      }
      if (currentSessionId === id) setCurrentSessionId(null);
      toast.success("Session archived");
    }
  });

  const unarchiveSessionMutation = useMutation({
    mutationFn: (id: string) => invoke("unarchive_chat", { chatId: id }),
    onSuccess: (_, id) => {
      const session = archivedSessions.find(s => s.id === id);
      if (session) {
        queryClient.setQueryData<Session[]>(["archived-sessions"], (prev) => prev?.filter(s => s.id !== id));
        queryClient.setQueryData<Session[]>(["sessions"], (prev) => [{ ...session, archived: false }, ...(prev || [])]);
      }
      toast.success("Session unarchived");
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => invoke("bulk_delete_chats", { chatIds: ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["archived-sessions"] });
      toast.success("History cleared");
    }
  });

  // --- Folder Mutations ---

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => invoke<BackendFolder>("create_chat_folder", { name }),
    onSuccess: (folder) => {
      queryClient.setQueryData<ChatFolder[]>(["folders"], (prev) => [mapChatFolderToFolder(folder), ...(prev || [])]);
    }
  });

  const moveChatToFolderMutation = useMutation({
    mutationFn: ({ chatId, folderId }: { chatId: string; folderId: string | null }) => 
      folderId 
        ? invoke("move_chat_to_folder", { chatId, folderId })
        : invoke("remove_chat_from_folder", { chatId }),
    onSuccess: (_, { chatId, folderId }) => {
      queryClient.setQueryData<Session[]>(["sessions"], (prev) => 
        prev?.map(s => s.id === chatId ? { ...s, folderId } : s)
      );
    }
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["search-sessions", search],
    queryFn: async () => {
      if (!search || search.length < 2) return [];
      const results = await invoke<SearchResult[]>("search_chats", { query: search });
      return results; // These are SearchResult models with snippets
    },
    enabled: search.length >= 2,
  });

  const handleSendMessage = useCallback(async (data: {
    message: string;
    model: string;
    provider?: string;
    webSearch?: boolean;
    thinking?: {
      enabled: boolean;
      effort?: "low" | "medium" | "high";
      budgetTokens?: number;
    };
    generativeUI?: boolean;
    attachments?: Attachment[];
    tools?: string[];
  }) => {
    if (!currentSessionId) {
      console.warn("[useChat] Attempted to send message, but no active chat session is selected.");
      return;
    }

    const store = useSettingsStore.getState();
    const activeProvider = data.provider || store.activeProvider || "ollama";

    // Ensure providerParams is at least an empty object before accessing
    const paramsStore = store.providerParams || {};
    const providerParams = paramsStore[activeProvider] || {};

    // Resolve temperature (prioritize provider-specific, then global, then default)
    const temperature = providerParams.temperature ?? store.temperature ?? 0.7;
    const maxTokens = providerParams.maxTokens ?? store.maxTokens ?? 4096;

    console.group(`[useChat] Sending Message to Session: ${currentSessionId}`);
    console.log("Payload:", {
      message: data.message,
      model: data.model,
      provider: activeProvider,
      webSearch: data.webSearch,
      temperature,
      maxTokens,
      providerParams,
    });
    console.groupEnd();

    // Optimistic: add user message + assistant placeholder to UI immediately
    const userMsg: Message = {
      id: `temp-user-${Date.now()}`,
      sessionId: currentSessionId,
      role: "user",
      content: data.message,
      createdAt: Date.now(),
      status: "sent",
      model: data.model,
      provider: activeProvider,
      steps: [],
      toolCalls: [],
      attachments: [],
      artifact: null,
    };

    const assistantMsg: Message = {
      id: `temp-assistant-${Date.now()}`,
      sessionId: currentSessionId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      status: "sending",
      model: data.model,
      provider: activeProvider,
      steps: [],
      toolCalls: [],
      attachments: [],
      artifact: null,
    };

    console.log("[useChat] Optimistically adding user/assistant messages to local state.");
    setMessages(prev => [...prev, userMsg, assistantMsg]);

    try {
      // Compile system prompt dynamically if Gen UI feature is active in chat
      const systemPrompt = data.generativeUI
        ? ((extendedLibrary as any).prompt
            ? (extendedLibrary as any).prompt(openuiPromptOptions)
            : openuiLibrary.prompt(openuiPromptOptions))
        : null;

      console.log("[useChat] Invoking 'send_message' backend IPC command with Gen UI prompt status:", !!systemPrompt);
      await invoke("send_message", {
        chatId: currentSessionId,
        content: data.message,
        model: data.model === "No Model" ? null : data.model,
        provider: data.provider,
        webSearch: data.webSearch,
        temperature,
        maxTokens,
        topP: providerParams.topP,
        topK: providerParams.topK,
        presencePenalty: providerParams.presencePenalty,
        frequencyPenalty: providerParams.frequencyPenalty,
        repeatPenalty: providerParams.repeatPenalty,
        seed: null,
        stop: providerParams.stop,
        thinking: data.thinking,
        generativeUi: data.generativeUI,
        tools: data.tools,
        attachments: data.attachments,
        systemPrompt: systemPrompt,
      });
      console.log("[useChat] 'send_message' IPC command succeeded.");
    } catch (e: any) {
      console.error("[useChat] 'send_message' IPC command failed:", e);
      // Mark assistant message as failed on error
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, status: "failed", error: e.toString() };
        }
        return next;
      });
      toast.error(e.toString() || "Failed to send message");
    }
  }, [currentSessionId, setMessages]);

  const handleExportSession = async (id: string) => {
    try {
      const data = await invoke<any>("export_chat", { chatId: id });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zen-chat-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Chat exported");
    } catch (e) {
      toast.error("Failed to export chat");
    }
  };

  const handleImportSession = async (path: string) => {
    try {
      const chat = await invoke<any>("import_chat", { sourcePath: path });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setCurrentSessionId(chat.id);
      toast.success("Chat imported");
    } catch (e) {
      toast.error("Failed to import chat");
    }
  };

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
    selectedModelId,
    setSelectedModelId,
    selectedProvider,
    setSelectedProvider,
    isStreaming,
    fetchModels: () => {
      // Trigger model refetch from the settings store
      const store = useSettingsStore.getState() as any;
      if (typeof store.fetchModels === "function") {
        store.fetchModels();
      }
    },
    handleCreateSession: async (title?: string | any): Promise<string> => {
      const cleanTitle = typeof title === "string" ? title : undefined;
      const chat = await createSessionMutation.mutateAsync(cleanTitle);
      return chat.id;
    },
    handleDeleteSession: (id: string) => deleteSessionMutation.mutate(id),
    handleRenameSession: (id: string, title: string) => renameSessionMutation.mutate({ id, title }),
    handlePinSession: (id: string) => pinSessionMutation.mutate(id),
    handleArchiveSession: (id: string) => archiveSessionMutation.mutate(id),
    handleUnarchiveSession: (id: string) => unarchiveSessionMutation.mutate(id),
    handleExportSession,
    handleImportSession,
    handleDeleteAll: () => bulkDeleteMutation.mutate(sessions.map(s => s.id)),
    handleCreateFolder: (name: string) => createFolderMutation.mutate(name),
    handleMoveToFolder: (chatId: string, folderId: string | null) => moveChatToFolderMutation.mutate({ chatId, folderId }),
    handleSendMessage,
    abortStream
  };
}
