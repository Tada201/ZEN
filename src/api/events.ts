import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import type { ActionMeta, ArtifactData, Message, MessageKind, ToolCall } from "@/atlas/components/chat/types";

type ResearchStep = NonNullable<ActionMeta["researchSteps"]>[number];

export interface ToolStartEventPayload {
  chat_id?: string | null;
  tool_call_id: string;
  tool_name: string;
  arguments: ToolCall["input"];
}

export interface ToolCompleteEventPayload {
  chat_id?: string | null;
  tool_call_id: string;
  status: string;
  output: string;
  duration_ms?: number;
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
}

export interface ChatDoneEventPayload {
  chat_id?: string | null;
  content?: string;
  reason?: string;
}

export interface ChatErrorEventPayload {
  chat_id?: string | null;
  error?: string;
}

export interface ChatStreamResetEventPayload {
  chat_id?: string | null;
}

export interface ChatResearchStepEventPayload {
  chat_id?: string | null;
  message_id?: string;
  text: string;
  status: ResearchStep["status"];
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

export interface AgentActionMetadata extends Omit<ActionMeta, "approvalRequest" | "spawn" | "toolCall" | "toolResult"> {
  approvalRequest?: FlexibleApprovalRequestMeta;
  approval_request?: FlexibleApprovalRequestMeta;
  spawn?: FlexibleSpawnMeta;
  toolCall?: FlexibleToolCallMeta;
  tool_call?: FlexibleToolCallMeta;
  toolResult?: FlexibleToolResultMeta;
  tool_result?: FlexibleToolResultMeta;
  [key: string]: unknown;
}

export interface AgentActionEventPayload {
  chat_id?: string | null;
  chatId?: string | null;
  id?: string;
  timestamp?: string;
  role?: Message["role"];
  kind?: MessageKind | string;
  content?: string;
  metadata?: AgentActionMetadata;
  message_id?: string;
  message?: string;
  status?: string;
  tool_name?: string;
  tool_call_id?: string;
  iteration?: string | number;
  run_id?: string;
  spawn_id?: string;
  task_id?: string;
  workflow_id?: string;
  phase?: string;
  description?: string;
  error?: string;
  task?: string;
  child_agent_name?: string;
  child_agent_id?: string;
  childAgent?: string;
  parent_agent?: string;
  parentAgent?: string;
  agent_id?: string;
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
}

export interface ChatMessageEventPayload extends AgentActionEventPayload {
  chat_id: string;
  id: string;
  timestamp: string;
  role: Message["role"];
  content: string;
}

export interface ChatContextDriftEventPayload {
  chat_id: string;
  similarity: number;
}

export interface AppEventPayloadMap {
  "tool:start": ToolStartEventPayload;
  "tool:complete": ToolCompleteEventPayload;
  "artifact:start": ArtifactStartEventPayload;
  "artifact:delta": ArtifactDeltaEventPayload;
  "artifact:complete": ArtifactCompleteEventPayload;
  "chat:chunk:first": ChatChunkEventPayload;
  "chat:chunk": ChatChunkEventPayload;
  "chat:done": ChatDoneEventPayload;
  "chat:error": ChatErrorEventPayload;
  "chat:stream-reset": ChatStreamResetEventPayload;
  "chat:research-step": ChatResearchStepEventPayload;
  "chat:message": ChatMessageEventPayload;
  "chat:context-drift": ChatContextDriftEventPayload;
  "orchestrator:progress": AgentActionEventPayload;
  "agent:spawn": AgentActionEventPayload;
  "agent:complete": AgentActionEventPayload;
  "agent:handoff": AgentActionEventPayload;
  "workflow:started": AgentActionEventPayload;
  "workflow:completed": AgentActionEventPayload;
  "workflow:failed": AgentActionEventPayload;
  "task:started": AgentActionEventPayload;
  "task:completed": AgentActionEventPayload;
  "task:failed": AgentActionEventPayload;
}

export type AppEventName = keyof AppEventPayloadMap;
export type AppEvent<TEventName extends AppEventName> = Event<AppEventPayloadMap[TEventName]>;

export function listenAppEvent<TEventName extends AppEventName>(
  eventName: TEventName,
  handler: (event: AppEvent<TEventName>) => void,
): Promise<UnlistenFn> {
  return listen<AppEventPayloadMap[TEventName]>(eventName, handler);
}
