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
  Wrench,
  Workflow,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toolsApi } from "@/api";
import { Step } from "./types";
import { AssistantTaskPlanPreview } from "./AssistantTaskPlanPreview";
import { AgentDelegationLane } from "./AgentDelegationLane";
import { buildAgentDelegationLaneModel } from "./agentDelegationLaneModel";

export function resolveToolApproval(toolCallId: string | undefined, approved: boolean, rememberExact = false) {
  if (!toolCallId) return;
  toolsApi.resolveApproval(toolCallId, approved, rememberExact).catch((e) =>
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
      detail: step.metadata?.resultSummary || spawn?.task || step.content,
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
    const taskLabel = typeof step.metadata?.taskId === "string" ? step.metadata.taskId : undefined;
    if (kind === "task_list_updated") {
      const taskCount = Array.isArray(step.metadata?.tasks) ? step.metadata.tasks.length : undefined;
      return {
        Icon: ListChecks,
        label: taskCount ? `${taskCount} tasks planned` : "Task list updated",
        detail: step.content,
        iconClass,
      };
    }
    if (kind === "task_complexity_analyzed") {
      return {
        Icon: Workflow,
        label: "Task plan analyzed",
        detail: step.content,
        iconClass: "text-blue-300/80",
      };
    }
    return {
      Icon: ListChecks,
      label:
        kind === "task_created" ? "Task created" :
        kind === "task_started" ? "Task started" :
        kind === "task_updated" ? "Task updated" :
        kind === "task_completed" ? "Task completed" :
        "Task failed",
      detail: [taskLabel, step.content].filter(Boolean).join(": "),
      iconClass,
    };
  }
  if (kind.startsWith("workflow_") || kind === "orchestrator_progress") {
    const phaseLabel = phase ? phase.replace(/_/g, " ") : "Planning";
    const workflowId = step.metadata?.workflowId;
    const tasksCompleted = step.metadata?.tasksCompleted;
    const totalTasks = step.metadata?.totalTasks;
    const workflowDetail = [
      typeof tasksCompleted === "number" && typeof totalTasks === "number" ? `${tasksCompleted}/${totalTasks} tasks` : undefined,
      step.content,
    ].filter(Boolean).join(": ");

    return {
      Icon: Workflow,
      label: kind === "orchestrator_progress" ? phaseLabel : kind.replace(/_/g, " "),
      detail: workflowDetail || workflowId,
      iconClass,
    };
  }
  if (kind === "chat_status") {
    const tools = Array.isArray(step.metadata?.tools) ? step.metadata.tools : [];
    if (phase === "tool_call_ready") {
      const preview = step.metadata?.toolCallPreview;
      const args = preview?.argumentsPreview;
      const detail = typeof args === "string" ? args : args ? JSON.stringify(args) : step.content || step.metadata?.message;
      return {
        Icon: Wrench,
        label: `${preview?.toolName || "Tool call"} ready`,
        detail: detail?.slice(0, 180),
        iconClass: "text-emerald-300/80",
      };
    }
    if (phase === "tool_call_streaming") {
      const preview = step.metadata?.toolCallPreview;
      const args = typeof preview?.argumentsPreview === "string" ? preview.argumentsPreview.trim() : "";
      return {
        Icon: Wrench,
        label: `Preparing ${preview?.toolName || "tool call"}`,
        detail: args ? args.slice(0, 180) : step.content || step.metadata?.message,
        iconClass: "text-blue-300/80",
      };
    }
    if (phase === "tool_batch_planned") {
      return {
        Icon: Wrench,
        label: step.metadata?.parallel ? "Parallel tool batch" : "Tool call planned",
        detail: tools.length > 0 ? tools.join(", ") : step.content || step.metadata?.message,
        iconClass: "text-blue-300/80",
      };
    }
    if (phase === "agent_streaming") {
      return {
        Icon: Bot,
        label: `${step.metadata?.agentName || step.metadata?.agentId || "Agent"} is working`,
        detail: step.content || step.metadata?.message,
        iconClass: "text-blue-300/80",
      };
    }
    if (phase === "provider_ready") {
      const providerDetail = [step.metadata?.provider, step.metadata?.model].filter(Boolean).join(" / ");
      return {
        Icon: CircleDot,
        label: "Provider ready",
        detail: providerDetail || step.content || step.metadata?.message,
        iconClass,
      };
    }
    const phaseLabel = phase ? phase.replace(/_/g, " ") : undefined;
    return {
      Icon: status === "running" ? Loader2 : CircleDot,
      label: phaseLabel || "Agent status",
      detail: step.content || step.metadata?.message,
      iconClass: status === "running" ? "text-blue-300/80" : iconClass,
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

function hasActionDetails(step: Step) {
  return Boolean(step.metadata || step.timestamp || step.eventId);
}

function formatActionTime(timestamp?: number) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return null;
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

function serializeActionDetails(step: Step) {
  return JSON.stringify(
    {
      eventId: step.eventId,
      kind: step.kind,
      status: step.status,
      timestamp: step.timestamp,
      content: step.content,
      metadata: step.metadata,
    },
    null,
    2,
  );
}

function compactValue(value: unknown, maxLength = 120) {
  if (value === undefined || value === null || value === "") return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function getActionChips(step: Step): Array<{ label: string; tone?: "default" | "warning" | "danger" }> {
  const chips: Array<{ label: string; tone?: "default" | "warning" | "danger" }> = [];
  const spawn = step.metadata?.spawn;
  const approval = step.metadata?.approvalRequest;
  const durationLabel = formatDuration(spawn?.durationMs);

  if (spawn?.parentAgent && spawn?.childAgent) {
    chips.push({ label: `${spawn.parentAgent} -> ${spawn.childAgent}` });
  }
  if (durationLabel) {
    chips.push({ label: durationLabel });
  }
  if (approval?.context?.risk_level) {
    const risk = approval.context.risk_level;
    chips.push({
      label: `${risk} risk`,
      tone: risk === "critical" || risk === "high" ? "danger" : risk === "medium" ? "warning" : "default",
    });
  }
  const argsPreview = compactValue(approval?.context?.arguments_preview || approval?.arguments);
  if (argsPreview) {
    chips.push({ label: argsPreview });
  }
  if (step.metadata?.taskId) {
    chips.push({ label: String(step.metadata.taskId) });
  }
  if (step.metadata?.workflowId) {
    chips.push({ label: String(step.metadata.workflowId) });
  }
  if (typeof step.metadata?.tasksCompleted === "number" && typeof step.metadata?.totalTasks === "number") {
    chips.push({ label: `${step.metadata.tasksCompleted}/${step.metadata.totalTasks} tasks` });
  }
  if (typeof step.metadata?.durationMs === "number") {
    const workflowDuration = formatDuration(step.metadata.durationMs);
    if (workflowDuration) chips.push({ label: workflowDuration });
  }
  if (step.metadata?.assignedTo) {
    chips.push({ label: `assigned ${step.metadata.assignedTo}` });
  }
  if (step.metadata?.tier) {
    chips.push({ label: String(step.metadata.tier) });
  }
  if (step.metadata?.battlePlan?.agents_needed?.length) {
    chips.push({ label: `agents ${step.metadata.battlePlan.agents_needed.join(", ")}` });
  }
  return chips;
}

export function AgentActionStep({ step, isStreaming }: { step: Step; isStreaming?: boolean }) {
  const presentation = getActionPresentation(step);
  const Icon = presentation.Icon;
  const isRunning = step.status === "running" && isStreaming;
  const progress = step.metadata?.progressPercent;
  const approval = step.metadata?.approvalRequest;
  const [isExpanded, setIsExpanded] = useState(false);
  const canExpand = hasActionDetails(step);
  const eventTime = formatActionTime(step.timestamp);
  const chips = getActionChips(step);
  const delegationLane = buildAgentDelegationLaneModel(step);

  if (delegationLane) {
    return <AgentDelegationLane lane={delegationLane} />;
  }

  return (
    <div className="font-sans">
      <div className="flex min-h-8 items-start gap-2 rounded-md px-1 py-1 transition-colors hover:bg-white/[0.018]">
        <div className={cn("mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500", presentation.iconClass)}>
          <Icon className={cn("h-3.5 w-3.5", isRunning && "animate-spin")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              disabled={!canExpand}
              aria-expanded={canExpand ? isExpanded : undefined}
              onClick={() => canExpand && setIsExpanded(!isExpanded)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1 text-left",
                canExpand && "hover:text-zinc-300",
              )}
            >
              {canExpand && (
                <ChevronRight className={cn("h-3 w-3 shrink-0 text-zinc-600 transition-transform", isExpanded && "rotate-90")} />
              )}
              <span className={cn("min-w-0 flex-1 truncate text-[12px] capitalize leading-5 text-zinc-400", isRunning && "text-premium-shimmer")}>
              {presentation.label}
              </span>
            </button>
            {step.metadata?.iteration !== undefined && (
              <span className="font-mono text-[11px] text-zinc-600">
                iter {step.metadata.iteration}
              </span>
            )}
            {eventTime && <span className="shrink-0 font-mono text-[10px] text-zinc-700">{eventTime}</span>}
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
            <div className="line-clamp-2 text-[11px] leading-5 text-zinc-600">
              {presentation.detail}
            </div>
          )}
          {chips.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {chips.map((chip, idx) => (
                <span
                  key={`${chip.label}-${idx}`}
                  className={cn(
                    "max-w-full truncate rounded bg-white/[0.025] px-1.5 py-0.5 font-mono text-[10px] leading-none text-zinc-600",
                    chip.tone === "warning" && "bg-amber-400/10 text-amber-300/80",
                    chip.tone === "danger" && "bg-rose-400/10 text-rose-300/80",
                  )}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          )}
          <AssistantTaskPlanPreview step={step} />
          {typeof progress === "number" && (
            <div className="mt-1.5 h-px overflow-hidden bg-zinc-800">
              <div className="h-full bg-zinc-500 transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
          )}
          {approval && <InlineApprovalControls approval={approval} metadata={step.metadata} />}
          {isExpanded && (
            <div className="mt-1.5 rounded-md bg-white/[0.018] px-2 py-1.5">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Event details</div>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-500">
                {serializeActionDetails(step)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ApprovalRequest = NonNullable<NonNullable<Step["metadata"]>["approvalRequest"]>;
type ActionMetadata = NonNullable<Step["metadata"]>;

function InlineApprovalControls({ approval, metadata }: { approval: ApprovalRequest; metadata?: ActionMetadata }) {
  const toolCallId = approval.tool_call_id;
  const toolName = approval.tool_name || "tool";
  const context = approval.context;
  const risk = context?.risk_level;
  const argsPreview = compactValue(context?.arguments_preview || approval.arguments, 360);
  const agentLabel = [
    metadata?.agentName || metadata?.agentId,
    metadata?.iteration !== undefined ? `iter ${metadata.iteration}` : undefined,
  ].filter(Boolean).join(" ");

  return (
    <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.035] p-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-[11px] leading-5 text-amber-100/80">
          Permission needed for <code className="rounded bg-black/20 px-1.5 py-0.5 text-amber-100">{toolName}</code>
        </span>
        {risk && (
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] uppercase leading-none",
              risk === "critical" || risk === "high"
                ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
                : risk === "medium"
                  ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
                  : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
            )}
          >
            {risk} risk
          </span>
        )}
      </div>
      {context?.description && (
        <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">{context.description}</div>
      )}
      {agentLabel && (
        <div className="mt-1 font-mono text-[10px] leading-5 text-zinc-600">{agentLabel}</div>
      )}
      {argsPreview && (
        <pre className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words rounded bg-black/20 px-2 py-1 font-mono text-[10px] leading-relaxed text-zinc-500">
          {argsPreview}
        </pre>
      )}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          type="button"
          className="h-7 border-zinc-700/80 px-3 text-[11px] text-zinc-300 hover:bg-zinc-800"
          onClick={() => resolveToolApproval(toolCallId, false)}
        >
          Deny
        </Button>
        <Button
          size="sm"
          type="button"
          className="h-7 bg-amber-500/20 px-3 text-[11px] text-amber-100 hover:bg-amber-500/30"
          onClick={() => resolveToolApproval(toolCallId, true)}
        >
          Approve
        </Button>
        <Button
          size="sm"
          type="button"
          className="h-7 bg-zinc-800 px-3 text-[11px] text-zinc-100 hover:bg-zinc-700"
          onClick={() => resolveToolApproval(toolCallId, true, true)}
        >
          Always allow exact
        </Button>
      </div>
    </div>
  );
}

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
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
          )}
        </span>
        <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-zinc-300">Execution history</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
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
                  step.status === "completed" ? "bg-emerald-400" : "bg-zinc-600"
                )}
              />
            </span>
            <div className="flex min-h-8 min-w-0 items-center gap-2 rounded-md px-1 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-white/[0.018]">
              {step.status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-300" />
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
