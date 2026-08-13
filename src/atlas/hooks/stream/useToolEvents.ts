import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listenAppEvent } from "@/api/events";
import { useChatStore } from "@/lib/stores/useChatStore";
import { getToolChatId, rememberToolChat } from "./toolLifecycleRouting";
import { makeToolCall, upsertTool } from "./toolEventReducer";
import type { Message, ToolCall } from "../../components/chat/types";
import { focusActiveAgentsPanel } from "./agentPanelFocus";
import { findWritableAssistantIndex } from "./messageTarget";
import { persistExecutionCheckpointForEvent } from "./persistExecutionCheckpoint";
import { normalizeExecutionPhase } from "@/atlas/agentRuntime/executionTrace";

interface UseToolEventsProps {
  resetHeartbeatTimeout: (chatId: string) => void;
}

type ToolEventMetaPayload = {
  trace_id?: string;
  traceId?: string;
  run_id?: string;
  runId?: string;
  message_id?: string;
  messageId?: string;
  parent_agent?: string;
  parentAgent?: string;
  parent_agent_id?: string;
  parentAgentId?: string;
  parent_tool_call_id?: string;
  parentToolCallId?: string;
  sequence?: number;
  timestamp?: string;
  phase?: string;
  execution_id?: string;
  executionId?: string;
  agent_id?: string;
  agent_name?: string;
  iteration?: number;
  batch_id?: string;
  batchId?: string;
  tool_batch_id?: string;
  toolBatchId?: string;
  context?: Record<string, unknown>;
};

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function redactPreview(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/(api[_-]?key|authorization|bearer|credential|password|secret|token)/i.test(value)) {
    return "[redacted sensitive tool arguments]";
  }
  return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return values.length > 0 ? values : undefined;
}

function normalizeApprovalContext(context?: Record<string, unknown>): ToolCall["approvalContext"] | undefined {
  if (!context) return undefined;
  const approvalContext = {
    riskLevel: readString(context.risk_level) || readString(context.riskLevel),
    description: readString(context.description),
    argumentsPreview: redactPreview(readString(context.arguments_preview) || readString(context.argumentsPreview)),
    suggestedPatterns: readStringArray(context.suggested_patterns) || readStringArray(context.suggestedPatterns),
  };
  return Object.values(approvalContext).some(Boolean) ? approvalContext : undefined;
}

function getToolEventMeta(payload: ToolEventMetaPayload) {
  const toolBatchId = payload.tool_batch_id || payload.toolBatchId;
  return {
    traceId: payload.trace_id || payload.traceId,
    runId: payload.run_id || payload.runId,
    messageId: payload.message_id || payload.messageId,
    parentAgentId: payload.parent_agent_id || payload.parentAgentId || payload.parent_agent || payload.parentAgent,
    parentToolCallId: payload.parent_tool_call_id || payload.parentToolCallId,
    sequence: payload.sequence,
    phase: payload.phase ? normalizeExecutionPhase(payload.phase, undefined) : undefined,
    startTime: payload.timestamp ? Date.parse(payload.timestamp) : undefined,
    executionId: payload.execution_id || payload.executionId,
    agentId: payload.agent_id,
    agentName: payload.agent_name,
    iteration: payload.iteration,
    batchId: payload.batch_id || payload.batchId || toolBatchId,
    toolBatchId,
    approvalContext: normalizeApprovalContext(payload.context),
  };
}

export function useToolEvents({ resetHeartbeatTimeout }: UseToolEventsProps) {
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const toolChatIdsRef = useRef<Map<string, string>>(new Map());
  const pendingMessageUpdatesRef = useRef<Map<string, Array<(messages: Message[]) => Message[]>>>(new Map());
  const updateFrameRef = useRef<number | null>(null);

  const flushMessageUpdates = () => {
    updateFrameRef.current = null;
    const pending = pendingMessageUpdatesRef.current;
    pendingMessageUpdatesRef.current = new Map();
    pending.forEach((updates, chatId) => {
      if (updates.length === 0) return;
      useChatStore.getState().setSessionMessages(chatId, (messages) => updates.reduce((next, update) => update(next), messages));
    });
  };

  const queueMessageUpdate = (chatId: string, update: (messages: Message[]) => Message[]) => {
    const updates = pendingMessageUpdatesRef.current.get(chatId) || [];
    updates.push(update);
    pendingMessageUpdatesRef.current.set(chatId, updates);
    if (updateFrameRef.current === null) updateFrameRef.current = requestAnimationFrame(flushMessageUpdates);
  };

  useEffect(() => {
    const setupListeners = async () => {
      unlistenRefs.current.forEach((unlisten) => unlisten());
      unlistenRefs.current = [];

      const unlistenAuthorization = await listenAppEvent("tool:authorization_request", (event) => {
        const chatId = getToolChatId(toolChatIdsRef.current, event.payload, useChatStore.getState());
        if (!chatId) return;
        focusActiveAgentsPanel({ force: true });
        rememberToolChat(toolChatIdsRef.current, event.payload, chatId);
        useChatStore.getState().setStreamingForChat(chatId, true);
        resetHeartbeatTimeout(chatId);
        const tool = makeToolCall(
          event.payload.tool_call_id,
          event.payload.tool_name,
          "awaiting_approval",
          event.payload.arguments,
          "",
          undefined,
          undefined,
          getToolEventMeta(event.payload),
        );
        queueMessageUpdate(chatId, (prev) => upsertTool(prev, chatId, tool));
        persistExecutionCheckpointForEvent({
          chatId,
          messageId: event.payload.message_id || event.payload.messageId,
          toolCallId: event.payload.tool_call_id,
        });
      });

      const unlistenToolStart = await listenAppEvent("tool:start", (event) => {
        const chatId = getToolChatId(toolChatIdsRef.current, event.payload, useChatStore.getState());
        if (!chatId) return;
        rememberToolChat(toolChatIdsRef.current, event.payload, chatId);
        useChatStore.getState().setStreamingForChat(chatId, true);
        resetHeartbeatTimeout(chatId);
        const tool = makeToolCall(
          event.payload.tool_call_id,
          event.payload.tool_name,
          "running",
          event.payload.arguments,
          "",
          undefined,
          undefined,
          getToolEventMeta(event.payload),
        );
        queueMessageUpdate(chatId, (prev) => upsertTool(prev, chatId, tool));
        persistExecutionCheckpointForEvent({
          chatId,
          messageId: event.payload.message_id || event.payload.messageId,
          toolCallId: event.payload.tool_call_id,
        });
      });

      const unlistenToolComplete = await listenAppEvent("tool:complete", (event) => {
        const chatId = getToolChatId(toolChatIdsRef.current, event.payload, useChatStore.getState());
        if (!chatId) return;
        rememberToolChat(toolChatIdsRef.current, event.payload, chatId);
        resetHeartbeatTimeout(chatId);
        const status: ToolCall["status"] = event.payload.status === "success" ? "completed" : "error";
        const tool = makeToolCall(
          event.payload.tool_call_id,
          event.payload.tool_name,
          status,
          {},
          event.payload.output,
          event.payload.duration_ms,
          undefined,
          getToolEventMeta(event.payload),
        );
        queueMessageUpdate(chatId, (prev) => {
          const next = upsertTool(prev, chatId, tool);

          // Auto-inject image markdown when generate_image completes successfully
          if (event.payload.tool_name === "generate_image" && event.payload.status === "success") {
            const imageUri = extractImageUri(event.payload.output);
            if (imageUri) {
              // Prefer precise ownership match, fall back to active sending assistant
              const ownershipIdx = findAssistantWithTool(next, event.payload.tool_call_id);
              const targetIdx = ownershipIdx !== -1 ? ownershipIdx : findWritableAssistantIndex(next, chatId);
              if (targetIdx !== -1) {
                const msg = next[targetIdx];
                const imageMarkdown = `\n\n![Generated Image](${imageUri})\n\n`;
                // Don't inject if the content already contains this image URI
                if (!msg.content.includes(imageUri)) {
                  const updatedMsg: Message = {
                    ...msg,
                    content: msg.content + imageMarkdown,
                    steps: [
                      ...(msg.steps || []),
                      { type: "text", content: imageMarkdown.trim() },
                    ],
                  };
                  const final = [...next];
                  final[targetIdx] = updatedMsg;
                  return final;
                }
              }
            }
          }

          return next;
        });
        persistExecutionCheckpointForEvent({
          chatId,
          messageId: event.payload.message_id || event.payload.messageId,
          toolCallId: event.payload.tool_call_id,
        });
      });

      const unlistenAuthorizationTimeout = await listenAppEvent("tool:authorization_timeout", (event) => {
        const chatId = getToolChatId(toolChatIdsRef.current, event.payload, useChatStore.getState());
        if (!chatId) return;
        focusActiveAgentsPanel({ force: true });
        rememberToolChat(toolChatIdsRef.current, event.payload, chatId);
        resetHeartbeatTimeout(chatId);
        const tool = makeToolCall(
          event.payload.tool_call_id,
          event.payload.tool_name,
          "error",
          event.payload.arguments || {},
          JSON.stringify({
            error: "Tool approval timed out.",
            hint: "Review the request and send the message again if you still want the tool to run.",
          }),
          undefined,
          undefined,
          getToolEventMeta(event.payload),
        );
        queueMessageUpdate(chatId, (prev) => upsertTool(prev, chatId, tool));
        persistExecutionCheckpointForEvent({
          chatId,
          messageId: event.payload.message_id || event.payload.messageId,
          toolCallId: event.payload.tool_call_id,
          flush: true,
        });
      });

      unlistenRefs.current.push(unlistenAuthorization, unlistenToolStart, unlistenToolComplete, unlistenAuthorizationTimeout);
    };

    setupListeners();

    return () => {
      unlistenRefs.current.forEach((unlisten) => unlisten());
      unlistenRefs.current = [];
    };
  }, [resetHeartbeatTimeout]);
}

/**
 * Extract image_uri from a generate_image tool output string.
 * The output is typically a JSON string like { status: "success", image_uri: "asset://localhost/..." }.
 */
function extractImageUri(output: string | undefined): string | undefined {
  if (!output) return undefined;
  try {
    const parsed = JSON.parse(output);
    return parsed.image_uri || parsed.imageUri || parsed.image_url || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Find the assistant message index that owns a given tool call ID.
 */
function findAssistantWithTool(messages: Message[], toolCallId: string): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    if (msg.toolCalls?.some((tc) => tc.id === toolCallId)) return i;
    if (msg.steps?.some((s) => s.type === "tool-call" && s.toolCall?.id === toolCallId)) return i;
  }
  return -1;
}
