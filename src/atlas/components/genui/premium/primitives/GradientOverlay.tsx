import { cn } from "@/lib/utils";

export type GradientTone =
  | "primary"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "sunset"
  | "ocean"
  | "void";

export type GradientVariant = "radial" | "conic";

export type GradientCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

export interface GradientOverlayProps {
  variant?: GradientVariant;
  corner?: GradientCorner;
  tone?: GradientTone;
  /**
   * Visual strength as an opacity (0..0.4). Default 0.20. 0.10 is a whisper,
   * 0.30 is clearly perceptible. Values above 0.40 begin to interfere with
   * foreground content legibility and are clamped.
   */
  intensity?: number;
  className?: string;
}

/**
 * Tone map. All entries are CSS color strings — NEVER Tailwind class names.
 *
 * IMPORTANT: This map is the single source of truth for atmospheric tones.
 * If you need a new hue, add it here — don't sprinkle raw `from-amber-500/20`
 * classes through individual cards.
 *
 * Values match the project Tailwind palette (default v4 scales):
 *   primary ≈ indigo-500, success ≈ emerald-500, danger ≈ rose-500,
 *   warning ≈ amber-500, info ≈ blue-500, sunset ≈ orange-400 → rose-500
 *   → purple-500, ocean ≈ cyan-400 → blue-500 → indigo-500,
 *   void ≈ slate-700 → slate-900 → black.
 */
const TONE_STOPS: Record<GradientTone, { from: string; to: string; via?: string }> = {
  primary: { from: "rgba(99, 102, 241, 0.30)", to: "transparent" },
  success: { from: "rgba(16, 185, 129, 0.30)", to: "transparent" },
  danger: { from: "rgba(244, 63, 94, 0.30)", to: "transparent" },
  warning: { from: "rgba(245, 158, 11, 0.30)", to: "transparent" },
  info: { from: "rgba(59, 130, 246, 0.30)", to: "transparent" },
  sunset: {
    from: "rgba(251, 146, 60, 0.30)",
    via: "rgba(244, 63, 94, 0.20)",
    to: "rgba(168, 85, 247, 0.20)",
  },
  ocean: {
    from: "rgba(34, 211, 238, 0.30)",
    via: "rgba(59, 130, 246, 0.20)",
    to: "rgba(99, 102, 241, 0.20)",
  },
  void: {
    from: "rgba(51, 65, 85, 0.40)",
    via: "rgba(15, 23, 42, 0.30)",
    to: "rgba(0, 0, 0, 0.30)",
  },
};

const RADIAL_CORNER: Record<GradientCorner, string> = {
  "top-left": "ellipse at top left",
  "top-right": "ellipse at top right",
  "bottom-left": "ellipse at bottom left",
  "bottom-right": "ellipse at bottom right",
  center: "circle at center",
};

const CONIC_CORNER: Record<GradientCorner, string> = {
  "top-left": "from 0deg at top left",
  "top-right": "from 0deg at top right",
  "bottom-left": "from 0deg at bottom left",
  "bottom-right": "from 0deg at bottom right",
  center: "from 45deg at center",
};

/**
 * Purely decorative atmospheric gradient backdrop. Always `aria-hidden`,
 * `pointer-events-none`, absolutely positioned. Drop as the first child
 * inside `<CardShell>` so the foreground content sits above it (raise with
 * `relative` + `z-10` if needed).
 *
 * Two variants:
 *  - `radial` (default): an ellipse anchored at one of four corners; washes
 *    a card with hue. Best for single-tone atmospheric accents.
 *  - `conic`: a fanned sweep anchored at one of four corners. Best for
 *    "spotlight" or "compass" effects.
 *
 * Implementation note: we generate the entire gradient via inline
 * `backgroundImage` so we don't fight Tailwind's `bg-*` utility cascade.
 */
export function GradientOverlay({
  variant = "radial",
  corner = "top-right",
  tone = "primary",
  intensity = 0.2,
  className,
}: GradientOverlayProps) {
  const safeIntensity = Math.max(0, Math.min(0.4, intensity));
  const stops = TONE_STOPS[tone];

  const stopList = stops.via
    ? `${stops.from}, ${stops.via}, ${stops.to}`
    : `${stops.from}, ${stops.to}`;

  const gradientFn = variant === "radial" ? "radial-gradient" : "conic-gradient";
  const bg = `${gradientFn}(${variant === "radial" ? RADIAL_CORNER[corner] : CONIC_CORNER[corner]}, ${stopList})`;

  return (
    <div
      aria-hidden
      className={cn("absolute inset-0 pointer-events-none", className)}
      style={{
        backgroundImage: bg,
        opacity: safeIntensity,
      }}
    />
  );
}
