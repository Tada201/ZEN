import type { MouseEventHandler } from "react";
import { Activity, X } from "lucide-react";
import { cn } from "@/lib/utils/style";
import type { WorkbenchView } from "@/lib/features/workbenchRegistry";

interface WorkbenchTabButtonProps {
  view: WorkbenchView;
  selected: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  badge?: number;
  compact?: boolean;
  onClose?: () => void;
  label?: string;
}

/** Shared browser/editor-style workbench tab with an independent close control. */
export function WorkbenchTabButton({ view, selected, onClick, badge = 0, compact = false, onClose, label }: WorkbenchTabButtonProps) {
  const Icon = view.icon ?? Activity;
  const displayLabel = label || view.label;
  const badgeLabel = badge > 0 ? `, ${badge} pending approval${badge === 1 ? "" : "s"}` : "";

  return (
    <div className="group relative inline-flex shrink-0 items-center">
      <button
        type="button"
        data-workbench-tab={view.id}
        onClick={onClick}
        aria-expanded={selected}
        aria-label={`${displayLabel}${badgeLabel}`}
        aria-controls="zen-workbench-panel"
        title={view.description ? `${displayLabel}: ${view.description}` : displayLabel}
        className={cn(
          compact
            ? "relative flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors duration-200 motion-reduce:transition-none"
            : "relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors duration-200 motion-reduce:transition-none",
          selected ? "border-primary/30 bg-primary/10 pr-7 text-primary shadow-sm" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        <Icon size={20} strokeWidth={selected ? 2.5 : 2} aria-hidden="true" />
        {compact && <span className="truncate">{displayLabel}</span>}
        {badge > 0 && <span aria-hidden="true" className={cn("absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full border border-card bg-warning px-1 text-[9px] font-bold text-warning-foreground", compact && "right-0 top-0")}>{badge > 99 ? "99+" : badge}</span>}
        {selected && <span aria-hidden="true" className={cn("absolute -right-[5px] top-1.5 bottom-1.5 w-1 rounded-l-full bg-primary motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-1", compact && "bottom-0 left-1 right-1 top-auto h-0.5 w-auto rounded-t-full rounded-l-none")} />}
      </button>
      {compact && onClose && (
        <button
          type="button"
          aria-label={`Close ${displayLabel}`}
          title={`Close ${displayLabel}`}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="absolute right-1 top-1/2 z-10 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted-foreground/20 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
