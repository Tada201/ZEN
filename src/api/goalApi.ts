import { callCommand } from "./tauriClient";

export type ThreadGoalStatus = "active" | "paused" | "complete" | "blocked";

export interface BackendThreadGoal {
  chatId: string;
  objective: string;
  status: ThreadGoalStatus;
  turnsCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Thread goals (`/goal`). One persistent objective per chat, owned by the
 * backend `services::goal` module; the frontend mirrors it through
 * `goal:updated` events + `useGoalStore`.
 */
export const goalApi = {
  getThreadGoal: (chatId: string) =>
    callCommand<BackendThreadGoal | null>("get_thread_goal", { chatId }),
  setThreadGoal: (chatId: string, objective: string) =>
    callCommand<BackendThreadGoal>("set_thread_goal", { chatId, objective }),
  updateThreadGoalStatus: (chatId: string, status: ThreadGoalStatus) =>
    callCommand<BackendThreadGoal | null>("update_thread_goal_status", { chatId, status }),
  clearThreadGoal: (chatId: string) =>
    callCommand<void>("clear_thread_goal", { chatId }),
};
