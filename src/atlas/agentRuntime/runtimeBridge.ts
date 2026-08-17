import { createAgentRunScheduler } from "./runScheduler.ts";
import { streamIdentity, type AgentRunEvent, type AgentTurnRecord } from "./types.ts";

export interface AgentRuntimeBridge {
  dispatch: (event: AgentRunEvent) => void;
  dispatchTerminal: (event: AgentRunEvent) => void;
  get: (runId: string, chatId: string, messageId?: string) => AgentTurnRecord | undefined;
  clear: (runId: string, chatId: string, messageId?: string) => void;
}

export function createAgentRuntimeBridge(
  onFlush: (record: AgentTurnRecord) => void,
): AgentRuntimeBridge {
  const schedulers = new Map<string, ReturnType<typeof createAgentRunScheduler>>();

  const getScheduler = (event: Pick<AgentRunEvent, "runId" | "chatId" | "messageId">) => {
    const key = streamIdentity(event.runId, event.chatId, event.messageId);
    let scheduler = schedulers.get(key);
    if (!scheduler) {
      scheduler = createAgentRunScheduler(onFlush);
      schedulers.set(key, scheduler);
    }
    return { key, scheduler };
  };

  return {
    dispatch(event) {
      getScheduler(event).scheduler.dispatch(event);
    },
    dispatchTerminal(event) {
      const { scheduler } = getScheduler(event);
      scheduler.dispatch(event);
      scheduler.flushNow(event.runId);
    },
    get(runId, chatId, messageId) {
      return schedulers.get(streamIdentity(runId, chatId, messageId))?.get(runId);
    },
    clear(runId, chatId, messageId) {
      const key = streamIdentity(runId, chatId, messageId);
      schedulers.get(key)?.clear(runId);
      schedulers.delete(key);
    },
  };
}
