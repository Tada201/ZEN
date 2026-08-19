import { useEffect, useMemo, useRef, useState } from "react";
import { projectScopedSubagents, selectOwnedChildTools } from "@/atlas/agentRuntime/subagentRuntime";
import { useScopedSubagent } from "@/atlas/agentRuntime/scopedSubagentStore";
import {
  selectDelegationChildTools,
  type DelegationNode,
  type DelegationTree,
} from "@/atlas/agentRuntime/delegationTree";
import {
  Ban,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { presentExecutionError } from "@/atlas/agentRuntime/executionError";
import { useUIStore } from "@/lib/stores/useUIStore";
import { FoldOutCard, FoldOutCardContent, FoldOutCardTrigger } from "@/components/ui/fold-out-card";
import type { ArtifactData, Step, ToolCall } from "./types";
import { AgentExecutionTrace } from "./AgentExecutionTrace";
import {
  createDisclosureState,
  toggleDisclosure,
  transitionDisclosure,
} from "./executionDisclosure";

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
  // Keep hooks unconditional while streamed reconciliation fills in the
  // subagent payload. The render guard stays after lifecycle state is set up.
  const scopedRuntimeSubagent = useScopedSubagent(sessionId, subagent?.spawnId);
  const resolvedSubagent = scopedRuntimeSubagent ?? subagent ?? null;
  const status = resolvedSubagent?.status ?? "completed";
  const isStale = resolvedSubagent?.status === "stale" || ("recoveryState" in (resolvedSubagent || {}) && (resolvedSubagent as { recoveryState?: string }).recoveryState === "stale");
  const isRunning = status === "running" && !isStale;
  const isFailed = status === "failed" || status === "cancelled";
  const needsReview = status === "incomplete" || status === "uncertain";
  const isCompleted = status === "completed";
  const duration = formatDuration(resolvedSubagent?.durationMs);
  const childSummary = delegation && delegation.childToolCount > 0
    ? `${delegation.completedChildToolCount}/${delegation.childToolCount} tools complete`
    : "";

  // Child tools that belong to this subagent (trace_id === spawn_id).
  const scopedSubagent = useMemo(() => {
    const records = projectScopedSubagents([step]);
    return records.get(step.subagent?.spawnId || "") || null;
  }, [step]);
  const childTools = useMemo(() => {
    if (!childToolCalls || childToolCalls.length === 0 || !scopedSubagent) return [];
    if (delegation) {
      const nestedSpawnToolIds = new Set(
        childAgents
          .map((child) => child.subagent?.parentToolCallId)
          .filter((id): id is string => Boolean(id)),
      );
      return selectDelegationChildTools(delegation, childToolCalls)
        .filter((tool) => !nestedSpawnToolIds.has(tool.id));
    }
    return selectOwnedChildTools(scopedSubagent, childToolCalls)
      .filter((tool) => !childAgents.some((child) => child.subagent?.parentToolCallId === tool.id));
  }, [childAgents, childToolCalls, delegation, scopedSubagent]);

  // Keep active or failed work open so the user does not miss an interruption.
  // Completed work stays summary-first even when child tools are available;
  // the user can open the child trace intentionally.
  const shouldDefaultOpen = Boolean(resolvedSubagent) && (isRunning || isFailed || needsReview || isStale || Boolean(resolvedSubagent?.error));
  const disclosureStatus = isRunning
    ? "running"
    : isFailed
      ? (status === "cancelled" ? "cancelled" : "failed")
      : needsReview
        ? "failed"
        : "completed";
  const disclosureStateRef = useRef(createDisclosureState(disclosureStatus, shouldDefaultOpen));
  const [isExpanded, setIsExpanded] = useState(disclosureStateRef.current.open);

  useEffect(() => {
    const nextState = transitionDisclosure(disclosureStateRef.current, disclosureStatus);
    disclosureStateRef.current = nextState;
    setIsExpanded((previous) => previous === nextState.open ? previous : nextState.open);
  }, [disclosureStatus]);

  if (!resolvedSubagent) return null;

  const statusIcon = isRunning ? (
    <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin motion-reduce:transition-none text-primary" aria-hidden="true" />
  ) : status === "cancelled" ? (
    <Ban className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
  ) : isFailed ? (
    <CircleAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
  ) : needsReview ? (
    <CircleAlert className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
  ) : isCompleted ? (
    <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
  ) : (
    <Bot className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
  );

  // The parent assistant timeline keeps delegation summary-first. Detailed
  // child failures remain available in the dedicated Agents panel instead of
  // becoming another error block in the main assistant message.
  const errorPresentation = showError && resolvedSubagent.error
    ? presentExecutionError(resolvedSubagent.error, { context: "subagent", recoverable: true })
    : null;

  const statusLabel = isStale
    ? "Interrupted"
    : isRunning
    ? "Working"
    : isFailed
    ? status === "cancelled"
      ? "Cancelled"
      : "Failed"
    : needsReview
    ? "Needs review"
    : isCompleted
    ? "Complete"
    : "Subagent";

  return (
    <FoldOutCard
      open={isExpanded}
      onOpenChange={(nextOpen) => {
        disclosureStateRef.current = toggleDisclosure(disclosureStateRef.current, nextOpen);
        setIsExpanded(nextOpen);
      }}
      className="execution-subagent overflow-hidden rounded-md border border-border bg-card shadow-sm"
      style={{ marginInlineStart: `${Math.min(delegation?.depth || 0, 4) * 12}px` }}
    >
      <FoldOutCardTrigger
        aria-label={`${resolvedSubagent.agentName}, ${statusLabel}${duration ? `, Duration ${duration}` : ""}`}
        className="execution-foldout-trigger min-h-10 w-full px-3 py-2 text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex w-full items-center gap-2">
          <div
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
              isRunning && "bg-muted",
              isFailed && "bg-muted",
              needsReview && "bg-warning/10",
              isCompleted && "bg-muted",
              !isRunning && !isFailed && !needsReview && !isCompleted && "bg-muted"
            )}
          >
            {statusIcon}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <div className="flex w-full items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-foreground">
                {resolvedSubagent.agentName}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[10px] font-medium uppercase tracking-wider",
                  isRunning && "text-primary",
                  isStale && "text-warning",
                  status === "cancelled" && "text-muted-foreground",
                  isFailed && status !== "cancelled" && "text-destructive",
                  needsReview && "text-warning",
                  isCompleted && "text-success",
                  !isRunning && !isFailed && !needsReview && !isCompleted && "text-muted-foreground"
                )}
              >
                {statusLabel}
              </span>
              {duration && (
                <span className="execution-subagent-duration shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {duration}
                </span>
              )}
            </div>
            <span className="w-full truncate text-left text-[11px] text-muted-foreground">
              {resolvedSubagent.task}
            </span>
            {(childSummary || delegation?.childAgentIds.length) && (
              <span className="w-full truncate text-left text-[10px] text-muted-foreground">
                {[childSummary, delegation?.childAgentIds.length ? `${delegation.childAgentIds.length} nested agent${delegation.childAgentIds.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              isExpanded && "rotate-90"
            )}
          />
        </div>
      </FoldOutCardTrigger>
      <FoldOutCardContent>
        <div className="px-3 pb-3 pt-1">
          {sessionId && resolvedSubagent?.spawnId && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => openSubagentInPanel(sessionId, resolvedSubagent.spawnId)}
                className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Open agent trace
              </button>
            </div>
          )}
          {(resolvedSubagent.resultSummary || errorPresentation) && (
            <div
              className={cn(
                "mb-2 rounded-lg border p-2.5 text-[12px] leading-relaxed",
                errorPresentation
                  ? "border-destructive bg-muted text-destructive"
                  : "border-border bg-muted text-foreground"
              )}
              role={errorPresentation ? "alert" : undefined}
            >
              {errorPresentation ? (
                <div className="flex items-start gap-2">
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="font-medium">{errorPresentation.title}</div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-foreground">{errorPresentation.summary}</div>
                    {errorPresentation.action !== "none" && (
                      <div className="mt-1 text-[10px] text-muted-foreground">Next: {errorPresentation.actionLabel}</div>
                    )}
                    {errorPresentation.technicalDetails !== errorPresentation.summary && (
                      <details className="mt-2 rounded border border-border bg-background px-2 py-1">
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground">Technical details</summary>
                        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">{errorPresentation.technicalDetails}</pre>
                      </details>
                    )}
                  </div>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{resolvedSubagent.resultSummary}</span>
              )}
            </div>
          )}
          {isStale && (
            <div className="mb-2 rounded-md border border-warning bg-muted px-2.5 py-2 text-[11px] text-foreground" role="status">
              <span className="font-medium text-warning">Interrupted after reload.</span>{" "}
              <span className="text-muted-foreground">The saved subagent trace is available for review.</span>
            </div>
          )}
          {childAgents.length > 0 && (
            <div className="mt-2 space-y-1.5" aria-label="Nested delegated agents">
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
          {childTools.length > 0 && (
            <div className="mt-2">
              {/* `bare` mode: render only the inner tool-row rail without the
                  surrounding FoldOutCard + ExecutionRow header. This card
                  already owns the single foldout/summary chrome above, so a
                  nested foldout here would produce double headers and
                  conflicting collapse behavior. */}
              <AgentExecutionTrace
                toolCalls={childTools}
                executionSteps={[]}
                sessionId={sessionId}
                messageId={messageId}
                onOpenArtifact={onOpenArtifact}
                preferCompact
                bare
              />
            </div>
          )}
        </div>
      </FoldOutCardContent>
    </FoldOutCard>
  );
}
