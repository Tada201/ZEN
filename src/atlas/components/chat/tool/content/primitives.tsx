import type { ReactNode } from "react";

export function Panel({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex min-h-7 items-center justify-between gap-2 border-b border-border bg-muted px-2.5 py-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {action}
      </div>
      <div className="bg-background px-2.5 py-2">{children}</div>
    </div>
  );
}

/** Same chrome as Panel, but the body is hidden until the header is toggled. */
export function CollapsiblePanel({ label, defaultOpen = false, children }: { label: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="overflow-hidden rounded-md border border-border bg-card">
      <summary className="flex min-h-7 cursor-pointer select-none items-center border-b border-border bg-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </summary>
      <div className="bg-background px-2.5 py-2">{children}</div>
    </details>
  );
}

export function SummaryLine({ text }: { text: string }) {
  if (!text) return null;
  return <div className="text-[12px] leading-relaxed text-foreground">{text}</div>;
}

export function filenameOf(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}
