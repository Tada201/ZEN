import { AlertCircle, Check, Circle, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "./types";
import { deriveWorkspaceExecutionStatus } from "./workspaceExecutionStatus";

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
  if (hideWhenIdle && status.kind === "idle") return null;
  const isActionable = status.kind === "approval" || status.kind === "running" || status.kind === "error";
  const Icon = status.kind === "approval"
    ? ShieldAlert
    : status.kind === "running"
      ? Loader2
      : status.kind === "error"
        ? AlertCircle
        : status.kind === "completed"
          ? Check
          : Circle;
  const openPanel = status.kind === "approval" ? onOpenApprovals : onOpenAgents;
  const label = `${status.label}. ${status.detail}.`;

  const content = (
    <>
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          status.kind === "running" && "motion-safe:animate-spin",
        )}
        aria-hidden="true"
      />
      <span className="truncate">{status.label}</span>
      <span className="hidden truncate text-[10px] font-normal text-muted-foreground sm:inline">
        {status.detail}
      </span>
    </>
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
