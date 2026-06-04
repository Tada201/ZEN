import { CheckCircle2, CircleDot, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ResearchTimeline({ steps }: { steps: Array<{ text: string; status: "pending" | "running" | "completed" | "error" }> }) {
  const completedCount = steps.filter((s) => s.status === "completed" || s.status === "error").length;
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="font-sans">
      <div className="flex items-start gap-2 text-zinc-500">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          {completedCount === steps.length ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin text-zinc-400" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold text-zinc-300">Execution history</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
            <span className="font-mono">{steps.length} planning steps</span>
            <span>{completedCount} completed</span>
          </span>
          <span className="mt-1.5 block h-px overflow-hidden rounded-full bg-white/[0.06]">
            <span className="block h-full bg-emerald-400/70 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </span>
        </span>
      </div>
      <div className="relative mt-1 flex flex-col gap-0.5 pl-4 before:absolute before:left-[5px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-zinc-800/80">
        {steps.map((step, idx) => (
          <div key={`${step.text}-${idx}`} className="relative">
            <span className="absolute -left-[15px] top-2.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-black">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  step.status === "running" ? "bg-blue-400" :
                  step.status === "error" ? "bg-rose-400" :
                  step.status === "completed" ? "bg-emerald-400" : "bg-zinc-500"
                )}
              />
            </span>
            <div className="flex min-h-8 min-w-0 items-center gap-2 rounded-md px-1 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-white/[0.018]">
              {step.status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin text-blue-300" />
              ) : step.status === "completed" ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
              ) : step.status === "error" ? (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400/80" />
              ) : (
                <CircleDot className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              )}
              <span className="truncate leading-5">{step.text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
