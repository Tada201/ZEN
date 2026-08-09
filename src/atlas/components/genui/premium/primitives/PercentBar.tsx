import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export type PercentBarTone = "primary" | "success" | "danger" | "warning" | "info";

export type PercentBarVariant = "single" | "range";

export interface PercentBarRange {
  /** Low end of the range band, in `unit`s. */
  low: number;
  /** High end of the range band, in `unit`s. */
  high: number;
  /** Current value marker, in `unit`s. Rendered as a thin vertical tick. */
  current: number;
}

export interface PercentBarProps {
  /**
   * Current fill value in [0, max]. Required for `variant="single"` (the
   * default); IGNORED when `variant="range"` is set, since the marker
   * position comes from `range.current`. Made optional so the range
   * variant can omit it without a type error.
   */
  value?: number;
  /** Maximum of the scale. Default 100. */
  max?: number;
  variant?: PercentBarVariant;
  /**
   * Required for variant="range". Defines the track band (low..high) and
   * the marker position (current). All three values are expressed in the
   * same numeric units as `value` and `max`.
   */
  range?: PercentBarRange;
  tone?: PercentBarTone;
  /** Track height in px. Default 8. Single variant; range tracks are always 16 px tall to host the marker. */
  height?: number;
  className?: string;
  ariaLabel?: string;
}

const TONE_FILL: Record<PercentBarTone, string> = {
  primary: "bg-primary",
  success: "bg-emerald-400",
  danger: "bg-rose-400",
  warning: "bg-amber-400",
  info: "bg-blue-400",
};

const TONE_FILL_FADED: Record<PercentBarTone, string> = {
  primary: "bg-primary/25",
  success: "bg-emerald-400/25",
  danger: "bg-rose-400/25",
  warning: "bg-amber-400/25",
  info: "bg-blue-400/25",
};

const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

/**
 * Horizontal progress bar with two variants:
 *  - `single` (default): a track + animated fill, value 0..max.
 *  - `range`: a faint band from `range.low` to `range.high` on the track,
 *    plus a vertical tick at `range.current`. Useful for "where in the
 *    expected range is this value?".
 *
 * Single-variant fill animates its width from 0% to value/max% on mount
 * (and on every value change) over 600 ms. Honors the app motion preference.
 */
export function PercentBar({
  value,
  max = 100,
  variant = "single",
  range,
  tone = "primary",
  height = 8,
  className,
  ariaLabel,
}: PercentBarProps) {
  const shouldReduceMotion = useReducedMotion();
  const fillRef = useRef<HTMLDivElement>(null);

  const safeMax = max > 0 ? max : 1;
  // `value` is optional because the range variant ignores it entirely.
  // Default to 0 so the width math never produces NaN.
  const safeValue = Math.max(0, Math.min(safeMax, value ?? 0));
  const percent = (safeValue / safeMax) * 100;

  useEffect(() => {
    if (variant !== "single") return;
    if (shouldReduceMotion || !fillRef.current) {
      if (fillRef.current) fillRef.current.style.width = `${percent}%`;
      return;
    }
    const node = fillRef.current;
    node.style.width = "0%";
    let raf = 0;
    const start = performance.now();
    const duration = 600;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutQuint(t);
      node.style.width = `${percent * eased}%`;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [percent, shouldReduceMotion, variant]);

  if (variant === "range") {
    if (!range) {
      // Defensive: caller asked for range but didn't supply one. Render an
      // empty track so layout never collapses.
      return (
        <div
          className={cn("w-full rounded-full bg-border/[0.15]", className)}
          style={{ height: 16 }}
          aria-hidden
        />
      );
    }
    const lowPct = Math.max(0, Math.min(100, (range.low / safeMax) * 100));
    const highPct = Math.max(0, Math.min(100, (range.high / safeMax) * 100));
    const currentPct = Math.max(
      0,
      Math.min(100, (range.current / safeMax) * 100),
    );
    return (
      <div
        className={cn("relative w-full rounded-full bg-border/[0.15]", className)}
        style={{ height: 16 }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={Math.round(range.current)}
        aria-label={ariaLabel}
      >
        {/* Faint range band */}
        <div
          className={cn("absolute top-1/2 -translate-y-1/2 rounded-full", TONE_FILL_FADED[tone])}
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%`, height: 8 }}
        />
        {/* Marker */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[2px] rounded-full",
            TONE_FILL[tone],
          )}
          style={{ left: `${currentPct}%`, height: 16 }}
          aria-hidden
        />
      </div>
    );
  }

  // variant === "single"
  return (
    <div
      ref={fillRef as React.RefObject<HTMLDivElement>}
      className={cn(
        "w-full rounded-full bg-border/[0.15] overflow-hidden",
        className,
      )}
      style={{ height }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(safeValue)}
      aria-label={ariaLabel}
    >
      <div
        className={cn("h-full rounded-full transition-[background-color]", TONE_FILL[tone])}
        // width is animated imperatively above; this inline style is the
        // reduced-motion rest state.
        style={shouldReduceMotion ? { width: `${percent}%` } : undefined}
      />
    </div>
  );
}
