import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chatApi, providersApi, type BackendChat, type BackendFolder, type BackendMessage } from "@/api";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { useShallow } from "zustand/react/shallow";
import type { ModelInfo } from "@/lib/types/provider";
import { Session, Message, ChatFolder, ToolCall, Step, extractInlineThoughtBlocks } from "../../components/chat/types";
import { type Model } from "../../components/ModelSettingsContent";
import { findLiveAssistantForFetched, mergeLiveToolState } from "./liveLedgerMerge";
import { coalesceTimelineMessages } from "./chatTimelineReplay";

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

type ReasoningBlock = {
  provider?: string;
  type?: string;
  blockType?: string;
  text?: string;
  raw?: unknown;
};

export const mapDbMessageToMessage = (msg: BackendMessage): Message => {
  let parsedMetadata = undefined;
  if (msg.metadata) {
    try {
      parsedMetadata = JSON.parse(msg.metadata);
    } catch (e) {
      console.error("Failed to parse metadata JSON:", e);
    }
  }
  let parsedToolCalls: ToolCall[] = [];
  if (msg.toolCalls) {
    if (Array.isArray(msg.toolCalls)) {
      parsedToolCalls = msg.toolCalls;
    } else {
      try {
        parsedToolCalls = JSON.parse(msg.toolCalls);
      } catch (e) {
        console.error("Failed to parse tool calls JSON:", e);
      }
    }
  }

  let reasoning = "";
  if (msg.reasoningDetails) {
    try {
      const parsedReasoning = JSON.parse(msg.reasoningDetails) as ReasoningBlock[];
      if (Array.isArray(parsedReasoning)) {
        reasoning = parsedReasoning
          .map((block) => typeof block?.text === "string" ? block.text : "")
          .filter(Boolean)
          .join("");
      }
    } catch (e) {
      console.error("Failed to parse reasoning details JSON:", e);
    }
  }

  let finalContent = msg.content || "";
  if (!reasoning && finalContent) {
    const extracted = extractInlineThoughtBlocks(finalContent);
    reasoning = extracted.reasoning;
    finalContent = extracted.content;
  }

  let parsedSteps: Step[] = [];
  const rawSteps = (msg as any).steps ?? parsedMetadata?.executionSteps;
  if (rawSteps) {
    if (Array.isArray(rawSteps)) {
      parsedSteps = rawSteps;
    } else {
      try {
        parsedSteps = JSON.parse(rawSteps);
      } catch (e) {
        console.error("Failed to parse message steps JSON:", e);
      }
    }
  }

  const steps: Step[] = parsedSteps.length > 0 ? parsedSteps : [];
  if (steps.length === 0) {
    if (reasoning) {
      steps.push({ type: "reasoning", content: reasoning });
    }
    if (parsedToolCalls.length > 0) {
      parsedToolCalls.forEach((toolCall) => {
        steps.push({ type: "tool-call", toolCall });
      });
    }
    if (finalContent) {
      steps.push({ type: "text", content: finalContent });
    }
  }

  return {
    id: msg.id,
    sessionId: msg.chatId,
    role: msg.role as Message["role"],
    content: finalContent,
    reasoning: reasoning || undefined,
    attachments: [],
    toolCalls: parsedToolCalls,
    steps,
    createdAt: new Date(msg.createdAt).getTime(),
    model: msg.model,
    status: msg.isComplete === 1 ? "sent" : "failed",
    kind: msg.kind as any,
    metadata: parsedMetadata,
    error: typeof parsedMetadata?.error === "string" && parsedMetadata.error.trim()
      ? parsedMetadata.error
      : undefined,
  };
};

const EMPTY_ARRAY: Message[] = [];
const MODEL_CATALOG_CACHE_KEY = "zen_model_catalog_cache_v1";
type BackendModelInfo = ModelInfo & {
  maxContextLength?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
};

function modelInfoToModel(model: ModelInfo): Model {
  const backendModel = model as BackendModelInfo;
  const capabilities = new Set(backendModel.capabilities?.length ? backendModel.capabilities : ["text"]);
  if (backendModel.supportsVision) capabilities.add("vision");
  if (backendModel.supportsTools) capabilities.add("tools");
  if (backendModel.supportsReasoning) capabilities.add("reasoning");

  return {
    id: model.id,
    name: model.displayName || model.name || model.id,
    provider: model.provider || "unknown",
    description: model.description || "",
    category: "Balanced",
    capabilities: Array.from(capabilities),
    available: model.state !== "missing",
    contextWindow: backendModel.contextWindow ?? backendModel.maxContextLength,
    supportsReasoning: model.supportsReasoning,
    reasoningConfigType: model.reasoningConfigType,
  };
}

function readCachedModelCatalog(): ModelInfo[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(MODEL_CATALOG_CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.models)) return [];

    return parsed.models.filter((model: unknown): model is ModelInfo => {
      if (!model || typeof model !== "object") return false;
      const candidate = model as Partial<ModelInfo>;
      return typeof candidate.id === "string" && typeof candidate.name === "string";
    });
  } catch (error) {
    console.warn("[models] Failed to read cached model catalog:", error);
    return [];
  }
}

function writeCachedModelCatalog(models: ModelInfo[]) {
  if (typeof window === "undefined" || models.length === 0) return;

  try {
    window.localStorage.setItem(
      MODEL_CATALOG_CACHE_KEY,
      JSON.stringify({ version: 1, updatedAt: Date.now(), models })
    );
  } catch (error) {
    console.warn("[models] Failed to cache model catalog:", error);
  }
}

function isMessageSemanticallyEqual(a: Message, b: Message): boolean {
  if (a.id !== b.id) return false;
  if (a.role !== b.role) return false;
  if (a.content !== b.content) return false;
  if (a.reasoning !== b.reasoning) return false;
  if (a.status !== b.status) return false;

  // Terminal messages don't change — skip expensive deep comparison
  if (a.status !== "sending" && b.status !== "sending") {
    return true;
  }
  
  if (JSON.stringify(a.metadata) !== JSON.stringify(b.metadata)) return false;
  
  if ((a.toolCalls?.length || 0) !== (b.toolCalls?.length || 0)) return false;
  if (a.toolCalls && b.toolCalls) {
    for (let i = 0; i < a.toolCalls.length; i++) {
      if (JSON.stringify(a.toolCalls[i]) !== JSON.stringify(b.toolCalls[i])) return false;
    }
  }

  if ((a.steps?.length || 0) !== (b.steps?.length || 0)) return false;
  if (a.steps && b.steps) {
    for (let i = 0; i < a.steps.length; i++) {
      const sA = a.steps[i];
      const sB = b.steps[i];
      if (sA.type !== sB.type) return false;
      if (sA.status !== sB.status) return false;
      if (sA.content !== sB.content) return false;
      if (sA.eventId !== sB.eventId) return false;
      if (sA.kind !== sB.kind) return false;
      if (JSON.stringify(sA.metadata) !== JSON.stringify(sB.metadata)) return false;
      if (JSON.stringify(sA.toolCall) !== JSON.stringify(sB.toolCall)) return false;
    }
  }

  return true;
}

function isRecentOptimisticAssistant(message: Message): boolean {
  return (
    message.role === "assistant" &&
    message.id.startsWith("temp-assistant-") &&
    (message.status === "sending" || message.status === "failed") &&
    Date.now() - (message.createdAt || 0) < 5 * 60_000
  );
}

export function useChatQueries() {
  const {
    activeSessionId: currentSessionId,
    setActiveSession: setCurrentSessionId,
    messages,
    setMessages,
    setSessionMessages,
    setStreamingForChat,
    isSessionStreaming,
  } = useChatStore(useShallow(state => ({
    activeSessionId: state.activeSessionId,
    setActiveSession: state.setActiveSession,
    messages: state.sessionMessages[state.activeSessionId ?? ''] ?? EMPTY_ARRAY,
    setMessages: state.setMessages,
    setSessionMessages: state.setSessionMessages,
    setStreamingForChat: state.setStreamingForChat,
    isSessionStreaming: state.streamingChats[state.activeSessionId ?? ''] ?? false,
  })));

  const [search, setSearch] = useState("");

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const page = await chatApi.listChatsPage(500, 0);
      return page.items.map(mapChatToSession);
    },
    staleTime: 30000,
    gcTime: 5 * 60000,
  });

  const { data: archivedSessions = [] } = useQuery({
    queryKey: ["archived-sessions"],
    queryFn: async () => {
      const page = await chatApi.listArchivedChatsPage(500, 0);
      return page.items.map(mapChatToSession);
    },
    staleTime: 60000,
    gcTime: 5 * 60000,
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: async () => {
      const fds = await chatApi.listFolders();
      return fds.map(mapChatFolderToFolder);
    },
    staleTime: 60000,
    gcTime: 5 * 60000,
  });

  const { customProviders, storeAvailableModels } = useSettingsStore(useShallow((s) => ({
    customProviders: s.customProviders,
    storeAvailableModels: s.availableModels,
  })));
  const cachedModelCatalog = useMemo(() => readCachedModelCatalog(), []);
  const {
    data: discoveredModels = cachedModelCatalog,
    isFetching: modelsLoading,
    refetch: refetchModels,
  } = useQuery({
    queryKey: ["provider-model-catalog"],
    queryFn: async () => {
      const models = await providersApi.getAllAvailableModels(null);
      if (models.length > 0) {
        writeCachedModelCatalog(models);
        useSettingsStore.getState().setAvailableModels(models);
        return models;
      }

      const cached = readCachedModelCatalog();
      return cached.length > 0 ? cached : models;
    },
    initialData: cachedModelCatalog.length > 0 ? cachedModelCatalog : undefined,
    initialDataUpdatedAt: cachedModelCatalog.length > 0 ? 0 : undefined,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const models: Model[] = useMemo(() => {
    const customModels = customProviders
      .filter((provider) => provider.enabled)
      .flatMap((provider) =>
        provider.customModels.map((model) => ({
          ...model,
          provider: provider.id,
          source: model.source || "direct",
          state: model.state || "unloaded",
        } satisfies ModelInfo))
      );

    const seen = new Set<string>();
    return [...discoveredModels, ...storeAvailableModels, ...customModels]
      .filter((model) => {
        const key = `${model.provider || "unknown"}:${model.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(modelInfoToModel);
  }, [discoveredModels, storeAvailableModels, customProviders]);

  const { data: fetchedMessages, isFetching: isMessagesFetching } = useQuery({
    queryKey: ["messages", currentSessionId],
    queryFn: async () => {
      if (!currentSessionId) return [];
      const page = await chatApi.listMessagesPage(currentSessionId, 500, 0);
      return coalesceTimelineMessages(page.items.map(mapDbMessageToMessage));
    },
    enabled: !!currentSessionId,
  });

  useEffect(() => {
    if (fetchedMessages && currentSessionId && !isSessionStreaming) {
      if (isMessagesFetching) return;
      const currentMessages = useChatStore.getState().sessionMessages[currentSessionId] ?? [];

      // Guard: deep_research messages are updated in-place by the chat:message
      // and chat:done event handlers. Don't let stale fetched data overwrite
      // the live message state that still contains deep research content.
      if (currentMessages.some((m) => m.kind === "deep_research")) return;

      const latestFetchedAssistantIndex = fetchedMessages.reduce((latestIndex, message, index) =>
        message.role === "assistant" ? index : latestIndex,
      -1);
      const merged = fetchedMessages.map((msg, index) => {
        const existing = findLiveAssistantForFetched(msg, currentMessages, {
          allowLatestFallback: index === latestFetchedAssistantIndex,
        });
        const withToolState = mergeLiveToolState(msg, existing);
        return existing?.artifact ? { ...withToolState, artifact: existing.artifact } : withToolState;
      });

      const fetchedIds = new Set(merged.map((message) => message.id));
      const optimisticAssistants = currentMessages.filter((message) =>
        isRecentOptimisticAssistant(message) && !fetchedIds.has(message.id)
      );
      if (optimisticAssistants.length > 0) {
        merged.push(...optimisticAssistants);
      }
      
      const hasChanged = merged.length !== currentMessages.length ||
        merged.some((msg, idx) => {
          const curr = currentMessages[idx];
          return !curr || !isMessageSemanticallyEqual(msg, curr);
        });

      if (hasChanged) {
        setSessionMessages(currentSessionId, merged);
      }
    } else if (!currentSessionId) {
      const chatStore = useChatStore.getState();
      const currentMessages = chatStore.activeSessionId ? (chatStore.sessionMessages[chatStore.activeSessionId] ?? []) : [];
      if (currentMessages.length > 0) {
        setMessages([]);
      }
    }
  }, [fetchedMessages, currentSessionId, isSessionStreaming, isMessagesFetching, setSessionMessages, setMessages]);

  useEffect(() => {
    if (!currentSessionId || isMessagesFetching || !fetchedMessages || !isSessionStreaming) return;

    const hasRecentSendingAssistant = fetchedMessages.some((message) =>
      message.role === "assistant" &&
      message.status === "sending" &&
      Date.now() - (message.createdAt || 0) < 60_000
    );

    if (hasRecentSendingAssistant) return;

    const inMemoryMessages = useChatStore.getState().sessionMessages[currentSessionId] ?? [];
    const hasRecentSendingInMemory = inMemoryMessages.some((m) =>
      m.role === "assistant" &&
      m.status === "sending" &&
      Date.now() - (m.createdAt || 0) < 60_000
    );

    if (!hasRecentSendingInMemory) {
      setStreamingForChat(currentSessionId, false);
    }
  }, [currentSessionId, fetchedMessages, isMessagesFetching, isSessionStreaming, setStreamingForChat]);

  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      setCurrentSessionId(sessions[0].id);
    }
  }, [sessions, currentSessionId]);

  const { data: searchResults = [] } = useQuery({
    queryKey: ["search-sessions", search],
    queryFn: async () => {
      if (!search || search.length < 2) return [];
      const results = await chatApi.searchChats(search);
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
    refetchModels,
  };
}
