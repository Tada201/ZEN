import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export interface CountUpProps {
  /**
   * Target value. Numbers animate from the previous displayed value to this
   * target. Strings are stripped of non-numeric separators (currency symbols,
   * thousands commas, percent signs) and parsed. Pass null/undefined or a
   * non-numeric ReactNode to render the fallback (or the value as-is when it
   * is a non-parseable primitive).
   */
  value: number | string | null | undefined;
  /**
   * Render the current animated number. Default formats with
   * `n.toLocaleString()` using decimals auto-detected from the target.
   * Use this to add a currency symbol, percent suffix, etc.
   */
  format?: (n: number) => string;
  /** Animation duration in seconds. Default 0.6. */
  duration?: number;
  /** Easing function (input/output in [0, 1]). Default easeOutQuint. */
  easing?: (t: number) => number;
  /** Render when value is null/NaN. Default `"—"`. */
  fallback?: ReactNode;
  /** Classname applied to the wrapping `<span>`. */
  className?: string;
}

const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

function parseNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    // Strip currency symbols, percent signs, thousands separators, and any
    // other non-numeric glyph so "$1,234.50" and "30%" both parse cleanly.
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function defaultFormat(value: number): string {
  const str = String(value);
  const dot = str.indexOf(".");
  const decimals =
    dot === -1
      ? 0
      : Math.min(8, str.length - dot - 1);
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Renders a numeric value that tweens from its previous displayed value to
 * the current target on mount and on every change. Falls back to a static
 * placeholder when the value is missing or unparseable, and renders the
 * value as-is when it is a non-numeric ReactNode. Honors
 * the app's central motion preference from the project's existing motion hook.
 *
 * Mid-flight changes adapt smoothly: if the target updates while a tween is
 * still in progress, the new tween starts from the most recently displayed
 * value (not the previous target), so values never snap.
 */
export function CountUp({
  value,
  format = defaultFormat,
  duration = 0.6,
  easing = easeOutQuint,
  fallback = "—",
  className,
}: CountUpProps) {
  const shouldReduceMotion = useReducedMotion();
  const target = parseNumber(value);
  const previousRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // Lazy initializer renders the initial value once on mount without
  // animation — the tween from 0 begins on the first effect tick.
  const [display, setDisplay] = useState<ReactNode>(() => {
    if (target == null) return fallback;
    return format(target);
  });

  useEffect(() => {
    if (target == null) {
      previousRef.current = 0;
      setDisplay(fallback);
      return;
    }
    if (shouldReduceMotion || duration <= 0) {
      previousRef.current = target;
      setDisplay(format(target));
      return;
    }
    const from = previousRef.current;
    const delta = target - from;
    if (delta === 0) {
      setDisplay(format(target));
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const t = Math.min(1, elapsed / duration);
      const eased = easing(t);
      const current = from + delta * eased;
      // Track the most recently displayed numeric value so subsequent
      // updates during the same tween continue smoothly.
      previousRef.current = current;
      setDisplay(format(current));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        previousRef.current = target;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, value, shouldReduceMotion, duration]);

  return <span className={className}>{display}</span>;
}
