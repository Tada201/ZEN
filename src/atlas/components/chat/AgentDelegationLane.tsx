import { useState } from "react";
import { Bot, CheckCircle2, ChevronRight, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentDelegationLaneModel } from "./agentDelegationLaneModel";

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return null;
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

export function AgentDelegationLane({ lane }: { lane: AgentDelegationLaneModel }) {
  const isRunning = lane.status === "running";
  const isError = lane.status === "error";
  const durationLabel = formatDuration(lane.durationMs);
  const StatusIcon = isRunning ? Loader2 : isError ? XCircle : CheckCircle2;
  const [isExpanded, setIsExpanded] = useState(isError);
  const canExpand = Boolean(lane.task || lane.resultSummary || lane.hasTranscript);
  const livePreview = lane.compactLivePreview;
  const conciseLivePreview = livePreview.length > 260 ? `${livePreview.slice(0, 260)}...` : livePreview;

  return (
    <div className="font-sans">
      <div className="border-l border-border/80 py-1 pl-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
          </span>
          <button
            type="button"
            disabled={!canExpand}
            aria-expanded={canExpand ? isExpanded : undefined}
            onClick={() => canExpand && setIsExpanded(!isExpanded)}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 text-left text-[12px] font-medium text-foreground",
              canExpand && "hover:text-foreground",
            )}
          >
            {canExpand && (
              <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
            )}
            <span className="min-w-0 flex-1 truncate">Delegated to {lane.agentName}</span>
          </button>
          {durationLabel && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{durationLabel}</span>}
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 text-[11px]",
              isRunning && "text-primary/80",
              lane.status === "completed" && "text-success/80",
              isError && "text-destructive/80",
              lane.status === "cancelled" && "text-muted-foreground",
            )}
          >
            <StatusIcon className={cn("h-3.5 w-3.5", isRunning && "motion-safe:animate-spin")} />
            {lane.status}
          </span>
        </div>

        {(lane.resultSummary || lane.task) && !isExpanded && (
          <div className="mt-0.5 truncate text-[12px] leading-5 text-muted-foreground">
            {lane.resultSummary || lane.task}
          </div>
        )}
        {isExpanded && (lane.task || lane.resultSummary || livePreview) && (
          <div className="mt-1.5 rounded border border-border/60 bg-background/20 px-2 py-1.5">
            {lane.resultSummary && <div className="text-[12px] leading-relaxed text-foreground">{lane.resultSummary}</div>}
            {!lane.resultSummary && lane.task && <div className="text-[12px] leading-relaxed text-muted-foreground">{lane.task}</div>}
            {isError && conciseLivePreview && (
              <div className="mt-2 rounded bg-muted/20 px-2 py-1 text-[12px] leading-relaxed text-muted-foreground">
                {conciseLivePreview}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
