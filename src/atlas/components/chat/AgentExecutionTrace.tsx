import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactData, Step, ToolCall } from "./types";
import { ToolCallCard } from "./ToolCallCard";
import { resolveToolApproval } from "./AssistantMessageTrace";
import { buildAgentExecutionTraceModel, type ToolExecutionBatchLane } from "./agentExecutionTraceModel";

export function AgentExecutionTrace({
  toolCalls,
  executionSteps,
  sessionId,
  onOpenArtifact,
}: {
  toolCalls: ToolCall[];
  executionSteps?: Step[];
  sessionId?: string;
  onOpenArtifact: (a: ArtifactData) => void;
  isStreaming?: boolean;
}) {
  const trace = useMemo(() => buildAgentExecutionTraceModel(toolCalls, executionSteps), [toolCalls, executionSteps]);
  const shouldDefaultOpen = trace.active || trace.errorCount > 0 || toolCalls.length <= 8;
  const collapsedSummary = [
    trace.activeLaneSummary ? `active batch ${trace.activeLaneSummary}` : "",
    trace.runningToolSummaries.length > 0 ? `active ${trace.runningToolSummaries.join(", ")}` : "",
    trace.approvalToolSummaries.length > 0 ? `waiting approval ${trace.approvalToolSummaries.join(", ")}` : "",
    trace.resultSummary ? `results ${trace.resultSummary}` : "",
    trace.completionSummary && trace.completionOrder.length > 1 ? `completed ${trace.completionSummary}` : "",
    trace.agentHierarchySummary ? `delegation ${trace.agentHierarchySummary}` : "",
    trace.agentSummary ? `delegation ${trace.agentSummary}` : "",
    trace.ownerSummary ? `agents ${trace.ownerSummary}` : "",
  ].filter(Boolean).join(" / ");
  const [isExpanded, setIsExpanded] = useState(shouldDefaultOpen);
  const userToggledRef = useRef(false);

  useEffect(() => {
    if (!userToggledRef.current && (trace.active || trace.errorCount > 0)) {
      setIsExpanded(true);
    }
  }, [trace.errorCount, trace.active]);

  return (
    <div className="font-sans">
      <button
        type="button"
        onClick={() => {
          userToggledRef.current = true;
          setIsExpanded(!isExpanded);
        }}
        aria-expanded={isExpanded}
        className="flex min-h-8 w-full items-center gap-2 rounded-md px-1 text-left text-zinc-500 transition-colors hover:bg-white/[0.018]"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {trace.active ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : trace.errorCount > 0 ? (
            <XCircle className="h-3.5 w-3.5 text-rose-400/80" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-300", trace.active && "text-premium-shimmer")}>
            {trace.executionLabel}: {toolCalls.length} tool {toolCalls.length === 1 ? "call" : "calls"}
          </span>
          {trace.runningCount > 0 && <span className="shrink-0 text-[11px] text-blue-300/80">{trace.runningCount} running</span>}
          {trace.approvalCount > 0 && <span className="shrink-0 text-[11px] text-amber-300/80">{trace.approvalCount} waiting approval</span>}
          {trace.errorCount > 0 && <span className="shrink-0 text-[11px] text-rose-400/80">{trace.errorCount} failed</span>}
          {trace.completedCount > 0 && <span className="shrink-0 text-[11px] text-zinc-500">{trace.completedCount} done</span>}
          <span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
            <span
              className={cn("block h-full transition-all duration-500", trace.errorCount > 0 ? "bg-rose-400/70" : "bg-emerald-400/70")}
              style={{ width: `${trace.progressPercent}%` }}
            />
          </span>
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform duration-200", isExpanded && "rotate-90")} />
      </button>

      {!isExpanded && collapsedSummary && (
        <div className="ml-8 mr-2 -mt-0.5 truncate rounded-md border border-zinc-800/70 bg-white/[0.012] px-2 py-1 text-[11px] leading-5 text-zinc-500">
          {collapsedSummary}
        </div>
      )}

      {isExpanded && (
        <div className="mt-1 overflow-hidden">
          {toolCalls.length > 1 && (
            <div className="mb-1.5 ml-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
              <span>{trace.startedTogether || trace.runningCount + trace.approvalCount > 1 ? "Batch started in parallel" : "Sequential tool calls"}</span>
              {trace.batchSummary && <span>batch {trace.batchSummary}</span>}
              {trace.finishedCount > 0 && <span>{trace.finishedCount}/{toolCalls.length} finished</span>}
              {trace.latestFinishedTool && <span>latest {trace.latestFinishedTool.name}</span>}
              {trace.completionSummary && trace.completionOrder.length > 1 && <span>completed {trace.completionSummary}</span>}
              {trace.resultSummary && <span>results {trace.resultSummary}</span>}
              {trace.agentHierarchySummary && <span>delegation {trace.agentHierarchySummary}</span>}
              {trace.agentSummary && <span>delegation {trace.agentSummary}</span>}
              {trace.handoffSummary && <span>handoff {trace.handoffSummary}</span>}
              {trace.ownerSummary && <span>agents {trace.ownerSummary}</span>}
              {trace.activeLaneSummary && <span>active batch {trace.activeLaneSummary}</span>}
              {trace.runningToolSummaries.length > 0 && <span>active {trace.runningToolSummaries.join(", ")}</span>}
              {trace.approvalToolSummaries.length > 0 && <span>waiting approval {trace.approvalToolSummaries.join(", ")}</span>}
            </div>
          )}
          <div
            className={cn(
              "relative pl-4 before:absolute before:left-[5px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-zinc-800/80",
              trace.shouldShowBatchLanes ? "flex flex-col gap-2" : toolCalls.length > 1 ? "grid gap-1.5 md:grid-cols-2" : "flex flex-col gap-0.5",
            )}
          >
            {trace.shouldShowBatchLanes
              ? trace.batchLanes.map((lane) => (
                  <ToolBatchLane
                    key={lane.id}
                    lane={lane}
                    sessionId={sessionId}
                    onOpenArtifact={onOpenArtifact}
                    totalToolCount={toolCalls.length}
                  />
                ))
              : toolCalls.map((tc, idx) => (
                  <ToolTraceRow
                    key={`${tc.id}-${idx}`}
                    toolCall={tc}
                    sessionId={sessionId}
                    onOpenArtifact={onOpenArtifact}
                    totalToolCount={toolCalls.length}
                  />
                ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolTraceRow({
  toolCall,
  sessionId,
  onOpenArtifact,
  totalToolCount,
}: {
  toolCall: ToolCall;
  sessionId?: string;
  onOpenArtifact: (a: ArtifactData) => void;
  totalToolCount: number;
}) {
  return (
    <div className="relative">
      <span className="absolute -left-[15px] top-2.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-black">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            toolCall.status === "awaiting_approval"
              ? "bg-amber-400"
              : toolCall.status === "running"
                ? "bg-blue-400"
              : toolCall.status === "error"
                ? "bg-rose-400"
                : "bg-emerald-400",
          )}
        />
      </span>
      <ToolCallCard
        toolCall={toolCall}
        className="w-full min-w-0"
        chatId={sessionId}
        onViewArtifact={onOpenArtifact}
        onCancel={() => resolveToolApproval(toolCall.id, false)}
        onRetry={() => resolveToolApproval(toolCall.id, true)}
        defaultExpanded={
          toolCall.status === "awaiting_approval" ||
          toolCall.status === "error" ||
          (totalToolCount <= 4 && toolCall.status === "completed" && Boolean(toolCall.output))
        }
      />
    </div>
  );
}

function ToolBatchLane({
  lane,
  sessionId,
  onOpenArtifact,
  totalToolCount,
}: {
  lane: ToolExecutionBatchLane;
  sessionId?: string;
  onOpenArtifact: (a: ArtifactData) => void;
  totalToolCount: number;
}) {
  const active = lane.runningCount > 0 || lane.approvalCount > 0;

  return (
    <div className="relative rounded-md border border-zinc-800/70 bg-white/[0.01] px-2 py-1.5">
      <span className="absolute -left-[15px] top-3 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-black">
        <span className={cn("h-1.5 w-1.5 rounded-full", lane.approvalCount > 0 ? "bg-amber-400" : active ? "bg-blue-400" : lane.errorCount > 0 ? "bg-rose-400" : "bg-emerald-400")} />
      </span>
      <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-zinc-600">
        <span className={cn("min-w-0 max-w-full truncate font-medium text-zinc-400", active && "text-blue-200/80")}>
          {lane.label}
        </span>
        <span>{lane.completedCount + lane.errorCount}/{lane.toolCount} finished</span>
        {lane.runningCount > 0 && <span>{lane.runningCount} running</span>}
        {lane.approvalCount > 0 && <span className="text-amber-300/80">{lane.approvalCount} waiting approval</span>}
        {lane.ownerSummary && <span>agents {lane.ownerSummary}</span>}
        {lane.runningToolSummaries.length > 0 && <span>active {lane.runningToolSummaries.join(", ")}</span>}
        {lane.approvalToolSummaries.length > 0 && <span className="text-amber-300/80">waiting approval {lane.approvalToolSummaries.join(", ")}</span>}
        {lane.resultSummary && <span>results {lane.resultSummary}</span>}
        <span className="h-1 w-12 overflow-hidden rounded-full bg-white/[0.06]">
          <span
            className={cn("block h-full transition-all duration-500", lane.errorCount > 0 ? "bg-rose-400/70" : "bg-emerald-400/70")}
            style={{ width: `${lane.progressPercent}%` }}
          />
        </span>
      </div>
      <div className={cn("grid gap-1.5", lane.toolCount > 1 && "md:grid-cols-2")}>
        {lane.toolCalls.map((toolCall) => (
          <ToolTraceRow
            key={toolCall.id}
            toolCall={toolCall}
            sessionId={sessionId}
            onOpenArtifact={onOpenArtifact}
            totalToolCount={totalToolCount}
          />
        ))}
      </div>
    </div>
  );
}
