import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export type SparklineTone = "primary" | "success" | "danger" | "warning" | "info" | "muted";
export type SparklineVariant = "area" | "line";

export interface SparklineProps {
  /**
   * Source series. Values are normalized against the local min/max so callers
   * do not need to pre-scale. NaN, null, and undefined entries are skipped
   * silently. When fewer than 2 valid entries are present, the component
   * renders a single baseline tick (8 px tall) so layout never collapses.
   */
  values: ReadonlyArray<number | null | undefined>;
  /** Visual style. `area` (default) draws a fill beneath the line; `line` is stroke-only. */
  variant?: SparklineVariant;
  /** Accent tone. Maps to the project's existing Tailwind palette tokens. */
  tone?: SparklineTone;
  /** Width of the SVG. Accepts a number (px) or any CSS length. Default `100%`. */
  width?: number | string;
  /** Height of the SVG in px. Default 40. */
  height?: number;
  /** Classname applied to the outer `<svg>`. */
  className?: string;
  /** Accessible name. When omitted, falls back to a generic "trend". */
  ariaLabel?: string;
}

const TONE_STROKE: Record<SparklineTone, string> = {
  primary: "stroke-primary",
  success: "stroke-emerald-400",
  danger: "stroke-rose-400",
  warning: "stroke-amber-400",
  info: "stroke-blue-400",
  muted: "stroke-muted-foreground/60",
};

const TONE_FILL: Record<SparklineTone, string> = {
  primary: "fill-primary/20",
  success: "fill-emerald-400/20",
  danger: "fill-rose-400/20",
  warning: "fill-amber-400/20",
  info: "fill-blue-400/20",
  muted: "fill-muted-foreground/15",
};

// Coordinate space is fixed at 100 x 100 so the SVG can use
// `preserveAspectRatio="none"` and stretch fluidly to whatever container
// width the caller provides.
const VB_W = 100;
const VB_H = 100;

// Build the path commands once per data change. We always render at full
// opacity and animate the entry via stroke-dashoffset so re-renders during
// data updates do not flash the entry animation again.
function buildPaths(values: ReadonlyArray<number | null | undefined>) {
  const clean = values.filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n),
  );
  if (clean.length < 2) {
    return { line: "", area: "", hasData: false };
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const step = VB_W / (clean.length - 1);
  let line = "";
  let area = "";
  clean.forEach((v, i) => {
    const x = i * step;
    const y = VB_H - ((v - min) / span) * VB_H;
    const cmd = i === 0 ? "M" : "L";
    line += `${cmd}${x.toFixed(2)},${y.toFixed(2)} `;
    if (i === 0) area += `M${x.toFixed(2)},${VB_H} L${x.toFixed(2)},${y.toFixed(2)} `;
    else area += `L${x.toFixed(2)},${y.toFixed(2)} `;
  });
  // Close the area path back to the baseline
  area += `L${VB_W.toFixed(2)},${VB_H} Z`;
  return { line: line.trimEnd(), area, hasData: true };
}

/**
 * Tiny in-card trend visualization. Renders one of two variants (`area`,
 * `line`) using `preserveAspectRatio="none"` so it stretches to fill any
 * container width while keeping the 100x100 viewBox coordinate space.
 *
 * On mount the line strokes itself in via `stroke-dashoffset` (RAF-driven,
 * respects `prefers-reduced-motion`); subsequent data updates do NOT replay
 * the entry animation — they snap to the new path, which is what you want
 * for live, frequently-changed series like stock tickers.
 *
 * Renders role="img" with an aria-label so screen readers announce it as a
 * single named graphic rather than reading the underlying path data.
 */
export function Sparkline({
  values,
  variant = "area",
  tone = "primary",
  width = "100%",
  height = 40,
  className,
  ariaLabel = "trend",
}: SparklineProps) {
  const shouldReduceMotion = useReducedMotion();
  const { line, area, hasData } = buildPaths(values);
  const pathRef = useRef<SVGPathElement>(null);
  const id = useId();
  const gradientId = `sparkline-grad-${id}`;
  // `hasAnimated` gates the entry animation: it plays once when data first
  // becomes available (covering the streaming/empty-on-mount-then-populated
  // case), then never replays on subsequent data updates so live tickers
  // don't strobe.
  const [hasAnimated, setHasAnimated] = useState(shouldReduceMotion);

  useEffect(() => {
    if (!hasData) {
      // Wait for data to arrive. Reset so the entry animation runs as soon
      // as the first non-empty series is committed.
      setHasAnimated(shouldReduceMotion);
      return;
    }
    if (shouldReduceMotion || hasAnimated || !pathRef.current) {
      setHasAnimated(true);
      return;
    }
    const node = pathRef.current;
    const length = node.getTotalLength();
    if (!length) {
      // Path hasn't measured yet (extremely rare): skip animation.
      setHasAnimated(true);
      return;
    }
    node.style.strokeDasharray = `${length}`;
    node.style.strokeDashoffset = `${length}`;
    let raf = 0;
    const start = performance.now();
    const duration = 600; // ms
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutQuint
      const eased = 1 - Math.pow(1 - t, 5);
      node.style.strokeDashoffset = `${length * (1 - eased)}`;
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setHasAnimated(true);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [hasData, line, shouldReduceMotion]);

  if (!hasData) {
    // Defensive collapse: a thin baseline keeps layout stable without
    // pretending we have data to visualize.
    return (
      <svg
        role="img"
        aria-label={ariaLabel}
        width={width}
        height={height}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        className={cn("block", className)}
      >
        <line
          x1="0"
          x2={VB_W}
          y1={VB_H / 2}
          y2={VB_H / 2}
          className="stroke-border/[0.4]"
          strokeWidth={1}
        />
      </svg>
    );
  }

  const showArea = variant === "area";

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      className={cn("block", className)}
    >
      {showArea && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.45} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={area}
            fill={showArea ? `url(#${gradientId})` : undefined}
            className={cn(TONE_FILL[tone], "text-current")}
            // The text color drives the gradient; the fill class is retained
            // so the area remains legible even when currentColor isn't honored
            // (e.g. when this SVG is embedded via CSS background).
            style={{ color: undefined }}
          />
        </>
      )}
      <path
        ref={pathRef}
        d={line}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={cn(TONE_STROKE[tone], !hasAnimated && "transition-none")}
      />
    </svg>
  );
}
