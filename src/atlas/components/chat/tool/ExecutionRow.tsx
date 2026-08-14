import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCategory } from "./toolCategory";

export type ExecutionStatus =
  | "running"
  | "completed"
  | "error"
  | "interrupted"
  | "awaiting_approval";

interface ExecutionRowProps {
  status: ExecutionStatus;
  category?: ToolCategory;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  duration?: string;
  /** Whether the row body is expanded (controls chevron rotation). */
  expanded?: boolean;
  className?: string;
  onClick?: () => void;
  /** Optional extra node rendered between the text and the chevron. */
  badge?: React.ReactNode;
  /** Accessible label for the status icon. */
  statusLabel?: string;
  /** Quiet Codex-style ledger row: use a small status dot instead of a card icon. */
  variant?: "card" | "ledger";
}

const STATUS_ICONS: Record<ExecutionStatus, LucideIcon> = {
  running: Loader2,
  completed: CheckCircle2,
  error: XCircle,
  interrupted: XCircle,
  awaiting_approval: ShieldAlert,
};

// Category palette mapped to the theme's semantic tokens. We deliberately
// avoid hardcoded one-off hex/neon colors; these borders are shared signals
// across tool cards, execution traces, and grouped summaries.
const CATEGORY_BORDER: Record<ToolCategory, string> = {
  edit: "border-l-warning",
  run: "border-l-primary",
  read: "border-l-accent",
  search: "border-l-muted-foreground",
  delegate: "border-l-primary",
  approval: "border-l-warning",
  error: "border-l-destructive",
  generic: "",
};

const STATUS_ICON_CLASS: Record<ExecutionStatus, string> = {
  running: "text-primary animate-spin",
  completed: "text-success",
  error: "text-destructive",
  interrupted: "text-warning",
  awaiting_approval: "text-warning",
};

export function normalizeExecutionRowStatus(value: string | undefined): ExecutionStatus {
  const normalized = (value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "completed":
    case "complete":
    case "done":
    case "success":
    case "succeeded":
      return "completed";
    case "error":
    case "errored":
    case "failed":
    case "failure":
      return "error";
    case "cancelled":
    case "canceled":
    case "stopped":
    case "aborted":
    case "interrupted":
      return "interrupted";
    case "awaiting_approval":
    case "waiting_for_approval":
    case "approval_required":
    case "approval":
      return "awaiting_approval";
    default:
      // Unknown or missing backend phases are treated as active rather than
      // crashing the row. The next lifecycle event can resolve the final state.
      return "running";
  }
}

export function getExecutionStatusLabel(status: ExecutionStatus) {
  if (status === "awaiting_approval") return "Needs approval";
  if (status === "completed") return "Complete";
  if (status === "error") return "Failed";
  if (status === "interrupted") return "Interrupted";
  return "Running";
}

/**
 * A single-line execution row primitive used for tool calls, subagent
 * delegations, approval requests, and grouped execution summaries.
 *
 * Design notes:
 * - Uses a thin left border color to signal the tool category.
 * - Uses semantic status icons + colors (no hardcoded blue/green/red dots).
 * - Avoids low-opacity surface/text colors per frontend surface rules.
 * - Keyboard focusable, with aria-expanded forwarded from the consumer.
 */
export function ExecutionRow({
  status,
  category = "generic",
  title,
  subtitle,
  duration,
  expanded,
  className,
  onClick,
  badge,
  statusLabel,
  variant = "card",
}: ExecutionRowProps) {
  const resolvedStatus = normalizeExecutionRowStatus(status);
  const Icon = STATUS_ICONS[resolvedStatus] ?? Circle;
  const resolvedStatusLabel = statusLabel || getExecutionStatusLabel(resolvedStatus);
  const resolvedAriaLabel = [
    typeof title === "string" ? title : undefined,
    resolvedStatusLabel,
    duration ? `Duration ${duration}` : undefined,
  ].filter(Boolean).join(", ");
  const clickable = Boolean(onClick);
  const containerClassName = cn(
    "execution-row flex w-full min-w-0 items-center gap-2 rounded-md border border-border bg-card text-left transition-colors duration-200 font-sans",
    category !== "generic" && "border-l-[3px]",
    CATEGORY_BORDER[category],
    clickable && "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    !clickable && "cursor-default",
    className,
  );

  if (!clickable) {
    return (
      <div
        aria-expanded={expanded}
        aria-busy={resolvedStatus === "running"}
        data-status={resolvedStatus}
        className={containerClassName}
      >
        <ExecutionRowContent
          status={resolvedStatus}
          title={title}
          subtitle={subtitle}
          duration={duration}
          expanded={expanded}
          badge={badge}
          statusLabel={statusLabel}
          variant={variant}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-busy={resolvedStatus === "running"}
      data-status={resolvedStatus}
      aria-label={resolvedAriaLabel}
      className={containerClassName}
    >
      {variant === "ledger" ? (
        <span
          className={cn("execution-row-status-dot h-1.5 w-1.5 shrink-0 rounded-full", `execution-row-status-dot--${resolvedStatus}`)}
          aria-hidden="true"
        />
      ) : (
        <Icon
          aria-label={resolvedStatusLabel}
          className={cn(
            "execution-row-icon h-3.5 w-3.5 shrink-0 transition-colors duration-200",
            STATUS_ICON_CLASS[resolvedStatus],
          )}
        />
      )}
      <span className="execution-row-copy min-w-0 flex-1 items-baseline gap-2 py-1.5 pl-0.5">
        <span className={cn(
          "execution-row-title min-w-0 truncate text-[12px] font-medium leading-5",
          resolvedStatus === "running" ? "animate-shimmer-text" : "text-foreground",
        )}>
          {title}
        </span>
        {subtitle && (
          <span className="execution-row-subtitle min-w-0 truncate text-[11px] leading-4 text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>

      {badge}

      {duration && (
        <span className="execution-row-meta shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {duration}
        </span>
      )}

      {(variant === "ledger" || resolvedStatus !== "completed") && (
        <span
          className={cn(
            "execution-row-status shrink-0 text-[11px]",
            resolvedStatus === "running" && "text-primary",
            resolvedStatus === "awaiting_approval" && "text-warning",
            resolvedStatus === "error" && "text-destructive",
            resolvedStatus === "interrupted" && "text-warning",
            resolvedStatus === "completed" && "text-success",
          )}
        >
          {resolvedStatusLabel}
        </span>
      )}

      {expanded !== undefined && (
        <ChevronRight
          className={cn(
            "execution-row-chevron h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90",
          )}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

interface ExecutionRowContentProps {
  status: ExecutionStatus;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  duration?: string;
  expanded?: boolean;
  badge?: React.ReactNode;
  statusLabel?: string;
  variant?: "card" | "ledger";
}

function ExecutionRowContent({
  status,
  title,
  subtitle,
  duration,
  expanded,
  badge,
  statusLabel,
  variant = "card",
}: ExecutionRowContentProps) {
  const resolvedStatus = normalizeExecutionRowStatus(status);
  const Icon = STATUS_ICONS[resolvedStatus] ?? Circle;
  const resolvedStatusLabel = statusLabel || getExecutionStatusLabel(resolvedStatus);
  return (
    <>
      {variant === "ledger" ? (
        <span
          className={cn("execution-row-status-dot h-1.5 w-1.5 shrink-0 rounded-full", `execution-row-status-dot--${resolvedStatus}`)}
          aria-hidden="true"
        />
      ) : (
        <Icon
          aria-label={resolvedStatusLabel}
          className={cn(
            "execution-row-icon h-3.5 w-3.5 shrink-0 transition-colors duration-200",
            STATUS_ICON_CLASS[resolvedStatus],
          )}
        />
      )}
      <span className="execution-row-copy min-w-0 flex-1 items-baseline gap-2 py-1.5 pl-0.5">
        <span className={cn(
          "execution-row-title min-w-0 truncate text-[12px] font-medium leading-5",
          resolvedStatus === "running" ? "animate-shimmer-text" : "text-foreground",
        )}>
          {title}
        </span>
        {subtitle && (
          <span className="execution-row-subtitle min-w-0 truncate text-[11px] leading-4 text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>

      {badge}

      {duration && (
        <span className="execution-row-meta shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {duration}
        </span>
      )}

      {(variant === "ledger" || resolvedStatus !== "completed") && (
        <span
          className={cn(
            "execution-row-status shrink-0 text-[11px]",
            resolvedStatus === "running" && "text-primary",
            resolvedStatus === "awaiting_approval" && "text-warning",
            resolvedStatus === "error" && "text-destructive",
            resolvedStatus === "interrupted" && "text-warning",
            resolvedStatus === "completed" && "text-success",
          )}
        >
          {resolvedStatusLabel}
        </span>
      )}

      {expanded !== undefined && (
        <ChevronRight
          className={cn(
            "execution-row-chevron h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90",
          )}
          aria-hidden="true"
        />
      )}
    </>
  );
}
