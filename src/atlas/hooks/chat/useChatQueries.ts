import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chatApi, providersApi, type BackendChat, type BackendFolder, type BackendMessage } from "@/api";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { useShallow } from "zustand/react/shallow";
import type { ModelInfo } from "@/lib/types/provider";
import { Session, Message, ChatFolder, ToolCall, Step } from "../../components/chat/types";
import { type Model } from "../../components/ModelSettingsContent";

const ACTION_MESSAGE_KINDS = new Set([
  "tool_call",
  "tool_result",
  "agent_handoff",
  "agent_spawn",
  "agent_complete",
  "approval_request",
  "clarification_request",
  "deep_research",
  "error",
  "system",
  "chat_status",
  "orchestrator_progress",
  "workflow_started",
  "workflow_completed",
  "workflow_failed",
  "task_started",
  "task_completed",
  "task_failed",
]);

function normalizeActionMetadata(metadata: any) {
  if (!metadata || typeof metadata !== "object") return metadata;
  return {
    ...metadata,
    approvalRequest: metadata.approvalRequest || metadata.approval_request,
    toolResult: metadata.toolResult || metadata.tool_result,
    toolCall: metadata.toolCall || metadata.tool_call,
  };
}

function getActionEventId(message: Message): string {
  const meta: any = message.metadata || {};
  const toolName =
    meta.toolCall?.toolName ||
    meta.tool_call?.tool_name ||
    meta.toolResult?.toolName ||
    meta.tool_result?.tool_name;

  const toolCallId =
    meta.toolCall?.toolCallId ||
    meta.toolCall?.tool_call_id ||
    meta.tool_call?.tool_call_id ||
    meta.toolResult?.toolCallId ||
    meta.toolResult?.tool_call_id ||
    meta.tool_result?.tool_call_id;

  if ((message.kind === "tool_call" || message.kind === "tool_result") && toolName) {
    if (toolCallId) {
      return `tool:${toolCallId}`;
    }
    return `tool:${meta.iteration ?? "unknown"}:${toolName}`;
  }
  if (message.kind === "orchestrator_progress") {
    return `orchestrator:${message.sessionId || "history"}`;
  }
  const stable =
    toolCallId ||
    meta.approvalRequest?.tool_call_id ||
    meta.approvalRequest?.toolCallId ||
    meta.approval_request?.tool_call_id ||
    meta.spawn?.spawnId ||
    meta.spawn?.spawn_id;
  return `${message.kind || "action"}:${stable || message.id}`;
}

function isTimelineActionMessage(message: Message): boolean {
  return !!message.kind && ACTION_MESSAGE_KINDS.has(message.kind);
}

function actionMessageToStep(message: Message): Step {
  const metadata = normalizeActionMetadata(message.metadata);
  const status = metadata?.status === "error" || metadata?.spawn?.status === "failed" || metadata?.toolResult?.status === "error"
    ? "error"
    : metadata?.status === "completed" || metadata?.spawn?.status === "completed" || metadata?.toolResult?.status === "ok" || message.kind === "agent_complete" || message.kind === "tool_result"
      ? "completed"
      : "running";

  return {
    type: "action",
    kind: message.kind,
    content: message.content,
    metadata,
    status,
    timestamp: message.createdAt,
    eventId: getActionEventId({ ...message, metadata }),
  };
}

function coalesceTimelineMessages(messages: Message[]): Message[] {
  const output: Message[] = [];
  let pendingSteps: Step[] = [];

  const mergePendingStep = (step: Step) => {
    const existingIdx = pendingSteps.findIndex((pending) => pending.eventId && pending.eventId === step.eventId);
    if (existingIdx === -1) {
      pendingSteps.push(step);
    } else {
      pendingSteps[existingIdx] = { ...pendingSteps[existingIdx], ...step };
    }
  };

  for (const message of messages) {
    if (isTimelineActionMessage(message)) {
      mergePendingStep(actionMessageToStep(message));
      continue;
    }

    if (message.role === "assistant" && pendingSteps.length > 0) {
      output.push({
        ...message,
        steps: [...pendingSteps, ...(message.steps || [])],
        metadata: {
          ...(message.metadata || {}),
          timelineActionCount: pendingSteps.length,
        } as any,
      });
      pendingSteps = [];
      continue;
    }

    if (message.role === "user" && pendingSteps.length > 0) {
      output.push({
        id: `timeline-${pendingSteps[0]?.eventId || Date.now()}`,
        sessionId: message.sessionId,
        role: "system",
        content: "",
        kind: "system",
        status: "sent",
        createdAt: pendingSteps[0]?.timestamp || message.createdAt,
        steps: pendingSteps,
      });
      pendingSteps = [];
    }

    output.push(message);
  }

  if (pendingSteps.length > 0) {
    const last = output[output.length - 1];
    if (last?.role === "assistant") {
      output[output.length - 1] = {
        ...last,
        steps: [...(last.steps || []), ...pendingSteps],
      };
    } else {
      output.push({
        id: `timeline-${pendingSteps[0]?.eventId || Date.now()}`,
        sessionId: last?.sessionId,
        role: "system",
        content: "",
        kind: "system",
        status: "sent",
        createdAt: pendingSteps[0]?.timestamp || Date.now(),
        steps: pendingSteps,
      });
    }
  }

  return output;
}

function mergeLiveToolState(fetched: Message, existing?: Message): Message {
  if (!existing?.toolCalls?.length && !existing?.steps?.length) {
    return fetched;
  }

  const liveTools = new Map<string, ToolCall>();
  existing.toolCalls?.forEach((tool) => liveTools.set(tool.id, tool));
  existing.steps?.forEach((step) => {
    if (step.type === "tool-call" && step.toolCall) {
      liveTools.set(step.toolCall.id, step.toolCall);
    }
  });

  if (liveTools.size === 0) return fetched;

  const mergeTool = (tool: ToolCall): ToolCall => {
    const live = liveTools.get(tool.id);
    if (!live) return { ...tool, output: tool.output || "" };
    return {
      ...tool,
      status: live.status || tool.status,
      output: live.output || tool.output || "",
      durationMs: live.durationMs ?? tool.durationMs,
      attempts: live.attempts || tool.attempts,
      startTime: live.startTime ?? tool.startTime,
    };
  };

  const toolCalls = fetched.toolCalls?.map(mergeTool) || fetched.toolCalls;
  const steps = fetched.steps?.map((step) =>
    step.type === "tool-call" && step.toolCall
      ? { ...step, toolCall: mergeTool(step.toolCall) }
      : step
  );

  return { ...fetched, toolCalls, steps };
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
    try {
      parsedToolCalls = JSON.parse(msg.toolCalls);
    } catch (e) {
      console.error("Failed to parse tool calls JSON:", e);
    }
  }

  const steps: Step[] = [];
  if (parsedToolCalls.length > 0) {
    parsedToolCalls.forEach((toolCall) => {
      steps.push({ type: "tool-call", toolCall });
    });
  }
  if (msg.content) {
    steps.push({ type: "text", content: msg.content });
  }

  return {
    id: msg.id,
    sessionId: msg.chatId,
    role: msg.role as Message["role"],
    content: msg.content,
    attachments: [],
    toolCalls: parsedToolCalls,
    steps,
    createdAt: new Date(msg.createdAt).getTime(),
    model: msg.model,
    status: msg.isComplete === 1 ? "sent" : "sending",
    kind: msg.kind as any,
    metadata: parsedMetadata,
  };
};

const EMPTY_ARRAY: Message[] = [];

function modelInfoToModel(model: ModelInfo): Model {
  return {
    id: model.id,
    name: model.displayName || model.name || model.id,
    provider: model.provider || "unknown",
    description: model.description || "",
    category: "Balanced",
    capabilities: model.capabilities || ["text"],
    available: model.state !== "missing",
    contextWindow: model.contextWindow,
  };
}

function isMessageSemanticallyEqual(a: Message, b: Message): boolean {
  if (a.id !== b.id) return false;
  if (a.role !== b.role) return false;
  if (a.content !== b.content) return false;
  if (a.status !== b.status) return false;
  
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
      const chats = await chatApi.listChats();
      return chats.map(mapChatToSession);
    },
  });

  const { data: archivedSessions = [] } = useQuery({
    queryKey: ["archived-sessions"],
    queryFn: async () => {
      const chats = await chatApi.listArchivedChats();
      return chats.map(mapChatToSession);
    },
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: async () => {
      const fds = await chatApi.listFolders();
      return fds.map(mapChatFolderToFolder);
    },
  });

  const customProviders = useSettingsStore(useShallow((s) => s.customProviders));
  const {
    data: discoveredModels = [],
    isFetching: modelsLoading,
    refetch: refetchModels,
  } = useQuery({
    queryKey: ["provider-model-catalog"],
    queryFn: async () => providersApi.getAllAvailableModels(null),
    staleTime: 60_000,
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
    return [...discoveredModels, ...customModels]
      .filter((model) => {
        const key = `${model.provider || "unknown"}:${model.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(modelInfoToModel);
  }, [discoveredModels, customProviders]);

  const { data: fetchedMessages, isFetching: isMessagesFetching } = useQuery({
    queryKey: ["messages", currentSessionId],
    queryFn: async () => {
      const msgs = await chatApi.listMessages(currentSessionId);
      return coalesceTimelineMessages(msgs.map(mapDbMessageToMessage));
    },
    enabled: !!currentSessionId,
  });

  useEffect(() => {
    if (fetchedMessages && currentSessionId && !isSessionStreaming) {
      if (isMessagesFetching) return;
      const currentMessages = useChatStore.getState().sessionMessages[currentSessionId] ?? [];
      const merged = fetchedMessages.map(msg => {
        const existing = currentMessages.find(m => m.id === msg.id);
        const withToolState = mergeLiveToolState(msg, existing);
        return existing?.artifact ? { ...withToolState, artifact: existing.artifact } : withToolState;
      });
      
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
