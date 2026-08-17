import { create } from "zustand";
import { toast } from "sonner";
import { goalApi, type BackendThreadGoal, type ThreadGoalStatus } from "@/api/goalApi";
import { listenAppEvent, type ThreadGoalEventPayload } from "@/api/events";

/**
 * Frontend mirror of the backend's thread goals (`/goal`). One objective per
 * chat, persisted in `thread_goals`; the backend emits `goal:updated` on
 * every mutation (user command or the agent's `update_goal` tool) and this
 * store applies those events so the banner never polls.
 *
 * Also tracks per-chat tool activity (`tool:start` events) which the
 * turn-advance hook consumes as Codex-style no-spin protection: a turn that
 * used no tools does not trigger another automatic goal continuation.
 */

export type ThreadGoal = BackendThreadGoal;

function normalizeGoal(payload: ThreadGoalEventPayload | null | undefined): ThreadGoal | null {
  if (!payload || !payload.chatId || !payload.objective) return null;
  const status: ThreadGoalStatus =
    payload.status === "paused" || payload.status === "complete" || payload.status === "blocked"
      ? payload.status
      : "active";
  return {
    chatId: payload.chatId,
    objective: payload.objective,
    status,
    turnsCount: typeof payload.turnsCount === "number" ? payload.turnsCount : 0,
    createdAt: payload.createdAt ?? "",
    updatedAt: payload.updatedAt ?? "",
  };
}

interface GoalState {
  goals: Record<string, ThreadGoal | null>;
  /** Per-chat "a tool ran during the current/last turn" flag (no-spin guard). */
  toolActivity: Record<string, boolean>;
  /** Automatic continuations started for the current goal (runaway cap). */
  continuationCounts: Record<string, number>;

  getGoal: (chatId: string | null | undefined) => ThreadGoal | null;
  loadGoal: (chatId: string) => Promise<void>;
  setGoal: (chatId: string, objective: string) => Promise<void>;
  updateStatus: (chatId: string, status: ThreadGoalStatus) => Promise<void>;
  clearGoal: (chatId: string) => Promise<void>;

  markToolActivity: (chatId: string) => void;
  consumeToolActivity: (chatId: string) => boolean;
  nextContinuation: (chatId: string) => number;
  resetContinuations: (chatId: string) => void;
}

export const useGoalStore = create<GoalState>((set, get) => {
  if (typeof window !== "undefined") {
    listenAppEvent("goal:updated", (event) => {
      const chatId = event.payload.chat_id;
      if (!chatId) return;
      const goal = normalizeGoal(event.payload.goal);
      set((state) => {
        const previous = state.goals[chatId];
        // A new objective (or a cleared goal) restarts the continuation run.
        const counters =
          !goal || previous?.objective !== goal.objective
            ? { ...state.continuationCounts, [chatId]: 0 }
            : state.continuationCounts;
        return {
          goals: { ...state.goals, [chatId]: goal },
          continuationCounts: counters,
        };
      });
      if (goal?.status === "complete") toast.success("Goal completed", { description: goal.objective });
      if (goal?.status === "blocked") toast.warning("Goal blocked — needs your input", { description: goal.objective });
    });

    listenAppEvent("tool:start", (event) => {
      const chatId = event.payload.chat_id;
      if (chatId) get().markToolActivity(chatId);
    });
  }

  return {
    goals: {},
    toolActivity: {},
    continuationCounts: {},

    getGoal: (chatId) => (chatId ? get().goals[chatId] ?? null : null),

    loadGoal: async (chatId) => {
      try {
        const goal = await goalApi.getThreadGoal(chatId);
        set((state) => ({ goals: { ...state.goals, [chatId]: goal } }));
      } catch (e) {
        console.warn(`[goalStore] Failed to load goal for ${chatId}:`, e);
      }
    },

    setGoal: async (chatId, objective) => {
      const goal = await goalApi.setThreadGoal(chatId, objective);
      set((state) => ({ goals: { ...state.goals, [chatId]: goal } }));
    },

    updateStatus: async (chatId, status) => {
      // Optimistically flip so the banner matches the click immediately; roll
      // back to the prior goal if the backend rejects the transition.
      const previous = get().goals[chatId] ?? null;
      if (previous) {
        set((state) => ({ goals: { ...state.goals, [chatId]: { ...previous, status } } }));
      }
      try {
        const goal = await goalApi.updateThreadGoalStatus(chatId, status);
        if (goal) set((state) => ({ goals: { ...state.goals, [chatId]: goal } }));
      } catch (e) {
        set((state) => ({ goals: { ...state.goals, [chatId]: previous } }));
        throw e;
      }
    },

    clearGoal: async (chatId) => {
      await goalApi.clearThreadGoal(chatId);
      set((state) => ({ goals: { ...state.goals, [chatId]: null } }));
    },

    markToolActivity: (chatId) => {
      if (get().toolActivity[chatId]) return;
      set((state) => ({ toolActivity: { ...state.toolActivity, [chatId]: true } }));
    },

    consumeToolActivity: (chatId) => {
      const active = get().toolActivity[chatId] === true;
      if (active) set((state) => ({ toolActivity: { ...state.toolActivity, [chatId]: false } }));
      return active;
    },

    nextContinuation: (chatId) => {
      const next = (get().continuationCounts[chatId] ?? 0) + 1;
      set((state) => ({ continuationCounts: { ...state.continuationCounts, [chatId]: next } }));
      return next;
    },

    resetContinuations: (chatId) => {
      if (!get().continuationCounts[chatId]) return;
      set((state) => ({ continuationCounts: { ...state.continuationCounts, [chatId]: 0 } }));
    },
  };
});
