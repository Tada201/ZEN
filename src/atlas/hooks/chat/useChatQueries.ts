import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi, providersApi, type BackendChat, type BackendFolder, type BackendMessage } from "@/api";
import { useChatStore } from "@/lib/stores/useChatStore";
import { IS_TAURI } from "@/api/tauriClient";
import { useTaskStore } from "@/lib/stores/taskStore";
import { useVoiceStageStore } from "@/atlas/components/voice/voiceStageStore";
import { useUIStore, setActiveSessionId as setUISessionId } from "@/lib/stores/useUIStore";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { useShallow } from "zustand/react/shallow";
import type { ModelInfo } from "@/lib/types/provider";
import { Session, Message, ChatFolder, Step } from "../../components/chat/types";
import { projectCanonicalMessageParts } from "@/atlas/agentRuntime/messageProjection";
import { projectNormalizedTraceToMessage } from "@/atlas/agentRuntime/executionTrace";
import { upsertScopedSubagentFromStep, flushScopedSubagentNotifications, clearScopedSubagents } from "@/atlas/agentRuntime/scopedSubagentStore";
import { type Model } from "../../components/ModelSettingsContent";
import { findLiveAssistantForFetched, mergeLiveToolState } from "./liveLedgerMerge";
import { coalesceTimelineMessages } from "./chatTimelineReplay";

export const mapChatToSession = (chat: BackendChat): Session => ({
  id: chat.id,
  title: chat.title || "No Title",
  model: chat.model || "No Model",
  systemPrompt: "",
  createdAt: parseBackendDate(chat.createdAt).getTime(),
  updatedAt: parseBackendDate(chat.updatedAt).getTime(),
  pinned: chat.pinned === 1,
  folderId: chat.folderId,
  // A valid archived row has both the archive flag and the timestamp created
  // by archive_chat. This keeps legacy malformed rows out of Archived chats.
  archived: Number(chat.isArchived ?? 0) === 1 && Boolean(chat.archivedAt),
  workspaceRoot: chat.workspaceRoot ?? null,
});

/**
 * Parse date strings returned by the backend. Raw SQLite timestamp strings
 * (e.g. "YYYY-MM-DD HH:MM:SS") have no timezone info, causing JS to interpret
 * them as local time. This helper suffixes 'Z' to force UTC parsing, resolving
 * timezone offsets like Vietnam GMT+7 displaying as "7h ago".
 */
export function parseBackendDate(val: string | number): Date {
  if (typeof val === "number") return new Date(val);
  if (typeof val === "string") {
    let clean = val.trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(clean)) {
      clean = clean.replace(" ", "T") + "Z";
    } else if (!clean.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(clean)) {
      clean += "Z";
    }
    return new Date(clean);
  }
  return new Date();
}

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
  const parseArray = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string" || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.steps)) return parsed.steps;
      return [];
    } catch (e) {
      console.error("Failed to parse message array JSON:", e);
      return [];
    }
  };

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

  const rawSteps = msg.stepsJson ?? parsedMetadata?.executionSteps;
  if (typeof msg.stepsJson === "string") {
    try {
      const parsedTrace = JSON.parse(msg.stepsJson);
      if (parsedTrace && typeof parsedTrace === "object" && !Array.isArray(parsedTrace)) {
        parsedMetadata = {
          ...(parsedMetadata || {}),
          traceVersion: parsedTrace.trace_version,
          traceStatus: parsedTrace.trace_status,
        };
      }
    } catch {
      // The canonical projection below will fall back to legacy steps.
    }
  }
  const canonicalParts = projectCanonicalMessageParts({
    content: finalContent,
    reasoning: reasoning || undefined,
    steps: parseArray(rawSteps),
    toolCalls: parseArray(msg.toolCalls),
  });
  finalContent = canonicalParts.content;
  reasoning = canonicalParts.reasoning || "";
  const steps = canonicalParts.steps as Step[];
  // Silently populate scoped subagent records during bulk hydration;
  // the caller must call flushScopedSubagentNotifications() once after mapping.
  steps.forEach((step) => upsertScopedSubagentFromStep(msg.chatId, step, true));
  const parsedToolCalls = canonicalParts.toolCalls;
  const timelineGenerativeUI = steps.find((step) =>
    typeof step.metadata?.generativeUI === "boolean",
  )?.metadata?.generativeUI;
  const generativeUI = typeof parsedMetadata?.generativeUI === "boolean"
    ? (parsedMetadata.generativeUI ? 1 : 0)
    : typeof timelineGenerativeUI === "boolean"
      ? (timelineGenerativeUI ? 1 : 0)
      : undefined;


  let parsedAttachments = [];
  if (msg.attachments) {
    try {
      parsedAttachments = JSON.parse(msg.attachments);
    } catch (e) {
      console.error("Failed to parse attachments JSON:", e);
    }
  }

  const isPendingDeepResearch = msg.kind === "deep_research" && msg.isComplete !== 1;

  // Backend-reported error must win over "looks in-flight" heuristics:
  // a row with metadata.error is a terminal failure, and the inline error
  // block only renders when status === "failed". Suppressing it via
  // "sending" would silently hide real failures from the user.
  const hasError = Boolean(
    typeof parsedMetadata?.error === "string" && parsedMetadata.error.trim()
  );

  // Only treat the row as a failure when there's nothing to show for it.
  // Rows that still have content or tool calls but haven't been marked
  // complete (e.g. a page refresh that lands between the stream ending and
  // the `isComplete=1` write) should keep rendering as in-flight so the
  // optimistic stream state survives the refetch.
  const hasMeaningfulContent = Boolean(
    !hasError && (finalContent?.trim?.() || (parsedToolCalls?.length ?? 0) > 0)
  );

  return {
    id: msg.id,
    sessionId: msg.chatId,
    role: msg.role as Message["role"],
    content: finalContent,
    reasoning: reasoning || undefined,
    generativeUI,
    attachments: parsedAttachments,
    toolCalls: parsedToolCalls as Message["toolCalls"],
    steps,
    stepsJson: msg.stepsJson,
    createdAt: new Date(msg.createdAt).getTime(),
    model: msg.model,
    // A deep-research run persists an assistant placeholder before its report
    // exists. Treat that row as live while the runner owns it; mapping it as a
    // failure lets a refetch overwrite the optimistic research card and makes
    // the chat appear to reset.
    status: isPendingDeepResearch ? "sending" : msg.isComplete === 1
      ? "sent"
      : hasMeaningfulContent
        ? "sending"
        : "failed",
    kind: msg.kind as any,
    metadata: parsedMetadata,
    error: typeof parsedMetadata?.error === "string" && parsedMetadata.error.trim()
      ? parsedMetadata.error
      : undefined,
  };
};

/**
 * A hydrated row has no live stream after an app reload. Keep the saved
 * timeline visible, but never leave a tool spinner active without a live
 * owner. Completed traces promote stale running summaries to completed;
 * interrupted/failed or ambiguous rows receive the stale recovery marker.
 */
function markRecoveredMessage(message: Message): Message {
  if (message.role !== "assistant") return message;

  const traceStatus = String(message.metadata?.traceStatus || "").trim().toLowerCase();
  const traceCompleted = traceStatus === "completed";
  const messageTerminal = message.status === "sent" || message.status === "failed" || message.status === "cancelled";

  const reconcileTool = (tool: NonNullable<Message["toolCalls"]>[number]) => {
    if (tool.status !== "running") return tool;
    const hasCompletionEvidence = tool.completedAt !== undefined || tool.durationMs !== undefined;
    if (traceCompleted || (message.status === "sent" && hasCompletionEvidence)) {
      return { ...tool, status: "completed" as const, recoveryState: undefined };
    }
    return messageTerminal || message.status === "sending"
      ? { ...tool, recoveryState: "stale" as const }
      : tool;
  };

  const reconcileStep = (step: Step): Step => {
    if (step.type === "tool-call" && step.toolCall) {
      const toolCall = reconcileTool(step.toolCall);
      return toolCall === step.toolCall
        ? step
        : { ...step, recoveryState: toolCall.recoveryState, toolCall };
    }
    if (step.type === "subagent" && step.subagent?.status === "running") {
      return { ...step, recoveryState: "stale", subagent: { ...step.subagent, recoveryState: "stale" } };
    }
    return step;
  };

  const steps = message.steps?.map(reconcileStep);
  const toolCalls = message.toolCalls?.map(reconcileTool);
  const recovered = message.status === "sending";
  return {
    ...message,
    ...(recovered ? { status: "sent" as const, recoveryState: "recovered" as const } : {}),
    steps,
    toolCalls,
  };
}

const EMPTY_ARRAY: Message[] = [];
const MODEL_CATALOG_CACHE_KEY = "zen_model_catalog_cache_v2";
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
  if (model.reasoning && model.reasoning.support !== "unsupported" && model.reasoning.support !== "unknown") {
    capabilities.add("reasoning");
  }

  return {
    id: model.id,
    name: model.displayName || model.name || model.id,
    provider: model.provider || "unknown",
    description: model.description || "",
    category: "Balanced",
    capabilities: Array.from(capabilities),
    available: model.state !== "missing",
    contextWindow: backendModel.contextWindow ?? backendModel.maxContextLength,
    reasoning: model.reasoning,
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
  const queryClient = useQueryClient();
  const {
    activeSessionId: currentSessionId,
    isNewChatDraft,
    setActiveSession: setCurrentSessionId,
    startNewChat,
    messages,
    setMessages,
    setSessionMessages,
    search,
    setSearch,
    setStreamingForChat,
    isSessionStreaming,
  } = useChatStore(useShallow(state => ({
    activeSessionId: state.activeSessionId,
    isNewChatDraft: state.isNewChatDraft,
    setActiveSession: state.setActiveSession,
    startNewChat: state.startNewChat,
    messages: state.sessionMessages[state.activeSessionId ?? ''] ?? EMPTY_ARRAY,
    setMessages: state.setMessages,
    setSessionMessages: state.setSessionMessages,
    search: state.searchQuery,
    setSearch: state.setSearchQuery,
    setStreamingForChat: state.setStreamingForChat,
    isSessionStreaming: state.streamingChats[state.activeSessionId ?? ''] ?? false,
  })));

  const prevSessionRef = useRef<string | null>(currentSessionId);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const page = await chatApi.listChatsPage(500, 0);
      return page.items.map(mapChatToSession).filter((session) => !session.archived);
    },
    staleTime: 30000,
    gcTime: 5 * 60000,
  });

  const { data: archivedSessions = [] } = useQuery({
    queryKey: ["archived-sessions"],
    queryFn: async () => {
      const page = await chatApi.listArchivedChatsPage(500, 0);
      return page.items.map(mapChatToSession).filter((session) => session.archived);
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
      const [page, normalizedTraces] = await Promise.all([
        chatApi.listMessagesPage(currentSessionId, 500, 0),
        chatApi.listExecutionTraces(currentSessionId).catch(() => []),
      ]);
      const traceByMessageId = new Map<string, (typeof normalizedTraces)[number]>();
      for (const trace of normalizedTraces) {
        if (!trace.messageId) continue;
        const current = traceByMessageId.get(trace.messageId);
        const nextUpdatedAt = Date.parse(trace.updatedAt || "") || 0;
        const currentUpdatedAt = current ? Date.parse(current.updatedAt || "") || 0 : -1;
        // A malformed backend response can contain more than one trace for a
        // message. Prefer the newest version/timestamp deterministically
        // instead of letting array order decide which execution is rendered.
        if (
          !current ||
          trace.traceVersion > current.traceVersion ||
          (trace.traceVersion === current.traceVersion && nextUpdatedAt >= currentUpdatedAt)
        ) {
          traceByMessageId.set(trace.messageId, trace);
        }
      }
      // Normalized v2 nodes are the authority for new traces. Legacy
      // `steps_json` is read only when a trace has no node rows or is absent.
      // Projecting nodes after the ordinary message mapper keeps old/imported
      // sessions compatible without making steps_json authoritative again.
      const messages = coalesceTimelineMessages(page.items.map((item) => {
        const message = mapDbMessageToMessage(item);
        const trace = traceByMessageId.get(item.id);
        if (!trace || trace.traceVersion < 2 || !Array.isArray(trace.nodes) || trace.nodes.length === 0) return message;
        return projectNormalizedTraceToMessage(message, trace);
      }));
      flushScopedSubagentNotifications();
      return messages;
    },
    enabled: !!currentSessionId,
  });

  useEffect(() => {
    if (fetchedMessages && currentSessionId && !isSessionStreaming) {
      if (isMessagesFetching) return;
      const currentMessages = useChatStore.getState().sessionMessages[currentSessionId] ?? [];

      // Query invalidation can race the user-message insert at the beginning
      // of a deep-research run. An empty page is never authoritative over a
      // populated in-memory session; otherwise the visible chat briefly
      // collapses to the empty-state while the research worker is still live.
      if (fetchedMessages.length === 0 && currentMessages.length > 0) return;

      // Guard: deep_research messages are updated in-place by the chat:message
      // and chat:done event handlers. Don't let stale fetched data overwrite
      // the live message state while deep research is actively streaming.
      // Only block when a deep_research message is still in "sending" status.
      if (currentMessages.some((m) => m.kind === "deep_research" && m.status === "sending")) return;

      const latestFetchedAssistantIndex = fetchedMessages.reduce((latestIndex, message, index) =>
        message.role === "assistant" ? index : latestIndex,
      -1);
      // A backend assistant row can arrive with a new ID while the optimistic
      // assistant is still in memory. Track the live row that was reconciled
      // so it is not appended again below as an "unmatched" optimistic row.
      const matchedLiveMessageIds = new Set<string>();
      const merged = fetchedMessages.map((msg, index) => {
        let updatedMsg = msg;
        const existing = findLiveAssistantForFetched(msg, currentMessages, {
          allowLatestFallback: index === latestFetchedAssistantIndex,
        });
        if (existing) matchedLiveMessageIds.add(existing.id);
        
        // If the fetched message is a deep research message, and the existing live message
        // has content/is complete while the fetched one is stale/incomplete (e.g. status "failed"
        // because it was fetched before completion database write finished or because of stale query),
        // we must preserve the live message's content, status, and metadata.
        if (updatedMsg.kind === "deep_research" && existing?.kind === "deep_research") {
          const fetchedIsComplete = updatedMsg.status === "sent";
          const existingIsComplete = existing.status === "sent";
          if (existingIsComplete && !fetchedIsComplete) {
            // Live message is complete but fetched DB row is stale — preserve live state.
            updatedMsg = {
              ...updatedMsg,
              status: existing.status,
              content: existing.content,
              metadata: existing.metadata,
              error: existing.error,
            };
          } else if (existingIsComplete && fetchedIsComplete) {
            // Both are complete. The live message may have richer researchSteps
            // accumulated from streaming events that the DB hasn't persisted yet.
            // Prefer the live metadata when it has more research steps.
            const liveStepCount = existing.metadata?.researchSteps?.length ?? 0;
            const fetchedStepCount = updatedMsg.metadata?.researchSteps?.length ?? 0;
            if (liveStepCount > fetchedStepCount) {
              updatedMsg = {
                ...updatedMsg,
                metadata: existing.metadata,
              };
            }
          } else if (existing.content && !updatedMsg.content) {
            updatedMsg = {
              ...updatedMsg,
              content: existing.content,
              metadata: existing.metadata || updatedMsg.metadata,
            };
          }
        }

        const withToolState = mergeLiveToolState(updatedMsg, existing);
        const hydrated = existing?.artifact ? { ...withToolState, artifact: existing.artifact } : withToolState;
        return markRecoveredMessage(hydrated);
      });

      const fetchedIds = new Set(merged.map((message) => message.id));
      const optimisticAssistants = currentMessages.filter((message) =>
        isRecentOptimisticAssistant(message) &&
        !fetchedIds.has(message.id) &&
        !matchedLiveMessageIds.has(message.id)
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
    if (sessions.length > 0 && !currentSessionId && !isNewChatDraft) {
      setCurrentSessionId(sessions[0].id);
    }
  }, [sessions, currentSessionId, isNewChatDraft, setCurrentSessionId]);

  // ── Listen for backend title-maker updates ───────────────────────────────
  // `commands/chat/title.rs::generate_session_title` emits
  // `chat:title-updated` after persisting an auto-generated title.
  // Patch the session in place so the sidebar / list updates without
  // refetching the full sessions query. Mirrors the rename mutation
  // contract (UI updates title on the same Session row identified by id).
  useEffect(() => {
    if (!IS_TAURI) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<{ chat_id: string; title: string }>(
          "chat:title-updated",
          (event) => {
            if (cancelled) return;
            const { chat_id, title } = event.payload;
            if (!chat_id || !title) return;

            const patch = (key: readonly unknown[]) =>
              queryClient.setQueryData<Session[]>(key, (prev) =>
                prev?.map((s) => (s.id === chat_id ? { ...s, title } : s))
              );
            patch(["sessions"]);
            patch(["archived-sessions"]);
          }
        )
      )
      .then((unsub) => {
        if (cancelled) {
          unsub();
        } else {
          unlisten = unsub;
        }
      })
      .catch((err) => {
        console.warn("[useChatQueries] failed to listen for chat:title-updated:", err);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [queryClient]);
  // On session switch, clear the previous session's non-streaming runtime
  // state (active artifact, task store, agent activity, voice board) so
  // stale data doesn't flash before the new fetch completes. Preserve
  // sessionMessages, streamingChats, and activeAssistantByChat for chats
  // that are still actively streaming in the background.
  useEffect(() => {
    const prev = prevSessionRef.current;
    prevSessionRef.current = currentSessionId;
    if (prev !== null && prev !== currentSessionId) {
      const chatStore = useChatStore.getState();
      if (chatStore.activeArtifactId) {
        chatStore.setActiveArtifact(null);
      }

      const prevStillStreaming = chatStore.streamingChats[prev] === true;
      if (prevStillStreaming) {
        // Background-streaming chat — preserve live buffers so stream
        // events keep routing correctly. Only clear the local UI artifact.
      } else {
        // Inactive chat — safe to purge its full runtime footprint.
        chatStore.clearSessionRuntime(prev);
        clearScopedSubagents(prev);
      }

      useTaskStore.getState().setActiveChatId(currentSessionId);
      useTaskStore.getState().clearTasksForChat(prev);

      // Voice board is session-bound — clear widgets, retained boards,
      // and close lifecycle so stale visualizations don't leak. Skip the
      // wipe when the overlay is currently open: the user is actively
      // working with it and an out-of-band clear would silently drop their
      // in-flight board contents and reject subsequent updates.
      if (!useUIStore.getState().voiceModeOpen) {
        const voiceStore = useVoiceStageStore.getState();
        voiceStore.clear();
        voiceStore.close();
      }

      // Track the active session for the UI store's per-session tab memory & active terminal binding
      setUISessionId(currentSessionId);
      useUIStore.getState().setActiveChatId(currentSessionId);
      // Restore the right-panel tab remembered for the new session
      useUIStore.getState().restoreRightTabForSession(currentSessionId);
    } else {
      useTaskStore.getState().setActiveChatId(currentSessionId);
      setUISessionId(currentSessionId);
      useUIStore.getState().setActiveChatId(currentSessionId);
    }
  }, [currentSessionId]);

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
    sessionsLoading,
    archivedSessions,
    folders,
    currentSessionId,
    setCurrentSessionId,
    startNewChat,
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
