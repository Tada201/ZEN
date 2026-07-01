import { FormEvent, useCallback, useMemo, useState, useEffect } from "react";
import {
  Search,
  ChevronDown,
  CheckCircle2,
  CircleDashed,
  Loader2,
  XCircle,
  Bot,
  Globe,
  Sparkles,
  Square,
} from "lucide-react";
import { Message } from "./types";
import { MarkdownContent } from "./MarkdownContent";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ResearchMatrix } from "./ResearchMatrix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ResearchStep {
  id?: string;
  text: string;
  status: "pending" | "running" | "completed" | "error";
  agentIndex?: number;
  agentName?: string;
  phase?: string;
  durationSecs?: number;
  subQuestion?: string;
  progressPercent?: number;
}

interface AgentInfo {
  index: number;
  name: string;
  subQuestion: string;
  steps: ResearchStep[];
  completed: number;
  total: number;
  activeText: string;
  allDone: boolean;
  durationSecs?: number;
  hasError?: boolean;
}

export function DeepResearchMessage({
  message,
  compact,
  onContinueResearch,
  onAbort,
  isChatStreaming,
  messages,
}: {
  message: Message;
  compact?: boolean;
  onContinueResearch?: (request: string) => void;
  onAbort?: () => void;
  isChatStreaming?: boolean;
  messages?: Message[];
}) {
  if (message.metadata?.researchClarification) {
    return <ResearchClarificationCard message={message} compact={compact} onContinueResearch={onContinueResearch} />;
  }

  return <DeepResearchRunMessage message={message} compact={compact} isChatStreaming={isChatStreaming} messages={messages} onContinueResearch={onContinueResearch} onAbort={onAbort} />;
}

function ResearchClarificationCard({
  message,
  compact,
  onContinueResearch,
}: {
  message: Message;
  compact?: boolean;
  onContinueResearch?: (request: string) => void;
}) {
  const clarification = message.metadata?.researchClarification;
  const [answers, setAnswers] = useState<string[]>([]);

  useEffect(() => {
    setAnswers(clarification?.questions.map(() => "") || []);
  }, [clarification]);

  const submitClarification = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clarification || !onContinueResearch) return;
    const responses = clarification.questions
      .map((question, index) => ({ question, answer: answers[index]?.trim() || "Not specified" }));
    onContinueResearch([
      `Original deep-research request: ${clarification.originalQuestion}`,
      "Clarifications supplied by the user:",
      ...responses.map(({ question, answer }) => `- ${question}\n  Answer: ${answer}`),
      "Research the original request using these clarifications as binding scope.",
    ].join("\n"));
  };

  if (!clarification) return null;

  return (
    <div className={cn("flex w-full flex-col px-4", compact ? "py-2" : "py-4")}>
      <form onSubmit={submitClarification} className="mx-auto w-full max-w-[800px] border border-primary/25 bg-primary/[0.07] p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center bg-primary/15 text-primary">
            <Search className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Research scope needed</h3>
            <p className="text-xs text-muted-foreground">Answer these before research begins.</p>
          </div>
        </div>
        <div className="space-y-3">
          {clarification.questions.map((question, index) => (
            <label key={`${message.id}-${index}`} className="block space-y-1.5 text-xs font-medium text-foreground">
              <span>{question}</span>
              <Input
                value={answers[index] || ""}
                onChange={(event) => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer))}
                className="h-9 rounded-none border-border/70 bg-background/70 text-sm"
                autoComplete="off"
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end border-t border-border/50 pt-3">
          <Button type="submit" size="sm" className="h-8 rounded-none text-xs" disabled={!onContinueResearch}>
            Start research
          </Button>
        </div>
      </form>
    </div>
  );
}

function DeepResearchRunMessage({ message, compact, isChatStreaming, messages, onContinueResearch, onAbort }: { message: Message; compact?: boolean; isChatStreaming?: boolean; messages?: Message[]; onContinueResearch?: (request: string) => void; onAbort?: () => void }) {
  const steps: ResearchStep[] = useMemo(() => {
    if (message.metadata?.researchSteps && Array.isArray(message.metadata.researchSteps)) {
      return message.metadata.researchSteps as ResearchStep[];
    }
    return [];
  }, [message.metadata]);

  // Detect stale/dead deep research messages left over from a crash or
  // incomplete session. These have is_complete=0 in the DB (mapped to
  // status="failed" by useChatQueries) and no streaming will arrive.
  const isFailed = message.status === "failed";

  // Detect phantom streaming: the message is status="sending" (from a
  // reload where is_complete=0 was mapped to "sending") but the chat is
  // not actually streaming — no events will arrive.
  // Note: during the deep-research handoff window (after chat:done but
  // before chat:message delivers the final report), streaming is kept
  // alive by useChatChunkEvent so isChatStreaming remains true and this
  // guard does not fire prematurely.
  const isStaleSending = message.status === "sending" && isChatStreaming === false;

  // The research is terminal if normally complete, marked completed in
  // metadata, failed, or is a stale sending message from a reload.
  const isComplete = message.status === "sent" || message.metadata?.status === "completed" || isFailed || isStaleSending;
  // True if the message has zero content and no steps — a crash happened
  // before the first periodic checkpoint.
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

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Split steps into process steps (no agentIndex) and agent steps
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

  // Build agent info for rendering
  const agents: AgentInfo[] = useMemo(() => {
    const result: AgentInfo[] = [];
    const sortedIndices = [...agentMap.keys()].sort();

    for (const idx of sortedIndices) {
      const agentSteps = agentMap.get(idx)!;
      const firstSpawn = agentSteps.find((s) => s.phase === "agent_spawn");
      const name = firstSpawn?.agentName || `Agent ${idx + 1}`;
      const subQuestion = firstSpawn?.subQuestion ||
        firstSpawn?.text
          ?.replace(`${name}: `, "")
          .replace(`${name}:`, "") || "";

      let completed = 0;
      let running = 0;
      let activeText = "";
      let durationSecs: number | undefined;
      agentSteps.forEach((s) => {
        if (s.status === "completed") completed++;
        else if (s.status === "running") {
          running++;
          activeText = s.text;
        }
        // Extract duration from agent_complete or agent_error phase step
        if ((s.phase === "agent_complete" || s.phase === "agent_error") && s.durationSecs !== undefined) {
          durationSecs = s.durationSecs;
        }
      });

      // Consider agent done if we received agent_complete or agent_error phase event
      const hasCompleteStep = agentSteps.some((s) => s.phase === "agent_complete");
      const hasErrorStep = agentSteps.some((s) => s.phase === "agent_error");
      const agentErrored = hasErrorStep;
      // Also consider done if all steps resolved (backward compat)
      const allStepsResolved = agentSteps.every(
        (s) =>
          s.status === "completed" ||
          s.status === "error" ||
          s.phase === "agent_spawn" ||
          s.phase === "agent_complete" ||
          s.phase === "agent_error"
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
        hasError: agentErrored,
      });
    }

    return result;
  }, [agentMap]);

  const processCompleted = useMemo(
    () => processSteps.filter((s) => s.status === "completed").length,
    [processSteps]
  );
  const processRunning = useMemo(
    () => processSteps.filter((s) => s.status === "running").length,
    [processSteps]
  );
  const processPending = useMemo(
    () => processSteps.filter((s) => s.status === "pending").length,
    [processSteps]
  );
  const activeProcessText = useMemo(() => {
    const running = processSteps.find((s) => s.status === "running");
    return running?.text || "";
  }, [processSteps]);

  const totalAgentSteps = useMemo(
    () => agents.reduce((sum, a) => sum + a.total, 0),
    [agents]
  );
  const completedAgentSteps = useMemo(
    () => agents.reduce((sum, a) => sum + a.completed, 0),
    [agents]
  );

  const hasAgents = agents.length > 0;
  const progressPercent = useMemo(() => {
    if (isComplete) return 100;
    const backendProgress = message.metadata?.researchProgress?.percent;
    if (typeof backendProgress === "number") {
      return Math.min(99, Math.max(0, backendProgress));
    }
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
        "group flex w-full flex-col px-4 transition-all duration-200",
        compact ? "bg-transparent py-2" : "bg-transparent py-4",
        "hover:bg-muted/20"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-4 items-start",
          compact ? "max-w-full" : "max-w-[800px]"
        )}
      >
        {/* Deep Research Specialized Card (expanded size, satisfies test constraint: h-[280px]) */}
        <div className="flex min-h-[360px] w-full flex-col rounded-xl border border-primary/20 bg-gradient-to-b from-indigo-500/10 to-transparent p-5 shadow-sm backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
              {isComplete ? (
                <Search className="h-4 w-4 text-primary" />
              ) : (
                <ResearchMatrix />
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-primary">
                Deep Research
              </span>
              <span
                className={cn(
                  "text-xs transition-all duration-300",
                  isComplete
                    ? "text-primary/60"
                    : "text-primary animate-text-shimmer font-medium"
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
                <span className="text-[11px] text-muted-foreground">{plannedTaskCount} planned investigation tasks</span>
              )}
            </div>
            {!isComplete && (
              <div className="ml-auto flex items-center gap-2">
                {onAbort && (
                  <button
                    type="button"
                    onClick={onAbort}
                    className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
                    title="Stop research"
                  >
                    <Square className="h-2.5 w-2.5" />
                    Stop
                  </button>
                )}
                <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 border border-primary/20 text-[10px] font-mono text-primary shadow-[0_0_10px_hsl(var(--primary) / 0.1)]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                  </span>
                  {formatTime(elapsed)}
                </div>
              </div>
            )}
          </div>

          <Collapsible defaultOpen={!isComplete || isStaleEmpty} className="flex min-h-0 w-full flex-1 flex-col">
            <CollapsibleTrigger className="flex w-full flex-col gap-2 rounded-lg p-2 hover:bg-muted/50 text-xs text-muted-foreground transition-all">
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground">
                    Research activity ({steps.length} events)
                  </span>
                  {steps.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {processCompleted > 0 && (
                        <span className="inline-flex items-center rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success border border-emerald-500/20">
                          {processCompleted} done
                        </span>
                      )}
                      {processRunning > 0 && (
                        <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary border border-primary/20 text-premium-shimmer">
                          {processRunning} active
                        </span>
                      )}
                      {processPending > 0 && (
                        <span className="inline-flex items-center rounded bg-muted/10 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground border border-border/20">
                          {processPending} pending
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-primary/80">{progressPercent}%</span>
                  {!isComplete && activeProcessText && (
                    <span className="hidden md:inline text-[11px] text-primary/70 max-w-[200px] truncate animate-pulse">
                      {activeProcessText}
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3 shrink-0 transition-transform duration-200" />
                </div>
              </div>

              {/* Progress bar — uses combined process + agent step completions */}
              {steps.length > 0 && (
                <div className="w-full h-1 bg-background/30 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500 ease-out relative"
                    style={{
                      width: `${progressPercent}%`,
                    }}
                  >
                    {!isComplete && (
                      <div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-card/30 to-transparent animate-shimmer-slide"
                        style={{ backgroundSize: "200% 100%" }}
                      />
                    )}
                  </div>
                </div>
              )}
            </CollapsibleTrigger>

            <CollapsibleContent className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 max-h-[400px]">
              {steps.length === 0 && !isComplete && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 px-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Initializing research plan...</span>
                </div>
              )}
              {isStaleEmpty && (
                <div className="flex flex-col gap-2 py-2 px-2">
                  <div className="flex items-center gap-2 text-xs text-destructive/80">
                    <XCircle className="h-3 w-3 shrink-0" />
                    <span>The research process ended before collecting any data.</span>
                  </div>
                  {onContinueResearch && (
                    <StaleRetryButton message={message} messages={messages} onContinueResearch={onContinueResearch} />
                  )}
                </div>
              )}
              {isStaleSending && !isStaleEmpty && message.content && (
                <div className="flex items-center gap-2 text-xs text-warning/80 py-2 px-2">
                  <XCircle className="h-3 w-3 shrink-0" />
                  <span>Connection was lost. Partial results are shown above. Re-run the research to get the complete report.</span>
                </div>
              )}

              {/* Two-panel layout: process left, agents right */}
              <div
                className={cn(
                  "flex gap-3",
                  hasAgents ? "flex-col md:flex-row" : "flex-col"
                )}
              >
                {/* ── LEFT PANEL: Process Steps ────────────────────────── */}
                <div
                  className={cn(
                    "flex flex-col gap-1",
                    hasAgents ? "md:w-1/2" : "w-full"
                  )}
                >
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <Globe className="h-3 w-3 text-primary" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Process
                    </span>
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

                {/* ── RIGHT PANEL: Sub-Agents ──────────────────────────── */}
                {hasAgents && (
                  <div className="md:w-1/2 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 px-2 py-1">
                      <Bot className="h-3 w-3 text-primary" />
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Agents
                      </span>
                      {!isComplete && (
                        <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                          {completedAgentSteps}/{totalAgentSteps}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {agents.map((agent) => (
                        <AgentCard
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

        {/* Final Report Synthesis */}
        {message.content && (
          <div className="w-full min-w-0 prose prose-invert prose-p:leading-relaxed prose-pre:p-0 max-w-none">
            <MarkdownContent content={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stale Retry Button ─────────────────────────────────────────────────────

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
    // Find the user message preceding this deep research message
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
      className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-[11px] font-medium text-destructive hover:bg-rose-500/20 transition-colors"
    >
      <XCircle className="h-3 w-3" />
      Retry research
    </button>
  );
}

// ── Process Step Item ──────────────────────────────────────────────────────

function ProcessStepItem({ step }: { step: ResearchStep }) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-[11px] py-1.5 px-2 rounded-md bg-background/20 hover:bg-background/30 transition-colors">
      {step.status === "completed" && (
        <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
      )}
      {step.status === "running" && (
        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin mt-0.5 shrink-0" />
      )}
      {step.status === "error" && (
        <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
      )}
      {step.status === "pending" && (
        <CircleDashed className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      )}
      <span
        className={cn(
          "min-w-0 line-clamp-2 text-foreground leading-relaxed",
          step.status === "running" && "text-primary font-medium",
          step.status === "completed" && "text-foreground",
          step.status === "error" && "text-destructive"
        )}
      >
        {step.text}
      </span>
    </div>
  );
}

// ── Agent Card ─────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  isComplete,
}: {
  agent: AgentInfo;
  isComplete: boolean;
}) {
  return (
    <div className="rounded-lg border border-primary/15 bg-gradient-to-b from-purple-500/5 to-transparent p-2.5 transition-all duration-200 hover:border-primary/25">
      {/* Agent header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15">
            <Sparkles className="h-2.5 w-2.5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-primary leading-tight">
              {agent.name}
            </span>
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
          {/* Running indicator */}
          {!agent.allDone && !isComplete && (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
          )}
          
          {/* Completed badge with duration — or Failed badge on error */}
          {agent.allDone && agent.hasError && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-1.5 py-0.5 border border-rose-500/20">
              <XCircle className="h-2.5 w-2.5 text-destructive" />
              {agent.durationSecs !== undefined && (
                <span className="text-[10px] font-mono text-destructive">
                  {agent.durationSecs >= 60
                    ? `${Math.floor(agent.durationSecs / 60)}m ${agent.durationSecs % 60}s`
                    : `${agent.durationSecs}s`}
                </span>
              )}
            </span>
          )}
          {agent.allDone && !agent.hasError && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 border border-emerald-500/20">
              <CheckCircle2 className="h-2.5 w-2.5 text-success" />
              {agent.durationSecs !== undefined && (
                <span className="text-[10px] font-mono text-success">
                  {agent.durationSecs >= 60
                    ? `${Math.floor(agent.durationSecs / 60)}m ${agent.durationSecs % 60}s`
                    : `${agent.durationSecs}s`}
                </span>
              )}
            </span>
          )}
          
          {/* Step counter */}
          {agent.total > 0 && !agent.allDone && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {agent.completed}/{agent.total}
            </span>
          )}
        </div>
      </div>

      {/* Agent steps — exclude spawn, completion, and error events */}
      <div className="flex flex-col gap-0.5">
        {agent.steps
          .filter((s) => s.phase !== "agent_spawn" && s.phase !== "agent_complete" && s.phase !== "agent_error")
          .map((step, idx) => (
            <div
              key={idx}
              className="flex items-start gap-1.5 py-0.5 px-1 rounded"
            >
              {step.status === "completed" && (
                <CheckCircle2 className="h-2.5 w-2.5 text-success mt-[2px] shrink-0" />
              )}
              {step.status === "running" && (
                <Loader2 className="h-2.5 w-2.5 text-primary animate-spin mt-[2px] shrink-0" />
              )}
              {step.status === "error" && (
                <XCircle className="h-2.5 w-2.5 text-destructive mt-[2px] shrink-0" />
              )}
              {step.status === "pending" && (
                <CircleDashed className="h-2.5 w-2.5 text-muted-foreground mt-[2px] shrink-0" />
              )}
              <span
                className={cn(
                  "text-[11px] leading-relaxed truncate",
                  step.status === "completed"
                    ? "text-foreground"
                    : step.status === "running"
                      ? "text-purple-200 font-medium"
                      : step.status === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                )}
                title={step.text || ""}
              >
                {(step.text || "").length > 50
                  ? (step.text || "").slice(0, 47) + "..."
                  : (step.text || "")}
              </span>
            </div>
          ))}
        {agent.steps.filter((s) => s.phase !== "agent_spawn" && s.phase !== "agent_complete" && s.phase !== "agent_error").length ===
          0 && (
          <div className="text-[11px] text-muted-foreground italic px-1">
            {agent.allDone && agent.hasError ? "No results — all fetches failed" : agent.allDone ? "No results" : "Searching..."}
          </div>
        )}
      </div>

      {/* Mini progress bar for this agent */}
      {agent.total > 0 && !agent.allDone && !isComplete && (
        <div className="mt-1.5 h-0.5 bg-background/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out rounded-full"
            style={{
              width: `${(agent.completed / agent.total) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
