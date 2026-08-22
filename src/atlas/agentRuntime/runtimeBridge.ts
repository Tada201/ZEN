import { createAgentRunScheduler } from "./runScheduler.ts";
import { streamIdentity, type AgentRunEvent, type AgentTurnRecord } from "./types.ts";

export interface AgentRuntimeBridge {
  dispatch: (event: AgentRunEvent) => void;
  dispatchTerminal: (event: AgentRunEvent) => void;
  get: (runId: string, chatId: string, messageId?: string) => AgentTurnRecord | undefined;
  clear: (runId: string, chatId: string, messageId?: string) => void;
  /** Drop every scheduler entry for a chat whose stream the backend reset
   *  without a terminal event; the per-run `clear` can't be keyed because the
   *  reset payload carries only the chat id. */
  clearForChat: (chatId: string) => void;
}

export function createAgentRuntimeBridge(
  onFlush: (record: AgentTurnRecord) => void,
): AgentRuntimeBridge {
  const schedulers = new Map<string, {
    scheduler: ReturnType<typeof createAgentRunScheduler>;
    chatId: string;
    runIds: Set<string>;
  }>();

  const getScheduler = (event: Pick<AgentRunEvent, "runId" | "chatId" | "messageId">) => {
    const key = streamIdentity(event.runId, event.chatId, event.messageId);
    let entry = schedulers.get(key);
    if (!entry) {
      entry = { scheduler: createAgentRunScheduler(onFlush), chatId: event.chatId, runIds: new Set() };
      schedulers.set(key, entry);
    }
    entry.runIds.add(event.runId);
    return { key, scheduler: entry.scheduler };
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
      return schedulers.get(streamIdentity(runId, chatId, messageId))?.scheduler.get(runId);
    },
    clear(runId, chatId, messageId) {
      const key = streamIdentity(runId, chatId, messageId);
      schedulers.get(key)?.scheduler.clear(runId);
      schedulers.delete(key);
    },
    clearForChat(chatId) {
      for (const [key, entry] of schedulers) {
        if (entry.chatId !== chatId) continue;
        for (const runId of entry.runIds) entry.scheduler.clear(runId);
        schedulers.delete(key);
      }
    },
  };
}
