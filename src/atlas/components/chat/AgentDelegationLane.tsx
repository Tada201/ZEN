import { useEffect, useRef, useState } from "react";
import { Ban, Bot, CheckCircle2, ChevronRight, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_LIVE_OUTPUT_CHARS, type AgentDelegationLaneModel } from "./agentDelegationLaneModel";
import {
  createDisclosureState,
  toggleDisclosure,
  transitionDisclosure,
} from "./executionDisclosure";

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return null;
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

export function AgentDelegationLane({ lane }: { lane: AgentDelegationLaneModel }) {
  const isRunning = lane.status === "running";
  const isError = lane.status === "error";
  const durationLabel = formatDuration(lane.durationMs);
  const StatusIcon = isRunning
    ? Loader2
    : isError
      ? XCircle
      : lane.status === "cancelled"
        ? Ban
        : CheckCircle2;
  const statusLabel = isRunning
    ? "Working"
    : lane.status === "cancelled"
      ? "Cancelled"
      : isError
        ? "Failed"
        : "Complete";
  const canExpand = Boolean(lane.task || lane.resultSummary || lane.hasTranscript);
  // Preserve the established completed/error initialization contract. Active
  // lanes are opened by the lifecycle effect below, while errors are visible
  // immediately on first render.
  const disclosureStateRef = useRef(createDisclosureState(lane.status, isError));
  const [isExpanded, setIsExpanded] = useState(isError);
  const livePreview = lane.compactLivePreview;
  const conciseLivePreview = livePreview.length > 260 ? `${livePreview.slice(0, 260)}...` : livePreview;
  // Keep the live transcript bounded before it enters the DOM. The scroll
  // container protects layout height; this cap protects render cost as well.
  const liveOutput = lane.liveContent.length > MAX_LIVE_OUTPUT_CHARS
    ? `${lane.liveContent.slice(-MAX_LIVE_OUTPUT_CHARS)}\n…`
    : lane.liveContent;
  const accessibleLabel = [
    `Delegated to ${lane.agentName}`,
    statusLabel,
    lane.task || undefined,
    durationLabel ? `Duration ${durationLabel}` : undefined,
  ].filter(Boolean).join(", ");

  useEffect(() => {
    const nextState = transitionDisclosure(disclosureStateRef.current, lane.status);
    disclosureStateRef.current = nextState;
    setIsExpanded((previous) => previous === nextState.open ? previous : nextState.open);
  }, [lane.status]);

  return (
    <div className="font-sans">
      <div className="border-l border-border py-1 pl-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
            <Bot className="h-3.5 w-3.5" />
          </span>
          <button
            type="button"
            disabled={!canExpand}
            aria-expanded={canExpand ? isExpanded : undefined}
            aria-busy={isRunning}
            aria-label={accessibleLabel}
            onClick={() => {
              if (!canExpand) return;
              const nextOpen = !isExpanded;
              disclosureStateRef.current = toggleDisclosure(disclosureStateRef.current, nextOpen);
              setIsExpanded(nextOpen);
            }}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 text-left text-[12px] font-medium text-foreground",
              canExpand && "hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
          >
            {canExpand && (
              <ChevronRight
                className={cn(
                  "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                  isExpanded && "rotate-90",
                )}
                aria-hidden="true"
              />
            )}
            <span className="min-w-0 flex-1 truncate">Delegated to {lane.agentName}</span>
          </button>
          {durationLabel && <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{durationLabel}</span>}
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 text-[11px]",
              isRunning && "text-primary",
              lane.status === "completed" && "text-success",
              isError && "text-destructive",
              lane.status === "cancelled" && "text-muted-foreground",
            )}
            role="status"
          >
            <StatusIcon className={cn("h-3.5 w-3.5", isRunning && "motion-safe:animate-spin motion-reduce:transition-none")} aria-hidden="true" />
            {statusLabel}
          </span>
        </div>

        {(lane.resultSummary || conciseLivePreview || lane.task) && !isExpanded && (
          <div className="mt-0.5 truncate text-[12px] leading-5 text-muted-foreground">
            {lane.resultSummary || conciseLivePreview || lane.task}
          </div>
        )}
        {isExpanded && (lane.task || lane.resultSummary || lane.hasTranscript) && (
          <div className="mt-1.5 rounded border border-border bg-muted px-2 py-1.5">
            {lane.task && (
              <div className="text-[12px] leading-relaxed text-muted-foreground">
                <span className="mr-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Task</span>
                {lane.task}
              </div>
            )}
            {lane.hasTranscript && liveOutput && (
              <div className="mt-2 rounded border border-border bg-background px-2 py-1.5">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Live output</div>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {liveOutput}
                </pre>
              </div>
            )}
            {lane.resultSummary && (
              <div className="mt-2 text-[12px] leading-relaxed text-foreground">
                <span className="mr-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Result</span>
                {lane.resultSummary}
              </div>
            )}
            {isError && conciseLivePreview && !lane.liveContent && (
              <div className="mt-2 rounded bg-muted px-2 py-1 text-[12px] leading-relaxed text-muted-foreground">
                {conciseLivePreview}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
