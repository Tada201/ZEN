import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import type { ArtifactData, ToolCall } from "@/atlas/components/chat/types";

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

export interface AppEventPayloadMap {
  "tool:start": ToolStartEventPayload;
  "tool:complete": ToolCompleteEventPayload;
  "artifact:start": ArtifactStartEventPayload;
  "artifact:delta": ArtifactDeltaEventPayload;
  "artifact:complete": ArtifactCompleteEventPayload;
}

export type AppEventName = keyof AppEventPayloadMap;
export type AppEvent<TEventName extends AppEventName> = Event<AppEventPayloadMap[TEventName]>;

export function listenAppEvent<TEventName extends AppEventName>(
  eventName: TEventName,
  handler: (event: AppEvent<TEventName>) => void,
): Promise<UnlistenFn> {
  return listen<AppEventPayloadMap[TEventName]>(eventName, handler);
}
