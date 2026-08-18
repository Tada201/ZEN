import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, OctagonX, Pause, Play, Target, X } from "lucide-react";
import { toast } from "sonner";
import { motionDurations, motionEasings, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils/style";
import { useGoalStore, type ThreadGoal } from "@/lib/stores/goalStore";
import { getIpcErrorMessage } from "@/api";

/**
 * Persistent goal banner above the composer — Zen's answer to Codex's
 * composer goal indicator. Shows the objective, lifecycle status, and the
 * user-owned transport controls (pause/resume/clear). Completion and blocked
 * states come from the model's `update_goal` tool via `goal:updated`.
 */

const STATUS_META: Record<
  ThreadGoal["status"],
  { label: string; tone: string; icon: typeof Target }
> = {
  active: { label: "Active", tone: "text-primary", icon: Target },
  paused: { label: "Paused", tone: "text-warning", icon: Pause },
  complete: { label: "Complete", tone: "text-success", icon: CheckCircle2 },
  blocked: { label: "Blocked", tone: "text-destructive", icon: OctagonX },
};

interface GoalBannerProps {
  chatId: string;
}

export const GoalBanner = memo(({ chatId }: GoalBannerProps) => {
  const reducedMotion = useReducedMotion();
  const goal = useGoalStore((s) => s.goals[chatId] ?? null);
  if (!goal) return null;

  const meta = STATUS_META[goal.status] ?? STATUS_META.active;
  const StatusIcon = meta.icon;

  const run = (action: () => Promise<void>) => {
    action().catch((e) => toast.error(getIpcErrorMessage(e, "Goal action failed")));
  };

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={goal.objective + goal.status}
        initial={reducedMotion ? false : { opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
        transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.fast, ease: motionEasings.standard }}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
        role="status"
        aria-label="Session goal"
      >
        <Target className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[12px] leading-4 text-foreground" title={goal.objective}>
            {goal.objective}
          </span>
          <span className={cn("inline-flex items-center gap-1 text-[10px] leading-3", meta.tone)}>
            <StatusIcon className="h-3 w-3" aria-hidden="true" />
            {meta.label}
            {goal.status === "active" && goal.turnsCount > 0 ? ` · turn ${goal.turnsCount}` : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {goal.status === "active" && (
            <button
              type="button"
              onClick={() => run(() => useGoalStore.getState().updateStatus(chatId, "paused"))}
              className="composer-control composer-control--icon rounded p-1"
              aria-label="Pause goal"
              title="Pause — stop auto-continuing toward the goal"
            >
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {goal.status === "paused" && (
            <button
              type="button"
              onClick={() => run(() => useGoalStore.getState().updateStatus(chatId, "active"))}
              className="composer-control composer-control--icon rounded p-1"
              aria-label="Resume goal"
              title="Resume working toward the goal"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => run(() => useGoalStore.getState().clearGoal(chatId))}
            className="composer-control composer-control--icon rounded p-1"
            aria-label="Clear goal"
            title="Remove the goal"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
