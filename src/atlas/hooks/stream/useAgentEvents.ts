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
import { focusActiveAgentsPanel, shouldFocusAgentsForSpawn } from "./agentPanelFocus";
import {
  syncAgentCompleteToActivity,
  syncAgentHandoffToActivity,
  syncAgentSpawnToActivity,
  syncTaskToActivity,
} from "./agentActivitySync";

const INLINE_ACTION_KINDS = new Set([
  "agent_handoff",
  "agent_spawn",
  "agent_complete",
  "approval_request",
  "clarification_request",
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

/**
 * True when an `agent:chunk` payload carries an actual chat id and is
 * safe to route into a per-chat message slot. Subagent token deltas
 * that lack a real `chat_id` (or carry only the parent's active id)
 * are dropped so they do not race with the parent's `chat:chunk` stream.
 */
export function isSubagentChunkRoutable(payload: {
  chat_id?: unknown;
  chatId?: unknown;
}): boolean {
  const fromSnake = typeof payload.chat_id === "string" ? payload.chat_id.trim() : "";
  const fromCamel = typeof payload.chatId === "string" ? payload.chatId.trim() : "";
  return Boolean(fromSnake || fromCamel);
}

export function useAgentEvents({ resetHeartbeatTimeout }: { resetHeartbeatTimeout?: (chatId: string) => void } = {}) {
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const taskChatIdsRef = useRef<Map<string, string>>(new Map());
  const agentChatIdsRef = useRef<Map<string, string>>(new Map());
  const workflowChatIdsRef = useRef<Map<string, string>>(new Map());
  const agentChunkBufferRef = useRef<Array<{ chatId: string; payload: AgentActionEventPayload }>>([]);
  const agentChunkFrameRef = useRef<number | null>(null);
  const spawnIdRegistryRef = useRef<Set<string>>(new Set());

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

  const flushAgentChunkBuffer = () => {
    agentChunkFrameRef.current = null;
    const buffered = agentChunkBufferRef.current;
    if (buffered.length === 0) return;
    agentChunkBufferRef.current = [];

    const byChat = new Map<string, AgentActionEventPayload[]>();
    buffered.forEach(({ chatId, payload }) => {
      byChat.set(chatId, [...(byChat.get(chatId) || []), payload]);
    });

    byChat.forEach((payloads, chatId) => {
      useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) =>
        payloads.reduce(
          (messages, payload) => appendActionStepToMessages(messages, chatId, payload, "agent_chunk"),
          prev,
        )
      );
    });
  };

  const bufferAgentChunk = (chatId: string, payload: AgentActionEventPayload) => {
    agentChunkBufferRef.current.push({ chatId, payload });
    if (agentChunkFrameRef.current !== null) return;
    agentChunkFrameRef.current = window.requestAnimationFrame(flushAgentChunkBuffer);
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
          // Special handling for deep_research: find by kind, not by id
          // The optimistic placeholder has a temp ID ("temp-assistant-..."),
          // while the backend emits the real DB message_id. Matching by id
          // would fail, creating a duplicate message. Instead, find the
          // existing deep_research message by kind and update it in-place.
          // Prefer the actively-streaming (sending) one to avoid overwriting
          // a completed message if multiple deep research queries coexist.
          // Note: findIndex returns -1 (not null/undefined), so explicit
          // conditional fallback is required — ?? won't work.
          if (kind === "deep_research" && payload.content) {
            let researchIdx = prev.findIndex(
              (m) => m.kind === "deep_research" && m.status === "sending"
            );
            if (researchIdx === -1) {
              researchIdx = prev.findIndex((m) => m.kind === "deep_research");
            }
            if (researchIdx !== -1) {
              const next = [...prev];
              next[researchIdx] = {
                ...next[researchIdx],
                id: payload.id,  // Replace temp ID with real DB ID
                content: payload.content,
                status: payload.status || "sent",
                ...(payload.status === "failed"
                  ? { error: payload.error?.trim() || "Research failed." }
                  : {}),
                // Preserve the original createdAt from the optimistic
                // placeholder so the elapsed timer doesn't jump when
                // the real DB ID replaces the temp ID.
                createdAt: next[researchIdx].createdAt,
              };
              return next;
            }
            // No existing deep_research message found — fall through
            // to create a new one as a regular message
          }

          if (prev.some((m) => m.id === payload.id)) {
            return prev;
          }

          // Assistant messages: replace the optimistic temp-assistant entry in-place
          // when the backend emits the persisted message with a real DB ID.
          if (payload.role === "assistant") {
            let tempAssistantIdx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === "assistant" && prev[i].id.startsWith("temp-assistant-")) {
                tempAssistantIdx = i;
                break;
              }
            }
            if (tempAssistantIdx !== -1) {
              const next = [...prev];
              const tempId = prev[tempAssistantIdx].id;
              
              // Update the active assistant reference in the store to point to the new UUID
              const currentActive = useChatStore.getState().getActiveAssistantForChat(chatId);
              if (currentActive === tempId) {
                useChatStore.getState().setActiveAssistantForChat(chatId, payload.id);
              }

              next[tempAssistantIdx] = {
                ...next[tempAssistantIdx],
                id: payload.id,
                content: payload.content || next[tempAssistantIdx].content,
                createdAt: payload.timestamp
                  ? new Date(payload.timestamp).getTime()
                  : next[tempAssistantIdx].createdAt,
                status: payload.status || next[tempAssistantIdx].status || "sent",
                metadata: (payload.metadata as ActionMeta | undefined) || next[tempAssistantIdx].metadata,
              };
              return next;
            }
          }

          // User messages: replace the optimistic temp-user entry in-place
          // when the backend emits the persisted message with a real DB ID.
          // The optimistic placeholder has "temp-user-{timestamp}" while the
          // backend emits the real message_id, so matching by id would fail
          // and create a duplicate. Instead, find the last temp-user message
          // and swap its id with the persisted one.
          if (payload.role === "user") {
            // Find the last user message with a temp ID — that's our optimistic
            // placeholder that needs to be replaced by the persisted version.
            // Use findLastIndex to get the most recent user message.
            let tempUserIdx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === "user" && prev[i].id.startsWith("temp-user-")) {
                tempUserIdx = i;
                break;
              }
            }
            if (tempUserIdx !== -1) {
              const next = [...prev];
              next[tempUserIdx] = {
                ...next[tempUserIdx],
                id: payload.id,
                content: payload.content || next[tempUserIdx].content,
                createdAt: payload.timestamp
                  ? new Date(payload.timestamp).getTime()
                  : next[tempUserIdx].createdAt,
              };
              return next;
            }
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
        const spawnId = event.payload.spawn_id || event.payload.spawnId;
        if (shouldFocusAgentsForSpawn(spawnId, spawnIdRegistryRef.current)) {
          focusActiveAgentsPanel({ force: true });
        }
        const chatId = getAgentChatId(agentChatIdsRef.current, event.payload, useChatStore.getState());
        if (chatId) syncAgentSpawnToActivity(chatId, event.payload);
        appendAgentActionStep(event.payload, "agent_spawn");
      });

      const unlistenAgentComplete = await listenAppEvent("agent:complete", (event) => {
        const spawnId = event.payload.spawn_id || event.payload.spawnId;
        if (shouldFocusAgentsForSpawn(spawnId, spawnIdRegistryRef.current)) {
          focusActiveAgentsPanel();
        }
        const chatId = getAgentChatId(agentChatIdsRef.current, event.payload, useChatStore.getState());
        if (chatId) syncAgentCompleteToActivity(chatId, event.payload);
        appendAgentActionStep(event.payload, "agent_complete");
      });

      const unlistenAgentHandoff = await listenAppEvent("agent:handoff", (event) => {
        const spawnId = event.payload.spawn_id || event.payload.spawnId;
        if (shouldFocusAgentsForSpawn(spawnId, spawnIdRegistryRef.current)) {
          focusActiveAgentsPanel({ force: true });
        }
        const chatId = getAgentChatId(agentChatIdsRef.current, event.payload, useChatStore.getState());
        if (chatId) syncAgentHandoffToActivity(chatId, event.payload);
        appendAgentActionStep(event.payload, "agent_handoff");
      });

      const unlistenAgentChunk = await listenAppEvent("agent:chunk", (event) => {
        const payload = event.payload;
        if (!isSubagentChunkRoutable(payload)) {
          // Subagent token deltas without a real chat id must NOT fall back
          // to the parent's active streaming chat — that path races with the
          // parent's own `chat:chunk` buffer and causes visible stutter.
          return;
        }
        const spawnId = payload.spawn_id || payload.spawnId;
        if (shouldFocusAgentsForSpawn(spawnId, spawnIdRegistryRef.current)) {
          focusActiveAgentsPanel({ force: true });
        }
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
        bufferAgentChunk(chatId, { ...actionPayload, chat_id: chatId });
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
        const chatId = getTaskChatId(taskChatIdsRef.current, useChatStore.getState(), event.payload);
        if (chatId) syncTaskToActivity(chatId, event.payload, "in_progress");
        appendTaskActionStep(event.payload, "task_started");
      });

      const unlistenTaskCreated = await listenAppEvent("task:created", (event) => {
        const chatId = getTaskChatId(taskChatIdsRef.current, useChatStore.getState(), event.payload);
        if (chatId) syncTaskToActivity(chatId, event.payload, "pending");
        appendTaskActionStep(event.payload, "task_created");
      });

      const unlistenTaskUpdated = await listenAppEvent("task:updated", (event) => {
        const chatId = getTaskChatId(taskChatIdsRef.current, useChatStore.getState(), event.payload);
        if (chatId) {
          const normalizedStatus = event.payload.status === "completed"
            ? "completed"
            : event.payload.status === "failed" || event.payload.status === "error"
              ? "failed"
              : event.payload.status === "pending"
                ? "pending"
                : "in_progress";
          syncTaskToActivity(chatId, event.payload, normalizedStatus);
        }
        appendTaskActionStep(event.payload, "task_updated");
      });

      const unlistenTaskCompleted = await listenAppEvent("task:completed", (event) => {
        const chatId = getTaskChatId(taskChatIdsRef.current, useChatStore.getState(), event.payload);
        if (chatId) syncTaskToActivity(chatId, event.payload, "completed");
        appendTaskActionStep(event.payload, "task_completed");
      });

      const unlistenTaskFailed = await listenAppEvent("task:failed", (event) => {
        const chatId = getTaskChatId(taskChatIdsRef.current, useChatStore.getState(), event.payload);
        if (chatId) syncTaskToActivity(chatId, event.payload, "failed");
        appendTaskActionStep(event.payload, "task_failed");
      });

      const unlistenTaskListUpdated = await listenAppEvent("task:list_updated", (event) => {
        const payload = event.payload;
        const chatId = getTaskPlanChatId(useChatStore.getState(), payload);
        if (!chatId) return;
        rememberTaskListChats(taskChatIdsRef.current, payload.tasks, chatId);
        (payload.tasks || []).forEach((task) => {
          syncTaskToActivity(chatId, task, task.status === "completed"
            ? "completed"
            : task.status === "failed" || task.status === "error"
              ? "failed"
              : task.status === "running" || task.status === "in_progress"
                ? "in_progress"
                : "pending");
        });
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

        // Deep research sends chat:research-step events instead of chat:chunk
        // events during its multi-round investigation phase. Reset the stream
        // heartbeat so the 5-minute timeout doesn't kill long-running research.
        resetHeartbeatTimeout?.(chatId);

        useChatStore.getState().setSessionMessages(chatId, (prev: Message[]) => {
          const next = [...prev];
          const lastIdx = getActiveAssistantIndex(next, payload.message_id);
          if (lastIdx !== -1) {
            const msg = next[lastIdx];
            const meta = msg.metadata || {};
            const prevSteps = meta.researchSteps || [];

            // Preserve agent_index and agent_name when present
            const stepId = payload.step_id || `${payload.phase || "research"}:${payload.text}:${payload.agent_index ?? "main"}`;
            const step = payload.agent_index !== undefined
              ? {
                  id: stepId,
                  text: payload.text,
                  status: payload.status,
                  agentIndex: payload.agent_index,
                  agentName: payload.agent_name,
                  phase: payload.phase,
                  durationSecs: payload.duration_secs,
                  progressPercent: payload.progress_percent,
                }
              : {
                  id: stepId,
                  text: payload.text,
                  status: payload.status,
                  phase: payload.phase,
                  durationSecs: payload.duration_secs,
                  progressPercent: payload.progress_percent,
                };
            
            // When agent_index is present, also match by agentIndex to prevent
            // step-dedup collisions between parallel sub-agents fetching the
            // same URL title.
            const existingIdx = prevSteps.findIndex((s) => s.id === stepId);
            const steps = existingIdx !== -1
              ? prevSteps.map((s, i) => i === existingIdx ? { ...s, status: payload.status } : s)
              : [...prevSteps, step];
            
            const researchProgress = typeof payload.progress_percent === "number"
              ? { phase: payload.phase, percent: payload.progress_percent, status: payload.status }
              : meta.researchProgress;
            next[lastIdx] = { ...msg, metadata: { ...meta, researchSteps: steps, researchProgress } };
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
      if (agentChunkFrameRef.current !== null) {
        window.cancelAnimationFrame(agentChunkFrameRef.current);
        agentChunkFrameRef.current = null;
      }
      flushAgentChunkBuffer();
      unlistenRefs.current.forEach(u => u());
      unlistenRefs.current = [];
    };
  }, []);
}
