import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import { IS_TAURI } from "./tauriClient";
import type { ActionMeta, ArtifactData, Message, MessageKind, ToolCall } from "@/atlas/components/chat/types";
import type { SessionFeedback, VisionCapture } from "@/types/session";

type ResearchStep = NonNullable<ActionMeta["researchSteps"]>[number];

export interface ToolStartEventPayload {
  chat_id?: string | null;
  chatId?: string | null;
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
  batch_id?: string;
  batchId?: string;
  tool_batch_id?: string;
  toolBatchId?: string;
  trace_id?: string;
  traceId?: string;
  parent_tool_call_id?: string;
  parentToolCallId?: string;
  sequence?: number;
  timestamp?: string;
  phase?: string;
  tool_call_id: string;
  tool_name: string;
  arguments: ToolCall["input"];
  agent_id?: string;
  agent_name?: string;
  iteration?: number;
}

export interface ToolCompleteEventPayload {
  chat_id?: string | null;
  chatId?: string | null;
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
  batch_id?: string;
  batchId?: string;
  tool_batch_id?: string;
  toolBatchId?: string;
  trace_id?: string;
  traceId?: string;
  parent_tool_call_id?: string;
  parentToolCallId?: string;
  sequence?: number;
  timestamp?: string;
  phase?: string;
  tool_call_id: string;
  tool_name: string;
  status: string;
  output: string;
  duration_ms?: number;
  agent_id?: string;
  agent_name?: string;
  iteration?: number;
}

export interface ToolAuthorizationRequestEventPayload {
  chat_id?: string | null;
  chatId?: string | null;
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
  batch_id?: string;
  batchId?: string;
  tool_batch_id?: string;
  toolBatchId?: string;
  trace_id?: string;
  traceId?: string;
  parent_tool_call_id?: string;
  parentToolCallId?: string;
  sequence?: number;
  timestamp?: string;
  phase?: string;
  tool_call_id: string;
  tool_name: string;
  arguments: ToolCall["input"];
  model?: string;
  context?: Record<string, unknown>;
  agent_id?: string;
  agent_name?: string;
  iteration?: number;
}

export interface ToolAuthorizationTimeoutEventPayload {
  chat_id?: string | null;
  chatId?: string | null;
  message_id?: string;
  messageId?: string;
  run_id?: string;
  runId?: string;
  parent_agent_id?: string;
  parentAgentId?: string;
  execution_id?: string;
  executionId?: string;
  batch_id?: string;
  batchId?: string;
  tool_batch_id?: string;
  toolBatchId?: string;
  trace_id?: string;
  traceId?: string;
  parent_tool_call_id?: string;
  parentToolCallId?: string;
  sequence?: number;
  timestamp?: string;
  phase?: string;
  tool_call_id: string;
  tool_name: string;
  arguments?: ToolCall["input"];
  agent_id?: string;
  agent_name?: string;
  iteration?: number;
}

export interface ArtifactStartEventPayload {
  chat_id?: string | null;
  artifact_type: ArtifactData["type"];
  title: string;
  language?: string;
}

export interface ArtifactDeltaEventPayload {
  chat_id?: string | null;
  delta: string;
}

export interface ArtifactCompleteEventPayload {
  chat_id?: string | null;
}

export interface ChatChunkEventPayload {
  chat_id?: string | null;
  delta?: string;
  type?: string;
  /** Backend assistant row ID used to keep late chunks on their original turn. */
  message_id?: string;
}

export interface ChatDoneEventPayload {
  chat_id?: string | null;
  content?: string;
  reason?: string;
  /** Backend-persisted assistant message ID; used to target the correct DB row for post-stream updates like `steps_json`. */
  message_id?: string;
}

export interface ChatErrorEventPayload {
  chat_id?: string | null;
  error?: string;
  recoverable?: boolean;
}

export interface ChatStreamResetEventPayload {
  chat_id?: string | null;
}

/** Emitted when a sub-agent run starts, progresses, or finishes. */
export interface SubagentStepEventPayload {
  chat_id?: string | null;
  chatId?: string | null;
  spawn_id: string;
  spawnId?: string;
  parent_tool_call_id?: string;
  parentToolCallId?: string;
  agent_id: string;
  agentId?: string;
  agent_name: string;
  agentName?: string;
  task: string;
  status: "running" | "completed" | "failed" | "cancelled" | "incomplete" | "uncertain";
  result_summary?: string;
  resultSummary?: string;
  result_content?: string;
  resultContent?: string;
  error?: string;
  duration_ms: number;
  durationMs?: number;
  timestamp: string;
  child_tool_call_ids?: string[];
  childToolCallIds?: string[];
}

export interface ChatResearchStepEventPayload {
  chat_id?: string | null;
  message_id?: string;
  text: string;
  status: ResearchStep["status"];
  phase?: string;
  agent_index?: number;
  agent_name?: string;
  step_id?: string;
  duration_secs?: number;
  progress_percent?: number;
}

export interface AgentChunkEventPayload {
  chat_id?: string | null;
  chatId?: string | null;
  spawn_id?: string;
  spawnId?: string;
  agent_id: string;
  agent_name?: string;
  agentName?: string;
  parent_agent?: string;
  parentAgent?: string;
  delta: string;
  type?: string;
}

type FlexibleToolCallMeta = Partial<NonNullable<ActionMeta["toolCall"]>> & {
  toolCallId?: string;
  tool_call_id?: string;
  tool_name?: string;
};

type FlexibleToolResultMeta = Partial<NonNullable<ActionMeta["toolResult"]>> & {
  toolCallId?: string;
  tool_call_id?: string;
  tool_name?: string;
};

type FlexibleApprovalRequestMeta = Partial<NonNullable<ActionMeta["approvalRequest"]>> & {
  toolCallId?: string;
};

type FlexibleSpawnMeta = Partial<NonNullable<ActionMeta["spawn"]>> & {
  spawnId?: string;
  spawn_id?: string;
};

export interface AgentActionMetadata extends Omit<ActionMeta, "approvalRequest" | "spawn" | "toolCall" | "toolResult" | "toolCallPreview"> {
  approvalRequest?: FlexibleApprovalRequestMeta;
  approval_request?: FlexibleApprovalRequestMeta;
  spawn?: FlexibleSpawnMeta;
  toolCall?: FlexibleToolCallMeta;
  tool_call?: FlexibleToolCallMeta;
  toolCallPreview?: ActionMeta["toolCallPreview"];
  tool_call_preview?: ActionMeta["toolCallPreview"];
  toolResult?: FlexibleToolResultMeta;
  tool_result?: FlexibleToolResultMeta;
  [key: string]: unknown;
}

export interface AgentActionEventPayload {
  chat_id?: string | null;
  chatId?: string | null;
  id?: string;
  timestamp?: string;
  sequence?: number;
  trace_id?: string;
  traceId?: string;
  role?: Message["role"];
  kind?: MessageKind | string;
  content?: string;
  metadata?: AgentActionMetadata;
  type?: string;
  message_id?: string;
  messageId?: string;
  message?: string;
  delta?: string;
  status?: string;
  tool_name?: string;
  tool_call_id?: string;
  parent_tool_call_id?: string;
  parentToolCallId?: string;
  iteration?: string | number;
  run_id?: string;
  runId?: string;
  batch_id?: string;
  batchId?: string;
  tool_batch_id?: string;
  toolBatchId?: string;
  execution_id?: string;
  executionId?: string;
  spawn_id?: string;
  spawnId?: string;
  task_id?: string;
  taskId?: string;
  assigned_to?: string;
  assignedTo?: string;
  workflow_id?: string;
  total_tasks?: number;
  tasks_completed?: number;
  phase?: string;
  description?: string;
  error?: string;
  task?: string;
  child_agent_name?: string;
  child_agent_id?: string;
  childAgent?: string;
  parent_agent?: string;
  parentAgent?: string;
  parent_agent_id?: string;
  parentAgentId?: string;
  agent_id?: string;
  agent_name?: string;
  result?: unknown;
  duration_ms?: number;
  from_agent?: string;
  fromAgent?: string;
  to_agent?: string;
  toAgent?: string;
  reason?: string;
  progress?: number;
  progress_percent?: number;
  progressPercent?: number;
  provider?: string;
  model?: string;
  toolCount?: number;
  parallel?: boolean;
  tools?: string[];
  tasks?: TaskEventPayload[];
  tier?: string;
  battle_plan?: {
    steps?: string[];
    agents_needed?: string[];
    [key: string]: unknown;
  };
  updates?: Partial<TaskEventPayload>;
}

export interface ChatMessageEventPayload extends AgentActionEventPayload {
  chat_id: string;
  id: string;
  timestamp: string;
  role: Message["role"];
  content: string;
  status?: Message["status"];
  error?: string;
  metadata?: AgentActionMetadata;
}

export interface ChatContextDriftEventPayload {
  chat_id: string;
  similarity: number;
}

export interface ChatStatusEventPayload {
  message?: string;
  chat_id?: string | null;
  iteration?: number;
  phase?: string;
  metadata?: AgentActionMetadata;
  provider?: string;
  model?: string;
  toolCount?: number;
  parallel?: boolean;
  tools?: string[];
}

export interface TtsSentenceCue {
  /** Sentence text exactly as spoken by TTS. */
  text: string;
  /** Start of this sentence within the TTS clip, in milliseconds. */
  start_ms: number;
  /** End of this sentence within the TTS clip, in milliseconds. */
  end_ms: number;
}

export interface TtsStartEventPayload {
  duration_ms?: number;
  durationMs?: number;
  /** Full text that is about to be spoken. Useful as a fallback when
   *  the closed-caption box was populated from streaming chunks. */
  text?: string;
  /** Sentence-level caption cues with estimated start/end times. The
   *  frontend uses these to highlight the active sentence in the
   *  closed-caption box as Piper plays. */
  sentences?: TtsSentenceCue[];
}

export interface TtsLevelEventPayload {
  level: number;
}

export interface TtsErrorEventPayload {
  error?: string;
}

export interface TtsCaptionEventPayload {
  text?: string;
}

export type EmptyEventPayload = Record<string, never>;
export type UnknownRecordEventPayload = Record<string, unknown>;

export interface TaskEventPayload extends AgentActionEventPayload {
  id?: string;
  taskId?: string;
  task_id?: string;
  description?: string;
  assignedTo?: string;
  assigned_to?: string;
  status?: string;
  progress?: number;
  error?: string;
  chatId?: string | null;
  chat_id?: string | null;
  createdAt?: number;
  created_at?: number;
  updatedAt?: number;
  updated_at?: number;
  updates?: Partial<TaskEventPayload>;
}

export interface TaskCompletedEventPayload extends TaskEventPayload {
  result?: {
    is_error?: boolean;
    content?: string;
    [key: string]: unknown;
  };
}

export interface TaskListUpdatedEventPayload {
  chat_id?: string | null;
  tasks?: TaskEventPayload[];
}

export interface TaskComplexityAnalyzedEventPayload {
  chat_id?: string | null;
  tier?: string;
  battle_plan?: {
    steps?: string[];
    agents_needed?: string[];
    [key: string]: unknown;
  };
}

export interface ThreadGoalEventPayload {
  chatId?: string | null;
  objective?: string;
  status?: string;
  turnsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface GoalUpdatedEventPayload {
  chat_id?: string | null;
  /** null when the goal was cleared. */
  goal?: ThreadGoalEventPayload | null;
}

export interface ContextCompactedEventPayload {
  chatId?: string | null;
  messagesSummarized?: number;
  messagesKept?: number;
}

export interface AppEventPayloadMap {
  "tool:start": ToolStartEventPayload;
  "tool:complete": ToolCompleteEventPayload;
  "tool:authorization_request": ToolAuthorizationRequestEventPayload;
  "tool:authorization_timeout": ToolAuthorizationTimeoutEventPayload;
  "artifact:start": ArtifactStartEventPayload;
  "artifact:delta": ArtifactDeltaEventPayload;
  "artifact:complete": ArtifactCompleteEventPayload;
  "chat:chunk:first": ChatChunkEventPayload;
  "chat:chunk": ChatChunkEventPayload;
  "chat:done": ChatDoneEventPayload;
  "chat:error": ChatErrorEventPayload;
  "chat:stream-reset": ChatStreamResetEventPayload;
  "chat:research-step": ChatResearchStepEventPayload;
  "chat:subagent-step": SubagentStepEventPayload;
  "chat:message": ChatMessageEventPayload;
  "chat:context-drift": ChatContextDriftEventPayload;
  "chat:status": ChatStatusEventPayload;
  "chat:partial": UnknownRecordEventPayload;
  "globe:navigate": UnknownRecordEventPayload;
  "drawing:ops": UnknownRecordEventPayload;
  "board:update": UnknownRecordEventPayload;
  "graph:session:feedback": SessionFeedback;
  "graph:session:vision_capture": VisionCapture;
  "tts:start": TtsStartEventPayload;
  "tts:stop": EmptyEventPayload;
  "tts:level": TtsLevelEventPayload;
  "tts:caption": TtsCaptionEventPayload;
  "tts:error": TtsErrorEventPayload;
  "orchestrator:progress": AgentActionEventPayload;
  "orchestrator:start": EmptyEventPayload;
  "agent:spawn": AgentActionEventPayload;
  "agent:complete": AgentActionEventPayload;
  "agent:handoff": AgentActionEventPayload;
  "agent:chunk": AgentChunkEventPayload;
  "workflow:started": AgentActionEventPayload;
  "workflow:completed": AgentActionEventPayload;
  "workflow:failed": AgentActionEventPayload;
  "task:started": AgentActionEventPayload;
  "task:created": TaskEventPayload;
  "task:updated": TaskEventPayload;
  "task:completed": TaskCompletedEventPayload;
  "task:failed": AgentActionEventPayload;
  "task:list_updated": TaskListUpdatedEventPayload;
  "task:complexity_analyzed": TaskComplexityAnalyzedEventPayload;
  "goal:updated": GoalUpdatedEventPayload;
  "context:compacted": ContextCompactedEventPayload;
}

export type AppEventName = keyof AppEventPayloadMap;
export type AppEvent<TEventName extends AppEventName> = Event<AppEventPayloadMap[TEventName]>;

export function listenAppEvent<TEventName extends AppEventName>(
  eventName: TEventName,
  handler: (event: AppEvent<TEventName>) => void,
): Promise<UnlistenFn> {
  // Browser-Only Dummy Dev Mode: route to mock pub/sub
  if (!IS_TAURI) {
    return import("./mockClient").then(({ mockListen }) => {
      return mockListen(eventName, handler as (payload: unknown) => void);
    });
  }

  return listen<AppEventPayloadMap[TEventName]>(eventName, handler);
}
