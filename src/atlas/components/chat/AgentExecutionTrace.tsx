import { useEffect, useMemo, useRef, useState, memo } from "react";
import { CheckCircle2, ChevronRight, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactData, Step, ToolCall } from "./types";
import { ToolCallCard } from "./ToolCallCard";
import { resolveToolApproval } from "./AssistantMessageTrace";
import { buildAgentExecutionTraceModel, type ToolExecutionBatchLane } from "./agentExecutionTraceModel";
import { buildToolOutputPreview as buildToolOutputPreviewImported } from "./tool/toolOutputPreview";

function isEmptyObject(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
}

function mergeTraceToolCall(existing: ToolCall, incoming: ToolCall): ToolCall {
  const keepTerminalStatus = (existing.status === "completed" || existing.status === "error") && incoming.status === "running";
  return {
    ...existing,
    ...incoming,
    status: keepTerminalStatus ? existing.status : incoming.status,
    input: isEmptyObject(incoming.input) ? existing.input : incoming.input ?? existing.input,
    output: incoming.output || existing.output,
    durationMs: incoming.durationMs ?? existing.durationMs,
    approvalContext: incoming.approvalContext || existing.approvalContext,
    runId: incoming.runId || existing.runId,
    messageId: incoming.messageId || existing.messageId,
    parentAgentId: incoming.parentAgentId || existing.parentAgentId,
    executionId: incoming.executionId || existing.executionId,
    agentId: incoming.agentId || existing.agentId,
    agentName: incoming.agentName || existing.agentName,
    iteration: incoming.iteration ?? existing.iteration,
    batchId: incoming.batchId || existing.batchId,
    toolBatchId: incoming.toolBatchId || existing.toolBatchId,
    startTime: existing.startTime || incoming.startTime,
    completedAt: incoming.completedAt ?? existing.completedAt,
    lastUpdatedAt: incoming.lastUpdatedAt ?? existing.lastUpdatedAt,
  };
}

function dedupeTraceToolCalls(toolCalls: ToolCall[]) {
  const byId = new Map<string, ToolCall>();
  const orderedIds: string[] = [];

  toolCalls.forEach((toolCall, index) => {
    const key = toolCall.id || `${toolCall.name}:${toolCall.startTime ?? index}`;
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, toolCall);
      orderedIds.push(key);
      return;
    }
    byId.set(key, mergeTraceToolCall(existing, toolCall));
  });

  return orderedIds.map((id) => byId.get(id)).filter((toolCall): toolCall is ToolCall => Boolean(toolCall));
}

export function AgentExecutionTrace({
  toolCalls,
  executionSteps,
  sessionId,
  onOpenArtifact,
  preferCompact = false,
}: {
  toolCalls: ToolCall[];
  executionSteps?: Step[];
  sessionId?: string;
  onOpenArtifact: (a: ArtifactData) => void;
  isStreaming?: boolean;
  preferCompact?: boolean;
}) {
  const normalizedToolCalls = useMemo(() => dedupeTraceToolCalls(toolCalls), [toolCalls]);
  const trace = useMemo(() => buildAgentExecutionTraceModel(normalizedToolCalls, executionSteps), [normalizedToolCalls, executionSteps]);
  const importantToolCalls = useMemo(
    () => normalizedToolCalls.filter((tool) => tool.status === "awaiting_approval" || tool.status === "error"),
    [normalizedToolCalls],
  );
  const shouldDefaultOpen = preferCompact
    ? importantToolCalls.length > 0
    : trace.active || trace.errorCount > 0 || trace.approvalCount > 0;
  const [isExpanded, setIsExpanded] = useState(shouldDefaultOpen);
  const userToggledRef = useRef(false);
  const collapsedSummary = useMemo(() => [
    trace.activeLaneSummary && `batch ${trace.activeLaneSummary}`,
    trace.runningToolSummaries.length > 0 && `active ${trace.runningToolSummaries.join(", ")}`,
    trace.approvalToolSummaries.length > 0 && `approval ${trace.approvalToolSummaries.join(", ")}`,
    trace.resultSummary && `results ${trace.resultSummary}`,
    trace.agentHierarchySummary && `delegation ${trace.agentHierarchySummary}`,
    trace.ownerSummary && `agents ${trace.ownerSummary}`,
  ].filter(Boolean).join(" · "), [trace]);

  // Map tool call IDs to streaming argument previews from chat_status steps
  const streamingPreviews = useMemo(() => {
    const map = new Map<string, string>();
    if (!executionSteps) return map;
    for (const step of executionSteps) {
      const preview = step.metadata?.toolCallPreview;
      if (preview?.toolCallId && preview?.argumentsPreview) {
        map.set(preview.toolCallId, typeof preview.argumentsPreview === "string" ? preview.argumentsPreview : JSON.stringify(preview.argumentsPreview));
      }
    }
    return map;
  }, [executionSteps]);

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
        className="flex min-h-8 w-full items-center gap-2 rounded-md px-1 text-left text-zinc-500 transition-all duration-200 hover:bg-white/[0.018]"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {trace.active ? (
            <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
          ) : trace.errorCount > 0 ? (
            <XCircle className="h-3.5 w-3.5 text-rose-400/80" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-300", trace.active && "text-premium-shimmer")}>
            {preferCompact
              ? trace.compactLabel
            : `${trace.executionLabel}: ${normalizedToolCalls.length} tool ${normalizedToolCalls.length === 1 ? "call" : "calls"}`}
          </span>
          {trace.runningCount > 0 && <span className="shrink-0 text-[11px] text-blue-300/80">{trace.runningCount} running</span>}
          {trace.approvalCount > 0 && <span className="shrink-0 text-[11px] text-amber-300/80">{trace.approvalCount} waiting approval</span>}
          {trace.errorCount > 0 && <span className="shrink-0 text-[11px] text-rose-400/80">{trace.errorCount} failed</span>}
          {!preferCompact && trace.completedCount > 0 && <span className="shrink-0 text-[11px] text-zinc-500">{trace.completedCount} done</span>}
          <span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="flex h-full">
              <span
                className="h-full bg-emerald-400/70 transition-all duration-500"
                style={{ width: `${trace.completedPercent}%` }}
              />
              <span
                className="h-full bg-rose-400/70 transition-all duration-500"
                style={{ width: `${trace.errorPercent}%` }}
              />
            </span>
          </span>
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-200", isExpanded && "rotate-90")} />
      </button>

      {!isExpanded && collapsedSummary && (
        <div className="truncate px-8 pb-1 text-[11px] text-zinc-500" title={collapsedSummary}>
          {collapsedSummary}
        </div>
      )}

      <div className={cn("tool-expand-grid", isExpanded && "open")}>
        <div className="tool-expand-inner">
          <div className="mt-1">
            {normalizedToolCalls.length > 1 && (
            <div className="mb-1.5 ml-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
              <span>{trace.startedTogether || trace.runningCount + trace.approvalCount > 1 ? "Batch started in parallel" : "Sequential tool calls"}</span>
              {trace.batchSummary && <span>batch {trace.batchSummary}</span>}
              {trace.finishedCount > 0 && <span>{trace.finishedCount}/{normalizedToolCalls.length} finished</span>}
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
          {preferCompact && importantToolCalls.length === 0 ? (
            <div className="grid gap-0.5">
              {normalizedToolCalls.map((tc, idx) => (
                <div key={`${tc.id}-${idx}`} className="flex min-w-0 items-center gap-2 rounded px-1.5 py-0.5 text-[11px] leading-5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      tc.status === "awaiting_approval" ? "bg-amber-400"
                        : tc.status === "running" ? "bg-blue-400"
                        : tc.status === "error" ? "bg-rose-400"
                        : "bg-emerald-400",
                    )}
                  />
                  <code className="shrink-0 rounded bg-white/[0.035] px-1 py-0.5 font-mono text-[11px] text-zinc-400">
                    {tc.name}
                  </code>
                  <span className="min-w-0 flex-1 truncate text-zinc-500">
                    {tc.status === "completed" || tc.status === "error"
                      ? (tc.output ? buildToolOutputPreviewImported(tc.output).summary : "") || (tc.status === "error" ? "failed" : "done")
                      : tc.status === "running" ? "running..." : "awaiting approval"}
                  </span>
                  {tc.durationMs != null && tc.durationMs > 0 && (
                    <span className="shrink-0 text-[11px] text-zinc-400 tabular-nums">
                      {tc.durationMs < 1000 ? `${tc.durationMs}ms` : `${(tc.durationMs / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              className={cn(
                "relative pl-4 before:absolute before:left-[5px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-zinc-800/80",
                trace.shouldShowBatchLanes && !preferCompact ? "flex flex-col gap-2" : normalizedToolCalls.length > 1 ? "grid gap-1.5 md:grid-cols-2" : "flex flex-col gap-0.5",
              )}
            >
              {trace.shouldShowBatchLanes && !preferCompact
                  ? trace.batchLanes.map((lane) => (
                    <ToolBatchLane
                      key={lane.id}
                      lane={lane}
                      sessionId={sessionId}
                      onOpenArtifact={onOpenArtifact}
                      streamingPreviews={streamingPreviews}
                    />
                  ))
                  : (preferCompact ? importantToolCalls : toolCalls).map((tc, idx) => (
                    <ToolTraceRow
                      key={tc.id || tc.runId || idx}
                      toolCall={tc}
                      sessionId={sessionId}
                      onOpenArtifact={onOpenArtifact}
                      streamingPreview={streamingPreviews.get(tc.id) || undefined}
                    />
                  ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolTraceRowInner({
  toolCall,
  sessionId,
  onOpenArtifact,
  streamingPreview,
}: {
  toolCall: ToolCall;
  sessionId?: string;
  onOpenArtifact: (a: ArtifactData) => void;
  streamingPreview?: string;
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
        streamingPreview={streamingPreview}
        defaultExpanded={
          toolCall.status === "awaiting_approval" ||
          toolCall.status === "error"
        }
      />
    </div>
  );
}
const ToolTraceRow = memo(ToolTraceRowInner);

function ToolBatchLaneInner({
  lane,
  sessionId,
  onOpenArtifact,
  streamingPreviews,
}: {
  lane: ToolExecutionBatchLane;
  sessionId?: string;
  onOpenArtifact: (a: ArtifactData) => void;
  streamingPreviews: Map<string, string>;
}) {
  const active = lane.runningCount > 0 || lane.approvalCount > 0;

  return (
    <div className="relative rounded-md border border-zinc-800/70 bg-white/[0.01] px-2 py-1.5">
      <span className="absolute -left-[15px] top-3 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-black">
        <span className={cn("h-1.5 w-1.5 rounded-full", lane.approvalCount > 0 ? "bg-amber-400" : active ? "bg-blue-400" : lane.errorCount > 0 ? "bg-rose-400" : "bg-emerald-400")} />
      </span>
      <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-zinc-400">
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
          <span className="flex h-full">
            <span
              className="h-full bg-emerald-400/70 transition-all duration-500"
              style={{ width: `${lane.completedPercent}%` }}
            />
            <span
              className="h-full bg-rose-400/70 transition-all duration-500"
              style={{ width: `${lane.errorPercent}%` }}
            />
          </span>
        </span>
      </div>
      <div className={cn("grid gap-1.5", lane.toolCount > 1 && "md:grid-cols-2")}>
        {lane.toolCalls.map((toolCall, index) => (
          <ToolTraceRow
            key={toolCall.id || toolCall.runId || index}
            toolCall={toolCall}
            sessionId={sessionId}
            onOpenArtifact={onOpenArtifact}
            streamingPreview={streamingPreviews.get(toolCall.id) || undefined}
          />
        ))}
      </div>
    </div>
  );
}
const ToolBatchLane = memo(ToolBatchLaneInner);
