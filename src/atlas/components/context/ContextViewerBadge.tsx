import { memo, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils/style";
import {
  effectiveWindow,
  formatTokens,
  SECTION_CATEGORY_COLOR,
  SECTION_CATEGORY_LABEL,
  SECTION_CATEGORY_ORDER,
  utilizationStatus,
  type SectionCategory,
} from "@/lib/types/contextBreakdown";
import { useContextStore, selectLatestBreakdown } from "@/lib/stores/useContextStore";
import { contextApi } from "@/api/contextApi";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Circular gauge geometry. Kept small enough to sit inline in the chat
// input toolbar; the stroke arc encodes 0–100% of the model window.
const GAUGE_SIZE = 24;
const GAUGE_STROKE = 2.5;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

interface ContextViewerBadgeProps {
  chatId: string | null | undefined;
  className?: string;
}

// Compact label/value stat cell for the popover's extra-stats grid.
function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <p className="text-[9px] uppercase tracking-widest font-black text-muted-foreground leading-none">
        {label}
      </p>
      <p className="text-xs font-bold tabular-nums text-foreground leading-none">
        {value}
        {hint && (
          <span className="text-[10px] font-medium text-muted-foreground">
            {" "}
            {hint}
          </span>
        )}
      </p>
    </div>
  );
}

export const ContextViewerBadge = memo(function ContextViewerBadge({
  chatId,
  className,
}: ContextViewerBadgeProps) {
  const breakdown = useContextStore((s) => selectLatestBreakdown(s, chatId));

  // Cold-start hydrate: if the user opens a chat mid-run (or after a
  // reload) the live subscription in useContextBridge will not have an
  // entry yet. Fetch the cached snapshot once per chatId change so the
  // badge reflects the last finished iteration immediately.
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    contextApi
      .getBreakdown(chatId)
      .then((payload) => {
        if (cancelled || !payload) return;
        useContextStore.getState().apply(payload);
      })
      .catch(() => {
        // Snapshot is best-effort; missing data is acceptable.
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  const summary = useMemo(() => {
    if (!breakdown) {
      return {
        tokens: 0,
        window: 100_000,
        utilization: 0,
        status: "calm" as const,
        truncatedCount: 0,
      };
    }
    // Gauge against the real model window when known, matching the
    // popover/panel denominator; falls back to the compaction cap.
    const window = effectiveWindow(breakdown);
    const utilization = window > 0 ? breakdown.totalTokens / window : 0;
    const truncatedCount = breakdown.sections.filter(
      (s) => s.isTruncated,
    ).length;
    return {
      tokens: breakdown.totalTokens,
      window,
      utilization,
      status: utilizationStatus(utilization),
      truncatedCount,
    };
  }, [breakdown]);

  // Per-category composition, ordered by the shared taxonomy. Each entry
  // carries its share of the *used* tokens (for the bar) and its share of
  // the whole window (the figure the user cares about).
  const composition = useMemo(() => {
    if (!breakdown) return [];
    const counts: Record<string, number> = {};
    breakdown.sections.forEach((s) => {
      counts[s.category] = (counts[s.category] ?? 0) + s.tokens;
    });
    return SECTION_CATEGORY_ORDER.map((category) => {
      const tokens = counts[category] ?? 0;
      return {
        category,
        tokens,
        shareOfUsed: summary.tokens > 0 ? tokens / summary.tokens : 0,
        shareOfWindow: summary.window > 0 ? tokens / summary.window : 0,
      };
    }).filter((row) => row.tokens > 0);
  }, [breakdown, summary.tokens, summary.window]);

  // Extra stats surfaced in the popover. All derived from data already in
  // the breakdown — free headroom, the soft compaction cap (distinct from
  // the model's hardware window), the live iteration, section counts, and
  // the most recent compaction event.
  const stats = useMemo(() => {
    if (!breakdown) return null;
    const free = Math.max(0, summary.window - summary.tokens);
    const softCap = breakdown.contextWindow;
    const modelWindow = breakdown.modelContextWindow;
    // Only worth showing the soft cap separately when it differs from the
    // denominator the gauge already uses (the model window).
    const showSoftCap =
      softCap > 0 && Math.abs(softCap - summary.window) > 1;
    const capUtilization = softCap > 0 ? breakdown.totalTokens / softCap : 0;
    return {
      free,
      freePct: summary.window > 0 ? free / summary.window : 0,
      iteration: breakdown.iteration,
      sectionCount: breakdown.sections.length,
      activeCount: breakdown.sections.filter((s) => s.isActive).length,
      mustKeepTokens: breakdown.sections
        .filter((s) => s.isMustKeep)
        .reduce((sum, s) => sum + s.tokens, 0),
      softCap,
      showSoftCap,
      modelWindow,
      capUtilization,
      compaction: breakdown.compactionEvent,
    };
  }, [breakdown, summary.window, summary.tokens]);

  const statusColors = useMemo(() => {
    switch (summary.status) {
      case "rose":
        return { stroke: "stroke-rose-400", text: "text-rose-400", ring: "focus-visible:ring-rose-400/40" };
      case "amber":
        return { stroke: "stroke-amber-400", text: "text-amber-400", ring: "focus-visible:ring-amber-400/40" };
      case "calm":
      default:
        return { stroke: "stroke-emerald-400", text: "text-emerald-400", ring: "focus-visible:ring-emerald-400/40" };
    }
  }, [summary.status]);

  const pct = Math.min(100, Math.round(summary.utilization * 100));
  const dashOffset =
    GAUGE_CIRCUMFERENCE * (1 - Math.min(1, summary.utilization));

  const title = `Context: ${formatTokens(summary.tokens)} / ${formatTokens(
    summary.window,
  )} (${pct}%) — click for composition`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`View agentic context breakdown — ${pct}% of window used`}
          data-testid="context-viewer-badge"
          title={title}
          className={cn(
            "relative inline-flex items-center justify-center rounded-full transition-transform hover:scale-105 select-none focus:outline-none focus-visible:ring-2",
            statusColors.ring,
            className,
          )}
          style={{ width: GAUGE_SIZE, height: GAUGE_SIZE }}
        >
          <svg
            width={GAUGE_SIZE}
            height={GAUGE_SIZE}
            viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
            className="-rotate-90"
            aria-hidden
          >
            {/* Track */}
            <circle
              cx={GAUGE_SIZE / 2}
              cy={GAUGE_SIZE / 2}
              r={GAUGE_RADIUS}
              fill="none"
              strokeWidth={GAUGE_STROKE}
              className="stroke-muted/40"
            />
            {/* Progress arc */}
            <circle
              cx={GAUGE_SIZE / 2}
              cy={GAUGE_SIZE / 2}
              r={GAUGE_RADIUS}
              fill="none"
              strokeWidth={GAUGE_STROKE}
              strokeLinecap="round"
              strokeDasharray={GAUGE_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              className={cn("transition-[stroke-dashoffset] duration-500", statusColors.stroke)}
            />
          </svg>
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center text-[8px] font-bold tabular-nums leading-none",
              statusColors.text,
            )}
          >
            {pct}
          </span>
          {summary.truncatedCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-background"
              aria-hidden
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-64 p-3 space-y-3"
      >
        {/* Header: total usage against the window */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">
              Context Window
            </span>
            <span className={cn("text-[10px] font-bold tabular-nums", statusColors.text)}>
              {pct}%
            </span>
          </div>
          <p className="text-sm font-black tabular-nums tracking-tight text-foreground">
            {formatTokens(summary.tokens)}
            <span className="text-[11px] text-muted-foreground font-medium">
              {" "}/ {formatTokens(summary.window)}
            </span>
          </p>
          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500",
                summary.status === "rose"
                  ? "bg-rose-400"
                  : summary.status === "amber"
                    ? "bg-amber-400"
                    : "bg-emerald-400",
              )}
              style={{ width: `${Math.min(100, summary.utilization * 100)}%` }}
            />
          </div>
        </div>

        {/* Extra stats: headroom, iteration, section counts, soft cap */}
        {stats && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/40 pt-2.5">
            <Stat
              label="Free"
              value={formatTokens(stats.free)}
              hint={`${(stats.freePct * 100).toFixed(0)}% left`}
            />
            <Stat
              label="Iteration"
              value={stats.iteration > 0 ? `#${stats.iteration}` : "—"}
            />
            <Stat
              label="Sections"
              value={`${stats.sectionCount}`}
              hint={`${stats.activeCount} active`}
            />
            <Stat
              label="Pinned"
              value={formatTokens(stats.mustKeepTokens)}
              hint="must-keep"
            />
            {stats.showSoftCap && (
              <Stat
                label="Soft cap"
                value={formatTokens(stats.softCap)}
                hint={`${(stats.capUtilization * 100).toFixed(0)}% used`}
                className="col-span-2"
              />
            )}
          </div>
        )}

        {/* Compaction: only when the last iteration reclaimed context */}
        {stats?.compaction && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-[10px]">
            <span className="uppercase tracking-wider font-bold text-muted-foreground">
              {stats.compaction.kind} compaction
            </span>
            <span className="font-mono tabular-nums text-emerald-400">
              −{formatTokens(
                Math.max(
                  0,
                  stats.compaction.preTokens - stats.compaction.postTokens,
                ),
              )}
            </span>
          </div>
        )}

        {/* Composition: what each layer contributes to the window */}
        {composition.length > 0 ? (
          <div className="space-y-1.5 border-t border-border/40 pt-2.5">
            <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">
              Composition
            </span>
            <ul className="space-y-1.5">
              {composition.map((row) => (
                <li key={row.category} className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{
                        backgroundColor:
                          SECTION_CATEGORY_COLOR[row.category as SectionCategory],
                      }}
                      aria-hidden
                    />
                    <span className="text-foreground truncate flex-1">
                      {SECTION_CATEGORY_LABEL[row.category as SectionCategory]}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground shrink-0">
                      {formatTokens(row.tokens)}
                    </span>
                    <span className="font-mono tabular-nums text-foreground/70 shrink-0 w-9 text-right">
                      {(row.shareOfWindow * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${Math.max(2, Math.round(row.shareOfUsed * 100))}%`,
                        backgroundColor:
                          SECTION_CATEGORY_COLOR[row.category as SectionCategory],
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {summary.truncatedCount > 0 && (
              <p className="text-[10px] text-amber-400/90 pt-0.5">
                {summary.truncatedCount} section(s) truncated to fit the budget.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2.5">
            Waiting for the next LLM iteration to report composition.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
});

export default ContextViewerBadge;
