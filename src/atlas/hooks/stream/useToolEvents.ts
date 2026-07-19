import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listenAppEvent } from "@/api/events";
import { useChatStore } from "@/lib/stores/useChatStore";
import { getToolChatId, rememberToolChat } from "./toolLifecycleRouting";
import { makeToolCall, upsertTool } from "./toolEventReducer";
import type { Message, ToolCall } from "../../components/chat/types";
import { focusActiveAgentsPanel, shouldFocusAgentsForTool } from "./agentPanelFocus";
import { findWritableAssistantIndex } from "./messageTarget";

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
        useChatStore.getState().setSessionMessages(chatId, (prev) => upsertTool(prev, chatId, tool));
      });

      const unlistenToolStart = await listenAppEvent("tool:start", (event) => {
        const chatId = getToolChatId(toolChatIdsRef.current, event.payload, useChatStore.getState());
        if (!chatId) return;
        if (shouldFocusAgentsForTool(event.payload)) {
          focusActiveAgentsPanel();
        }
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
        useChatStore.getState().setSessionMessages(chatId, (prev) => upsertTool(prev, chatId, tool));
      });

      const unlistenToolComplete = await listenAppEvent("tool:complete", (event) => {
        const chatId = getToolChatId(toolChatIdsRef.current, event.payload, useChatStore.getState());
        if (!chatId) return;
        if (event.payload.status !== "success" || shouldFocusAgentsForTool(event.payload)) {
          focusActiveAgentsPanel();
        }
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
        useChatStore.getState().setSessionMessages(chatId, (prev) => {
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
        useChatStore.getState().setSessionMessages(chatId, (prev) => upsertTool(prev, chatId, tool));
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
