import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw, Undo2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getIpcErrorMessage } from "@/api/tauriClient";
import { toolsApi } from "@/api/toolsApi";
import type { ToolCall } from "./types";
import { buildToolOutputPreview } from "./tool/toolOutputPreview";
import { ToolDetailView } from "./tool/ToolDetailView";
import { FoldOutCard, FoldOutCardContent } from "@/components/ui/fold-out-card";
import { ExecutionRow, getExecutionStatusLabel } from "./tool/ExecutionRow";
import { classifyToolCategory } from "./tool/toolCategory";
import { formatDuration } from "./tool/formatDuration";
import { toToolInputRecord } from "./tool/toToolInputRecord";

interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
  onViewArtifact?: (artifact: NonNullable<ReturnType<typeof buildToolOutputPreview>["artifact"]>) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  defaultExpanded?: boolean;
  streamingPreview?: string;
  chatId?: string;
  /** Render as a quiet row in the shared execution ledger. */
  ledgerRow?: boolean;
}

export function humanizeToolName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("search") || lower.includes("web")) {
    return "Web search";
  }
  const stripped = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return "Tool";
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function compactText(value: unknown, maxLength = 160) {
  if (value === undefined || value === null || value === "") return "";
  const compact = redactDisplayValue(value).replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function redactDisplayValue(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/(api[_-]?key|authorization|bearer|credential|password|secret|token)/i.test(text)) {
    return "[redacted]";
  }
  return text;
}

function splitPath(filePath: string) {
  const parts = filePath.replace(/\\/g, "/").split("/");
  const filename = parts.pop() || filePath;
  return { filename, dir: parts.join("/") };
}

function getInputTarget(input: Record<string, unknown>) {
  const args = toToolInputRecord(input.arguments as ToolCall["input"]);
  return compactText(
    input.file_path ||
      input.filePath ||
      input.path ||
      input.targetPath ||
      input.command ||
      input.query ||
      input.url ||
      args.file_path ||
      args.path ||
      args.query ||
      args.url,
  );
}

/**
 * Single source of truth for tool-action verbs in the chat timeline.
 *
 * Maps a tool-name shape + status to one of the user-facing verbs.
 * Search, read, create, edit/patch, write, and terminal families each get
 * their own progressive/completed forms. Status-specific labels
 * (`Needs approval`, `Failed`, `Completed`) win after family miss so the
 * action text reflects the engine state when no family match applies.
 *
 * Consumers: `ToolCallCard` collapsed `actionText`, the
 * `AgentExecutionTrace.singleToolActionLine` multi-tool collapsed label,
 * the `getActionPresentation` chat_status branches
 * (ToolCallReady / ToolCallStreaming) via `humanizeToolName`, and the same
 * helper drives the right-side `LogEntry` structured metadata summary.
 */
export function humanizeToolAction(name: string, status: ToolCall["status"]) {
  const lower = name.toLowerCase();
  const progressive = status === "running" || status === "awaiting_approval";
  if (lower.includes("search") || lower.includes("web") || lower.includes("grep")) return progressive ? "Searching" : "Searched";
  if (lower.includes("read") || lower.includes("list") || lower.includes("open")) return progressive ? "Reading" : "Read";
  if (lower.includes("create")) return progressive ? "Creating" : "Created";
  if (lower.includes("edit") || lower.includes("patch")) return progressive ? "Editing" : "Updated";
  if (lower.includes("write")) return progressive ? "Writing" : "Updated";
  if (lower.includes("terminal") || lower.includes("shell") || lower.includes("command") || lower.includes("bash")) return progressive ? "Running" : "Ran";
  if (status === "awaiting_approval") return "Needs approval";
  if (status === "error") return "Failed";
  if (status === "completed") return "Completed";
  return "Working";
}

export function ToolCallCard({
  toolCall,
  className,
  defaultExpanded,
  streamingPreview,
  onViewArtifact,
  onCancel,
  onRetry,
  chatId,
  ledgerRow = false,
}: ToolCallCardProps) {
  const { id, name, status, input, output, approvalContext, durationMs } = toolCall;
  const isStale = toolCall.recoveryState === "stale";
  const executionStatus = isStale ? "error" as const : status;
  const inputRecord = useMemo(() => toToolInputRecord(input), [input]);
  const outputPreview = useMemo(() => buildToolOutputPreview(output || ""), [output]);
  const userToggledRef = useRef(false);
  const hasPreview = Boolean(outputPreview.summary || outputPreview.results.length || outputPreview.files.length || outputPreview.artifact);
  // Running, approval, and error tool cards open by default so the user
  // sees work in progress and actionable states; completed background cards
  // collapse. `defaultExpanded` is an explicit override — when set (true or
  // false) it wins; otherwise `hasAction` decides.
  const hasAction = !isStale && (status === "running" || status === "awaiting_approval" || status === "error");
  const [isExpanded, setIsExpanded] = useState(() => defaultExpanded ?? hasAction);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isUndone, setIsUndone] = useState(false);
  const [checkpointAvailable, setCheckpointAvailable] = useState(false);
  const checkpoint = outputPreview.checkpoint;
  const category = useMemo(() => {
    if (status === "awaiting_approval") return "approval";
    if (status === "error") return "error";
    return classifyToolCategory(name);
  }, [status, name]);

  useEffect(() => {
    if (!userToggledRef.current) {
      setIsExpanded(defaultExpanded ?? hasAction);
    }
  }, [defaultExpanded, hasAction]);

  useEffect(() => {
    let active = true;
    setCheckpointAvailable(false);
    if (status !== "completed" || !chatId || !checkpoint?.available) {
      return () => { active = false; };
    }

    void toolsApi.getToolCheckpoint(chatId, checkpoint.toolCallId)
      .then((result) => {
        if (active) setCheckpointAvailable(result?.available === true);
      })
      .catch(() => {
        if (active) setCheckpointAvailable(false);
      });

    return () => { active = false; };
  }, [chatId, status, checkpoint?.available, checkpoint?.toolCallId]);

  const target = getInputTarget(inputRecord);
  const fileTarget = target && /[/\\.]|\.(tsx?|rs|md|json|toml|ya?ml|css|html)$/i.test(target) ? splitPath(target).filename : "";
  const deltaLabel = useMemo(() => {
    if (status !== "completed" || outputPreview.files.length !== 1) return "";
    const file = outputPreview.files[0];
    if (file.linesAdded === undefined && file.linesRemoved === undefined) return "";
    return `+${file.linesAdded || 0} −${file.linesRemoved || 0}`;
  }, [status, outputPreview.files]);
  const actionText = [
    isStale ? "Interrupted" : humanizeToolAction(name, status),
    fileTarget || humanizeToolName(name),
    deltaLabel,
  ].filter(Boolean).join(" ");
  const summary = status === "running"
    ? compactText(streamingPreview || target || "Working...")
    : outputPreview.summary || target || humanizeToolName(name);
  const durationLabel = formatDuration(durationMs);
  const canUndo = status === "completed" && Boolean(chatId && checkpoint?.available && checkpointAvailable) && !isUndone;

  const handleUndo = async () => {
    if (!chatId || !checkpoint?.available || isUndoing || isUndone) return;
    if (!window.confirm(`Undo ${checkpoint.fileCount} file${checkpoint.fileCount === 1 ? "" : "s"} changed by this tool?`)) return;

    setIsUndoing(true);
    try {
      const result = await toolsApi.undoToolCall(chatId, checkpoint.toolCallId);
      if (result.conflicts.length > 0) {
        toast.error("Undo stopped: the workspace changed after the agent edit.", {
          description: "No files were overwritten. Review the conflicting files manually.",
        });
        return;
      }
      setIsUndone(true);
      toast.success(`Undid ${result.restored_files} file${result.restored_files === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error("Could not undo this tool call.", {
        description: getIpcErrorMessage(error, "The recovery checkpoint is no longer available."),
      });
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <FoldOutCard open={isExpanded} onOpenChange={(value) => { userToggledRef.current = true; setIsExpanded(value); }} className={cn(ledgerRow ? "execution-card--ledger min-w-0" : "execution-card codex-surface min-w-0", isStale && "execution-card--stale", className)}>
      <ExecutionRow
        status={executionStatus}
        category={category}
        title={actionText}
        subtitle={summary}
        duration={durationLabel}
        expanded={isExpanded}
        statusLabel={isStale ? "Interrupted" : getExecutionStatusLabel(executionStatus)}
        variant={ledgerRow ? "ledger" : "card"}
        className={ledgerRow ? "execution-row--ledger" : undefined}
        onClick={() => { userToggledRef.current = true; setIsExpanded((prev) => !prev); }}
      />

      <FoldOutCardContent className={ledgerRow ? "execution-card-content--ledger" : undefined}>
        <div className="execution-card-body space-y-2 px-2 py-2">
          {isStale && (
            <div className="flex items-start gap-2 rounded-md border border-warning bg-muted px-2 py-1.5 text-[11px] text-foreground" role="status">
              <span className="font-medium text-warning">Interrupted</span>
              <span className="text-muted-foreground">The app was reloaded before this tool finished. Review the saved trace or retry it.</span>
            </div>
          )}
          {approvalContext && (
            <div className="codex-surface-muted border-l-2 border-l-warning px-2 py-1.5">
              <div className="text-[11px] font-medium leading-5 text-warning">Approval context</div>
              {approvalContext.description && (
                <div className="text-[12px] leading-relaxed text-foreground">{approvalContext.description}</div>
              )}
              {approvalContext.riskLevel && (
                <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{approvalContext.riskLevel} risk</div>
              )}
            </div>
          )}

          {hasPreview && (
            <ToolDetailView
              toolCall={toolCall}
              outputPreview={outputPreview}
              onViewArtifact={onViewArtifact}
            />
          )}

          {canUndo && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-warning/60 bg-warning/5 px-2 py-1.5">
              <span className="text-[11px] text-muted-foreground">
                Recovery checkpoint · {checkpoint?.fileCount} file{checkpoint?.fileCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={handleUndo}
                disabled={isUndoing}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-warning/60 bg-transparent px-2.5 text-[11px] font-medium text-warning transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
              >
                {isUndoing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                {isUndoing ? "Undoing..." : "Undo"}
              </button>
            </div>
          )}

          {isUndone && (
            <div className="rounded-md border border-success/50 bg-success/5 px-2 py-1.5 text-[11px] text-success" role="status">
              Workspace restored for this tool call.
            </div>
          )}

          {status === "awaiting_approval" && (
            <div className="flex justify-end gap-2">
              <button type="button" className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-transparent px-3 text-[11px] font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => onCancel?.(id)}>
                Deny
              </button>
              <button type="button" className="inline-flex h-7 items-center justify-center rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => onRetry?.(id)}>
                Approve
              </button>
            </div>
          )}

          {status === "error" && onRetry && (
            <div className="flex justify-end gap-2">
              <button type="button" className="inline-flex h-7 items-center gap-1.5 justify-center rounded-md border border-border bg-transparent px-3 text-[11px] font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => onRetry?.(id)}>
                <RefreshCcw className="h-3 w-3" />
                Retry
              </button>
            </div>
          )}

        </div>
      </FoldOutCardContent>
    </FoldOutCard>
  );
}
