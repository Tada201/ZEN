import { useStreamHeartbeat } from "./stream/useStreamHeartbeat";
import { useChatChunkEvent } from "./stream/useChatChunkEvent";
import { useToolEvents } from "./stream/useToolEvents";
import { useArtifactEvents } from "./stream/useArtifactEvents";
import { useAgentEvents } from "./stream/useAgentEvents";
import { useGraphSessionEvents } from "./stream/useGraphSessionEvents";

/**
 * Global Tauri event listener for ALL chat streaming events.
 * 
 * This hook MUST be mounted at the App root level so it never unmounts.
 * It handles events for ALL sessions (not filtered by active chatId),
 * solving the critical issue where switching sessions caused event
 * listeners to be destroyed mid-stream.
 * 
 * Events are routed to the correct session's message buffer in Zustand
 * using the `chat_id` field in each event payload.
 */
export function useGlobalStreamListener() {
  const { resetHeartbeatTimeout, clearHeartbeatTimeout } = useStreamHeartbeat();

  useChatChunkEvent({ resetHeartbeatTimeout, clearHeartbeatTimeout });
  useToolEvents({ resetHeartbeatTimeout });
  useArtifactEvents({ resetHeartbeatTimeout });
  useAgentEvents({ resetHeartbeatTimeout });
  useGraphSessionEvents();
}
