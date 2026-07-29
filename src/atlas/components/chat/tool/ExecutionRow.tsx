import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  ChevronRight,
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
}

const STATUS_ICONS: Record<ExecutionStatus, LucideIcon> = {
  running: Loader2,
  completed: CheckCircle2,
  error: XCircle,
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
  running: "text-primary motion-safe:animate-spin",
  completed: "text-success",
  error: "text-destructive",
  awaiting_approval: "text-warning",
};

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
}: ExecutionRowProps) {
  const Icon = STATUS_ICONS[status];
  const clickable = Boolean(onClick);
  const containerClassName = cn(
    "flex w-full min-w-0 items-center gap-2 rounded-md border border-border bg-card text-left transition-colors duration-200",
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
        className={containerClassName}
      >
        <ExecutionRowContent
          status={status}
          title={title}
          subtitle={subtitle}
          duration={duration}
          expanded={expanded}
          badge={badge}
          statusLabel={statusLabel}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={containerClassName}
    >
      <Icon
        aria-label={statusLabel}
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-colors duration-200",
          STATUS_ICON_CLASS[status],
        )}
      />

      <span className="min-w-0 flex-1 py-1.5 pl-0.5">
        <span className="block min-w-0 truncate text-[12px] font-medium leading-5 text-foreground">
          {title}
        </span>
        {subtitle && (
          <span className="block min-w-0 truncate text-[11px] leading-4 text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>

      {badge}

      {duration && (
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {duration}
        </span>
      )}

      {expanded !== undefined && (
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
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
}

function ExecutionRowContent({
  status,
  title,
  subtitle,
  duration,
  expanded,
  badge,
  statusLabel,
}: ExecutionRowContentProps) {
  const Icon = STATUS_ICONS[status];
  return (
    <>
      <Icon
        aria-label={statusLabel}
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-colors duration-200",
          STATUS_ICON_CLASS[status],
        )}
      />

      <span className="min-w-0 flex-1 py-1.5 pl-0.5">
        <span className="block min-w-0 truncate text-[12px] font-medium leading-5 text-foreground">
          {title}
        </span>
        {subtitle && (
          <span className="block min-w-0 truncate text-[11px] leading-4 text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>

      {badge}

      {duration && (
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {duration}
        </span>
      )}

      {expanded !== undefined && (
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90",
          )}
          aria-hidden="true"
        />
      )}
    </>
  );
}
