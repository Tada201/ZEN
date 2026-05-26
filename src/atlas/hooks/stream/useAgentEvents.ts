import { useEffect, useRef } from "react";
import { type UnlistenFn } from "@tauri-apps/api/event";
import { listenAppEvent, type AgentActionEventPayload } from "@/api/events";
import { useChatStore } from "@/lib/stores/useChatStore";
import { ActionMeta, Message, MessageKind, Step } from "../../components/chat/types";
import { toast } from "@/lib/hooks/use-toast";

const INLINE_ACTION_KINDS = new Set([
  "agent_handoff",
  "agent_spawn",
  "agent_complete",
  "approval_request",
  "clarification_request",
  "deep_research",
  "error",
  "system",
  "orchestrator_progress",
  "workflow_started",
  "workflow_completed",
  "workflow_failed",
  "task_started",
  "task_completed",
  "task_failed",
]);

function getNestedValue(obj: Record<string, unknown> | undefined, path: string[]): string | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
    if (cur === undefined || cur === null) return undefined;
  }
  return typeof cur === "string" && cur.trim() ? cur : undefined;
}

function getActionEventId(payload: AgentActionEventPayload, kind: string): string {
  const metadata = payload.metadata || {};
  const toolName =
    metadata.toolCall?.toolName ||
    metadata.tool_call?.tool_name ||
    metadata.toolResult?.toolName ||
    metadata.tool_result?.tool_name ||
    payload.tool_name;

  const toolCallId =
    payload.tool_call_id ||
    metadata.toolCall?.toolCallId ||
    metadata.toolCall?.tool_call_id ||
    metadata.tool_call?.tool_call_id ||
    metadata.toolResult?.toolCallId ||
    metadata.toolResult?.tool_call_id ||
    metadata.tool_result?.tool_call_id;

  if ((kind === "tool_call" || kind === "tool_result") && toolName) {
    if (toolCallId) {
      return `tool:${toolCallId}`;
    }
    return `tool:${payload.iteration ?? metadata.iteration ?? "unknown"}:${toolName}`;
  }
  if (kind === "orchestrator_progress") {
    return `orchestrator:${payload.run_id || payload.chat_id || payload.chatId || "active"}`;
  }

  const stable =
    toolCallId ||
    payload.spawn_id ||
    payload.task_id ||
    payload.workflow_id ||
    getNestedValue(metadata, ["approvalRequest", "tool_call_id"]) ||
    getNestedValue(metadata, ["approvalRequest", "toolCallId"]) ||
    getNestedValue(metadata, ["approval_request", "tool_call_id"]) ||
    getNestedValue(metadata, ["spawn", "spawnId"]) ||
    getNestedValue(metadata, ["spawn", "spawn_id"]);

  if (stable) return `${kind}:${stable}`;
  if (payload.id) return `${kind}:${payload.id}`;
  return `${kind}:${payload.timestamp || ""}:${payload.message || payload.content || ""}`;
}

function toEpoch(timestamp?: string): number {
  return timestamp ? new Date(timestamp).getTime() : Date.now();
}

function getActiveAssistantIndex(messages: Message[], preferredMessageId?: string): number {
  if (preferredMessageId) {
    const exact = messages.findIndex((m) => m.id === preferredMessageId);
    if (exact !== -1) return exact;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].status === "sending") return i;
  }

  return -1;
}

function summarizeAction(payload: AgentActionEventPayload, kind: string): string {
  if (payload.content) return payload.content;
  if (kind === "chat_status") return payload.message || "Agent status updated";
  if (kind === "orchestrator_progress") return payload.message || payload.phase || payload.status || "Orchestrator progress";
  if (kind.startsWith("workflow_")) return payload.workflow_id ? `Workflow ${payload.workflow_id}` : "Workflow update";
  if (kind.startsWith("task_")) return payload.description || payload.error || payload.task_id || "Task update";
  if (kind === "agent_spawn") return payload.task || `Spawned ${payload.child_agent_name || payload.child_agent_id || "agent"}`;
  if (kind === "agent_complete") return payload.error || `Agent ${payload.agent_id || "worker"} completed`;
  if (kind === "agent_handoff") return payload.reason || "Agent handoff";
  return kind.replace(/_/g, " ");
}

function inferStatus(kind: string, payload: AgentActionEventPayload): Step["status"] {
  const explicit = payload.metadata?.status || payload.status;
  const toolResultStatus = payload.metadata?.toolResult?.status || payload.metadata?.tool_result?.status;
  if (explicit === "error" || explicit === "failed") return "error";
  if (explicit === "completed" || explicit === "complete" || explicit === "ok" || explicit === "success") return "completed";
  if (toolResultStatus === "error" || toolResultStatus === "timeout") return "error";
  if (toolResultStatus === "ok") return "completed";
  if (kind.endsWith("_failed") || kind === "error") return "error";
  if (kind.endsWith("_completed") || kind === "agent_complete" || kind === "tool_result") return "completed";
  return "running";
}

function normalizeMetadata(kind: string, payload: AgentActionEventPayload): ActionMeta {
  const metadata = { ...(payload.metadata || {}) } as Record<string, unknown> & {
    approvalRequest?: unknown;
    approval_request?: unknown;
    spawn?: unknown;
    status?: unknown;
    toolCall?: unknown;
    tool_call?: unknown;
    toolResult?: unknown;
    tool_result?: unknown;
  };
  if (metadata.approval_request && !metadata.approvalRequest) {
    metadata.approvalRequest = metadata.approval_request;
  }
  if (metadata.tool_result && !metadata.toolResult) {
    metadata.toolResult = metadata.tool_result;
  }
  if (metadata.tool_call && !metadata.toolCall) {
    metadata.toolCall = metadata.tool_call;
  }
  if (kind === "agent_spawn" && !metadata.spawn) {
    metadata.spawn = {
      parentAgent: payload.parent_agent || payload.parentAgent || "main",
      childAgent: payload.child_agent_name || payload.child_agent_id || payload.childAgent || "agent",
      task: payload.task || "",
      status: "spawned",
    };
  }
  if (kind === "agent_complete" && !metadata.spawn) {
    metadata.spawn = {
      parentAgent: payload.parent_agent || "main",
      childAgent: payload.agent_id || payload.child_agent_id || "agent",
      task: payload.result ? JSON.stringify(payload.result) : payload.error || "",
      status: payload.error ? "failed" : "completed",
      durationMs: payload.duration_ms,
    };
  }
  if (kind === "agent_handoff" && !metadata.handoff) {
    metadata.handoff = {
      fromAgent: payload.from_agent || payload.fromAgent || "agent",
      toAgent: payload.to_agent || payload.toAgent || "agent",
      reason: payload.reason || "",
    };
  }
  if (payload.iteration !== undefined) metadata.iteration = payload.iteration;
  if (payload.phase !== undefined) metadata.phase = payload.phase;
  if (payload.message !== undefined) metadata.message = payload.message;
  if (payload.progressPercent !== undefined || payload.progress_percent !== undefined || payload.progress !== undefined) {
    metadata.progressPercent = payload.progressPercent ?? payload.progress_percent ?? payload.progress;
  }
  metadata.status = inferStatus(kind, payload) === "error" ? "error" : inferStatus(kind, payload) === "completed" ? "completed" : "running";
  return metadata as ActionMeta;
}

function appendActionStep(chatId: string, payload: AgentActionEventPayload, kind: string) {
  if (!chatId) return;
  useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
    const eventId = getActionEventId(payload, kind);
    const actionStep: Step = {
      type: "action",
      kind,
      content: summarizeAction(payload, kind),
      status: inferStatus(kind, payload),
      metadata: normalizeMetadata(kind, payload),
      timestamp: toEpoch(payload.timestamp),
      eventId,
    };

    const existingMessageIdx = prev.findIndex((m) => m.steps?.some((s) => s.type === "action" && s.eventId === eventId));
    if (existingMessageIdx !== -1) {
      const next = [...prev];
      const existingMessage = next[existingMessageIdx];
      next[existingMessageIdx] = {
        ...existingMessage,
        steps: (existingMessage.steps || []).map((step) =>
          step.type === "action" && step.eventId === eventId
            ? { ...step, ...actionStep }
            : step
        ),
        metadata: { ...(existingMessage.metadata || {}), ...(actionStep.metadata || {}) },
      };
      return next;
    }

    const targetIdx = getActiveAssistantIndex(prev, payload.message_id);
    if (targetIdx !== -1) {
      const next = [...prev];
      const target = next[targetIdx];
      next[targetIdx] = {
        ...target,
        steps: [...(target.steps || []), actionStep],
        metadata: { ...(target.metadata || {}), ...(actionStep.metadata || {}) },
      };
      return next;
    }

    return [
      ...prev,
      {
        id: eventId,
        sessionId: chatId,
        role: "system",
        content: payload.content || "",
        kind: kind as MessageKind,
        status: "sent",
        createdAt: actionStep.timestamp,
        metadata: actionStep.metadata,
        steps: [actionStep],
      },
    ];
  });
}

export function useAgentEvents() {
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    const setupListeners = async () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];

      const unlistenChatMessage = await listenAppEvent("chat:message", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id;
        if (!chatId) return;
        const kind = payload.kind || "system";

        if (INLINE_ACTION_KINDS.has(kind)) {
          appendActionStep(chatId, payload, kind);
          return;
        }

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          if (prev.some((m) => m.id === payload.id)) {
            return prev;
          }

          const newMessage: Message = {
            id: payload.id,
            sessionId: chatId,
            role: payload.role,
            content: payload.content || "",
            kind: payload.kind as MessageKind,
            status: "sent",
            createdAt: payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now(),
            metadata: payload.metadata as ActionMeta | undefined,
          };

          return [...prev, newMessage];
        });
      });

      const unlistenOrchestratorProgress = await listenAppEvent("orchestrator:progress", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id || payload.chatId;
        if (!chatId) return;
        appendActionStep(chatId, payload, "orchestrator_progress");
      });

      const unlistenAgentSpawn = await listenAppEvent("agent:spawn", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id || payload.chatId;
        if (!chatId) return;
        appendActionStep(chatId, payload, "agent_spawn");
      });

      const unlistenAgentComplete = await listenAppEvent("agent:complete", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id || payload.chatId;
        if (!chatId) return;
        appendActionStep(chatId, payload, "agent_complete");
      });

      const unlistenAgentHandoff = await listenAppEvent("agent:handoff", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id || payload.chatId;
        if (!chatId) return;
        appendActionStep(chatId, payload, "agent_handoff");
      });

      const unlistenWorkflowStarted = await listenAppEvent("workflow:started", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id || payload.chatId;
        if (chatId) appendActionStep(chatId, payload, "workflow_started");
      });

      const unlistenWorkflowCompleted = await listenAppEvent("workflow:completed", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id || payload.chatId;
        if (chatId) appendActionStep(chatId, payload, "workflow_completed");
      });

      const unlistenWorkflowFailed = await listenAppEvent("workflow:failed", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id || payload.chatId;
        if (chatId) appendActionStep(chatId, payload, "workflow_failed");
      });

      const unlistenTaskStarted = await listenAppEvent("task:started", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id || payload.chatId;
        if (chatId) appendActionStep(chatId, payload, "task_started");
      });

      const unlistenTaskCompleted = await listenAppEvent("task:completed", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id || payload.chatId;
        if (chatId) appendActionStep(chatId, payload, "task_completed");
      });

      const unlistenTaskFailed = await listenAppEvent("task:failed", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id || payload.chatId;
        if (chatId) appendActionStep(chatId, payload, "task_failed");
      });

      const unlistenContextDrift = await listenAppEvent("chat:context-drift", (event) => {
        const chatId = event.payload.chat_id;
        const activeChatId = useChatStore.getState().activeSessionId;
        if (chatId === activeChatId) {
          toast({
            title: "Context Drift Detected",
            description: `The conversation topic has drifted (Similarity: ${(event.payload.similarity * 100).toFixed(0)}%). Consider resetting topic or compacting history.`,
          });
        }
      });

      const unlistenResearchStep = await listenAppEvent("chat:research-step", (event) => {
        const payload = event.payload;
        const chatId = payload.chat_id;
        if (!chatId) return;

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const next = [...prev];
          let lastIdx = -1;
          for (let i = next.length - 1; i >= 0; i--) {
            const m = next[i];
            if (m.id === payload.message_id || m.status === "sending") {
              lastIdx = i;
              break;
            }
          }
          if (lastIdx !== -1) {
            const msg = next[lastIdx];
            const meta = msg.metadata || {};
            const prevSteps = meta.researchSteps || [];
            
            const existingIdx = prevSteps.findIndex((s) => s.text === payload.text);
            const steps = existingIdx !== -1
              ? prevSteps.map((s, i) => i === existingIdx ? { ...s, status: payload.status } : s)
              : [...prevSteps, { text: payload.text, status: payload.status }];
            
            next[lastIdx] = { ...msg, metadata: { ...meta, researchSteps: steps } };
          }
          return next;
        });
      });

      unlistenRefs.current.push(
        unlistenChatMessage,
        unlistenOrchestratorProgress,
        unlistenAgentSpawn,
        unlistenAgentComplete,
        unlistenAgentHandoff,
        unlistenWorkflowStarted,
        unlistenWorkflowCompleted,
        unlistenWorkflowFailed,
        unlistenTaskStarted,
        unlistenTaskCompleted,
        unlistenTaskFailed,
        unlistenContextDrift,
        unlistenResearchStep
      );
    };

    setupListeners();

    return () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];
    };
  }, []);
}
