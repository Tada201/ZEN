import { useEffect, useMemo, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Check, ChevronRight, CircleAlert, Loader2, Square, Trash2 } from "lucide-react";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useUIStore } from "@/lib/stores/useUIStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { chatApi } from "@/api";
import type { Message, Step, SubagentStepData, ToolCall } from "@/atlas/components/chat/types";
import { selectDelegationChildTools, buildDelegationTree } from "@/atlas/agentRuntime/delegationTree";
import { agentIconName, latestChildActivity } from "@/atlas/agentRuntime/agentIcon";
import { upsertScopedSubagent } from "@/atlas/agentRuntime/scopedSubagentStore";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";
import { UserMessage } from "@/atlas/components/chat/UserMessage";
import { AssistantMessage } from "@/atlas/components/chat/AssistantMessage";
import { buildAgentDelegationLaneModel, type AgentDelegationLaneModel } from "@/atlas/components/chat/agentDelegationLaneModel";

type SubagentItem = {
  id: string;
  message: Message;
  step: Step;
  subagent: SubagentStepData;
  childTools: ToolCall[];
  reasoning?: string;
  response?: string;
  lane?: AgentDelegationLaneModel;
  children?: SubagentItem[];
};

const EMPTY_MESSAGES: Message[] = [];

function statusLabel(status: SubagentStepData["status"], stale = false) {
  if (stale) return "Interrupted";
  if (status === "running") return "Working";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "incomplete" || status === "uncertain") return "Needs review";
  return "Completed";
}

function formatElapsed(durationMs: number) {
  const totalSeconds = Math.floor(Math.max(0, durationMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/**
 * Keep the wall-clock tick local to the small text node that needs it. This
 * avoids re-rendering every subagent row and the full panel once per second.
 */
function ElapsedSubagentTime({ startTime, durationMs, running }: { startTime?: number; durationMs?: number; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || typeof startTime !== "number") return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [running, startTime]);

  const elapsedMs = running && typeof startTime === "number"
    ? Math.max(0, now - startTime)
    : durationMs;
  if (typeof elapsedMs !== "number" || elapsedMs < 0) return null;

  const label = formatElapsed(elapsedMs);
  return <span className="shrink-0 font-mono tabular-nums text-[10px] text-muted-foreground" aria-label={`Elapsed ${label}`}>{label}</span>;
}

function isFileTool(tool: ToolCall) {
  return /read|write|edit|patch|create|delete|file/i.test(tool.name);
}

function isSubagentRunning(subagent: SubagentStepData) {
  return subagent.status === "running" && subagent.recoveryState !== "stale";
}

function toSubagentFromLane(lane: AgentDelegationLaneModel, timestamp?: number): SubagentStepData {
  return {
    spawnId: lane.spawnId || `${lane.agentName}:${lane.task}`,
    agentId: lane.agentName,
    agentName: lane.agentName,
    task: lane.task,
    status: lane.status === "error" ? "failed" : lane.status,
    resultSummary: lane.resultSummary || undefined,
    durationMs: lane.durationMs,
    timestamp,
  };
}

function buildSubagentItems(messages: Message[]): SubagentItem[] {
  const bySpawn = new Map<string, SubagentItem>();
  const parentBySpawn = new Map<string, string>();
  const canonicalSpawnIds = new Set<string>();

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const steps = message.steps || [];
    const toolCalls = message.toolCalls || [];
    const tree = buildDelegationTree(steps, toolCalls);
    tree.nodes.forEach((_, spawnId) => canonicalSpawnIds.add(spawnId));

    tree.nodes.forEach((node, spawnId) => {
      if (node.parentSpawnId) parentBySpawn.set(spawnId, node.parentSpawnId);
    });

    const addItem = (
      resolved: SubagentStepData,
      step: Step,
      childTools: ToolCall[],
      lane?: AgentDelegationLaneModel,
    ) => {
      const id = resolved.spawnId;
      const previous = bySpawn.get(id);
      bySpawn.set(id, {
        id,
        message,
        step,
        subagent: resolved,
        childTools: childTools.length > 0 ? childTools : previous?.childTools || [],
        response: resolved.resultSummary || lane?.liveContent || previous?.response || "",
        lane,
      });
    };

    // Subagent lifecycle steps are the canonical panel records. Using the
    // delegation tree here preserves explicit child-tool ownership and keeps
    // nested agents out of the flat root list.
    tree.steps.forEach((step, spawnId) => {
      const node = tree.nodes.get(spawnId);
      if (!node || !step.subagent) return;
      const nestedSpawnToolIds = new Set(
        node.childAgentIds
          .map((childId) => tree.nodes.get(childId)?.parentToolCallId)
          .filter((id): id is string => Boolean(id)),
      );
      const childTools = selectDelegationChildTools(node, toolCalls)
        .filter((tool) => !nestedSpawnToolIds.has(tool.id));
      addItem(step.subagent, step, childTools);
    });

    // Keep legacy action lanes readable when a persisted trace predates the
    // dedicated subagent-step record, but never render them beside a canonical
    // record for the same spawn.
    for (const step of steps) {
      if (step.type !== "action") continue;
      const lane = buildAgentDelegationLaneModel(step);
      if (!lane || (lane.spawnId && canonicalSpawnIds.has(lane.spawnId))) continue;
      const resolved = toSubagentFromLane(lane, step.timestamp);
      const childTools = toolCalls.filter((tool) => tool.traceId === resolved.spawnId);
      addItem(resolved, { ...step, type: "subagent", subagent: resolved }, childTools, lane);
    }
  }

  const items = [...bySpawn.values()];
  items.forEach((item) => {
    item.children = items.filter((child) => parentBySpawn.get(child.id) === item.id);
  });
  return items.filter((item) => !parentBySpawn.has(item.id));
}

function flattenSubagentItems(items: SubagentItem[]): SubagentItem[] {
  return items.flatMap((item) => [item, ...flattenSubagentItems(item.children || [])]);
}

/** Optimistically flip a subagent step to cancelled after the backend stop. */
function markSubagentStepCancelled(messages: Message[], spawnId: string): Message[] {
  const now = Date.now();
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
          durationMs: step.subagent.durationMs ?? (typeof startedAt === "number" ? Math.max(0, now - startedAt) : undefined),
        },
      };
    });
    return changed ? { ...message, steps } : message;
  });
}

function subagentRecordTime(item: SubagentItem): number {
  return item.subagent.timestamp ?? item.message.createdAt ?? 0;
}

function filterSubagentItems(items: SubagentItem[], clearedAt?: number): SubagentItem[] {
  return items.flatMap((item) => {
    const children = filterSubagentItems(item.children || [], clearedAt);
    const keepItem = !clearedAt
      || isSubagentRunning(item.subagent)
      || subagentRecordTime(item) > clearedAt;
    if (!keepItem && children.length === 0) return [];
    return [{ ...item, children }];
  });
}

function CompactSubagentRow({ item, selected, onSelect, onStop, stopping }: { item: SubagentItem; selected: boolean; onSelect: () => void; onStop?: () => void; stopping?: boolean }) {
  const stale = item.subagent.recoveryState === "stale";
  const running = isSubagentRunning(item.subagent);
  const failed = item.subagent.status === "failed";
  const needsReview = item.subagent.status === "incomplete" || item.subagent.status === "uncertain";
  const StatusIcon = running ? Loader2 : failed || needsReview || stale ? CircleAlert : Check;
  const fileCount = item.childTools.filter(isFileTool).length;
  const hasElapsed = typeof item.subagent.timestamp === "number" || typeof item.subagent.durationMs === "number";
  const title = item.subagent.task || item.subagent.agentName;
  // While running, show the child's live action ("Searching · news"); once
  // ended fall back to the result summary. Never repeat the title verbatim.
  const liveActivity = running ? latestChildActivity(item.childTools) : "";
  const endedSummary = item.response && item.response !== title ? item.response : "";
  const summary = liveActivity || endedSummary;
  return (
    <div className={cn("group flex w-full items-start gap-2 border-b border-border px-4 py-3 transition-colors hover:bg-muted", selected && "bg-muted")}>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-current={selected ? "true" : undefined}>
        <span className="relative mt-0.5 shrink-0">
          <WorkbenchIcon name={agentIconName(item.subagent.agentId, item.subagent.agentName)} size={16} className="text-muted-foreground" />
          <StatusIcon className={cn("absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-background", running && "animate-spin text-primary", failed && "text-destructive", (needsReview || stale) && "text-warning", !running && !failed && !needsReview && !stale && "text-success")} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{title}</span>
            <span className={cn("shrink-0 text-[11px]", running && "text-primary", failed && "text-destructive", (needsReview || stale) && "text-warning", !running && !failed && !needsReview && !stale && "text-success")}>{statusLabel(item.subagent.status, stale)}</span>
          </span>
          {summary && <span className="mt-1 block truncate text-[12px] text-muted-foreground">{summary}</span>}
          <span className="mt-1 flex items-center gap-1 font-mono text-[10px] text-muted-foreground"><span>{item.childTools.length} {item.childTools.length === 1 ? "step" : "steps"}{fileCount ? ` · ${fileCount} files flagged` : ""}</span>{hasElapsed && <><span aria-hidden="true">·</span><ElapsedSubagentTime startTime={item.subagent.timestamp} durationMs={item.subagent.durationMs} running={running} /></>}
</span>
        </span>
      </button>
      {running && onStop
        ? (
          <button type="button" onClick={onStop} disabled={stopping} className="mt-0.5 inline-flex h-6 shrink-0 items-center gap-1 rounded border border-destructive/40 px-1.5 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={`Stop ${item.subagent.agentName}`} title={`Stop ${item.subagent.agentName}`}>
            {stopping ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Square className="h-3 w-3 fill-current" aria-hidden="true" />}
          </button>
        )
        : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
    </div>
  );
}

/**
 * Reconstruct a subagent's run as a normal chat exchange so the panel reuses
 * the exact main-timeline renderers (UserMessage + AssistantMessage) instead of
 * a bespoke trace view. The prompt sent to the child becomes the user turn; its
 * owned tool calls + final summary become one assistant turn.
 *
 * generativeUI is forced to 0: subagent output must never render premium/GenUI
 * cards, per the product rule that only the main agent surfaces those.
 */
function buildSubagentConversation(item: SubagentItem): { prompt: Message; reply: Message } {
  const { subagent } = item;
  const running = isSubagentRunning(subagent);
  const orderedTools = [...item.childTools].sort(
    (a, b) => (a.sequence ?? a.startTime ?? 0) - (b.sequence ?? b.startTime ?? 0),
  );
  // Interleave the child's between-tool commentary with its tool cards using
  // the backend event sequence. A text segment tagged sequence N sorts just
  // before the tool at sequence N, reproducing the child's real execution
  // order (think → call → think → call) instead of a flat tool list.
  type Ordered = { sequence: number; kind: "tool" | "text"; tool?: ToolCall; text?: string };
  const ordered: Ordered[] = [
    ...orderedTools.map((tool, i) => ({
      sequence: tool.sequence ?? tool.startTime ?? i,
      kind: "tool" as const,
      tool,
    })),
    ...(subagent.intermediateContent || []).map((segment) => ({
      sequence: segment.sequence,
      kind: "text" as const,
      text: segment.text,
    })),
  ].sort((a, b) => a.sequence - b.sequence || (a.kind === "text" ? -1 : 1));

  const midSteps: Step[] = ordered.map((entry) =>
    entry.kind === "tool"
      ? {
          type: "tool-call",
          toolCall: entry.tool!,
          status: entry.tool!.status === "error" ? "error" : entry.tool!.status === "running" ? "running" : "completed",
          timestamp: entry.tool!.startTime,
        }
      : { type: "text", content: entry.text! },
  );
  // Prefer the child's full final answer; fall back to the short summary the
  // list row already shows so a reply always renders when the child finished.
  const finalText = subagent.resultContent?.trim() || item.response?.trim() || "";
  // Only append the final answer when it adds something the interleaved
  // commentary didn't already show. The backend now sends just the terminal
  // turn as resultContent, which usually equals the last commentary segment;
  // treat containment (either direction) as a duplicate so it isn't repeated.
  const lastText = [...midSteps].reverse().find((s) => s.type === "text")?.content?.trim() || "";
  const duplicatesLast = Boolean(finalText) && Boolean(lastText)
    && (lastText.includes(finalText) || finalText.includes(lastText));
  const steps: Step[] = finalText && !duplicatesLast
    ? [...midSteps, { type: "text", content: finalText }]
    : midSteps;

  const prompt: Message = {
    id: `${item.id}:prompt`,
    sessionId: item.message.sessionId,
    role: "user",
    content: subagent.task || subagent.agentName,
    createdAt: subagent.timestamp,
  };
  const reply: Message = {
    id: `${item.id}:reply`,
    sessionId: item.message.sessionId,
    role: "assistant",
    content: finalText,
    steps,
    toolCalls: orderedTools,
    model: subagent.agentName,
    createdAt: subagent.timestamp,
    generativeUI: 0,
    status: running ? "sending" : subagent.status === "failed" ? "failed" : subagent.status === "cancelled" ? "cancelled" : "sent",
    error: subagent.error,
    recoveryState: subagent.recoveryState === "stale" ? "recovered" : undefined,
  };
  return { prompt, reply };
}

function SubagentDetail({ item, onBack, onSelectSubagent, onOpenArtifact }: { item: SubagentItem; onBack: () => void; onSelectSubagent: (id: string) => void; onOpenArtifact: (artifact: NonNullable<Message["artifact"]>) => void }) {
  const { subagent } = item;
  const stale = subagent.recoveryState === "stale";
  const running = isSubagentRunning(subagent);
  const needsReview = subagent.status === "incomplete" || subagent.status === "uncertain";
  const hasElapsed = typeof subagent.timestamp === "number" || typeof subagent.durationMs === "number";
  const { prompt, reply } = buildSubagentConversation(item);
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-4 py-3">
        <button type="button" onClick={onBack} className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to subagents"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><WorkbenchIcon name={agentIconName(subagent.agentId, subagent.agentName)} size={16} className="text-primary" /><h2 className="truncate text-[14px] font-semibold text-foreground">{subagent.agentName}</h2><span className={cn("text-[11px]", running ? "text-primary" : subagent.status === "failed" ? "text-destructive" : needsReview || stale ? "text-warning" : "text-success")}>{running ? "Working" : subagent.status === "completed" ? "Done" : statusLabel(subagent.status, stale)}</span>
{hasElapsed && <><span aria-hidden="true" className="text-muted-foreground">·</span><ElapsedSubagentTime startTime={subagent.timestamp} durationMs={subagent.durationMs} running={running} /></>}
</div>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{subagent.task}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {item.children && item.children.length > 0 && (
          <section aria-labelledby="nested-subagents-heading" className="mb-3 px-4">
            <h3 id="nested-subagents-heading" className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Nested subagents</h3>
            <div className="overflow-hidden rounded-md border border-border bg-card">
              {item.children.map((child) => (
                <CompactSubagentRow key={child.id} item={child} selected={false} onSelect={() => onSelectSubagent(child.id)} />
              ))}
            </div>
          </section>
        )}
        <UserMessage message={prompt} compact />
        <AssistantMessage message={reply} compact onOpenArtifact={onOpenArtifact} />
      </div>
    </div>
  );
}

export function OrchestratorPanel() {
  const activeChatId = useUIStore((state) => state.activeChatId);
  const queryClient = useQueryClient();
  const focusedSubagent = useUIStore((state) => state.focusedSubagent);
  const clearFocusedSubagent = useUIStore((state) => state.clearFocusedSubagent);
  const clearSubagentHistory = useUIStore((state) => state.clearSubagentHistory);
  const subagentHistoryClearedAtByChat = useUIStore((state) => state.subagentHistoryClearedAtByChat);
  const messages = useChatStore((state) => activeChatId ? state.sessionMessages[activeChatId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
  const setSessionMessages = useChatStore((state) => state.setSessionMessages);
  const artifacts = useChatStore((state) => state.artifacts);
  const setActiveArtifact = useChatStore((state) => state.setActiveArtifact);
  const setArtifactPanelOpen = useUIStore((state) => state.setArtifactPanelOpen);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const clearedAt = activeChatId ? subagentHistoryClearedAtByChat[activeChatId] : undefined;
  const allSubagentItems = useMemo(() => buildSubagentItems(messages), [messages]);
  const allItemsBeforeClear = useMemo(() => flattenSubagentItems(allSubagentItems), [allSubagentItems]);
  const items = useMemo(() => filterSubagentItems(allSubagentItems, clearedAt), [allSubagentItems, clearedAt]);
  const allItems = useMemo(() => flattenSubagentItems(items), [items]);
  const visibleSubagentIds = useMemo(() => new Set(allItems.map((item) => item.id)), [allItems]);
  const hiddenEndedCount = allItemsBeforeClear.filter((item) =>
    !isSubagentRunning(item.subagent) && !visibleSubagentIds.has(item.id),
  ).length;
  const messageQueryKey = ["messages", activeChatId] as const;
  const cachedMessages = queryClient.getQueryData<Message[]>(messageQueryKey);
  const messageQueryState = queryClient.getQueryState<Message[]>(messageQueryKey);
  const messagesFetching = useIsFetching({ queryKey: messageQueryKey }) > 0;
  const isHistoryLoading = Boolean(activeChatId && messages.length === 0 && cachedMessages === undefined && (messagesFetching || messageQueryState?.status === "pending"));
  const isHistoryError = Boolean(activeChatId && messages.length === 0 && cachedMessages === undefined && messageQueryState?.status === "error");
  const isHistoryReconciling = Boolean(activeChatId && messages.length === 0 && Array.isArray(cachedMessages) && cachedMessages.length > 0);
  const isHistoryRefreshing = Boolean(activeChatId && messages.length > 0 && messagesFetching);
  const recoveredCount = allItems.filter((item) => item.subagent.recoveryState === "stale").length;
  const selected = allItems.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    setSelectedId(null);
    clearFocusedSubagent();
  }, [activeChatId, clearFocusedSubagent]);

  useEffect(() => {
    if (focusedSubagent?.chatId === activeChatId) {
      setSelectedId(focusedSubagent.spawnId);
      return;
    }
    if (!selectedId || !allItems.some((item) => item.id === selectedId)) setSelectedId(null);
  }, [activeChatId, allItems, focusedSubagent, selectedId]);

  const handleOpenArtifact = (artifact: NonNullable<Message["artifact"]>) => {
    const known = artifacts.find((candidate) => candidate.id === artifact.id);
    setActiveArtifact(known?.id || artifact.id || null);
    setArtifactPanelOpen(true);
  };

  const handleStopSubagent = async (item: SubagentItem) => {
    if (!activeChatId || stoppingId) return;
    const spawnId = item.subagent.spawnId;
    setStoppingId(spawnId);
    try {
      const cancelled = await chatApi.cancelSubagent(activeChatId, spawnId);
      if (cancelled) {
        upsertScopedSubagent(activeChatId, { ...item.subagent, status: "cancelled", childToolCallIds: item.subagent.childToolCallIds || [] });
        setSessionMessages(activeChatId, (previous) => markSubagentStepCancelled(previous, spawnId));
      } else {
        toast.info("That subagent has already finished.");
      }
    } catch {
      toast.error("Could not stop the subagent.");
    } finally {
      setStoppingId(null);
    }
  };

  if (selected) return <SubagentDetail item={selected} onBack={() => { setSelectedId(null); clearFocusedSubagent(); }} onSelectSubagent={setSelectedId} onOpenArtifact={handleOpenArtifact} />;

  if (isHistoryLoading || isHistoryReconciling) {
    const label = isHistoryReconciling ? "Restoring delegated work…" : "Loading delegated work…";
    const detail = isHistoryReconciling
      ? "Reconciling the saved chat trace before showing the Agents panel."
      : "Checking this chat's saved execution history.";
    return <div className="flex h-full min-h-0 flex-col bg-background"><div className="flex flex-1 flex-col items-center justify-center px-6 text-center" role="status" aria-live="polite"><Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" /><p className="mt-3 text-[13px] font-medium text-foreground">{label}</p><p className="mt-1 max-w-[260px] text-[12px] leading-5 text-muted-foreground">{detail}</p></div></div>;
  }

  if (isHistoryError) {
    return <div className="flex h-full min-h-0 flex-col bg-background"><div className="flex flex-1 flex-col items-center justify-center px-6 text-center" role="alert"><CircleAlert className="h-5 w-5 text-destructive" aria-hidden="true" /><p className="mt-3 text-[13px] font-medium text-foreground">Couldn’t restore delegated work</p><p className="mt-1 max-w-[260px] text-[12px] leading-5 text-muted-foreground">The saved chat history could not be loaded, so the panel will not claim this chat has no subagents.</p><button type="button" onClick={() => { void queryClient.refetchQueries({ queryKey: messageQueryKey }); }} className="mt-4 rounded border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Try again</button></div></div>;
  }

  const running = items.filter((item) => isSubagentRunning(item.subagent));
  const ended = items.filter((item) => !isSubagentRunning(item.subagent));
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <h2 className="truncate text-[13px] font-semibold text-foreground">Agents</h2>
          {allItems.length > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">{allItems.length}</span>}
        </div>
        {ended.length > 0 && activeChatId && (
          <button
            type="button"
            onClick={() => clearSubagentHistory(activeChatId)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Clear past subagent history"
            title="Clear past subagent history"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Clear history
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isHistoryRefreshing && <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2 text-[11px] text-muted-foreground" role="status" aria-live="polite"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />Refreshing saved execution history…</div>}
        {recoveredCount > 0 && <div className="border-b border-warning bg-muted px-4 py-2 text-[11px] leading-5 text-foreground" role="status"><span className="font-medium text-warning">Reload reconciliation:</span>{" "}{recoveredCount} subagent {recoveredCount === 1 ? "run was" : "runs were"} interrupted before reload. The saved trace remains available for review.</div>}
        {running.length > 0 && <section aria-labelledby="running-subagents-heading"><h2 id="running-subagents-heading" className="px-4 pb-2 pt-4 text-[12px] font-medium text-muted-foreground">Running · {running.length}</h2>{running.map((item) => <CompactSubagentRow key={item.id} item={item} selected={false} onSelect={() => setSelectedId(item.id)} onStop={() => { void handleStopSubagent(item); }} stopping={stoppingId === item.subagent.spawnId} />)}</section>}
        {ended.length > 0 && <section aria-labelledby="ended-subagents-heading"><h2 id="ended-subagents-heading" className="px-4 pb-2 pt-3 text-[12px] font-medium text-muted-foreground">Ended · {ended.length}</h2>{ended.map((item) => <CompactSubagentRow key={item.id} item={item} selected={false} onSelect={() => setSelectedId(item.id)} />)}</section>}
        {items.length === 0 && <div className="border-t border-border px-4 py-6 text-center"><Bot className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" /><p className="mt-2 text-[13px] text-foreground">{hiddenEndedCount > 0 ? "Past delegated work cleared" : "No delegated work in this chat"}</p><p className="mt-1 text-[12px] leading-5 text-muted-foreground">{hiddenEndedCount > 0 ? "New subagent runs will appear here." : "Subagents will appear here when Zen delegates a task."}</p></div>}
      </div>
    </div>
  );
}
