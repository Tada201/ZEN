import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export type RingTone = "primary" | "success" | "danger" | "warning" | "info";

export interface RingProps {
  /**
   * Progress percentage in [0, 100]. Out-of-range values are clamped without warning.
   * NaN/undefined renders the empty track only.
   */
  value: number | null | undefined;
  /** Diameter in px. Default 64. */
  size?: number;
  /** Stroke width in px. Default 6. */
  stroke?: number;
  /** Accent tone. */
  tone?: RingTone;
  /** Accessible name, e.g., "Carbon footprint 42%". Falls back to "Progress". */
  ariaLabel?: string;
  /** Optional centered label (typically the primary numeric value). */
  children?: ReactNode;
  /** Classname applied to the outer `<span>`. */
  className?: string;
}

const TONE_STROKE: Record<RingTone, string> = {
  primary: "stroke-primary",
  success: "stroke-emerald-400",
  danger: "stroke-rose-400",
  warning: "stroke-amber-400",
  info: "stroke-blue-400",
};

const TONE_TRACK: Record<RingTone, string> = {
  primary: "stroke-primary/15",
  success: "stroke-emerald-400/15",
  danger: "stroke-rose-400/15",
  warning: "stroke-amber-400/15",
  info: "stroke-blue-400/15",
};

const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

/**
 * Circular progress ring. Two stacked SVG circles: a translucent track plus
 * an accented progress arc that draws itself in over 600 ms on mount via
 * `stroke-dashoffset`. Subsequent value changes re-trigger the same draw
 * animation only when `value` actually changes — no animation on identical
 * updates (avoids re-stroking on every parent re-render).
 *
 * Honors the app motion preference by snapping to the final state.
 */
export function Ring({
  value,
  size = 64,
  stroke = 6,
  tone = "primary",
  ariaLabel = "Progress",
  children,
  className,
}: RingProps) {
  const shouldReduceMotion = useReducedMotion();
  const progressRef = useRef<SVGCircleElement>(null);

  const safeValue =
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : 0;

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safeValue / 100);

  useEffect(() => {
    if (shouldReduceMotion || !progressRef.current) {
      return;
    }
    const node = progressRef.current;
    node.style.strokeDasharray = `${circumference}`;
    node.style.strokeDashoffset = `${circumference}`;
    let raf = 0;
    const start = performance.now();
    const duration = 600;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutQuint(t);
      node.style.strokeDashoffset = `${circumference * (1 - eased * (safeValue / 100))}`;
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // safeValue drives the rest state; circumference/radius are static.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeValue, shouldReduceMotion]);

  return (
    <span
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue)}
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className={TONE_TRACK[tone]}
        />
        <circle
          ref={progressRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cn(TONE_STROKE[tone], "transition-[stroke-dashoffset] duration-200")}
          // Snap-path for reduced motion: rely on the SVG attribute, not the
          // animated style, so SSR/initial paint matches the final state.
          strokeDashoffset={shouldReduceMotion ? dashOffset : undefined}
        />
      </svg>
      {children != null && (
        <span className="absolute inset-0 flex items-center justify-center text-center">
          {children}
        </span>
      )}
    </span>
  );
}
