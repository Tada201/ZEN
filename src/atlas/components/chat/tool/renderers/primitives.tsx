import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared layout primitives for identity-based tool renderers.
 * Mirrors the visual language of `ToolDetailView`'s local `Panel`
 * (same border/label scale) so custom cards sit flush with the
 * shape-based fallback cards.
 */
export function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted">
      <div className="border-b border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="px-2 py-1.5">{children}</div>
    </div>
  );
}

/** Header line reused across list-style renderers — the tool's narrative `summary`. */
export function SummaryLine({ text }: { text: string }) {
  if (!text) return null;
  return <div className="text-[12px] leading-relaxed text-foreground">{text}</div>;
}

/** "+N more" footer when a list is capped. */
export function MoreRow({ hidden }: { hidden: number }) {
  if (hidden <= 0) return null;
  return <div className="text-[11px] text-muted-foreground">+{hidden} more</div>;
}

/** Labelled horizontal bar for percentage-style metrics (0–100). */
export function StatBar({
  label,
  percent,
  detail,
  tone = "primary",
}: {
  label: string;
  percent: number;
  detail?: string;
  tone?: "primary" | "warning" | "destructive";
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[11px] tabular-nums text-foreground">{detail ?? `${clamped.toFixed(0)}%`}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            tone === "destructive" && "bg-destructive",
            tone === "warning" && "bg-warning",
            tone === "primary" && "bg-primary",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/* ── shared parse helpers ─────────────────────────────────────── */

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
