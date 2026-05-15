import { useEffect, useRef } from "react";
import { Code2, Copy, MousePointerClick, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useZen } from "./atlasContext";

export function Inspector({ onClose }: { onClose?: () => void }) {
  const { selection, select, exportCSS } = useZen();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevIdRef = useRef<string | null>(null);

  // When a new selection arrives, move focus to the heading so screen readers
  // land in the inspector. Skip on initial mount and on deselect.
  useEffect(() => {
    if (selection && selection.id !== prevIdRef.current) {
      headingRef.current?.focus();
    }
    prevIdRef.current = selection?.id ?? null;
  }, [selection]);

  const liveMessage = selection
    ? `${selection.name} selected in ${selection.category}. ${selection.variants.length} variants available.`
    : "Selection cleared.";

  return (
    <aside
      id="Zen-inspector"
      className="flex h-full w-full flex-col border-l border-border bg-card"
      aria-label="Component inspector"
      aria-labelledby="inspector-title"
    >
      {/* Polite live region — announces selection changes without stealing focus */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>

      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 id="inspector-title" className="text-sm font-semibold">Inspector</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close inspector"
            data-inspector-close
            className="press rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </header>

      {!selection ? (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="relative mb-4 h-20 w-20" aria-hidden="true">
            <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-border" />
            <div className="absolute inset-3 rounded-xl bg-muted" />
            <MousePointerClick className="absolute -bottom-1 -right-1 h-7 w-7 text-primary" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-medium">Nothing selected</p>
          <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">Click any component card to inspect its variants and copy code.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-border px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{selection.category}</div>
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card rounded-sm"
            >
              {selection.name}
            </h3>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <section aria-labelledby="inspector-variants">
              <h4 id="inspector-variants" className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Variants ({selection.variants.length})</h4>
              <ul className="flex flex-wrap gap-1.5">
                {selection.variants.map((v) => (
                  <li key={v} className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px]">{v}</li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="inspector-jsx">
              <h4 id="inspector-jsx" className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">JSX</h4>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                <code>{selection.jsx}</code>
              </pre>
            </section>
          </div>

          <footer className="space-y-2 border-t border-border p-4">
            <Button
              variant="outline"
              className="press w-full"
              onClick={async () => {
                await navigator.clipboard.writeText(selection.jsx);
                toast.success("JSX copied to clipboard");
              }}
            >
              <Copy className="h-4 w-4" aria-hidden="true" /> Copy JSX
            </Button>
            <Button
              variant="ghost"
              className="press w-full"
              onClick={async () => {
                await navigator.clipboard.writeText(exportCSS());
                toast.success("CSS variables copied");
              }}
            >
              <Copy className="h-4 w-4" aria-hidden="true" /> Copy CSS variables
            </Button>
            <Button variant="ghost" className="press w-full text-muted-foreground" onClick={() => select(null)}>
              Deselect
            </Button>
          </footer>
        </div>
      )}
    </aside>
  );
}


