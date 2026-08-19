import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Check,
  ChevronRight,
  CircleAlert,
  ListTree,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useUIStore } from "@/lib/stores/useUIStore";
import { chatApi, type BackendExecutionTrace } from "@/api/chatApi";
import { projectNormalizedTraceToMessage } from "@/atlas/agentRuntime/executionTrace";
import { cn } from "@/lib/utils";
import type { Message } from "@/atlas/components/chat/types";
import {
  buildRunInspectorModel,
  filterInspectorNodes,
  type InspectorStatusFilter,
  type RunInspectorNode,
  MAX_INSPECTOR_RENDER_NODES,
} from "@/atlas/agentRuntime/runInspectorModel";

const EMPTY_MESSAGES: Message[] = [];

type InspectorView = "summary" | "timeline";

function formatDuration(ms?: number) {
  if (typeof ms !== "number" || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function phaseIcon(node: RunInspectorNode) {
  if (node.phase === "errored") return <CircleAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />;
  if (node.phase === "waiting_for_approval") return <ShieldCheck className="h-3.5 w-3.5 text-warning" aria-hidden="true" />;
  if (node.phase === "completed") return <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />;
  if (node.phase === "interrupted" || node.phase === "cancelled") return <X className="h-3.5 w-3.5 text-warning" aria-hidden="true" />;
  return <Activity className="h-3.5 w-3.5 text-primary" aria-hidden="true" />;
}

function NodeRow({ node, selected, onSelect }: { node: RunInspectorNode; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 items-start gap-2 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-muted",
      )}
      style={{ paddingInlineStart: `${12 + Math.min(node.depth, 6) * 16}px` }}
      aria-current={selected ? "true" : undefined}
      aria-label={`${node.summary}, ${node.statusLabel}`}
    >
      <span className="mt-0.5 shrink-0">{phaseIcon(node)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{node.summary}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{node.statusLabel}</span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
          <span className="truncate">{node.target || node.resultSummary || node.agentName || node.kind}</span>
          {node.durationMs !== undefined && <span className="shrink-0 tabular-nums">{formatDuration(node.durationMs)}</span>}
        </span>
      </span>
      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "success" | "warning" | "error" }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", tone === "success" && "text-success", tone === "warning" && "text-warning", tone === "error" && "text-destructive", tone === "neutral" && "text-foreground")}>{value}</div>
    </div>
  );
}

function selectLatestTrace(traces: BackendExecutionTrace[], messageId: string): BackendExecutionTrace | undefined {
  const candidates = traces.filter((trace) =>
    trace && trace.messageId === messageId &&
    Number.isFinite(Number(trace.traceVersion)) &&
    Number(trace.traceVersion) >= 2 &&
    Array.isArray(trace.nodes),
  );
  return candidates.sort((left, right) => {
    const versionDelta = Number(right.traceVersion) - Number(left.traceVersion);
    if (versionDelta !== 0) return versionDelta;
    const leftUpdated = Date.parse(typeof left.updatedAt === "string" ? left.updatedAt : "");
    const rightUpdated = Date.parse(typeof right.updatedAt === "string" ? right.updatedAt : "");
    return (Number.isFinite(rightUpdated) ? rightUpdated : 0) - (Number.isFinite(leftUpdated) ? leftUpdated : 0);
  })[0];
}

export function RunInspector() {
  const activeChatId = useUIStore((state) => state.activeChatId);
  const focusedRun = useUIStore((state) => state.focusedRun);
  const messages = useChatStore((state) => activeChatId ? state.sessionMessages[activeChatId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
  const [view, setView] = useState<InspectorView>("summary");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InspectorStatusFilter>("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const {
    data: normalizedTraces = [],
    isLoading: tracesLoading,
    isFetching: tracesFetching,
    isError: tracesError,
    refetch: refetchTraces,
  } = useQuery<BackendExecutionTrace[]>({
    queryKey: ["execution-traces", activeChatId],
    queryFn: () => activeChatId ? chatApi.listExecutionTraces(activeChatId) : Promise.resolve([]),
    enabled: Boolean(activeChatId),
    staleTime: 5_000,
  });

  const message = useMemo(() => {
    if (focusedRun?.chatId === activeChatId && focusedRun.messageId) {
      return messages.find((candidate) => candidate.id === focusedRun.messageId) || null;
    }
    return [...messages].reverse().find((candidate) => candidate.role === "assistant" && Boolean(candidate.steps?.length || candidate.toolCalls?.length)) || null;
  }, [activeChatId, focusedRun, messages]);
  const normalizedTrace = useMemo(() => {
    const messageId = focusedRun?.messageId || message?.id;
    if (!messageId) return undefined;
    return selectLatestTrace(normalizedTraces, messageId);
  }, [focusedRun?.messageId, message?.id, normalizedTraces]);
  const inspectorMessage = useMemo(() => {
    if (!normalizedTrace) return message;
    const hasLegacyExecution = Boolean(message?.steps?.length || message?.toolCalls?.length);
    const base = message || {
      id: normalizedTrace.messageId,
      sessionId: normalizedTrace.chatId,
      role: "assistant" as const,
      content: "",
      status: "sent" as const,
      createdAt: normalizedTrace.startedAt || Date.now(),
    };
    const projected = projectNormalizedTraceToMessage(base, normalizedTrace);
    // A malformed/empty normalized response must not erase a usable legacy
    // projection during a partial IPC or migration failure.
    if (!projected.steps?.length && hasLegacyExecution) return message;
    return projected;
  }, [message, normalizedTrace]);
  const model = useMemo(() => inspectorMessage ? buildRunInspectorModel(inspectorMessage) : null, [inspectorMessage]);
  const filteredNodes = useMemo(() => model ? filterInspectorNodes(model.nodes, query, filter) : [], [filter, model, query]);
  const renderedNodes = filteredNodes.slice(0, MAX_INSPECTOR_RENDER_NODES);

  useEffect(() => {
    setSelectedNodeId(focusedRun?.chatId === activeChatId ? focusedRun.nodeId || null : null);
    // A deep link is a new inspection context; do not carry filters from a
    // previous run into a different chat or message.
    setQuery("");
    setFilter("all");
  }, [activeChatId, focusedRun?.chatId, focusedRun?.messageId, focusedRun?.nodeId]);

  useEffect(() => {
    if (selectedNodeId && model && !model.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [model, selectedNodeId]);

  if (!model) {
    const loading = tracesLoading;
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background px-6 text-center" role={tracesError ? "alert" : "status"}>
        <ListTree className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-sm font-semibold text-foreground">{loading ? "Restoring execution trace…" : tracesError ? "Couldn’t load execution trace" : "No execution trace"}</h2>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{loading ? "Reading the saved run history." : tracesError ? "The local trace service did not respond. Your chat is unchanged." : "Run Inspector will show the active assistant execution timeline, agents, and tool results here."}</p>
        {tracesError && <button type="button" onClick={() => refetchTraces()} className="mt-3 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Retry trace load</button>}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" aria-label="Run Inspector">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary"><ListTree className="h-4 w-4" aria-hidden="true" /></div>
          <div className="flex min-w-0 flex-1 items-center gap-2"><h2 className="truncate text-sm font-semibold text-foreground">Run Inspector</h2><span className="shrink-0 text-[11px] text-muted-foreground">{model.statusLabel}</span></div>
        </div>
        <nav className="mt-3 flex gap-1" aria-label="Inspector views">
          {(["summary", "timeline"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setView(item)} className={cn("rounded-md px-2.5 py-1.5 text-[11px] font-medium capitalize transition-colors", view === item ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")} aria-current={view === item ? "page" : undefined}>{item}</button>
          ))}
        </nav>
      </header>

      {view === "timeline" && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <div className="relative min-w-[10rem] flex-1"><Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search trace" className="h-7 w-full rounded-md border border-border bg-card pl-7 pr-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label="Search execution trace" /></div>
          {(["all", "active", "attention", "completed"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item)} className={cn("h-7 shrink-0 rounded-md px-2 text-[11px] font-medium capitalize transition-colors", filter === item ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")} aria-pressed={filter === item}>{item}</button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "summary" && (
          <div className="space-y-3 p-3">
            <div className="grid grid-cols-2 gap-2"><Metric label="Duration" value={formatDuration(model.durationMs)} /><Metric label="Tools" value={model.toolCount} /><Metric label="Completed" value={model.completedToolCount} tone="success" /><Metric label="Failed" value={model.failedToolCount} tone={model.failedToolCount ? "error" : "neutral"} /><Metric label="Approvals" value={model.approvalCount} tone={model.approvalCount ? "warning" : "neutral"} /><Metric label="Files changed" value={model.filesChanged} /></div>
            <section className="rounded-md border border-border bg-card p-3"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Result</h3><p className="mt-2 text-[12px] leading-relaxed text-foreground">{model.resultSummary || "No summarized result available."}</p></section>
            {model.agents.length > 0 && <section className="rounded-md border border-border bg-card p-3"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agents</h3><div className="mt-2 flex flex-wrap gap-1.5">{model.agents.map((agent) => <span key={agent} className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] text-foreground">{agent}</span>)}</div></section>}
            <button type="button" onClick={() => setView("timeline")} className="flex w-full items-center justify-between rounded-md border border-border bg-muted px-3 py-2 text-[11px] font-medium text-foreground hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open chronological trace <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
            {tracesFetching && <p className="text-[10px] text-muted-foreground" role="status">Refreshing saved execution history…</p>}
            {tracesError && <button type="button" onClick={() => refetchTraces()} className="text-left text-[11px] font-medium text-warning underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Retry normalized trace load</button>}
          </div>
        )}
        {view === "timeline" && (
          <div role="list" aria-label="Execution timeline">
            {tracesFetching && <div className="border-b border-border bg-muted px-3 py-1.5 text-[10px] text-muted-foreground" role="status">Refreshing saved execution history…</div>}
            {tracesError && <div className="border-b border-warning bg-muted px-3 py-1.5 text-[10px] text-warning" role="status">Showing the local message projection; normalized history could not be refreshed.</div>}
            {filteredNodes.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No matching trace nodes.</p> : renderedNodes.map((node) => <NodeRow key={node.id} node={node} selected={selectedNodeId === node.id} onSelect={() => setSelectedNodeId(node.id)} />)}
            {filteredNodes.length > MAX_INSPECTOR_RENDER_NODES && <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">Showing the first {MAX_INSPECTOR_RENDER_NODES} matching nodes. Narrow the search to inspect the rest.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
