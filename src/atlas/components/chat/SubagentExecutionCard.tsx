import { useMemo, useState } from "react";
import {
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

interface SubagentExecutionCardProps {
  step: Step;
  childToolCalls?: ToolCall[];
  isStreaming?: boolean;
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
  isStreaming,
  sessionId,
  onOpenArtifact,
}: SubagentExecutionCardProps) {
  const subagent = step.subagent;
  if (!subagent) return null;

  const status = subagent.status;
  const isRunning = status === "running";
  const isFailed = status === "failed" || status === "cancelled";
  const isCompleted = status === "completed";
  const duration = formatDuration(subagent.durationMs);

  // Child tools that belong to this subagent (trace_id === spawn_id).
  const childTools = useMemo(() => {
    if (!childToolCalls || childToolCalls.length === 0) return [];
    return childToolCalls;
  }, [childToolCalls]);

  // Keep the card expanded while running, or when there is a result/error to
  // inspect, so the user doesn't miss the sub-agent's output.
  const shouldDefaultOpen = isRunning || isFailed || Boolean(subagent.resultSummary || subagent.error) || childTools.length > 0;
  const [isExpanded, setIsExpanded] = useState(shouldDefaultOpen);

  const statusIcon = isRunning ? (
    <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin text-primary" aria-hidden="true" />
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
    ? "Completed"
    : "Subagent";

  return (
    <FoldOutCard
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <FoldOutCardTrigger className="min-h-10 w-full px-3 py-2 text-foreground transition-colors duration-200 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/60">
        <div className="flex w-full items-center gap-2">
          <div
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
              isRunning && "bg-primary/10",
              isFailed && "bg-destructive/10",
              isCompleted && "bg-success/10",
              !isRunning && !isFailed && !isCompleted && "bg-muted"
            )}
          >
            {statusIcon}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <div className="flex w-full items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-foreground">
                {subagent.agentName}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[10px] font-medium uppercase tracking-wider",
                  isRunning && "text-primary",
                  isFailed && "text-destructive",
                  isCompleted && "text-success",
                  !isRunning && !isFailed && !isCompleted && "text-muted-foreground"
                )}
              >
                {statusLabel}
              </span>
              {duration && (
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {duration}
                </span>
              )}
            </div>
            <span className="w-full truncate text-left text-[11px] text-muted-foreground">
              {subagent.task}
            </span>
          </div>
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              isExpanded && "rotate-90"
            )}
          />
        </div>
      </FoldOutCardTrigger>
      <FoldOutCardContent>
        <div className="px-3 pb-3 pt-1">
          {(subagent.resultSummary || subagent.error) && (
            <div
              className={cn(
                "mb-2 rounded-lg border p-2.5 text-[12px] leading-relaxed",
                subagent.error
                  ? "border-destructive/20 bg-destructive/5 text-destructive/90"
                  : "border-border bg-muted text-foreground"
              )}
            >
              {subagent.error ? (
                <div className="flex items-start gap-2">
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <span className="whitespace-pre-wrap">{subagent.error}</span>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{subagent.resultSummary}</span>
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
                isStreaming={isStreaming}
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
