import { Bot, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentDelegationLaneModel } from "./agentDelegationLaneModel";

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return null;
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

export function AgentDelegationLane({ lane }: { lane: AgentDelegationLaneModel }) {
  const isRunning = lane.status === "running";
  const isError = lane.status === "error";
  const durationLabel = formatDuration(lane.durationMs);
  const StatusIcon = isRunning ? Loader2 : isError ? XCircle : CheckCircle2;

  return (
    <div className="font-sans">
      <div className="rounded-md border border-zinc-800/80 bg-white/[0.012] px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/[0.025] text-zinc-500">
            <Bot className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-300">
            Delegated to {lane.agentName}
          </span>
          <span className="shrink-0 rounded bg-white/[0.025] px-1.5 py-0.5 font-mono text-[10px] leading-none text-zinc-600">
            {lane.parentName} -&gt; {lane.agentName}
          </span>
          {lane.iteration !== undefined && (
            <span className="shrink-0 font-mono text-[10px] text-zinc-600">iter {lane.iteration}</span>
          )}
          {durationLabel && <span className="shrink-0 font-mono text-[10px] text-zinc-600">{durationLabel}</span>}
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 text-[11px]",
              isRunning && "text-blue-300/80",
              lane.status === "completed" && "text-emerald-300/80",
              isError && "text-rose-300/80",
              lane.status === "cancelled" && "text-zinc-500",
            )}
          >
            <StatusIcon className={cn("h-3.5 w-3.5", isRunning && "animate-spin")} />
            {lane.status}
          </span>
        </div>

        {lane.task && (
          <div className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
            {lane.task}
          </div>
        )}
        {lane.resultSummary && (
          <div className="mt-1.5 rounded bg-white/[0.018] px-2 py-1.5 text-[11px] leading-relaxed text-zinc-400">
            {lane.resultSummary}
          </div>
        )}
      </div>
    </div>
  );
}
