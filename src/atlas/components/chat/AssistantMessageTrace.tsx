import { useState } from "react";
import {
  Activity,
  ArrowRightLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  HelpCircle,
  ListChecks,
  Loader2,
  ShieldAlert,
  Workflow,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toolsApi } from "@/api";
import { ArtifactData, Step, ToolCall } from "./types";
import { ToolCallCard } from "./ToolCallCard";

export function resolveToolApproval(toolCallId: string | undefined, approved: boolean) {
  if (!toolCallId) return;
  toolsApi.resolveApproval(toolCallId, approved).catch((e) =>
    console.error("resolve_tool_approval failed:", e)
  );
}

function getActionPresentation(step: Step) {
  const kind = step.kind || "system";
  const status = step.status || "running";
  const isError = status === "error";
  const isDone = status === "completed";
  const iconClass = isError ? "text-rose-400/80" : isDone ? "text-zinc-600" : "text-zinc-500";
  const phase = typeof step.metadata?.phase === "string" ? step.metadata.phase : undefined;

  if (kind === "agent_spawn") {
    const spawn = step.metadata?.spawn;
    return {
      Icon: Bot,
      label: `Spawned ${spawn?.childAgent || "agent"}`,
      detail: spawn?.task || step.content,
      iconClass: "text-zinc-500",
    };
  }
  if (kind === "agent_complete") {
    const spawn = step.metadata?.spawn;
    return {
      Icon: isError ? XCircle : CheckCircle2,
      label: `${spawn?.childAgent || "Agent"} ${isError ? "failed" : "completed"}`,
      detail: spawn?.task || step.content,
      iconClass,
    };
  }
  if (kind === "agent_handoff") {
    const handoff = step.metadata?.handoff;
    return {
      Icon: ArrowRightLeft,
      label: `${handoff?.fromAgent || "Agent"} handed off to ${handoff?.toAgent || "agent"}`,
      detail: handoff?.reason || step.content,
      iconClass: "text-zinc-500",
    };
  }
  if (kind === "approval_request") {
    return {
      Icon: ShieldAlert,
      label: `Approval required: ${step.metadata?.approvalRequest?.tool_name || "tool"}`,
      detail: step.metadata?.approvalRequest?.context?.description || step.content,
      iconClass: "text-amber-400/80",
    };
  }
  if (kind === "clarification_request") {
    return {
      Icon: HelpCircle,
      label: "Clarification needed",
      detail: step.metadata?.clarificationRequest?.question || step.content,
      iconClass: "text-amber-400/80",
    };
  }
  if (kind.startsWith("task_")) {
    return {
      Icon: ListChecks,
      label: kind === "task_started" ? "Task started" : kind === "task_completed" ? "Task completed" : "Task failed",
      detail: step.content,
      iconClass,
    };
  }
  if (kind.startsWith("workflow_") || kind === "orchestrator_progress") {
    const phaseLabel = phase ? phase.replace(/_/g, " ") : "Planning";
    return {
      Icon: Workflow,
      label: kind === "orchestrator_progress" ? phaseLabel : kind.replace(/_/g, " "),
      detail: step.content,
      iconClass,
    };
  }
  if (kind === "chat_status") {
    return {
      Icon: status === "running" ? Loader2 : CircleDot,
      label: "Agent status",
      detail: step.content,
      iconClass,
    };
  }
  if (kind === "tool_result") {
    const result = step.metadata?.toolResult;
    return {
      Icon: isError ? XCircle : CheckCircle2,
      label: `${result?.toolName || "Tool"} ${isError ? "failed" : "completed"}`,
      detail: result?.contentSummary || step.content,
      iconClass,
    };
  }
  return {
    Icon: isError ? XCircle : status === "running" ? Loader2 : Activity,
    label: kind.replace(/_/g, " "),
    detail: step.content,
    iconClass,
  };
}

export function AgentActionStep({ step, isStreaming }: { step: Step; isStreaming?: boolean }) {
  const presentation = getActionPresentation(step);
  const Icon = presentation.Icon;
  const isRunning = step.status === "running" && isStreaming;
  const progress = step.metadata?.progressPercent;
  const approval = step.metadata?.approvalRequest;

  return (
    <div className="py-1 font-sans">
      <div className="flex items-start gap-3">
        <div className={cn("mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500", presentation.iconClass)}>
          <Icon className={cn("h-3.5 w-3.5", isRunning && "animate-spin")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-[13px] capitalize leading-5 text-zinc-400", isRunning && "text-premium-shimmer")}>
              {presentation.label}
            </span>
            {step.metadata?.iteration !== undefined && (
              <span className="font-mono text-[11px] text-zinc-600">
                iter {step.metadata.iteration}
              </span>
            )}
            {step.status && (
              <span
                className={cn(
                  "text-[11px]",
                  step.status === "error" && "text-rose-400/80",
                  step.status === "completed" && "text-zinc-600",
                  step.status === "running" && "text-zinc-500",
                )}
              >
                {step.status}
              </span>
            )}
          </div>
          {presentation.detail && (
            <div className="mt-0.5 line-clamp-3 text-[12px] leading-relaxed text-zinc-600">
              {presentation.detail}
            </div>
          )}
          {typeof progress === "number" && (
            <div className="mt-1.5 h-px overflow-hidden bg-zinc-800">
              <div className="h-full bg-zinc-500 transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
          )}
          {approval && (
            <InlineApprovalControls toolCallId={approval.tool_call_id} toolName={approval.tool_name} />
          )}
        </div>
      </div>
    </div>
  );
}

function InlineApprovalControls({ toolCallId, toolName }: { toolCallId?: string; toolName?: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-zinc-500">
        Permission needed for <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{toolName || "tool"}</code>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-zinc-700/80 px-3 text-[11px] text-zinc-300 hover:bg-zinc-800"
        onClick={() => resolveToolApproval(toolCallId, false)}
      >
        Deny
      </Button>
      <Button
        size="sm"
        className="h-7 bg-zinc-800 px-3 text-[11px] text-zinc-100 hover:bg-zinc-700"
        onClick={() => resolveToolApproval(toolCallId, true)}
      >
        Approve
      </Button>
    </div>
  );
}

export function ResearchTimeline({ steps }: { steps: Array<{ text: string; status: "pending" | "running" | "completed" | "error" }> }) {
  return (
    <div className="py-1 font-sans">
      <div className="mb-1.5 flex items-center gap-2 text-zinc-500">
        <Workflow className="h-3.5 w-3.5" />
        <span className="text-[13px]">Researching</span>
        <span className="font-mono text-[11px] text-zinc-600">
          {steps.filter((s) => s.status === "completed" || s.status === "error").length}/{steps.length}
        </span>
      </div>
      <div className="ml-1.5 space-y-1 border-l border-zinc-800 pl-4">
        {steps.map((step, idx) => (
          <div key={`${step.text}-${idx}`} className="flex items-start gap-2 text-[12px] text-zinc-500">
            {step.status === "running" ? (
              <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-zinc-400" />
            ) : step.status === "completed" ? (
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" />
            ) : step.status === "error" ? (
              <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-400/80" />
            ) : (
              <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-zinc-500" />
            )}
            <span className="leading-relaxed">{step.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentExecutionTrace({
  toolCalls,
  sessionId,
  onOpenArtifact,
  isStreaming,
}: {
  toolCalls: ToolCall[];
  sessionId?: string;
  onOpenArtifact: (a: ArtifactData) => void;
  isStreaming?: boolean;
}) {
  const hasActiveTools = toolCalls.some(tc => tc.status === 'running' || tc.status === 'awaiting_approval');
  const completedCount = toolCalls.filter(tc => tc.status === 'completed').length;
  const errorCount = toolCalls.filter(tc => tc.status === 'error').length;
  const runningCount = toolCalls.filter(tc => tc.status === 'running' || tc.status === 'awaiting_approval').length;
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="my-2 font-sans">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 rounded py-1 text-left text-zinc-500 transition-colors hover:bg-white/[0.025]"
      >
        {hasActiveTools ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : errorCount > 0 ? <XCircle className="h-3.5 w-3.5 text-rose-400/80" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        <span className={cn("text-[13px]", hasActiveTools && "text-premium-shimmer")}>
          {hasActiveTools ? "Working with tools" : "Used tools"}
        </span>
        <span className="font-mono text-[11px] text-zinc-600">
          {completedCount + errorCount}/{toolCalls.length}
        </span>
        {runningCount > 0 && <span className="text-[11px] text-zinc-600">{runningCount} running</span>}
        {errorCount > 0 && <span className="text-[11px] text-rose-400/70">{errorCount} failed</span>}
        <ChevronRight className={cn("ml-auto h-3 w-3 text-zinc-700 transition-transform duration-200", isExpanded && "rotate-90")} />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="ml-1.5 overflow-hidden border-l border-zinc-800 pl-4"
          >
            <div className="flex flex-col gap-0.5">
              {toolCalls.map((tc, idx) => (
                <ToolCallCard
                  key={`${tc.id}-${idx}`}
                  toolCall={tc}
                  className="w-full min-w-0"
                  chatId={sessionId}
                  onViewArtifact={onOpenArtifact}
                  onCancel={() => resolveToolApproval(tc.id, false)}
                  onRetry={() => resolveToolApproval(tc.id, true)}
                />
              ))}
            </div>
            {isStreaming && hasActiveTools && (
              <div className="py-1 text-[12px] text-zinc-600">
                Tool output stays in this timeline while the answer continues below.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
