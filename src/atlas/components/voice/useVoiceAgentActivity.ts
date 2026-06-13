import { useEffect, useState } from "react";
import { listenAppEvent, type AgentActionEventPayload } from "@/api/events";

export interface VoiceAgentActivity {
  displayAgentRunning: boolean;
  otherAgentCount: number;
}

function eventChatId(payload: AgentActionEventPayload) {
  return payload.chat_id || payload.chatId || null;
}

function eventAgentId(payload: AgentActionEventPayload) {
  return payload.child_agent_id || payload.agent_id || payload.metadata?.agentId || "unknown";
}

function eventSpawnId(payload: AgentActionEventPayload) {
  return payload.spawn_id || payload.metadata?.spawn?.spawn_id || payload.metadata?.spawn?.spawnId || payload.id || null;
}

export function useVoiceAgentActivity(chatId: string): VoiceAgentActivity {
  const [active, setActive] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    let disposed = false;
    const unlistens: Array<() => void> = [];

    void Promise.all([
      listenAppEvent("agent:spawn", (event) => {
        if (eventChatId(event.payload) !== chatId) return;
        const spawnId = eventSpawnId(event.payload);
        if (!spawnId) return;
        setActive((current) => new Map(current).set(spawnId, eventAgentId(event.payload)));
      }),
      listenAppEvent("agent:complete", (event) => {
        if (eventChatId(event.payload) !== chatId) return;
        const spawnId = eventSpawnId(event.payload);
        if (!spawnId) return;
        setActive((current) => {
          const next = new Map(current);
          next.delete(spawnId);
          return next;
        });
      }),
    ]).then((listeners) => {
      if (disposed) listeners.forEach((unlisten) => unlisten());
      else unlistens.push(...listeners);
    });

    return () => {
      disposed = true;
      unlistens.forEach((unlisten) => unlisten());
      setActive(new Map());
    };
  }, [chatId]);

  const agents = [...active.values()];
  return {
    displayAgentRunning: agents.includes("voice_display"),
    otherAgentCount: agents.filter((agentId) => agentId !== "voice_display").length,
  };
}
