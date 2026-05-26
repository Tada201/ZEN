import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import type { ActionMeta, ArtifactData, ToolCall } from "@/atlas/components/chat/types";

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
}

export type AppEventName = keyof AppEventPayloadMap;
export type AppEvent<TEventName extends AppEventName> = Event<AppEventPayloadMap[TEventName]>;

export function listenAppEvent<TEventName extends AppEventName>(
  eventName: TEventName,
  handler: (event: AppEvent<TEventName>) => void,
): Promise<UnlistenFn> {
  return listen<AppEventPayloadMap[TEventName]>(eventName, handler);
}
