import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { CardMotion } from "./motion/CardMotion";

export interface CardShellProps {
  children: ReactNode;
  className?: string;
  /**
   * Cards that manage their own internal padding (code, invoice, media
   * cards with edge-to-edge headers) opt out of the default p-5.
   */
  padded?: boolean;
  /**
   * Enable the reusable motion wrapper. When true, the card will fade up on
   * entrance and can optionally enable spotlight and/or tilt effects.
   * Defaults to false to preserve the existing behavior of all current cards.
   */
  motion?: boolean;
  /** Enable mouse-tracking spotlight glow. Requires `motion` to be true. */
  spotlight?: boolean;
  /** Enable 3D tilt on hover. Requires `motion` to be true. */
  tilt?: boolean;
  /** Entrance animation delay in seconds. Only applies when `motion` is true. */
  entranceDelay?: number;
}

export type StatusVariant =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "running"
  | "pending";

/**
 * The single full-width glass container every premium GenUI card renders
 * through. Width is always the full chat column; height scales with content.
 *
 * Having one shell here means the full-width standard is native to each card
 * — no `[&>*]:!max-w-none` override needed on the message wrapper. Change the
 * card chrome (radius, border, blur, shadow) in exactly one place.
 *
 * @example
 * ```tsx
 * // Static card (default, unchanged behavior)
 * <CardShell>…</CardShell>
 *
 * // Animated card with entrance, spotlight, and 3D tilt
 * <CardShell motion spotlight tilt>
 *   …
 * </CardShell>
 *
 * // Staggered list of cards
 * <StaggerContainer>
 *   <StaggerItem><CardShell motion>…</CardShell></StaggerItem>
 *   <StaggerItem><CardShell motion>…</CardShell></StaggerItem>
 * </StaggerContainer>
 * ```
 */
export function CardShell({
  children,
  className,
  padded = true,
  motion = false,
  spotlight = false,
  tilt = false,
  entranceDelay = 0,
}: CardShellProps) {
  const shell = (
    <div
      className={cn(
        "w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );

  if (!motion) {
    return shell;
  }

  return (
    <CardMotion
      spotlight={spotlight}
      tilt={tilt}
      entranceDelay={entranceDelay}
    >
      {shell}
    </CardMotion>
  );
}

interface SafeImgProps {
  src?: string;
  alt?: string;
  className?: string;
  fallback: ReactNode;
}

/**
 * External images are user/model-supplied URLs. On an OSINT tool we don't want
 * to hotlink blindly: no referrer leak, lazy-loaded, and a graceful fallback
 * (never the browser's broken-image glyph) when the URL is dead or absent.
 */
export function SafeImg({ src, alt = "", className, fallback }: SafeImgProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared card primitives — single source of truth for premium card layouts
// ─────────────────────────────────────────────────────────────────────────────

/** Maps a semantic status to a consistent set of Tailwind classes. */
export function getStatusConfig(variant: string): string {
  const map: Record<string, string> = {
    success:
      "text-emerald-400 border-emerald-500 bg-emerald-500/10 border",
    ok: "text-emerald-400 border-emerald-500 bg-emerald-500/10 border",
    done: "text-emerald-400 border-emerald-500 bg-emerald-500/10 border",
    completed:
      "text-emerald-400 border-emerald-500 bg-emerald-500/10 border",
    passed:
      "text-emerald-400 border-emerald-500 bg-emerald-500/10 border",
    error: "text-rose-400 border-rose-500 bg-rose-500/10 border",
    failed: "text-rose-400 border-rose-500 bg-rose-500/10 border",
    failure:
      "text-rose-400 border-rose-500 bg-rose-500/10 border",
    overdue:
      "text-rose-400 border-rose-500 bg-rose-500/10 border",
    warning:
      "text-amber-400 border-amber-500 bg-amber-500/10 border",
    warn: "text-amber-400 border-amber-500 bg-amber-500/10 border",
    alert:
      "text-amber-400 border-amber-500 bg-amber-500/10 border",
    info: "text-primary border-primary bg-primary/10 border",
    pending:
      "text-muted-foreground border-border bg-muted",
    running: "text-blue-400 border-blue-500 bg-blue-500/10 border",
    "in-progress":
      "text-blue-400 border-blue-500 bg-blue-500/10 border",
    easy: "text-emerald-400 border-emerald-500 bg-emerald-500/10 border",
    medium: "text-amber-400 border-amber-500 bg-amber-500/10 border",
    hard: "text-rose-400 border-rose-500 bg-rose-500/10 border",
  };
  return map[variant] || map.info;
}

export interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

/** Standard card header: title/icon left, badges/actions right. */
export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      {children}
    </div>
  );
}

export interface CardTitleProps {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  title?: string;
}

/** Standard card title. */
export function CardTitle({
  children,
  className,
  as: Component = "h4",
  title,
}: CardTitleProps) {
  return (
    <Component
      title={title}
      className={cn(
        "text-sm font-semibold text-primary-foreground leading-tight",
        className
      )}
    >
      {children}
    </Component>
  );
}

export interface CardLabelProps {
  children: ReactNode;
  className?: string;
}

/** Standard label for data fields. */
export function CardLabel({ children, className }: CardLabelProps) {
  return (
    <span
      className={cn(
        "text-[11px] text-muted-foreground uppercase tracking-wider",
        className
      )}
    >
      {children}
    </span>
  );
}

export interface CardValueProps {
  children: ReactNode;
  className?: string;
  mono?: boolean;
  title?: string;
}

/** Standard value for data fields. */
export function CardValue({ children, className, mono, title }: CardValueProps) {
  return (
    <span
      title={title}
      className={cn(
        "text-[11px] text-primary-foreground",
        mono && "font-mono",
        className
      )}
    >
      {children}
    </span>
  );
}

export interface CardBadgeProps {
  children: ReactNode;
  className?: string;
  variant?: StatusVariant | string;
  icon?: ReactNode;
}

/** Standard status badge with consistent colors. */
export function CardBadge({
  children,
  className,
  variant = "info",
  icon,
}: CardBadgeProps) {
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border",
        getStatusConfig(variant),
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export interface CardDataGridProps {
  children: ReactNode;
  className?: string;
  /** Number of grid columns. */
  columns?: number;
}

/** Standard grid for key/value data rows. */
export const CardDataGrid = ({
  children,
  className,
  columns = 1,
}: CardDataGridProps) => {
  return (
    <div
      className={cn("grid gap-x-6 gap-y-1.5", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
};

export interface CardDataRowProps {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}

/** Standard key/value data row. */
export function CardDataRow({ label, value, className }: CardDataRowProps) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2 min-w-0",
        className
      )}
    >
      <CardLabel className="shrink-0">{label}</CardLabel>
      <CardValue className="text-right truncate" mono>
        {value}
      </CardValue>
    </div>
  );
}

export interface CardSectionProps {
  children: ReactNode;
  className?: string;
  divider?: boolean;
}

/** Standard card section with optional top divider. */
export function CardSection({
  children,
  className,
  divider = false,
}: CardSectionProps) {
  return (
    <div
      className={cn(
        divider && "border-t border-border pt-3",
        className
      )}
    >
      {children}
    </div>
  );
}
