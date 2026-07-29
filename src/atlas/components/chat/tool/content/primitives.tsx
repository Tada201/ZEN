import type { ReactNode } from "react";

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

export function SummaryLine({ text }: { text: string }) {
  if (!text) return null;
  return <div className="text-[12px] leading-relaxed text-foreground">{text}</div>;
}

export function filenameOf(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}
