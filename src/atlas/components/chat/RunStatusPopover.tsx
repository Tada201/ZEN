import {
  Bot,
  Check,
  CircleDashed,
  FileText,
  Image as ImageIcon,
  ListChecks,
  SlidersHorizontal,
  TerminalSquare,
} from "lucide-react";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

function PlaceholderRow({
  icon: Icon,
  children,
  muted = false,
}: {
  icon: typeof FileText;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-[11px] ${muted ? "text-muted-foreground/70" : "text-foreground"}`}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof FileText;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 pb-1.5 pt-2.5">
      <div className="flex items-center gap-2 text-[11px] font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span>{title}</span>
      </div>
      {action}
    </div>
  );
}

/**
 * Static run-status surface based on the Codex workbench status popover.
 * The rows are intentionally placeholders for now; execution, subagent,
 * process, and source data will be connected in a later pass.
 */
export function RunStatusPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="codex-focus h-7 w-7 shrink-0 rounded-md border border-transparent text-muted-foreground hover:border-[var(--codex-border)] hover:bg-[var(--codex-surface-muted)] hover:text-foreground data-[state=open]:border-[var(--codex-border)] data-[state=open]:bg-[var(--codex-surface-muted)] data-[state=open]:text-foreground"
          aria-label="Open run status"
          title="Run status"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        // The content is portaled outside WorkspaceLayout. The layout
        // publishes this value so the popover follows the live right-panel
        // open/collapsed and resize states without a fixed offset.
        style={{ marginRight: "var(--zen-right-panel-offset, 0px)" }}
        className="w-[min(19rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border-[var(--codex-border)] bg-[var(--codex-surface-muted)] p-0 text-[var(--codex-text)] shadow-2xl shadow-black/30"
      >
        <div className="flex max-h-[min(74vh,36rem)] flex-col overflow-y-auto">
          <div className="flex items-center justify-between border-b border-[var(--codex-border)] px-2.5 py-2">
            <div className="flex items-center gap-2 text-[12px] font-semibold">
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Run status</span>
            </div>
            <span className="rounded-full border border-[var(--codex-border)] bg-[var(--codex-surface)] px-1.5 py-0.5 text-[9px] text-muted-foreground">
              Placeholder
            </span>
          </div>

          <section className="border-b border-[var(--codex-border)] pb-1.5">
            <SectionHeader
              icon={CircleDashed}
              title="Goal command"
              action={<span className="text-[10px] text-muted-foreground">Not started</span>}
            />
            <div className="mx-2.5 flex items-center gap-2 rounded-lg border border-dashed border-[var(--codex-border)] bg-[var(--codex-surface)] px-2.5 py-2 text-[10px] text-muted-foreground">
              <CircleDashed className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>No goal command has been defined yet.</span>
            </div>
          </section>

          <section className="border-b border-[var(--codex-border)] pb-1.5">
            <SectionHeader
              icon={ListChecks}
              title="TODO list"
            />
            <PlaceholderRow icon={Check} muted>No tasks have been created yet.</PlaceholderRow>
          </section>

          <section className="border-b border-[var(--codex-border)] pb-1.5">
            <SectionHeader icon={Bot} title="Subagents" />
            <PlaceholderRow icon={Bot} muted>No active subagents.</PlaceholderRow>
          </section>

          <section className="border-b border-[var(--codex-border)] pb-1.5">
            <SectionHeader icon={TerminalSquare} title="Background processes" />
            <PlaceholderRow icon={TerminalSquare} muted>No background processes.</PlaceholderRow>
          </section>

          <section className="pb-1.5">
            <SectionHeader
              icon={FileText}
              title="Sources"
            />
            <PlaceholderRow icon={FileText} muted>Files will appear here.</PlaceholderRow>
            <PlaceholderRow icon={ImageIcon} muted>Images will appear here.</PlaceholderRow>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}
