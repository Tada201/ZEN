import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chatApi, providersApi, type BackendChat, type BackendFolder, type BackendMessage } from "@/api";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { useShallow } from "zustand/react/shallow";
import type { ModelInfo } from "@/lib/types/provider";
import { Session, Message, ChatFolder, ToolCall, Step } from "../../components/chat/types";
import { type Model } from "../../components/ModelSettingsContent";
import { toolResultMetaToOutput } from "../../components/chat/assistantMessageParts";
import { findLiveAssistantForFetched, mergeLiveToolState } from "./liveLedgerMerge";

const ACTION_MESSAGE_KINDS = new Set([
  "tool_call",
  "tool_result",
  "agent_handoff",
  "agent_spawn",
  "agent_complete",
  "agent_chunk",
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
  "task_created",
  "task_started",
  "task_updated",
  "task_list_updated",
  "task_complexity_analyzed",
  "task_completed",
  "task_failed",
]);

function normalizeActionMetadata(metadata: any) {
  if (!metadata || typeof metadata !== "object") return metadata;
  return {
    ...metadata,
    runId: metadata.runId || metadata.run_id,
    messageId: metadata.messageId || metadata.message_id,
    parentAgentId: metadata.parentAgentId || metadata.parent_agent_id || metadata.parentAgent || metadata.parent_agent,
    executionId: metadata.executionId || metadata.execution_id,
    batchId: metadata.batchId || metadata.batch_id,
    toolBatchId: metadata.toolBatchId || metadata.tool_batch_id,
    approvalRequest: metadata.approvalRequest || metadata.approval_request,
    toolResult: metadata.toolResult || metadata.tool_result,
    toolCall: metadata.toolCall || metadata.tool_call,
    agentStream: metadata.agentStream || metadata.agent_stream,
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
  if (message.kind === "agent_chunk") {
    const agentId = meta.agentId || meta.agent_id || meta.agentName || meta.agent_name || meta.spawn?.childAgent;
    return `agent-chunk:${message.sessionId || "history"}:${agentId || "agent"}`;
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

function isEmptyToolInput(input: ToolCall["input"] | undefined) {
  return input === undefined ||
    input === null ||
    input === "" ||
    (typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0);
}

function mergeReplayToolCall(previous: ToolCall | undefined, incoming: ToolCall): ToolCall {
  if (!previous) return incoming;
  const keepTerminalStatus = (previous.status === "completed" || previous.status === "error") && incoming.status === "running";
  return {
    ...previous,
    ...incoming,
    status: keepTerminalStatus ? previous.status : incoming.status,
    input: isEmptyToolInput(incoming.input) ? previous.input : incoming.input,
    output: incoming.output || previous.output,
    durationMs: incoming.durationMs ?? previous.durationMs,
    approvalContext: incoming.approvalContext || previous.approvalContext,
    runId: incoming.runId || previous.runId,
    messageId: incoming.messageId || previous.messageId,
    parentAgentId: incoming.parentAgentId || previous.parentAgentId,
    executionId: incoming.executionId || previous.executionId,
    agentId: incoming.agentId || previous.agentId,
    agentName: incoming.agentName || previous.agentName,
    iteration: incoming.iteration ?? previous.iteration,
    batchId: incoming.batchId || previous.batchId,
    toolBatchId: incoming.toolBatchId || previous.toolBatchId,
    startTime: previous.startTime || incoming.startTime,
    completedAt: incoming.completedAt ?? previous.completedAt,
    lastUpdatedAt: incoming.lastUpdatedAt ?? previous.lastUpdatedAt,
  };
}

function mergeReplayActionStep(previous: Step, incoming: Step): Step {
  const metadata: any = {
    ...(previous.metadata || {}),
    ...(incoming.metadata || {}),
  };
  if (previous.metadata?.spawn || incoming.metadata?.spawn) {
    metadata.spawn = {
      ...(previous.metadata?.spawn || {}),
      ...(incoming.metadata?.spawn || {}),
      task: incoming.metadata?.spawn?.task || previous.metadata?.spawn?.task || incoming.content || previous.content || "",
    };
  }
  if (previous.metadata?.agentStream || incoming.metadata?.agentStream) {
    const previousContent = previous.metadata?.agentStream?.content || "";
    const incomingContent = incoming.metadata?.agentStream?.content || "";
    metadata.agentStream = {
      ...(previous.metadata?.agentStream || {}),
      ...(incoming.metadata?.agentStream || {}),
      content: incomingContent && previousContent.endsWith(incomingContent)
        ? previousContent
        : previousContent + incomingContent,
    };
  }
  if (
    (previous.status === "completed" || previous.status === "error" || previous.status === "cancelled") &&
    incoming.status === "running"
  ) {
    return { ...previous, metadata };
  }
  return {
    ...previous,
    ...incoming,
    metadata,
  };
}

function getToolCallIdFromMetadata(metadata: any): string | undefined {
  return (
    metadata?.toolCall?.toolCallId ||
    metadata?.toolCall?.tool_call_id ||
    metadata?.tool_call?.toolCallId ||
    metadata?.tool_call?.tool_call_id ||
    metadata?.toolResult?.toolCallId ||
    metadata?.toolResult?.tool_call_id ||
    metadata?.tool_result?.toolCallId ||
    metadata?.tool_result?.tool_call_id
  );
}

function toolActionMessageToToolCall(message: Message): ToolCall | null {
  const metadata = normalizeActionMetadata(message.metadata);
  const toolCall = metadata?.toolCall || metadata?.tool_call;
  const toolResult = metadata?.toolResult || metadata?.tool_result;
  const id = getToolCallIdFromMetadata(metadata) || message.id;
  const name = toolResult?.toolName || toolResult?.tool_name || toolCall?.toolName || toolCall?.tool_name;

  if (!name) return null;

  const status: ToolCall["status"] =
    message.kind === "tool_result"
      ? toolResult?.status === "error" || toolResult?.status === "timeout"
        ? "error"
        : "completed"
      : toolCall?.status === "error"
        ? "error"
        : "running";

  const output = toolResult ? toolResultMetaToOutput(toolResult, message.content) : "";

  return {
    id,
    name,
    status,
    input: toolCall?.args || toolResult?.args || toolResult?.input || {},
    output,
    durationMs: toolResult?.durationMs ?? toolResult?.duration_ms,
    runId: metadata?.runId,
    messageId: metadata?.messageId,
    parentAgentId: metadata?.parentAgentId,
    executionId: metadata?.executionId,
    agentId: metadata?.agentId || metadata?.agent_id,
    agentName: metadata?.agentName || metadata?.agent_name,
    iteration: typeof metadata?.iteration === "number" ? metadata.iteration : undefined,
    batchId: toolResult?.batchId || toolResult?.batch_id || toolCall?.batchId || toolCall?.batch_id || metadata?.batchId || metadata?.toolBatchId,
    toolBatchId: toolResult?.toolBatchId || toolResult?.tool_batch_id || toolCall?.toolBatchId || toolCall?.tool_batch_id || metadata?.toolBatchId,
    startTime: message.createdAt,
    completedAt: status === "completed" || status === "error" ? message.createdAt : undefined,
    lastUpdatedAt: message.createdAt,
  };
}

function coalesceTimelineMessages(messages: Message[]): Message[] {
  const output: Message[] = [];
  let pendingSteps: Step[] = [];
  let pendingTools = new Map<string, ToolCall>();

  const mergePendingStep = (step: Step) => {
    const existingIdx = pendingSteps.findIndex((pending) => pending.eventId && pending.eventId === step.eventId);
    if (existingIdx === -1) {
      pendingSteps.push(step);
    } else {
      pendingSteps[existingIdx] = mergeReplayActionStep(pendingSteps[existingIdx], step);
    }
  };

  const mergePendingTool = (toolCall: ToolCall) => {
    const previous = pendingTools.get(toolCall.id);
    const merged = mergeReplayToolCall(previous, toolCall);
    pendingTools.set(toolCall.id, merged);

    const existingStepIdx = pendingSteps.findIndex(
      (pending) => pending.type === "tool-call" && pending.toolCall?.id === toolCall.id
    );
    const toolStep: Step = { type: "tool-call", toolCall: merged };
    if (existingStepIdx === -1) {
      pendingSteps.push(toolStep);
    } else {
      pendingSteps[existingStepIdx] = toolStep;
    }
  };

  const flushPendingIntoMessage = (message: Message): Message => {
    const toolCalls = Array.from(pendingTools.values());
    const next = {
      ...message,
      toolCalls: [...toolCalls, ...(message.toolCalls || [])],
      steps: [...pendingSteps, ...(message.steps || [])],
      metadata: {
        ...(message.metadata || {}),
        ...(pendingSteps.length > 0 ? { timelineActionCount: pendingSteps.length } : {}),
      } as any,
    };
    pendingSteps = [];
    pendingTools = new Map();
    return next;
  };

  for (const message of messages) {
    if (isTimelineActionMessage(message)) {
      if (message.kind === "tool_call" || message.kind === "tool_result") {
        const toolCall = toolActionMessageToToolCall(message);
        if (toolCall) {
          mergePendingTool(toolCall);
        }
        continue;
      }
      mergePendingStep(actionMessageToStep(message));
      continue;
    }

    if (message.role === "assistant" && (pendingSteps.length > 0 || pendingTools.size > 0)) {
      output.push(flushPendingIntoMessage(message));
      continue;
    }

    if (message.role === "user" && (pendingSteps.length > 0 || pendingTools.size > 0)) {
      const toolCalls = Array.from(pendingTools.values());
      output.push({
        id: `timeline-${pendingSteps[0]?.eventId || toolCalls[0]?.id || Date.now()}`,
        sessionId: message.sessionId,
        role: "system",
        content: "",
        kind: "system",
        status: "sent",
        createdAt: pendingSteps[0]?.timestamp || message.createdAt || Date.now(),
        toolCalls,
        steps: pendingSteps,
      });
      pendingSteps = [];
      pendingTools = new Map();
    }

    output.push(message);
  }

  if (pendingSteps.length > 0 || pendingTools.size > 0) {
    const last = output[output.length - 1];
    if (last?.role === "assistant") {
      output[output.length - 1] = flushPendingIntoMessage(last);
    } else {
      const toolCalls = Array.from(pendingTools.values());
      output.push({
        id: `timeline-${pendingSteps[0]?.eventId || toolCalls[0]?.id || Date.now()}`,
        sessionId: last?.sessionId,
        role: "system",
        content: "",
        kind: "system",
        status: "sent",
        createdAt: pendingSteps[0]?.timestamp || Date.now(),
        toolCalls,
        steps: pendingSteps,
      });
    }
  }

  return output;
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
  if (!reasoning && finalContent && /<\/?(?:think|thought)>/i.test(finalContent)) {
    const thinkMatch = /<(?:thought|think)>([\s\S]*?)<\/(?:thought|think)>/i.exec(finalContent);
    if (thinkMatch) {
      reasoning = thinkMatch[1].trim();
      finalContent = finalContent.replace(/<(?:thought|think)>[\s\S]*?<\/(?:thought|think)>/ig, "").trim();
    } else {
      const openMatch = /<(?:thought|think)>/i.exec(finalContent);
      if (openMatch) {
        const idx = openMatch.index;
        reasoning = finalContent.slice(idx + openMatch[0].length).trim();
        finalContent = finalContent.slice(0, idx).trim();
      }
    }
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
    status: msg.isComplete === 1 ? "sent" : "sending",
    kind: msg.kind as any,
    metadata: parsedMetadata,
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
  });

  const { data: archivedSessions = [] } = useQuery({
    queryKey: ["archived-sessions"],
    queryFn: async () => {
      const page = await chatApi.listArchivedChatsPage(500, 0);
      return page.items.map(mapChatToSession);
    },
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: async () => {
      const fds = await chatApi.listFolders();
      return fds.map(mapChatFolderToFolder);
    },
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
