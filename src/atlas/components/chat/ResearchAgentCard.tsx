import { CheckCircle2, CircleDashed, Loader2, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentInfo, ResearchStep } from "./deepResearchTypes";

function StepStatusIcon({ status }: { status: ResearchStep["status"] }) {
    if (status === "completed") return <CheckCircle2 className="h-2.5 w-2.5 text-success mt-[2px] shrink-0" />;
    if (status === "running") return <Loader2 className="h-2.5 w-2.5 text-primary animate-spin mt-[2px] shrink-0" />;
    if (status === "error") return <XCircle className="h-2.5 w-2.5 text-destructive mt-[2px] shrink-0" />;
    return <CircleDashed className="h-2.5 w-2.5 text-muted-foreground mt-[2px] shrink-0" />;
}

function formatAgentDuration(seconds: number): string {
    return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

export function ResearchAgentCard({
    agent,
    isComplete,
}: {
    agent: AgentInfo;
    isComplete: boolean;
}) {
    const visibleSteps = agent.steps.filter(
        (s) => s.phase !== "agent_spawn" && s.phase !== "agent_complete" && s.phase !== "agent_error",
    );

    return (
        <div className="rounded-lg border border-primary/15 bg-gradient-to-b from-purple-500/5 to-transparent p-2.5 transition-all duration-200 hover:border-primary/25">
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15">
                        <Sparkles className="h-2.5 w-2.5 text-primary" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[11px] font-semibold text-primary leading-tight">{agent.name}</span>
                        {agent.subQuestion && (
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/20 truncate max-w-[200px]">
                                {agent.subQuestion.length > 50
                                    ? agent.subQuestion.slice(0, 48) + "..."
                                    : agent.subQuestion}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    {!agent.allDone && !isComplete && (
                        <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                    )}
                    {agent.allDone && agent.hasError && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-1.5 py-0.5 border border-rose-500/20">
                            <XCircle className="h-2.5 w-2.5 text-destructive" />
                            {agent.durationSecs !== undefined && (
                                <span className="text-[10px] font-mono text-destructive">
                                    {formatAgentDuration(agent.durationSecs)}
                                </span>
                            )}
                        </span>
                    )}
                    {agent.allDone && !agent.hasError && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 border border-emerald-500/20">
                            <CheckCircle2 className="h-2.5 w-2.5 text-success" />
                            {agent.durationSecs !== undefined && (
                                <span className="text-[10px] font-mono text-success">
                                    {formatAgentDuration(agent.durationSecs)}
                                </span>
                            )}
                        </span>
                    )}
                    {agent.total > 0 && !agent.allDone && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                            {agent.completed}/{agent.total}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-0.5">
                {visibleSteps.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 py-0.5 px-1 rounded">
                        <StepStatusIcon status={step.status} />
                        <span
                            className={cn(
                                "text-[11px] leading-relaxed truncate",
                                step.status === "completed"
                                    ? "text-foreground"
                                    : step.status === "running"
                                        ? "text-purple-200 font-medium"
                                        : step.status === "error"
                                            ? "text-destructive"
                                            : "text-muted-foreground",
                            )}
                            title={step.text || ""}
                        >
                            {(step.text || "").length > 50
                                ? (step.text || "").slice(0, 47) + "..."
                                : (step.text || "")}
                        </span>
                    </div>
                ))}
                {visibleSteps.length === 0 && (
                    <div className="text-[11px] text-muted-foreground italic px-1">
                        {agent.allDone && agent.hasError
                            ? "No results — all fetches failed"
                            : agent.allDone
                                ? "No results"
                                : "Searching..."}
                    </div>
                )}
            </div>

            {agent.total > 0 && !agent.allDone && !isComplete && (
                <div className="mt-1.5 h-0.5 bg-background/30 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out rounded-full"
                        style={{ width: `${(agent.completed / agent.total) * 100}%` }}
                    />
                </div>
            )}
        </div>
    );
}
