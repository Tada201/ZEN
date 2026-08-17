import { create } from "zustand";
import type { Attachment } from "@/atlas/components/chat/types";
import type { ThinkingPayload } from "@/atlas/components/chat/input/PremiumChatInputTypes";

/**
 * Client-side prompt queue: messages submitted while a turn is streaming are
 * buffered per chat and replayed through the normal send pipeline when the
 * stream finishes (see `useChatTurnAdvance`). The backend stays strictly
 * one-turn-at-a-time — queueing is a frontend policy, so there is no server
 * state to keep in sync. Intentionally not persisted: a restart clears the
 * queue rather than auto-sending stale prompts.
 */

export interface QueuedPromptPayload {
  message: string;
  model: string;
  provider?: string;
  webSearch?: boolean;
  thinking?: ThinkingPayload;
  deepResearch?: boolean;
  generativeUI?: boolean;
  imageGen?: boolean;
  attachments?: Attachment[];
  tools?: string[];
}

export interface QueuedPrompt {
  id: string;
  chatId: string;
  createdAt: number;
  payload: QueuedPromptPayload;
}

interface PromptQueueState {
  queues: Record<string, QueuedPrompt[]>;

  enqueue: (chatId: string, payload: QueuedPromptPayload) => QueuedPrompt;
  remove: (chatId: string, id: string) => void;
  clear: (chatId: string) => void;
  /** Pop the head of the queue (FIFO) for sending. */
  shift: (chatId: string) => QueuedPrompt | null;
}

let queueSeq = 0;

export const usePromptQueueStore = create<PromptQueueState>((set, get) => ({
  queues: {},

  enqueue: (chatId, payload) => {
    const item: QueuedPrompt = {
      id: `queued-${Date.now()}-${++queueSeq}`,
      chatId,
      createdAt: Date.now(),
      payload,
    };
    set((state) => ({
      queues: { ...state.queues, [chatId]: [...(state.queues[chatId] ?? []), item] },
    }));
    return item;
  },

  remove: (chatId, id) => {
    set((state) => {
      const queue = state.queues[chatId];
      if (!queue?.length) return state;
      return { queues: { ...state.queues, [chatId]: queue.filter((q) => q.id !== id) } };
    });
  },

  clear: (chatId) => {
    if (!get().queues[chatId]?.length) return;
    set((state) => ({ queues: { ...state.queues, [chatId]: [] } }));
  },

  shift: (chatId) => {
    const queue = get().queues[chatId];
    if (!queue?.length) return null;
    const [head, ...rest] = queue;
    set((state) => ({ queues: { ...state.queues, [chatId]: rest } }));
    return head;
  },
}));
