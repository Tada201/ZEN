import { useEffect, useRef } from "react";
import { type UnlistenFn } from "@tauri-apps/api/event";
import { listenAppEvent, type AgentActionEventPayload } from "@/api/events";
import { useChatStore } from "@/lib/stores/useChatStore";
import { ttftMark, type TtftMarker } from "@/lib/ttft";
import { ActionMeta, Message, MessageKind } from "../../components/chat/types";
import { toast } from "@/lib/hooks/use-toast";
import { findWritableAssistantIndex } from "./messageTarget";
import { appendActionStepToMessages } from "./agentActionLedger";
import { getAgentChatId, rememberAgentChat } from "./agentLifecycleRouting";
import { getDirectOrActiveStreamingChatId } from "./activeStreamRouting";
import {
  getTaskChatId,
  getTaskPlanChatId,
  getWorkflowChatId,
  rememberTaskChat,
  rememberTaskListChats,
  rememberWorkflowChat,
} from "./taskWorkflowRouting";
import { focusActiveAgentsPanel } from "./agentPanelFocus";

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
  "task_created",
  "task_updated",
  "task_completed",
  "task_failed",
  "task_list_updated",
  "task_complexity_analyzed",
]);

const TTFT_PHASE_MARKERS: Record<string, TtftMarker> = {
  persisted: "dbInsert",
  db_persisted: "dbInsert",
  provider_ready: "providerReady",
  llm_invoked: "llmInvoked",
  agent_invoked: "llmInvoked",
  orchestrator_invoked: "llmInvoked",
};

function getActiveAssistantIndex(messages: Message[], preferredMessageId?: string): number {
  if (preferredMessageId) {
    const exact = messages.findIndex((m) => m.id === preferredMessageId);
    if (exact !== -1) return exact;
  }

  return findWritableAssistantIndex(messages);
}

function appendActionStep(chatId: string, payload: AgentActionEventPayload, kind: string) {
  if (!chatId) return;
  useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => appendActionStepToMessages(prev, chatId, payload, kind));
}

function markTtftStatusPhase(chatId: string, phase?: unknown) {
  if (typeof phase !== "string") return;
  const marker = TTFT_PHASE_MARKERS[phase];
  if (marker) ttftMark(chatId, marker);
}

export function useAgentEvents() {
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const taskChatIdsRef = useRef<Map<string, string>>(new Map());
  const agentChatIdsRef = useRef<Map<string, string>>(new Map());
  const workflowChatIdsRef = useRef<Map<string, string>>(new Map());

  const appendTaskActionStep = (payload: AgentActionEventPayload, kind: string) => {
    const chatId = getTaskChatId(taskChatIdsRef.current, useChatStore.getState(), payload);
    if (!chatId) return;
    rememberTaskChat(taskChatIdsRef.current, payload, chatId);
    appendActionStep(chatId, { ...payload, chat_id: chatId }, kind);
  };

  const appendWorkflowActionStep = (payload: AgentActionEventPayload, kind: string) => {
    const chatId = getWorkflowChatId(workflowChatIdsRef.current, useChatStore.getState(), payload);
    if (!chatId) return;
    rememberWorkflowChat(workflowChatIdsRef.current, payload, chatId);
    appendActionStep(chatId, { ...payload, chat_id: chatId }, kind);
  };

  const appendAgentActionStep = (payload: AgentActionEventPayload, kind: string) => {
    const chatId = getAgentChatId(agentChatIdsRef.current, payload, useChatStore.getState());
    if (!chatId) return;
    rememberAgentChat(agentChatIdsRef.current, payload, chatId);
    appendActionStep(chatId, { ...payload, chat_id: chatId }, kind);
  };

  useEffect(() => {
    const setupListeners = async () => {
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];

      const unlistenChatMessage = await listenAppEvent("chat:message", (event) => {
        const payload = event.payload;
        const kind = payload.kind || "system";
        const chatId = INLINE_ACTION_KINDS.has(kind)
          ? getDirectOrActiveStreamingChatId(useChatStore.getState(), payload)
          : payload.chat_id;
        if (!chatId) return;

        if (INLINE_ACTION_KINDS.has(kind)) {
          if (kind === "agent_spawn" || kind === "agent_complete" || kind === "agent_handoff") {
            rememberAgentChat(agentChatIdsRef.current, payload, chatId);
          } else if (kind.startsWith("task_")) {
            rememberTaskChat(taskChatIdsRef.current, payload, chatId);
          } else if (kind.startsWith("workflow_")) {
            rememberWorkflowChat(workflowChatIdsRef.current, payload, chatId);
          }
          appendActionStep(chatId, { ...payload, chat_id: chatId }, kind);
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
        const chatId = getDirectOrActiveStreamingChatId(useChatStore.getState(), payload);
        if (!chatId) return;
        appendActionStep(chatId, { ...payload, chat_id: chatId }, "orchestrator_progress");
      });

      const unlistenChatStatus = await listenAppEvent("chat:status", (event) => {
        const payload = event.payload;
        const chatId = getDirectOrActiveStreamingChatId(useChatStore.getState(), payload);
        if (!chatId) return;
        markTtftStatusPhase(chatId, payload.phase);
        appendActionStep(chatId, { ...payload, chat_id: chatId } as AgentActionEventPayload, "chat_status");
      });

      const unlistenAgentSpawn = await listenAppEvent("agent:spawn", (event) => {
        focusActiveAgentsPanel({ force: true });
        appendAgentActionStep(event.payload, "agent_spawn");
      });

      const unlistenAgentComplete = await listenAppEvent("agent:complete", (event) => {
        focusActiveAgentsPanel();
        appendAgentActionStep(event.payload, "agent_complete");
      });

      const unlistenAgentHandoff = await listenAppEvent("agent:handoff", (event) => {
        focusActiveAgentsPanel({ force: true });
        appendAgentActionStep(event.payload, "agent_handoff");
      });

      const unlistenAgentChunk = await listenAppEvent("agent:chunk", (event) => {
        focusActiveAgentsPanel({ force: true });
        const payload = event.payload;
        const actionPayload = {
          ...payload,
          agent_id: payload.agent_id,
          agent_name: payload.agent_name || payload.agentName,
          parent_agent: payload.parent_agent || payload.parentAgent,
          content: payload.delta,
        } as AgentActionEventPayload;
        const chatId =
          payload.chat_id ||
          payload.chatId ||
          getAgentChatId(agentChatIdsRef.current, actionPayload, useChatStore.getState());
        if (!chatId) return;
        rememberAgentChat(agentChatIdsRef.current, actionPayload, chatId);
        appendActionStep(chatId, { ...actionPayload, chat_id: chatId }, "agent_chunk");
      });

      const unlistenWorkflowStarted = await listenAppEvent("workflow:started", (event) => {
        appendWorkflowActionStep(event.payload, "workflow_started");
      });

      const unlistenWorkflowCompleted = await listenAppEvent("workflow:completed", (event) => {
        appendWorkflowActionStep(event.payload, "workflow_completed");
      });

      const unlistenWorkflowFailed = await listenAppEvent("workflow:failed", (event) => {
        appendWorkflowActionStep(event.payload, "workflow_failed");
      });

      const unlistenTaskStarted = await listenAppEvent("task:started", (event) => {
        appendTaskActionStep(event.payload, "task_started");
      });

      const unlistenTaskCreated = await listenAppEvent("task:created", (event) => {
        appendTaskActionStep(event.payload, "task_created");
      });

      const unlistenTaskUpdated = await listenAppEvent("task:updated", (event) => {
        appendTaskActionStep(event.payload, "task_updated");
      });

      const unlistenTaskCompleted = await listenAppEvent("task:completed", (event) => {
        appendTaskActionStep(event.payload, "task_completed");
      });

      const unlistenTaskFailed = await listenAppEvent("task:failed", (event) => {
        appendTaskActionStep(event.payload, "task_failed");
      });

      const unlistenTaskListUpdated = await listenAppEvent("task:list_updated", (event) => {
        const payload = event.payload;
        const chatId = getTaskPlanChatId(useChatStore.getState(), payload);
        if (!chatId) return;
        rememberTaskListChats(taskChatIdsRef.current, payload.tasks, chatId);
        appendActionStep(chatId, { ...payload, chat_id: chatId }, "task_list_updated");
      });

      const unlistenTaskComplexityAnalyzed = await listenAppEvent("task:complexity_analyzed", (event) => {
        const payload = event.payload;
        const chatId = getTaskPlanChatId(useChatStore.getState(), payload);
        if (!chatId) return;
        appendActionStep(chatId, { ...payload, chat_id: chatId }, "task_complexity_analyzed");
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
        const chatId = getDirectOrActiveStreamingChatId(useChatStore.getState(), payload);
        if (!chatId) return;

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const next = [...prev];
          const lastIdx = getActiveAssistantIndex(next, payload.message_id);
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
        unlistenChatStatus,
        unlistenAgentSpawn,
        unlistenAgentComplete,
        unlistenAgentHandoff,
        unlistenAgentChunk,
        unlistenWorkflowStarted,
        unlistenWorkflowCompleted,
        unlistenWorkflowFailed,
        unlistenTaskStarted,
        unlistenTaskCreated,
        unlistenTaskUpdated,
        unlistenTaskCompleted,
        unlistenTaskFailed,
        unlistenTaskListUpdated,
        unlistenTaskComplexityAnalyzed,
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
