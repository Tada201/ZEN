import { CheckCircle2, CircleDot, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Step } from "./types";
import { buildTaskPlanPreviewModel, type NormalizedTaskPreview } from "./taskPlanPreviewModel";

type TaskPreviewStatus = "pending" | "running" | "completed" | "error" | "cancelled" | string;

function TaskStatusIcon({ status }: { status: TaskPreviewStatus }) {
  if (status === "running") return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-300" />;
  if (status === "completed") return <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-300" />;
  if (status === "error" || status === "failed") return <XCircle className="h-3 w-3 shrink-0 text-rose-400/80" />;
  return <CircleDot className="h-3 w-3 shrink-0 text-zinc-600" />;
}

export function AssistantTaskPlanPreview({ step }: { step: Step }) {
  const preview = buildTaskPlanPreviewModel(step);

  if (!preview.hasPreview) return null;

  return (
    <div className="mt-2 space-y-1.5 rounded-md bg-white/[0.012] px-2 py-2">
      {preview.tasks.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600">Planned tasks</div>
          <div className="grid gap-1 md:grid-cols-2">
            {preview.tasks.map((task: NormalizedTaskPreview) => {
              return (
                <div key={task.id} className="flex min-w-0 items-center gap-1.5 rounded bg-white/[0.014] px-1.5 py-1">
                  <TaskStatusIcon status={task.status} />
                  <span className="min-w-0 flex-1 truncate text-[11px] leading-4 text-zinc-500">
                    {task.label}
                  </span>
                  {task.assignee && <span className="shrink-0 truncate font-mono text-[10px] text-zinc-700">{task.assignee}</span>}
                </div>
              );
            })}
          </div>
          {preview.hiddenTaskCount > 0 && (
            <div className="text-[10px] text-zinc-700">{preview.hiddenTaskCount} more tasks hidden in details</div>
          )}
        </div>
      )}

      {preview.battlePlanSteps.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600">Battle plan</div>
          <div className="flex flex-col gap-0.5">
            {preview.battlePlanSteps.map((item, index) => (
              <div key={`${item}-${index}`} className="flex min-w-0 items-start gap-1.5 text-[11px] leading-5 text-zinc-500">
                <span className={cn("mt-2 h-1 w-1 shrink-0 rounded-full", index === 0 ? "bg-blue-300/80" : "bg-zinc-700")} />
                <span className="min-w-0 flex-1 truncate">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview.taskResult && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600">Task result</div>
          {preview.taskResult.text && (
            <div className="line-clamp-3 whitespace-pre-wrap rounded bg-white/[0.014] px-1.5 py-1 font-mono text-[11px] leading-5 text-zinc-500">
              {preview.taskResult.text}
            </div>
          )}
          {preview.taskResult.durationMs !== undefined && (
            <div className="text-[10px] text-zinc-700">{preview.taskResult.durationMs}ms</div>
          )}
        </div>
      )}
    </div>
  );
}
