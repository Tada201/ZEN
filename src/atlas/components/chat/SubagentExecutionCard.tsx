import { Ban, Check, CircleAlert, Loader2, X } from "lucide-react";
import { useScopedSubagent } from "@/atlas/agentRuntime/scopedSubagentStore";
import { agentIconName } from "@/atlas/agentRuntime/agentIcon";
import type { DelegationNode, DelegationTree } from "@/atlas/agentRuntime/delegationTree";
import { cn } from "@/lib/utils";
import { presentExecutionError } from "@/atlas/agentRuntime/executionError";
import { useUIStore } from "@/lib/stores/useUIStore";
import { Badge } from "@/components/ui/badge";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import type { ArtifactData, Step, ToolCall } from "./types";

interface SubagentExecutionCardProps {
  step: Step;
  childToolCalls?: ToolCall[];
  childAgents?: Step[];
  delegation?: DelegationNode;
  delegationTree?: DelegationTree;
  messageId?: string;
  sessionId?: string;
  /** Keep child-agent failures in the dedicated Agents panel by default. */
  showError?: boolean;
  onOpenArtifact: (artifact: ArtifactData) => void;
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
 * agent name opens it. Nested child agents render as their own minimal markers.
 */
export function SubagentExecutionCard({
  step,
  childToolCalls,
  childAgents = [],
  delegation,
  delegationTree,
  messageId,
  sessionId,
  showError = false,
  onOpenArtifact,
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
  const isCompleted = status === "completed";
  const duration = formatDuration(resolvedSubagent.durationMs);

  const statusLabel = isStale ? "Interrupted"
    : isRunning ? "Working"
    : isCancelled ? "Cancelled"
    : isFailed ? "Failed"
    : needsReview ? "Needs review"
    : isCompleted ? "Complete"
    : "Subagent";

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

  // Failures stay in the Agents panel by default; only surface inline when the
  // caller opts in (showError), so the main timeline isn't flooded with a
  // child's raw error.
  const errorPresentation = showError && resolvedSubagent.error
    ? presentExecutionError(resolvedSubagent.error, { context: "subagent", recoverable: true })
    : null;

  return (
    <div className="execution-subagent" style={{ marginInlineStart: `${Math.min(delegation?.depth || 0, 4) * 12}px` }}>
      <div
        className="flex min-h-9 items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5"
        aria-label={`${resolvedSubagent.agentName}, ${statusLabel}${duration ? `, Duration ${duration}` : ""}`}
      >
        <WorkbenchIcon
          name={agentIconName(resolvedSubagent.agentId, resolvedSubagent.agentName)}
          size={15}
          className="shrink-0 text-muted-foreground"
        />
        <span className="shrink-0 text-[12px] text-muted-foreground">Subagent:</span>
        {canOpen ? (
          <button
            type="button"
            onClick={openPanel}
            className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
            title={`Open ${resolvedSubagent.agentName} in the Agents panel`}
          >
            {resolvedSubagent.agentName}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{resolvedSubagent.agentName}</span>
        )}
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">|</span>
        <Badge variant="outline" className={cn("shrink-0 gap-1 border-border px-1.5 py-0 text-[10px] font-medium", statusTone)}>
          <StatusIcon className={cn("h-3 w-3", isRunning && "motion-safe:animate-spin motion-reduce:transition-none")} aria-hidden="true" />
          {statusLabel}
        </Badge>
        {duration && <span className="execution-subagent-duration shrink-0 text-[10px] tabular-nums text-muted-foreground">{duration}</span>}
      </div>

      {errorPresentation && (
        <div className="mt-1.5 rounded-md border border-destructive bg-muted p-2.5 text-[12px] leading-relaxed text-destructive" role="alert">
          <div className="flex items-start gap-2">
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-medium">{errorPresentation.title}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-foreground">{errorPresentation.summary}</div>
              {errorPresentation.action !== "none" && (
                <div className="mt-1 text-[10px] text-muted-foreground">Next: {errorPresentation.actionLabel}</div>
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

      {childAgents.length > 0 && (
        <div className="mt-1.5 space-y-1.5" aria-label="Nested delegated agents">
          {childAgents.map((childStep) => (
            <SubagentExecutionCard
              key={childStep.subagent?.spawnId || childStep.eventId}
              step={childStep}
              childToolCalls={childToolCalls}
              childAgents={delegationTree?.childrenByParent.get(childStep.subagent?.spawnId || "") || []}
              delegation={delegationTree?.nodes.get(childStep.subagent?.spawnId || "")}
              delegationTree={delegationTree}
              messageId={messageId}
              sessionId={sessionId}
              showError={showError}
              onOpenArtifact={onOpenArtifact}
            />
          ))}
        </div>
      )}
    </div>
  );
}
