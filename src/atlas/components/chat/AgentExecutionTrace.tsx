import { useEffect, useMemo, useRef, useState, memo } from "react";
import { cn } from "@/lib/utils";
import type { ArtifactData, Step, ToolCall } from "./types";
import { ToolCallCard, humanizeToolAction } from "./ToolCallCard";
import { resolveToolApproval } from "./approvalActions";
import { buildAgentExecutionTraceModel } from "./agentExecutionTraceModel";
import { buildToolOutputPreview as buildToolOutputPreviewImported } from "./tool/toolOutputPreview";
import { isToolVisibleInChat } from "./assistantMessageParts";
import { FoldOutCard, FoldOutCardContent } from "@/components/ui/fold-out-card";
import { ExecutionRow, getExecutionStatusLabel } from "./tool/ExecutionRow";
import type { ExecutionStatus } from "./tool/ExecutionRow";
import { classifyToolCategory, type ToolCategory } from "./tool/toolCategory";
import { formatDuration } from "./tool/formatDuration";
import { toToolInputRecord } from "./tool/toToolInputRecord";
import {
  createDisclosureState,
  toggleDisclosure,
  transitionDisclosure,
} from "./executionDisclosure";

function compactToolDisplayName(tool: ToolCall): string {
  const name = tool.name.toLowerCase();
  const input = toToolInputRecord(tool.input);
  const args = input.arguments && typeof input.arguments === "object" && !Array.isArray(input.arguments)
    ? input.arguments as Record<string, unknown>
    : {};
  const innerTool = String(input.tool_id || input.tool || input.name || "").toLowerCase();
  const hasSearchArgs = Boolean(input.query || args.query || input.url || args.url);
  const outputLooksLikeSearch = Boolean(tool.output && buildToolOutputPreviewImported(tool.output).results.length > 0);

  if (
    name.includes("search") ||
    name.includes("web") ||
    innerTool.includes("search") ||
    innerTool.includes("web") ||
    (name === "tool_exec" && (hasSearchArgs || outputLooksLikeSearch))
  ) {
    return "Web search";
  }

  return tool.name;
}

function isEmptyObject(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
}

function singleToolActionLine(tool: ToolCall): string {
  const verb = humanizeToolAction(tool.name, tool.status);

  const input = toToolInputRecord(tool.input);
  const args = input.arguments && typeof input.arguments === "object" && !Array.isArray(input.arguments)
    ? input.arguments as Record<string, unknown>
    : {};
  const rawTarget = input.file_path || input.filePath || input.path || input.command || input.query || input.url
    || args.file_path || args.path || args.query || args.url;
  const target = typeof rawTarget === "string" ? rawTarget : "";
  const filename = target && /[/\\]/.test(target) ? target.replace(/\\/g, "/").split("/").pop() || target : target;
  const label = filename ? `${verb} ${filename}` : `${verb} ${compactToolDisplayName(tool)}`;
  return label.length > 80 ? `${label.slice(0, 80)}...` : label;
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

function getGroupStatus(toolCalls: ToolCall[]): ExecutionStatus {
  // Human-attention states win over background activity. A running sibling
  // must not hide an approval request or a failure in the group header.
  if (toolCalls.some((tool) => tool.status === "awaiting_approval")) return "awaiting_approval";
  if (toolCalls.some((tool) => tool.status === "error")) return "error";
  if (toolCalls.some((tool) => tool.status === "running")) return "running";
  return "completed";
}

function getGroupDuration(toolCalls: ToolCall[]): number | undefined {
  // Group duration is elapsed wall time, not the sum of parallel calls.
  // Summing makes a parallel batch look slower than the user experienced.
  const startedAt = toolCalls
    .map((tool) => tool.startTime)
    .filter((value): value is number => typeof value === "number");
  const completedAt = toolCalls
    .map((tool) => tool.completedAt)
    .filter((value): value is number => typeof value === "number");
  if (startedAt.length > 0 && completedAt.length > 0) {
    return Math.max(0, Math.max(...completedAt) - Math.min(...startedAt));
  }
  const durations = toolCalls
    .map((tool) => tool.durationMs)
    .filter((value): value is number => typeof value === "number" && value > 0);
  return durations.length > 0 ? Math.max(...durations) : undefined;
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
  bare = false,
}: {
  toolCalls: ToolCall[];
  executionSteps?: Step[];
  sessionId?: string;
  onOpenArtifact: (a: ArtifactData) => void;
  preferCompact?: boolean;
  /**
   * When true, renders only the inner tool-row rail WITHOUT the surrounding
   * FoldOutCard + ExecutionRow header. Used by SubagentExecutionCard so the
   * subagent card owns the single foldout/summary chrome and the tool rows
   * live directly inside it — eliminating the double-header / nested
   * foldout chrome that previously appeared for subagent child tools.
   */
  bare?: boolean;
}) {
  const normalizedToolCalls = useMemo(() => dedupeTraceToolCalls(toolCalls).filter(isToolVisibleInChat), [toolCalls]);
  const trace = useMemo(() => buildAgentExecutionTraceModel(normalizedToolCalls, executionSteps), [normalizedToolCalls, executionSteps]);
  const importantToolCalls = useMemo(
    () => normalizedToolCalls.filter((tool) => tool.status === "awaiting_approval" || tool.status === "error"),
    [normalizedToolCalls],
  );
  // `trace.active` = runningCount > 0 || approvalCount > 0, so
  // `trace.active || importantToolCalls.length > 0` covers running, approval,
  // and error — matching the old ExecutionGroup default-open behavior.
  const shouldDefaultOpen = preferCompact
    ? trace.active || importantToolCalls.length > 0
    : trace.active || trace.errorCount > 0 || trace.approvalCount > 0;
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

  const groupStatus = useMemo(() => getGroupStatus(normalizedToolCalls), [normalizedToolCalls]);
  const disclosureStateRef = useRef(createDisclosureState(groupStatus, shouldDefaultOpen));
  const [isExpanded, setIsExpanded] = useState(disclosureStateRef.current.open);
  const groupDuration = useMemo(() => getGroupDuration(normalizedToolCalls), [normalizedToolCalls]);
  const dominantCategory = useMemo<ToolCategory>(() => {
    const counts = new Map<ToolCategory, number>();
    for (const tool of normalizedToolCalls) {
      const cat = classifyToolCategory(tool.name, tool.status);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    let best: ToolCategory | undefined;
    let bestCount = 0;
    for (const [cat, count] of counts) {
      if (count > bestCount) {
        best = cat;
        bestCount = count;
      }
    }
    return best ?? "generic";
  }, [normalizedToolCalls]);

  const headerLabel = useMemo(() => {
    const count = normalizedToolCalls.length;
    if (count === 1) {
      return singleToolActionLine(normalizedToolCalls[0]);
    }
    if (groupStatus === "running") {
      return `Running ${normalizedToolCalls.length} tools`;
    }
    if (groupStatus === "awaiting_approval") {
      return `${normalizedToolCalls.length} tools waiting for approval`;
    }
    if (groupStatus === "error") {
      return `${normalizedToolCalls.length} tools · ${trace.errorCount} failed`;
    }
    return `${normalizedToolCalls.length} actions`;
  }, [normalizedToolCalls, groupStatus, trace.errorCount]);

  const summarySubtitle = useMemo(() => {
    const parts: string[] = [];
    if (groupStatus === "completed") {
      if (trace.resultSummary) parts.push(trace.resultSummary);
    } else if (groupStatus === "error") {
      if (trace.resultSummary) parts.push(trace.resultSummary);
      else parts.push(`${trace.completedCount} completed`);
    } else {
      if (trace.runningCount > 0) parts.push(`${trace.runningCount} running`);
      if (trace.approvalCount > 0) parts.push(`${trace.approvalCount} waiting`);
      if (trace.errorCount > 0) parts.push(`${trace.errorCount} failed`);
    }
    return parts.join(" · ") || undefined;
  }, [groupStatus, trace]);

  const summaryDuration = useMemo(() => formatDuration(groupDuration), [groupDuration]);
  const statusLabel = getExecutionStatusLabel(groupStatus);
  const traceAriaLabel = `${headerLabel}, ${statusLabel}${summarySubtitle ? `. ${summarySubtitle}` : ""}`;
  const liveStatusMessage = groupStatus === "running"
    ? `${headerLabel}. Running.`
    : groupStatus === "awaiting_approval"
      ? `${headerLabel}. Needs approval.`
      : groupStatus === "error"
        ? `${headerLabel}. Failed.`
          : groupStatus === "completed"
            ? `${headerLabel}. Complete.`
            : headerLabel;
  const hasExecutionContext = Boolean(
    trace.shouldShowBatchLanes ||
    trace.agentSummary ||
    trace.agentHierarchySummary ||
    trace.handoffSummary ||
    trace.activeLaneSummary,
  );

  useEffect(() => {
    const nextState = transitionDisclosure(disclosureStateRef.current, groupStatus);
    disclosureStateRef.current = nextState;
    setIsExpanded((previous) => previous === nextState.open ? previous : nextState.open);
  }, [groupStatus]);

  if (normalizedToolCalls.length === 0) return null;

  // `bare` mode: render only the inner tool-row rail without the surrounding
  // FoldOutCard + ExecutionRow header. The parent (SubagentExecutionCard)
  // owns the single foldout/summary chrome, so we avoid the double-header
  // and conflicting collapse behavior that nested foldouts produced.
  if (bare) {
    return (
      <div className="execution-tool-rail relative pl-4 before:absolute before:left-[5px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-border flex flex-col gap-1.5">
        {normalizedToolCalls.map((tc, idx) => (
          <div key={tc.id || tc.runId || idx} className="animate-in fade-in duration-150 motion-reduce:animate-none">
            <ToolTraceRow toolCall={tc} sessionId={sessionId} onOpenArtifact={onOpenArtifact} streamingPreview={streamingPreviews.get(tc.id) || undefined} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="execution-trace min-w-0"
      aria-label={traceAriaLabel}
      aria-busy={groupStatus === "running"}
    >
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveStatusMessage}
      </span>
      <FoldOutCard open={isExpanded} onOpenChange={(value) => {
        disclosureStateRef.current = toggleDisclosure(disclosureStateRef.current, value);
        setIsExpanded(value);
      }} className="execution-group execution-group--ledger font-sans">
      <ExecutionRow
        status={groupStatus}
        category={dominantCategory}
        title={headerLabel}
        subtitle={summarySubtitle}
        duration={summaryDuration}
        expanded={isExpanded}
        variant="ledger"
        className="execution-row--ledger execution-row--group"
        onClick={() => {
          const nextOpen = !isExpanded;
          disclosureStateRef.current = toggleDisclosure(disclosureStateRef.current, nextOpen);
          setIsExpanded(nextOpen);
        }}
      />

      <FoldOutCardContent>
          {hasExecutionContext && (
            <div
              className="mb-2 space-y-1.5 rounded-md border border-border bg-muted px-2.5 py-2 text-[11px]"
              data-testid="execution-context-summary"
            >
              {(trace.agentSummary || trace.agentHierarchySummary || trace.handoffSummary) && (
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                  <span className="font-medium text-foreground">Agents</span>
                  {trace.agentSummary && <span className="truncate">{trace.agentSummary}</span>}
                  {trace.agentHierarchySummary && <span className="truncate">{trace.agentHierarchySummary}</span>}
                  {trace.handoffSummary && <span className="truncate">Handoff {trace.handoffSummary}</span>}
                </div>
              )}
              {trace.activeLaneSummary && (
                <div className="truncate text-primary" role="status" aria-live="polite">
                  {trace.activeLaneSummary}
                </div>
              )}
              {trace.shouldShowBatchLanes && (
                <div className="grid gap-1 sm:grid-cols-2" aria-label="Execution lanes">
                  {trace.batchLanes.slice(0, 4).map((lane) => {
                    const laneStatus = lane.approvalCount > 0
                      ? "Needs approval"
                      : lane.errorCount > 0
                        ? "Failed"
                        : lane.runningCount > 0
                          ? "Running"
                          : "Complete";
                    return (
                      <div key={lane.id} className="flex min-w-0 items-center gap-1.5 rounded border border-border bg-background px-2 py-1">
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{lane.label}</span>
                        <span className="shrink-0 text-muted-foreground">{lane.completedCount}/{lane.toolCount}</span>
                        <span className={cn(
                          "shrink-0",
                          lane.approvalCount > 0 && "text-warning",
                          lane.errorCount > 0 && "text-destructive",
                          lane.runningCount > 0 && lane.errorCount === 0 && lane.approvalCount === 0 && "text-primary",
                          lane.runningCount === 0 && lane.errorCount === 0 && lane.approvalCount === 0 && "text-success",
                        )}>{laneStatus}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="execution-tool-rail relative pl-4 before:absolute before:left-[5px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-border flex flex-col gap-1.5">
            {normalizedToolCalls.map((tc, idx) => (
              <div key={tc.id || tc.runId || idx} className="animate-in fade-in duration-150 motion-reduce:animate-none">
                <ToolTraceRow toolCall={tc} sessionId={sessionId} onOpenArtifact={onOpenArtifact} streamingPreview={streamingPreviews.get(tc.id) || undefined} />
              </div>
            ))}
      </div>
      </FoldOutCardContent>
      </FoldOutCard>
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
      <span className="absolute -left-[15px] top-2.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[var(--execution-surface)]">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors duration-200",
            toolCall.status === "awaiting_approval"
              ? "bg-warning"
              : toolCall.status === "running"
                ? "bg-primary"
              : toolCall.status === "error"
                ? "bg-destructive"
                : "bg-success",
          )}
        />
      </span>
      <ToolCallCard
        toolCall={toolCall}
        className="w-full min-w-0"
        ledgerRow
        chatId={sessionId}
        onViewArtifact={onOpenArtifact}
        onCancel={() => resolveToolApproval(toolCall.id, false)}
        onRetry={() => resolveToolApproval(toolCall.id, true)}
        streamingPreview={streamingPreview}
        defaultExpanded={
          toolCall.status === "running" ||
          toolCall.status === "awaiting_approval" ||
          toolCall.status === "error"
        }
      />
    </div>
  );
}
const ToolTraceRow = memo(ToolTraceRowInner);
