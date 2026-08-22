import { Ban, Check, CircleAlert, Loader2, X } from "lucide-react";
import { useScopedSubagent } from "@/atlas/agentRuntime/scopedSubagentStore";
import { subagentPhaseLabel } from "@/atlas/agentRuntime/subagentPhase";
import { cn } from "@/lib/utils";
import { presentExecutionError } from "@/atlas/agentRuntime/executionError";
import { useUIStore } from "@/lib/stores/useUIStore";
import type { Step } from "./types";

interface SubagentExecutionCardProps {
  step: Step;
  sessionId?: string;
  /** Keep child-agent failures in the dedicated Agents panel by default. */
  showError?: boolean;
}

function formatDuration(ms?: number): string {
  if (typeof ms !== "number" || ms <= 0) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/**
 * Inline subagent marker in the main assistant timeline. Intentionally minimal:
 * `Subagent: <name> · <status>` with the child's icon. The full trace, live
 * activity, and stop control live in the right-side Agents panel — clicking the
 * agent name opens it.
 */
export function SubagentExecutionCard({
  step,
  sessionId,
  showError = false,
}: SubagentExecutionCardProps) {
  const subagent = step.subagent;
  const openSubagentInPanel = useUIStore((state) => state.openSubagentInPanel);
  const scopedRuntimeSubagent = useScopedSubagent(sessionId, subagent?.spawnId);
  const resolvedSubagent = scopedRuntimeSubagent ?? subagent ?? null;

  if (!resolvedSubagent) return null;

  const status = resolvedSubagent.status ?? "completed";
  const isStale = status === "stale"
    || ("recoveryState" in resolvedSubagent && (resolvedSubagent as { recoveryState?: string }).recoveryState === "stale");
  const isRunning = status === "running" && !isStale;
  const isCancelled = status === "cancelled";
  const isFailed = status === "failed" || isCancelled;
  const needsReview = status === "incomplete" || status === "uncertain";
  const duration = formatDuration(resolvedSubagent.durationMs);

  const statusLabel = isStale ? "Interrupted" : subagentPhaseLabel(status, isStale);

  const StatusIcon = isRunning ? Loader2
    : isCancelled ? Ban
    : isFailed ? CircleAlert
    : needsReview ? CircleAlert
    : Check;
  const statusTone = isRunning ? "text-primary"
    : isStale || needsReview ? "text-warning"
    : isCancelled ? "text-muted-foreground"
    : isFailed ? "text-destructive"
    : "text-success";

  const canOpen = Boolean(sessionId && resolvedSubagent.spawnId);
  const openPanel = () => {
    if (sessionId && resolvedSubagent.spawnId) openSubagentInPanel(sessionId, resolvedSubagent.spawnId);
  };

  // Show the delegated task, not the internal agent name — the task is what the
  // user recognizes. Lead with the status icon (working/done/failed) rather than
  // a generic agent glyph, matching Claude Code / Cursor agent rows. The agent
  // name is kept only in the accessible label for screen-reader context.
  const taskLabel = resolvedSubagent.task?.trim() || resolvedSubagent.agentName;

  // Failures stay in the Agents panel by default; only surface inline when the
  // caller opts in (showError), so the main timeline isn't flooded with a
  // child's raw error.
  const errorPresentation = showError && resolvedSubagent.error
    ? presentExecutionError(resolvedSubagent.error, { context: "subagent", recoverable: true })
    : null;

  return (
    <div className="execution-subagent">
      <div
        className="flex min-h-9 items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5"
        aria-label={`${resolvedSubagent.agentName}, ${statusLabel}${duration ? `, Duration ${duration}` : ""}. Task: ${taskLabel}`}
      >
        <StatusIcon className={cn("h-4 w-4 shrink-0", statusTone, isRunning && "animate-spin")} aria-hidden="true" />
        {canOpen ? (
          <button
            type="button"
            onClick={openPanel}
            className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
            title={`Open this agent’s execution trace`}
          >
            {taskLabel}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{taskLabel}</span>
        )}
        <span className={cn("shrink-0 text-[11px] font-medium", statusTone)}>{statusLabel}</span>
        {duration && <span className="execution-subagent-duration shrink-0 text-[11px] tabular-nums text-muted-foreground">{duration}</span>}
      </div>

      {/* Announce every lifecycle transition — not just running — so a screen
          reader hears the child finish/fail, matching the Agents panel's
          persistent live region. A plain aria-live on the status word only
          fired while running. */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {`${taskLabel}: ${statusLabel}`}
      </span>

      {errorPresentation && (
        <div className="mt-1.5 rounded-md border border-destructive bg-muted p-2.5 text-[12px] leading-relaxed text-destructive" role="alert">
          <div className="flex items-start gap-2">
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-medium">{errorPresentation.title}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-foreground">{errorPresentation.summary}</div>
              {errorPresentation.action !== "none" && (
                <div className="mt-1 text-[11px] text-muted-foreground">Next: {errorPresentation.actionLabel}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {isStale && (
        <div className="mt-1.5 rounded-md border border-warning bg-muted px-2.5 py-1.5 text-[11px] text-foreground" role="status">
          <span className="font-medium text-warning">Interrupted after reload.</span>{" "}
          <span className="text-muted-foreground">The saved subagent trace is available in the Agents panel.</span>
        </div>
      )}
    </div>
  );
}
