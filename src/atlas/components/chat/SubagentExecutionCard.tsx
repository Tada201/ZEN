import { useEffect, useMemo, useRef, useState } from "react";
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
  sessionId?: string;
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
  sessionId,
  onOpenArtifact,
}: SubagentExecutionCardProps) {
  const subagent = step.subagent;
  // Keep hooks unconditional while streamed reconciliation fills in the
  // subagent payload. The render guard stays after lifecycle state is set up.
  const resolvedSubagent = subagent ?? null;
  const status = resolvedSubagent?.status ?? "completed";
  const isRunning = status === "running";
  const isFailed = status === "failed" || status === "cancelled";
  const isCompleted = status === "completed";
  const duration = formatDuration(subagent?.durationMs);

  // Child tools that belong to this subagent (trace_id === spawn_id).
  const childTools = useMemo(() => {
    if (!childToolCalls || childToolCalls.length === 0) return [];
    return childToolCalls;
  }, [childToolCalls]);

  // Keep active or failed work open so the user does not miss an interruption.
  // Completed work stays summary-first even when child tools are available;
  // the user can open the child trace intentionally.
  const shouldDefaultOpen = Boolean(resolvedSubagent) && (isRunning || isFailed || Boolean(resolvedSubagent?.error));
  const disclosureStatus = isRunning ? "running" : isFailed ? (status === "cancelled" ? "cancelled" : "failed") : "completed";
  const disclosureStateRef = useRef(createDisclosureState(disclosureStatus, shouldDefaultOpen));
  const [isExpanded, setIsExpanded] = useState(disclosureStateRef.current.open);

  useEffect(() => {
    const nextState = transitionDisclosure(disclosureStateRef.current, disclosureStatus);
    disclosureStateRef.current = nextState;
    setIsExpanded((previous) => previous === nextState.open ? previous : nextState.open);
  }, [disclosureStatus]);

  if (!resolvedSubagent) return null;

  const statusIcon = isRunning ? (
    <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin text-primary" aria-hidden="true" />
  ) : status === "cancelled" ? (
    <Ban className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
  ) : isFailed ? (
    <CircleAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
  ) : isCompleted ? (
    <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
  ) : (
    <Bot className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
  );

  const statusLabel = isRunning
    ? "Working"
    : isFailed
    ? status === "cancelled"
      ? "Cancelled"
      : "Failed"
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
    >
      <FoldOutCardTrigger
        aria-label={`${resolvedSubagent.agentName}, ${statusLabel}${duration ? `, Duration ${duration}` : ""}`}
        className="execution-foldout-trigger min-h-10 w-full px-3 py-2 text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <div className="flex w-full items-center gap-2">
          <div
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
              isRunning && "bg-muted",
              isFailed && "bg-muted",
              isCompleted && "bg-muted",
              !isRunning && !isFailed && !isCompleted && "bg-muted"
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
                  status === "cancelled" && "text-muted-foreground",
                  isFailed && status !== "cancelled" && "text-destructive",
                  isCompleted && "text-success",
                  !isRunning && !isFailed && !isCompleted && "text-muted-foreground"
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
          {(resolvedSubagent.resultSummary || resolvedSubagent.error) && (
            <div
              className={cn(
                "mb-2 rounded-lg border p-2.5 text-[12px] leading-relaxed",
                resolvedSubagent.error
                  ? "border-destructive bg-muted text-destructive"
                  : "border-border bg-muted text-foreground"
              )}
            >
              {resolvedSubagent.error ? (
                <div className="flex items-start gap-2">
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <span className="whitespace-pre-wrap">{resolvedSubagent.error}</span>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{resolvedSubagent.resultSummary}</span>
              )}
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
