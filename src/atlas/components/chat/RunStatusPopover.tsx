import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Bot,
  Check,
  CircleDashed,
  FileDiff,
  ListTree,
  Loader2,
  Pause,
  ShieldAlert,
  Square,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { chatApi } from "@/api";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useUIStore } from "@/lib/stores/useUIStore";
import { toast } from "sonner";
import { projectScopedSubagents, type ScopedSubagentRecord } from "@/atlas/agentRuntime/subagentRuntime";
import { upsertScopedSubagent } from "@/atlas/agentRuntime/scopedSubagentStore";
import { collectMessageToolCalls } from "./messageToolCallModel";
import { buildToolOutputPreview } from "./tool/toolOutputPreview";
import { deriveWorkspaceExecutionStatus, type WorkspaceExecutionStatus } from "./workspaceExecutionStatus";
import type { Message } from "./types";

const ACTIVE_SUBAGENT_STATUSES = new Set(["queued", "running"]);
const RECENT_SUBAGENT_LIMIT = 4;

function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 pb-1.5 pt-2.5">
      <div className="flex items-center gap-2 text-[11px] font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span>{title}</span>
      </div>
      {action}
    </div>
  );
}

function formatElapsed(durationMs: number) {
  const totalSeconds = Math.floor(Math.max(0, durationMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function SubagentTimer({ startTime, durationMs, running }: { startTime?: number; durationMs?: number; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || typeof startTime !== "number") return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [running, startTime]);

  const elapsedMs = running && typeof startTime === "number"
    ? Math.max(0, now - startTime)
    : durationMs;
  if (typeof elapsedMs !== "number") return null;

  const label = formatElapsed(elapsedMs);
  return (
    <span className="shrink-0 font-mono tabular-nums text-[10px] text-muted-foreground" aria-label={`Elapsed ${label}`}>
      {label}
    </span>
  );
}

function currentTurnMessages(messages: Message[]) {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  return messages.slice(lastUserIndex + 1);
}

function collectSubagents(messages: Message[]): ScopedSubagentRecord[] {
  const records = new Map<string, ScopedSubagentRecord>();
  for (const message of currentTurnMessages(messages)) {
    if (message.role !== "assistant") continue;
    for (const record of projectScopedSubagents(message.steps).values()) {
      const previous = records.get(record.spawnId);
      records.set(record.spawnId, {
        ...previous,
        ...record,
        timestamp: previous?.timestamp ?? record.timestamp,
        childToolCallIds: [...new Set([...(previous?.childToolCallIds || []), ...record.childToolCallIds])],
      });
    }
  }
  return [...records.values()];
}

function collectChangedFileCount(messages: Message[]) {
  const paths = new Set<string>();
  for (const message of currentTurnMessages(messages)) {
    if (message.role !== "assistant") continue;
    for (const tool of collectMessageToolCalls(message)) {
      if (!tool.output) continue;
      try {
        for (const file of buildToolOutputPreview(tool.output).files) paths.add(file.path);
      } catch {
        // A malformed tool result should not break the status surface.
      }
    }
  }
  return paths.size;
}

function statusLabel(status: ScopedSubagentRecord["status"]) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Working";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "incomplete" || status === "uncertain") return "Needs review";
  if (status === "stale") return "Interrupted";
  return "Complete";
}

function statusIcon(status: ScopedSubagentRecord["status"]) {
  if (status === "running") return Loader2;
  if (status === "queued") return CircleDashed;
  if (status === "failed") return AlertCircle;
  if (status === "incomplete" || status === "uncertain" || status === "stale") return AlertCircle;
  if (status === "cancelled") return XCircle;
  return Check;
}

function statusTone(status: ScopedSubagentRecord["status"]) {
  if (status === "running") return "text-primary";
  if (status === "failed") return "text-destructive";
  if (status === "incomplete" || status === "uncertain" || status === "stale") return "text-warning";
  if (status === "cancelled") return "text-muted-foreground";
  if (status === "queued") return "text-muted-foreground";
  return "text-success";
}

function markSubagentCancelled(messages: Message[], spawnId: string): Message[] {
  const durationNow = Date.now();
  return messages.map((message) => {
    if (message.role !== "assistant" || !message.steps) return message;
    let changed = false;
    const steps = message.steps.map((step) => {
      if (step.type !== "subagent" || step.subagent?.spawnId !== spawnId) return step;
      changed = true;
      const startedAt = step.subagent.timestamp;
      return {
        ...step,
        status: "cancelled" as const,
        subagent: {
          ...step.subagent,
          status: "cancelled" as const,
          durationMs: step.subagent.durationMs ?? (typeof startedAt === "number" ? Math.max(0, durationNow - startedAt) : undefined),
        },
      };
    });
    return changed ? { ...message, steps } : message;
  });
}

function HistoryNotice({
  kind,
  onRetry,
}: {
  kind: "loading" | "reconciling" | "refreshing" | "error";
  onRetry?: () => void;
}) {
  const isError = kind === "error";
  const Icon = isError ? AlertCircle : Loader2;
  const label = kind === "loading"
    ? "Loading delegated work…"
    : kind === "reconciling"
      ? "Restoring delegated work…"
      : kind === "refreshing"
        ? "Refreshing saved execution history…"
        : "Couldn’t restore delegated work";

  return (
    <div className={`mx-2.5 mb-2 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[10px] ${isError ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-card text-muted-foreground"}`} role={isError ? "alert" : "status"} aria-live="polite">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${isError ? "" : "motion-safe:animate-spin motion-reduce:transition-none"}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">{label}</span>
      {isError && onRetry && <button type="button" onClick={onRetry} className="shrink-0 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">Retry</button>}
    </div>
  );
}

function SubagentStatusRow({
  subagent,
  stopping = false,
  onOpen,
  onStop,
}: {
  subagent: ScopedSubagentRecord;
  stopping?: boolean;
  onOpen: () => void;
  onStop?: () => void;
}) {
  const running = subagent.status === "running";
  const Icon = statusIcon(subagent.status);
  const tone = statusTone(subagent.status);
  const label = statusLabel(subagent.status);
  return (
    <div className="mx-2.5 mb-1.5 rounded-lg border border-border bg-card">
      <button type="button" onClick={onOpen} className="flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={`Open ${subagent.agentName} subagent details`}>
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone} ${subagent.status === "running" ? "motion-safe:animate-spin motion-reduce:transition-none" : ""}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{subagent.agentName}</span>
            <span className={`shrink-0 text-[10px] ${tone}`}>{label}</span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={subagent.task}>{subagent.task || "Delegated task"}</span>
        </span>
        <SubagentTimer startTime={subagent.timestamp} durationMs={subagent.durationMs} running={running} />
      </button>
      {onStop && (
        <div className="flex items-center justify-between border-t border-border px-2.5 py-1.5">
          <span className="text-[10px] text-muted-foreground">Local subagent</span>
          <button type="button" onClick={onStop} disabled={stopping} className="inline-flex h-6 items-center gap-1 rounded border border-destructive/40 px-2 text-[10px] font-medium text-destructive hover:bg-destructive/10 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={`Stop ${subagent.agentName} subagent`} title={`Stop ${subagent.agentName}`}>
            {stopping ? <Loader2 className="h-3 w-3 motion-safe:animate-spin motion-reduce:transition-none" aria-hidden="true" /> : <Square className="h-3 w-3 fill-current" aria-hidden="true" />}
            {stopping ? "Stopping…" : "Stop"}
          </button>
        </div>
      )}
    </div>
  );
}

export function RunStatusPopover({ messages, isStreaming }: { messages: Message[]; isStreaming: boolean }) {
  const activeChatId = useUIStore((state) => state.activeChatId);
  const openRunInspector = useUIStore((state) => state.openRunInspector);
  const openSubagentInPanel = useUIStore((state) => state.openSubagentInPanel);
  const setRightPanelOpen = useUIStore((state) => state.setRightPanelOpen);
  const setActiveRightTab = useUIStore((state) => state.setActiveRightTab);
  const setSessionMessages = useChatStore((state) => state.setSessionMessages);
  const queryClient = useQueryClient();
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const records = useMemo(() => collectSubagents(messages), [messages]);
  const activeSubagents = useMemo(() => records.filter((record) => ACTIVE_SUBAGENT_STATUSES.has(record.status)), [records]);
  const recentSubagents = useMemo(() => records.filter((record) => !ACTIVE_SUBAGENT_STATUSES.has(record.status)).slice(-RECENT_SUBAGENT_LIMIT).reverse(), [records]);
  const executionStatus = useMemo(() => deriveWorkspaceExecutionStatus(messages, isStreaming), [isStreaming, messages]);
  const changedFileCount = useMemo(() => collectChangedFileCount(messages), [messages]);
  const messageQueryKey = ["messages", activeChatId] as const;
  const cachedMessages = queryClient.getQueryData<Message[]>(messageQueryKey);
  const messageQueryState = queryClient.getQueryState<Message[]>(messageQueryKey);
  const messagesFetching = useIsFetching({ queryKey: messageQueryKey }) > 0;
  const isHistoryLoading = Boolean(activeChatId && messages.length === 0 && cachedMessages === undefined && (messagesFetching || messageQueryState?.status === "pending"));
  const isHistoryReconciling = Boolean(activeChatId && messages.length === 0 && Array.isArray(cachedMessages) && cachedMessages.length > 0);
  const isHistoryRefreshing = Boolean(activeChatId && messages.length > 0 && messagesFetching);
  const isHistoryError = Boolean(activeChatId && messages.length === 0 && cachedMessages === undefined && messageQueryState?.status === "error");

  const openApprovals = () => {
    setActiveRightTab("approvals");
    setRightPanelOpen(true);
  };
  const openAgents = () => {
    setActiveRightTab("agents");
    setRightPanelOpen(true);
  };
  const openInspector = () => {
    if (activeChatId) openRunInspector(activeChatId);
  };
  const retryHistory = () => {
    if (activeChatId) void queryClient.refetchQueries({ queryKey: messageQueryKey });
  };

  const handleStopSubagent = async (subagent: ScopedSubagentRecord) => {
    if (!activeChatId || stoppingId) return;
    setStoppingId(subagent.spawnId);
    try {
      const cancelled = await chatApi.cancelSubagent(activeChatId, subagent.spawnId);
      if (cancelled) {
        upsertScopedSubagent(activeChatId, { ...subagent, status: "cancelled" });
        setSessionMessages(activeChatId, (previous) => markSubagentCancelled(previous, subagent.spawnId));
      } else {
        toast.info("That subagent has already finished.");
      }
    } catch {
      toast.error("Could not stop the subagent.");
    } finally {
      setStoppingId(null);
    }
  };

  const statusAction = executionStatus.kind === "approval"
    ? openApprovals
    : executionStatus.kind === "error"
      ? openInspector
      : executionStatus.kind === "review" || activeSubagents.length > 0
        ? openAgents
        : openInspector;
  const statusActionLabel = executionStatus.kind === "approval"
    ? "Open approvals"
    : executionStatus.kind === "error"
      ? "Open inspector"
      : executionStatus.kind === "review" || activeSubagents.length > 0
        ? "Open agents"
        : "Open inspector";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="codex-focus h-7 w-7 shrink-0 rounded-md border border-transparent text-muted-foreground hover:border-[var(--codex-border)] hover:bg-[var(--codex-surface-muted)] hover:text-foreground data-[state=open]:border-[var(--codex-border)] data-[state=open]:bg-[var(--codex-surface-muted)] data-[state=open]:text-foreground" aria-label="Open run status" title="Run status">
          <Activity className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" side="bottom" sideOffset={8} style={{ marginRight: "var(--zen-right-panel-offset, 0px)" }} className="w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border-border bg-muted p-0 text-foreground shadow-2xl shadow-black/30">
        <div className="flex max-h-[min(74vh,36rem)] flex-col overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-2 text-[12px] font-semibold">
              <Activity className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>Run status</span>
              <span className="truncate text-[10px] font-normal text-muted-foreground">{executionStatus.label}</span>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={statusAction} className="h-6 shrink-0 gap-1 px-2 text-[10px] text-muted-foreground hover:bg-card hover:text-foreground" aria-label={statusActionLabel}>
              <ListTree className="h-3 w-3" aria-hidden="true" />
              {statusActionLabel}
            </Button>
          </div>

          {(isHistoryLoading || isHistoryReconciling || isHistoryRefreshing || isHistoryError) && (
            <div className="border-b border-border pb-1.5 pt-2.5">
              <HistoryNotice kind={isHistoryError ? "error" : isHistoryLoading ? "loading" : isHistoryReconciling ? "reconciling" : "refreshing"} onRetry={isHistoryError ? retryHistory : undefined} />
            </div>
          )}

          <section className="border-b border-border pb-1.5">
            <SectionHeader icon={CircleDashed} title="Parent run" action={<span className="text-[10px] text-muted-foreground">{executionStatus.detail}</span>} />
            <div className="mx-2.5 flex w-[calc(100%-1.25rem)] items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left" role="status" aria-label={`${executionStatus.label}. ${executionStatus.detail}. Use ${statusActionLabel} above for details.`}>
              {executionStatus.kind === "running" ? <Loader2 className="h-3.5 w-3.5 shrink-0 text-primary motion-safe:animate-spin motion-reduce:transition-none" aria-hidden="true" /> : executionStatus.kind === "approval" ? <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" /> : executionStatus.kind === "paused" ? <Pause className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" /> : executionStatus.kind === "review" ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" /> : executionStatus.kind === "error" ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" /> : executionStatus.kind === "completed" ? <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" /> : <CircleDashed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{executionStatus.detail}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{executionStatus.label}</span>
            </div>
          </section>

          {activeSubagents.length > 0 && (
            <section className="border-b border-border pb-1.5">
              <SectionHeader icon={Bot} title="Active subagents" action={<span className="text-[10px] text-muted-foreground">{activeSubagents.length}</span>} />
              {activeSubagents.map((subagent) => (
                <SubagentStatusRow key={subagent.spawnId} subagent={subagent} stopping={stoppingId === subagent.spawnId} onOpen={() => activeChatId && openSubagentInPanel(activeChatId, subagent.spawnId)} onStop={() => { void handleStopSubagent(subagent); }} />
              ))}
            </section>
          )}

          {recentSubagents.length > 0 && (
            <section className="border-b border-border pb-1.5">
              <SectionHeader icon={Bot} title="Recent subagents" action={<span className="text-[10px] text-muted-foreground">{recentSubagents.length}</span>} />
              {recentSubagents.map((subagent) => (
                <SubagentStatusRow key={subagent.spawnId} subagent={subagent} onOpen={() => activeChatId && openSubagentInPanel(activeChatId, subagent.spawnId)} />
              ))}
            </section>
          )}

          {executionStatus.pendingApprovalCount > 0 && (
            <section className="border-b border-border pb-1.5">
              <SectionHeader icon={ShieldAlert} title="Approvals" action={<span className="text-[10px] text-warning">{executionStatus.pendingApprovalCount} waiting</span>} />
              <button type="button" onClick={openApprovals} className="mx-2.5 flex w-[calc(100%-1.25rem)] items-center gap-2 rounded-lg border border-warning/40 bg-card px-2.5 py-2 text-left text-[11px] text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                Review pending tool actions
              </button>
            </section>
          )}

          {changedFileCount > 0 && (
            <section className="border-b border-border pb-1.5">
              <SectionHeader icon={FileDiff} title="Local changes" action={<span className="text-[10px] text-muted-foreground">{changedFileCount} files</span>} />
              <button type="button" onClick={openInspector} className="mx-2.5 flex w-[calc(100%-1.25rem)] items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left text-[11px] text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <FileDiff className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                Inspect run with local changes
              </button>
            </section>
          )}

          {!activeSubagents.length && !recentSubagents.length && !executionStatus.pendingApprovalCount && !changedFileCount && !isHistoryLoading && !isHistoryReconciling && !isHistoryError && (
            <div className="px-2.5 py-3 text-[11px] text-muted-foreground" role="status">No delegated work or pending local actions.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type { WorkspaceExecutionStatus };
