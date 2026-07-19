import { useEffect, useMemo, useRef, useState, memo } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactData, Step, ToolCall } from "./types";
import { ToolCallCard, humanizeToolAction } from "./ToolCallCard";
import { resolveToolApproval } from "./AssistantMessageTrace";
import { buildAgentExecutionTraceModel } from "./agentExecutionTraceModel";
import { buildToolOutputPreview as buildToolOutputPreviewImported } from "./tool/toolOutputPreview";
import { isToolVisibleInChat } from "./assistantMessageParts";

function asInputRecord(input: ToolCall["input"]): Record<string, unknown> {
  if (!input) return {};
  if (typeof input !== "string") return input;
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function compactToolDisplayName(tool: ToolCall): string {
  const name = tool.name.toLowerCase();
  const input = asInputRecord(tool.input);
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

  const input = asInputRecord(tool.input);
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
  const normalizedToolCalls = useMemo(() => dedupeTraceToolCalls(toolCalls).filter(isToolVisibleInChat), [toolCalls]);
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
  // Quiet Codex-style collapsed header: for a single tool show its action line;
  // for many, just "Ran N tools" with running/failed counts only when relevant.
  const headerLabel = useMemo(() => {
    if (normalizedToolCalls.length === 1) {
      return singleToolActionLine(normalizedToolCalls[0]);
    }
    const verb = trace.active ? "Running" : "Ran";
    const parts = [`${verb} ${normalizedToolCalls.length} tools`];
    if (trace.runningCount > 0) parts.push(`${trace.runningCount} running`);
    if (trace.errorCount > 0) parts.push(`${trace.errorCount} failed`);
    return parts.join(" · ");
  }, [normalizedToolCalls, trace.active, trace.runningCount, trace.errorCount]);

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

  if (normalizedToolCalls.length === 0) return null;

  return (
    <div className="font-sans">
      <button
        type="button"
        onClick={() => {
          userToggledRef.current = true;
          setIsExpanded(!isExpanded);
        }}
        aria-expanded={isExpanded}
        className="flex min-h-8 w-full items-center gap-2 rounded-md border border-border bg-muted/50 px-2 py-1 text-left text-muted-foreground transition-all duration-200 hover:bg-muted/70"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {trace.active ? (
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
          ) : trace.errorCount > 0 ? (
            <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
          ) : (
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[12px] font-medium text-foreground", trace.active && "text-blue-500")}>
            {headerLabel}
          </span>
          {!isExpanded && normalizedToolCalls.length > 1 && (
            <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
              {trace.completedCount + trace.errorCount}/{normalizedToolCalls.length}
            </span>
          )}
          {trace.runningCount > 0 && <span className="shrink-0 text-[11px] text-primary/80">{trace.runningCount} running</span>}
          {trace.approvalCount > 0 && <span className="shrink-0 text-[11px] text-warning/80">{trace.approvalCount} waiting</span>}
          {trace.errorCount > 0 && (
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-red-500">
              {trace.errorCount} FAILED
            </span>
          )}
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-90")} />
      </button>

      <div className={cn("tool-expand-grid", isExpanded && "open")}>
        <div className="tool-expand-inner">
          <div className="mt-1">
            <div
              className={cn(
                "relative pl-4 before:absolute before:left-[5px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-muted/80",
                "flex flex-col gap-2",
              )}
            >
              {normalizedToolCalls.map((tc, idx) => (
                <ToolTraceRow
                  key={tc.id || tc.runId || idx}
                  toolCall={tc}
                  sessionId={sessionId}
                  onOpenArtifact={onOpenArtifact}
                  streamingPreview={streamingPreviews.get(tc.id) || undefined}
                />
              ))}
            </div>
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
      <span className="absolute -left-[15px] top-2.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-background">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            toolCall.status === "awaiting_approval"
              ? "bg-amber-400"
              : toolCall.status === "running"
                ? "bg-blue-400"
              : toolCall.status === "error"
                ? "bg-rose-400"
                : "bg-success",
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
