/**
 * Shared primitives for the GenUI premium card system.
 *
 * Every complex premium card (Weather, Stock, Movie, Book, Chart,
 * Comparison, Metric, etc.) composes its visual treatment from these five
 * building blocks. Adding a new card? Start here before writing bespoke SVG
 * or animation code.
 *
 * Conventions:
 *  - PascalCase exports from PascalCase files.
 *  - All primitives respect `useReducedMotion`.
 *  - All primitives use the project's existing Tailwind palette tokens
 *    (`text-primary`, `stroke-emerald-400`, etc.) — never inline colors.
 *  - Defaults are opinionated. If you need a knob, add it to the primitive,
 *    not the call site.
 *
 * Utility parsers (`parseNumeric`, `parseNumericLoose`) are also exported
 * here so cards don't reinvent the same strip-and-parse logic. Use
 * `parseNumeric` for percentages/prices/stock levels (strips `% $ ,`), and
 * `parseNumericLoose` for ratings where a `/10` suffix should be ignored.
 */
export { Sparkline } from "./Sparkline";
export type { SparklineProps, SparklineTone, SparklineVariant } from "./Sparkline";

export { Ring } from "./Ring";
export type { RingProps, RingTone } from "./Ring";

export { PercentBar } from "./PercentBar";
export type {
  PercentBarProps,
  PercentBarRange,
  PercentBarTone,
  PercentBarVariant,
} from "./PercentBar";

export { GradientOverlay } from "./GradientOverlay";
export type {
  GradientOverlayProps,
  GradientTone,
  GradientVariant,
  GradientCorner,
} from "./GradientOverlay";

export { EdgeBleedShell } from "./EdgeBleedShell";
export type { EdgeBleedShellProps } from "./EdgeBleedShell";

export { parseNumeric, parseNumericLoose } from "./parseNumeric";
