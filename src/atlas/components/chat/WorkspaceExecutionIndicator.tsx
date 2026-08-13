import { AlertCircle, Check, Circle, Loader2, Pause, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Message } from "./types";
import { deriveWorkspaceExecutionStatus } from "./workspaceExecutionStatus";
import { motionDurations, motionEasings, useReducedMotion } from "@/lib/motion";

export function WorkspaceExecutionIndicator({
  messages,
  isStreaming,
  hideWhenIdle = false,
  onOpenApprovals,
  onOpenAgents,
}: {
  messages: Message[];
  isStreaming: boolean;
  /** Dense chrome (the window title bar) omits "Ready"; only live state earns space. */
  hideWhenIdle?: boolean;
  onOpenApprovals: () => void;
  onOpenAgents: () => void;
}) {
  const status = deriveWorkspaceExecutionStatus(messages, isStreaming);
  const reducedMotion = useReducedMotion();
  if (hideWhenIdle && status.kind === "idle") return null;
  const isActionable = status.kind === "approval" || status.kind === "running" || status.kind === "paused" || status.kind === "review" || status.kind === "error";
  const Icon = status.kind === "approval"
    ? ShieldAlert
    : status.kind === "running"
      ? Loader2
      : status.kind === "paused"
        ? Pause
        : status.kind === "review" || status.kind === "error"
          ? AlertCircle
          : status.kind === "completed"
          ? Check
          : Circle;
  const openPanel = status.kind === "approval" ? onOpenApprovals : onOpenAgents;
  const label = `${status.label}. ${status.detail}.`;

  const content = (
    <AnimatePresence initial={false} mode="wait">
      <motion.span
        key={`${status.kind}:${status.label}:${status.detail}`}
        initial={reducedMotion ? false : { opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reducedMotion ? undefined : { opacity: 0, y: -2 }}
        transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.fast, ease: motionEasings.standard }}
        className="inline-flex min-w-0 items-center gap-1.5"
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            status.kind === "running" && "animate-spin",
          )}
          aria-hidden="true"
        />
        <span className="truncate">{status.label}</span>
        <span className="hidden truncate text-[10px] font-normal text-muted-foreground sm:inline">
          {status.detail}
        </span>
      </motion.span>
    </AnimatePresence>
  );

  if (!isActionable) {
    return (
      <div
        className={cn("workspace-execution-status", `workspace-execution-status--${status.kind}`)}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy={status.kind === "running"}
        aria-label={label}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "workspace-execution-status",
        `workspace-execution-status--${status.kind}`,
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
      onClick={openPanel}
      aria-label={`${label} Open related workbench panel.`}
      aria-live="polite"
      aria-atomic="true"
      aria-busy={status.kind === "running"}
    >
      {content}
    </button>
  );
}
