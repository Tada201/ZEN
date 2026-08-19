import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, ChevronDown, CheckCircle2, CircleDashed, Globe, Loader2, Search, XCircle } from "lucide-react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "./MarkdownContent";
import { ResearchMatrix } from "./ResearchMatrix";
import { ResearchAgentCard } from "./ResearchAgentCard";
import type { AgentInfo, DeepResearchRunMessageProps, ResearchStep } from "./deepResearchTypes";
import type { Message } from "./types";

function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function ProcessStepItem({ step }: { step: ResearchStep }) {
    const status = step.status;
    return (
        <div className="flex min-w-0 items-start gap-2 text-[11px] py-1.5 px-2 rounded-md bg-muted hover:bg-muted transition-colors">
            {status === "completed" && <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />}
            {status === "running" && <Loader2 className="h-3.5 w-3.5 text-primary motion-safe:animate-spin motion-reduce:transition-none mt-0.5 shrink-0" />}
            {status === "error" && <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />}
            {status === "pending" && <CircleDashed className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
            <span
                className={cn(
                    "min-w-0 line-clamp-2 text-foreground leading-relaxed",
                    status === "running" && "text-primary font-medium",
                    status === "completed" && "text-foreground",
                    status === "error" && "text-destructive",
                )}
            >
                {step.text}
            </span>
        </div>
    );
}

function StaleRetryButton({
    message,
    messages,
    onContinueResearch,
}: {
    message: Message;
    messages?: Message[];
    onContinueResearch: (request: string) => void;
}) {
    const handleRetry = useCallback(() => {
        if (!messages) return;
        const msgIdx = messages.findIndex((m) => m.id === message.id);
        if (msgIdx === -1) return;
        for (let i = msgIdx - 1; i >= 0; i--) {
            if (messages[i].role === "user") {
                onContinueResearch(messages[i].content);
                return;
            }
        }
    }, [messages, message.id, onContinueResearch]);

    return (
        <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive bg-card px-3 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
            <XCircle className="h-3 w-3" />
            Retry research
        </button>
    );
}

export function DeepResearchRunMessage({
    message,
    compact,
    isChatStreaming,
    messages,
    onContinueResearch,
}: DeepResearchRunMessageProps) {
    const steps: ResearchStep[] = useMemo(() => {
        if (message.metadata?.researchSteps && Array.isArray(message.metadata.researchSteps)) {
            return message.metadata.researchSteps as ResearchStep[];
        }
        return [];
    }, [message.metadata]);

    const isFailed = message.status === "failed";
    const isStaleSending = message.status === "sending" && isChatStreaming === false;
    const isComplete = message.status === "sent" || message.metadata?.status === "completed" || isFailed || isStaleSending;
    const isStaleEmpty = (isFailed || isStaleSending) && !message.content && steps.length === 0;

    const [elapsed, setElapsed] = useState<number>(0);
    useEffect(() => {
        if (isComplete) return;
        const startTime = message.createdAt || Date.now();
        const interval = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
        return () => clearInterval(interval);
    }, [isComplete, message.createdAt]);

    const { processSteps, agentMap } = useMemo(() => {
        const proc: ResearchStep[] = [];
        const agentsMap = new Map<number, ResearchStep[]>();
        steps.forEach((step) => {
            if (step.agentIndex !== undefined && step.agentIndex >= 0) {
                const list = agentsMap.get(step.agentIndex) || [];
                list.push(step);
                agentsMap.set(step.agentIndex, list);
            } else {
                proc.push(step);
            }
        });
        return { processSteps: proc, agentMap: agentsMap };
    }, [steps]);

    const agents: AgentInfo[] = useMemo(() => {
        const result: AgentInfo[] = [];
        const sortedIndices = [...agentMap.keys()].sort();
        for (const idx of sortedIndices) {
            const agentSteps = agentMap.get(idx)!;
            const firstSpawn = agentSteps.find((s) => s.phase === "agent_spawn");
            const name = firstSpawn?.agentName || `Agent ${idx + 1}`;
            const subQuestion = firstSpawn?.subQuestion ||
                firstSpawn?.text?.replace(`${name}: `, "").replace(`${name}:`, "") || "";
            let completed = 0;
            let activeText = "";
            let durationSecs: number | undefined;
            agentSteps.forEach((s) => {
                if (s.status === "completed") completed++;
                else if (s.status === "running") activeText = s.text;
                if ((s.phase === "agent_complete" || s.phase === "agent_error") && s.durationSecs !== undefined) {
                    durationSecs = s.durationSecs;
                }
            });
            const hasCompleteStep = agentSteps.some((s) => s.phase === "agent_complete");
            const hasErrorStep = agentSteps.some((s) => s.phase === "agent_error");
            const allStepsResolved = agentSteps.every(
                (s) =>
                    s.status === "completed" ||
                    s.status === "error" ||
                    s.phase === "agent_spawn" ||
                    s.phase === "agent_complete" ||
                    s.phase === "agent_error",
            );
            const allDone = hasCompleteStep || hasErrorStep || (agentSteps.length > 1 && allStepsResolved);
            result.push({
                index: idx,
                name,
                subQuestion,
                steps: agentSteps,
                completed,
                total: agentSteps.filter((s) => s.phase !== "agent_spawn" && s.phase !== "agent_complete" && s.phase !== "agent_error").length,
                activeText,
                allDone,
                durationSecs,
                hasError: hasErrorStep,
            });
        }
        return result;
    }, [agentMap]);

    const processCompleted = useMemo(() => processSteps.filter((s) => s.status === "completed").length, [processSteps]);
    const processRunning = useMemo(() => processSteps.filter((s) => s.status === "running").length, [processSteps]);
    const processPending = useMemo(() => processSteps.filter((s) => s.status === "pending").length, [processSteps]);
    const activeProcessText = useMemo(() => processSteps.find((s) => s.status === "running")?.text || "", [processSteps]);
    const totalAgentSteps = useMemo(() => agents.reduce((sum, a) => sum + a.total, 0), [agents]);
    const completedAgentSteps = useMemo(() => agents.reduce((sum, a) => sum + a.completed, 0), [agents]);

    const hasAgents = agents.length > 0;
    const progressPercent = useMemo(() => {
        if (isComplete) return 100;
        const backendProgress = message.metadata?.researchProgress?.percent;
        if (typeof backendProgress === "number") return Math.min(99, Math.max(0, backendProgress));
        const settled = processSteps.filter((step) => step.status === "completed" || step.status === "error").length;
        return processSteps.length > 0 ? Math.min(95, Math.round((settled / processSteps.length) * 100)) : 0;
    }, [isComplete, message.metadata?.researchProgress?.percent, processSteps]);
    const visibleProcessSteps = useMemo(() => processSteps.slice(-12), [processSteps]);
    const hiddenProcessStepCount = processSteps.length - visibleProcessSteps.length;
    const plannedTaskCount = useMemo(() => {
        const planStep = processSteps.find((step) => step?.text && /Research plan created with \d+ investigation tasks/.test(step.text));
        return Number(planStep?.text?.match(/with (\d+) investigation tasks/)?.[1] || 0);
    }, [processSteps]);

    return (
        <div
            className={cn(
                "group flex w-full flex-col px-3 transition-all duration-200",
                compact ? "bg-transparent py-1" : "bg-transparent py-2",
                "hover:bg-muted",
            )}
        >
            <div
                className={cn(
                    "mx-auto flex w-full flex-col gap-2 items-start",
                    compact ? "max-w-full" : "max-w-[800px]",
                )}
            >
                <div className="flex h-[240px] min-h-[240px] w-full flex-col rounded-lg border border-primary bg-card p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                            {isComplete ? <Search className="h-4 w-4 text-primary" /> : <ResearchMatrix />}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-primary">Deep Research</span>
                            <span
                                className={cn(
                                    "text-xs transition-all duration-300",
                                    isComplete ? "text-muted-foreground" : "text-primary font-medium",
                                )}
                            >
                                {isStaleEmpty
                                    ? "Research interrupted"
                                    : isStaleSending
                                        ? message.content
                                            ? "Research interrupted (partial results)"
                                            : "Research interrupted"
                                        : isFailed
                                            ? message.content
                                                ? "Research interrupted (partial results)"
                                                : "Research interrupted"
                                            : isComplete
                                                ? "Research complete"
                                                : "Agent is actively researching..."}
                            </span>
                            {plannedTaskCount > 0 && (
                                <span className="text-[11px] text-muted-foreground">
                                    {plannedTaskCount} planned investigation tasks
                                </span>
                            )}
                        </div>
                        {!isComplete && (
                            <div className="ml-auto flex items-center gap-2">
                                <div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 border border-border text-[10px] font-mono text-primary">
                                    <span className="relative flex h-1.5 w-1.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                                    </span>
                                    {formatElapsed(elapsed)}
                                </div>
                            </div>
                        )}
                    </div>

                    <Collapsible defaultOpen={!isComplete || isStaleEmpty} className="flex min-h-0 w-full flex-1 flex-col">
                        <CollapsibleTrigger className="flex w-full flex-col gap-1 rounded-md p-1.5 hover:bg-muted text-xs text-muted-foreground transition-all">
                            <div className="flex w-full items-center justify-between">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-foreground">
                                        Research activity ({steps.length} events)
                                    </span>
                                    {steps.length > 0 && (
                                        <div className="flex items-center gap-1.5">
                                            {processCompleted > 0 && (
                                                <span className="inline-flex items-center rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success border border-success">
                                                    {processCompleted} done
                                                </span>
                                            )}
                                            {processRunning > 0 && (
                                                <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary border border-primary">
                                                    {processRunning} active
                                                </span>
                                            )}
                                            {processPending > 0 && (
                                                <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground border border-border">
                                                    {processPending} pending
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-mono text-primary">{progressPercent}%</span>
                                    {!isComplete && activeProcessText && (
                                        <span className="hidden md:inline text-[11px] text-primary max-w-[200px] truncate animate-pulse">
                                            {activeProcessText}
                                        </span>
                                    )}
                                    <ChevronDown className="h-3 w-3 shrink-0 transition-transform duration-200" />
                                </div>
                            </div>

                            {steps.length > 0 && (
                                <div className="w-full h-1 bg-muted rounded-full overflow-hidden mt-1">
                                    <div
                                        className="h-full bg-primary transition-all duration-500 ease-out relative"
                                        style={{ width: `${progressPercent}%` }}
                                    >
                                        {!isComplete && (
                                            <div
                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-card to-transparent animate-shimmer-slide"
                                                style={{ backgroundSize: "200% 100%" }}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </CollapsibleTrigger>

                        <CollapsibleContent className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1 max-h-[360px]">
                            {steps.length === 0 && !isComplete && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 px-2">
                                    <Loader2 className="h-3 w-3 motion-safe:animate-spin motion-reduce:transition-none" />
                                    <span>Initializing research plan...</span>
                                </div>
                            )}
                            {isStaleEmpty && (
                                <div className="flex flex-col gap-2 py-2 px-2">
                                    <div className="flex items-center gap-2 text-xs text-destructive">
                                        <XCircle className="h-3 w-3 shrink-0" />
                                        <span>The research process ended before collecting any data.</span>
                                    </div>
                                    {onContinueResearch && (
                                        <StaleRetryButton
                                            message={message}
                                            messages={messages}
                                            onContinueResearch={onContinueResearch}
                                        />
                                    )}
                                </div>
                            )}
                            {isStaleSending && !isStaleEmpty && message.content && (
                                <div className="flex items-center gap-2 text-xs text-warning py-2 px-2">
                                    <XCircle className="h-3 w-3 shrink-0" />
                                    <span>Connection was lost. Partial results are shown above. Re-run the research to get the complete report.</span>
                                </div>
                            )}

                            <div className={cn("flex gap-2", hasAgents ? "flex-col md:flex-row" : "flex-col")}>
                                <div className={cn("flex flex-col gap-1", hasAgents ? "md:w-1/2" : "w-full")}>
                                    <div className="flex items-center gap-1.5 px-2 py-1">
                                        <Globe className="h-3 w-3 text-primary" />
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Process</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        {hiddenProcessStepCount > 0 && (
                                            <div className="px-2 py-1 text-[11px] text-muted-foreground">
                                                {hiddenProcessStepCount} earlier events collapsed
                                            </div>
                                        )}
                                        {visibleProcessSteps.map((step, idx) => (
                                            <ProcessStepItem key={idx} step={step} />
                                        ))}
                                        {processSteps.length === 0 && (
                                            <div className="text-[11px] text-muted-foreground px-2 italic">
                                                No process steps yet...
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {hasAgents && (
                                    <div className="md:w-1/2 flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5 px-2 py-1">
                                            <Bot className="h-3 w-3 text-primary" />
                                            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Agents</span>
                                            {!isComplete && (
                                                <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                                                    {completedAgentSteps}/{totalAgentSteps}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            {agents.map((agent) => (
                                                <ResearchAgentCard
                                                    key={agent.index}
                                                    agent={agent}
                                                    isComplete={isComplete}
                                                />
                                            ))}
                                        </div>
                                        {agents.length === 0 && (
                                            <div className="text-[11px] text-muted-foreground px-2 italic">
                                                Spawning agents...
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                </div>

                {message.content && (
                    <div className="w-full min-w-0 prose prose-invert prose-p:leading-relaxed prose-pre:p-0 max-w-none">
                        <MarkdownContent content={message.content} />
                    </div>
                )}
            </div>
        </div>
    );
}
