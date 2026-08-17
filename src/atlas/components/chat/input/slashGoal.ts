import { toast } from "sonner";
import { useGoalStore } from "@/lib/stores/goalStore";
import { getIpcErrorMessage } from "@/api";

/**
 * Client-side `/goal` command handling. Unlike skills (which travel to the
 * backend), the goal command is intercepted in the send path and resolved
 * against `goalApi` so it executes immediately — even while a turn is
 * streaming.
 *
 * Grammar:
 *   /goal <objective>   set (or replace) the chat's goal and activate it
 *   /goal clear         remove the goal
 *   /goal pause         pause auto-continuation
 *   /goal resume        resume a paused goal
 *   /goal               view the current goal
 */

export type GoalCommand =
  | { action: "set"; objective: string }
  | { action: "clear" }
  | { action: "pause" }
  | { action: "resume" }
  | { action: "view" };

/** Returns null when the text is not a `/goal` invocation. */
export function parseGoalCommand(text: string): GoalCommand | null {
  const trimmed = text.trim();
  if (trimmed !== "/goal" && !trimmed.startsWith("/goal ") && !trimmed.startsWith("/goal\t")) {
    return null;
  }
  const arg = trimmed.slice(5).trim();
  if (!arg) return { action: "view" };
  // Control words match only as the entire (single-line) argument;
  // multi-line input is treated as an objective.
  const firstLine = arg.split("\n")[0].trim();
  if (arg === firstLine && (firstLine === "clear" || firstLine === "pause" || firstLine === "resume")) {
    return { action: firstLine };
  }
  return { action: "set", objective: arg };
}

/** Run the parsed command. Returns true when the input is fully consumed. */
export async function executeGoalCommand(chatId: string, command: GoalCommand): Promise<boolean> {
  const store = useGoalStore.getState();
  const goal = store.getGoal(chatId);

  try {
    switch (command.action) {
      case "view":
        if (goal) {
          toast.info(`Goal (${goal.status})`, { description: goal.objective });
        } else {
          toast.info("No goal set", { description: "Type /goal <objective> to set one." });
        }
        return true;
      case "clear":
        if (!goal) {
          toast.info("No goal to clear.");
          return true;
        }
        await store.clearGoal(chatId);
        toast.success("Goal cleared.");
        return true;
      case "pause":
        if (!goal) return noGoalToast();
        if (goal.status !== "active") {
          toast.info("Goal is not active.");
          return true;
        }
        await store.updateStatus(chatId, "paused");
        toast.success("Goal paused — the agent stops auto-continuing.");
        return true;
      case "resume":
        if (!goal) return noGoalToast();
        if (goal.status !== "paused") {
          toast.info("Goal is not paused.");
          return true;
        }
        await store.updateStatus(chatId, "active");
        toast.success("Goal resumed. Send a message to continue working on it.");
        return true;
      case "set": {
        await store.setGoal(chatId, command.objective);
        toast.success("Goal set — the agent keeps working toward it between turns.");
        return true;
      }
    }
  } catch (e) {
    toast.error(getIpcErrorMessage(e, "Goal command failed"));
    return true;
  }
}

function noGoalToast(): boolean {
  toast.info("No goal set", { description: "Type /goal <objective> to set one." });
  return true;
}
