import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, Check, ChevronRight, CircleAlert, Loader2 } from "lucide-react";
import { useChatStore } from "@/lib/stores/useChatStore";
import { useUIStore } from "@/lib/stores/useUIStore";
import { cn } from "@/lib/utils";
import type { Message, Step, SubagentStepData, ToolCall } from "@/atlas/components/chat/types";
import { AgentExecutionTrace } from "@/atlas/components/chat/AgentExecutionTrace";
import { MarkdownContent } from "@/atlas/components/chat/MarkdownContent";
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
};

const EMPTY_MESSAGES: Message[] = [];

function statusLabel(status: SubagentStepData["status"]) {
  if (status === "running") return "Working";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return "Completed";
}

function isFileTool(tool: ToolCall) {
  return /read|write|edit|patch|create|delete|file/i.test(tool.name);
}

function toSubagentFromLane(lane: AgentDelegationLaneModel): SubagentStepData {
  return {
    spawnId: lane.spawnId || `${lane.agentName}:${lane.task}`,
    agentId: lane.agentName,
    agentName: lane.agentName,
    task: lane.task,
    status: lane.status === "error" ? "failed" : lane.status,
    resultSummary: lane.resultSummary || undefined,
    durationMs: lane.durationMs,
  };
}

function buildSubagentItems(messages: Message[]): SubagentItem[] {
  const bySpawn = new Map<string, SubagentItem>();

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const steps = message.steps || [];
    const toolCalls = message.toolCalls || [];
    const reasoning = steps.filter((step) => step.type === "reasoning").map((step) => step.content || "").filter(Boolean).join("\n");

    for (const step of steps) {
      const subagent = step.type === "subagent" ? step.subagent : undefined;
      const lane = step.type === "action" ? buildAgentDelegationLaneModel(step) : undefined;
      if (!subagent && !lane) continue;
      const resolved = subagent || toSubagentFromLane(lane!);
      const id = resolved.spawnId;
      const childTools = toolCalls.filter((tool) => tool.traceId === id);
      const previous = bySpawn.get(id);
      bySpawn.set(id, {
        id,
        message,
        step: subagent ? step : { ...step, type: "subagent", subagent: resolved },
        subagent: resolved,
        childTools: childTools.length > 0 ? childTools : previous?.childTools || [],
        reasoning: reasoning || previous?.reasoning,
        response: resolved.resultSummary || lane?.liveContent || previous?.response || "",
        lane,
      });
    }
  }

  return [...bySpawn.values()];
}

function CompactSubagentRow({ item, selected, onSelect }: { item: SubagentItem; selected: boolean; onSelect: () => void }) {
  const running = item.subagent.status === "running";
  const failed = item.subagent.status === "failed";
  const Icon = running ? Loader2 : failed ? CircleAlert : Check;
  const fileCount = item.childTools.filter(isFileTool).length;
  const summary = item.response || item.subagent.task || "No summary yet";
  return (
    <button type="button" onClick={onSelect} className={cn("group flex w-full items-start gap-2 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected && "bg-muted/60")} aria-current={selected ? "true" : undefined}>
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", running && "animate-spin text-primary", failed && "text-destructive", !running && !failed && "text-success")} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{item.subagent.task || item.subagent.agentName}</span>
          <span className={cn("shrink-0 text-[11px]", running && "text-primary", failed && "text-destructive", !running && !failed && "text-success")}>{statusLabel(item.subagent.status)}</span>
        </span>
        <span className="mt-1 block truncate text-[12px] text-muted-foreground">{summary}</span>
        <span className="mt-1 block font-mono text-[10px] text-muted-foreground">{item.childTools.length} {item.childTools.length === 1 ? "step" : "steps"}{fileCount ? ` · ${fileCount} files flagged` : ""}</span>
      </span>
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}

function SubagentDetail({ item, onBack, onOpenArtifact }: { item: SubagentItem; onBack: () => void; onOpenArtifact: (artifact: NonNullable<Message["artifact"]>) => void }) {
  const { subagent } = item;
  const running = subagent.status === "running";
  const response = item.response || "";
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-4 py-3">
        <button type="button" onClick={onBack} className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to subagents"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" aria-hidden="true" /><h2 className="truncate text-[14px] font-semibold text-foreground">{subagent.agentName}</h2><span className={cn("text-[11px]", running ? "text-primary" : subagent.status === "failed" ? "text-destructive" : "text-success")}>{running ? "Working" : subagent.status === "completed" ? "Done" : statusLabel(subagent.status)}</span></div>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{subagent.task}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {item.reasoning && <div className="mb-3 rounded-md bg-muted/70 px-3 py-2 font-mono text-[12px] text-muted-foreground">Thought for {item.reasoning.trim().split(/\s+/).length} words</div>}
        {item.childTools.length > 0 && <AgentExecutionTrace toolCalls={item.childTools} executionSteps={item.message.steps || []} sessionId={item.message.sessionId} onOpenArtifact={onOpenArtifact} preferCompact />}
        {(subagent.error || response) && <div className="mt-4 border-t border-border pt-4">{subagent.error ? <p className="text-[13px] leading-6 text-destructive">{subagent.error}</p> : <MarkdownContent content={response} isStreaming={running} onOpenArtifact={onOpenArtifact} chatId={item.message.sessionId} />}</div>}
      </div>
    </div>
  );
}

export function OrchestratorPanel() {
  const activeChatId = useUIStore((state) => state.activeChatId);
  const messages = useChatStore((state) => activeChatId ? state.sessionMessages[activeChatId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
  const artifacts = useChatStore((state) => state.artifacts);
  const setActiveArtifact = useChatStore((state) => state.setActiveArtifact);
  const setArtifactPanelOpen = useUIStore((state) => state.setArtifactPanelOpen);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = useMemo(() => buildSubagentItems(messages), [messages]);
  const selected = items.find((item) => item.id === selectedId) || null;

  useEffect(() => { if (!selectedId || !items.some((item) => item.id === selectedId)) setSelectedId(null); }, [items, selectedId]);

  const handleOpenArtifact = (artifact: NonNullable<Message["artifact"]>) => {
    const known = artifacts.find((candidate) => candidate.id === artifact.id);
    setActiveArtifact(known?.id || artifact.id || null);
    setArtifactPanelOpen(true);
  };

  if (selected) return <SubagentDetail item={selected} onBack={() => setSelectedId(null)} onOpenArtifact={handleOpenArtifact} />;

  const running = items.filter((item) => item.subagent.status === "running");
  const ended = items.filter((item) => item.subagent.status !== "running");
  return <div className="flex h-full min-h-0 flex-col bg-background"><div className="min-h-0 flex-1 overflow-y-auto"><section aria-labelledby="running-subagents-heading"><h2 id="running-subagents-heading" className="px-4 pb-2 pt-4 text-[12px] font-medium text-muted-foreground">Running · {running.length}</h2>{running.length === 0 ? <p className="px-4 pb-6 text-[13px] text-muted-foreground">No running subagents</p> : running.map((item) => <CompactSubagentRow key={item.id} item={item} selected={false} onSelect={() => setSelectedId(item.id)} />)}</section><section aria-labelledby="ended-subagents-heading"><h2 id="ended-subagents-heading" className="px-4 pb-2 pt-3 text-[12px] font-medium text-muted-foreground">Ended · {ended.length}</h2>{ended.length === 0 ? <p className="px-4 pb-6 text-[13px] text-muted-foreground">No completed subagents</p> : ended.map((item) => <CompactSubagentRow key={item.id} item={item} selected={false} onSelect={() => setSelectedId(item.id)} />)}</section></div></div>;
}
