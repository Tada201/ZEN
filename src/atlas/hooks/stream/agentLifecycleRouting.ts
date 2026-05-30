import type { AgentActionEventPayload } from "@/api/events";
import { getActiveStreamingChatId, type ActiveStreamState } from "./activeStreamRouting";

function readNestedString(obj: Record<string, unknown> | undefined, path: string[]): string | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" && cur.trim() ? cur : undefined;
}

export function getAgentLifecycleKeys(payload: AgentActionEventPayload): string[] {
  const metadata = payload.metadata;
  const keys = [
    payload.spawn_id,
    payload.id,
    payload.child_agent_id,
    payload.childAgent,
    payload.agent_id,
    payload.from_agent,
    payload.fromAgent,
    payload.to_agent,
    payload.toAgent,
    readNestedString(metadata, ["spawn", "spawnId"]),
    readNestedString(metadata, ["spawn", "spawn_id"]),
    readNestedString(metadata, ["spawn", "childAgent"]),
    readNestedString(metadata, ["spawn", "child_agent_id"]),
    readNestedString(metadata, ["handoff", "fromAgent"]),
    readNestedString(metadata, ["handoff", "toAgent"]),
  ].filter((key): key is string => typeof key === "string" && key.trim().length > 0);

  return Array.from(new Set(keys));
}

export function rememberAgentChat(
  cache: Map<string, string>,
  payload: AgentActionEventPayload,
  chatId?: string | null,
) {
  if (!chatId) return;
  getAgentLifecycleKeys(payload).forEach((key) => cache.set(key, chatId));
}

export function getAgentChatId(
  cache: Map<string, string>,
  payload: AgentActionEventPayload,
  state?: ActiveStreamState,
): string | undefined {
  const direct = payload.chat_id || payload.chatId;
  if (direct) return direct;

  for (const key of getAgentLifecycleKeys(payload)) {
    const chatId = cache.get(key);
    if (chatId) return chatId;
  }
  return state ? getActiveStreamingChatId(state) : undefined;
}
