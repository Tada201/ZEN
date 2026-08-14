import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { CodeBlock } from "./CodeBlock";
import { sanitizeMermaidSvg } from "@/lib/security/generatedContent";
import { chatApi } from "@/api/chatApi";
import { formatMermaidError, MermaidSizeError, renderMermaidDiagram } from "@/lib/mermaid";
import { persistFencedRepair } from "@/lib/richContentRepair";
import { ZoomIn, ZoomOut } from "lucide-react";

// Zoom bounds for the wide-diagram scroll container (fractions of natural size).
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

export function MermaidDiagram({
  code,
  isStreaming,
  chatId,
  messageId,
}: {
  code: string;
  isStreaming?: boolean;
  /** Session + backend message id — when present, AI repairs are persisted. */
  chatId?: string;
  messageId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string>("");
  const [sizeError, setSizeError] = useState(false);
  const [isNearViewport, setIsNearViewport] = useState(false);
  // Self-healing: when a render fails, the model repairs the diagram and the
  // corrected code replaces the broken one in place. `showOriginal` lets the
  // user flip back to the original broken diagram.
  const [repair, setRepair] = useState<{ baseCode: string; fixedCode: string } | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairFailed, setRepairFailed] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const { resolvedTheme } = useTheme();

  const renderCode = repair && !showOriginal ? repair.fixedCode : code;

  // Wide-diagram containment: the injected SVG's natural size is measured from
  // its viewBox and scaled through an explicit pixel width inside a
  // horizontally scrollable wrapper, so large diagrams scroll instead of
  // overflowing the chat column on narrow viewports.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [userZoomed, setUserZoomed] = useState(false);

  useEffect(() => {
    if (isNearViewport) {
      return;
    }

    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isNearViewport]);

  // If the underlying message content changed, drop any in-memory repair so
  // the diagram re-renders from the (possibly updated) original code.
  useEffect(() => {
    if (repair && repair.baseCode !== code) {
      setRepair(null);
      setShowOriginal(false);
      setRepairFailed(null);
    }
  }, [code, repair]);

  useEffect(() => {
    if (isStreaming) {
      setSvg("");
      setError(null);
      setRawError("");
      setSizeError(false);
      return;
    }

    if (!isNearViewport) {
      return;
    }

    let isMounted = true;

    const renderMermaid = async () => {
      try {
        const renderedSvg = await renderMermaidDiagram(renderCode, resolvedTheme);

        if (isMounted) {
          setSvg(sanitizeMermaidSvg(renderedSvg));
          setError(null);
          setSizeError(false);
        }
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error("[mermaid] render failed", err);
        if (isMounted) {
          setRawError(raw);
          setSizeError(err instanceof MermaidSizeError);
          setError(formatMermaidError(err));
        }
      }
    };

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [renderCode, resolvedTheme, isStreaming, isNearViewport]);

  // Measure the injected SVG's natural width from its viewBox once rendered.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !svg) return;
    const svgEl = node.querySelector("svg");
    if (!svgEl) return;
    const vb = svgEl.viewBox?.baseVal;
    const natural = vb && vb.width > 0 ? vb.width : svgEl.getBoundingClientRect().width;
    if (natural > 0) setNaturalWidth(natural);
  }, [svg]);

  // Apply the zoom as an explicit pixel width so the scroll wrapper sees real
  // layout size — transform: scale would not resize the scrollable area.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !svg) return;
    const svgEl = node.querySelector("svg");
    if (!svgEl) return;
    if (naturalWidth) {
      svgEl.style.width = `${Math.max(1, Math.round(naturalWidth * zoom))}px`;
      svgEl.style.height = "auto";
      svgEl.style.maxWidth = "none";
    }
  }, [svg, zoom, naturalWidth]);

  // Auto-fit wide diagrams to the column on first render; the zoom controls
  // take over once the user interacts.
  useEffect(() => {
    if (userZoomed || !naturalWidth || !scrollRef.current) return;
    const containerWidth = Math.max(80, scrollRef.current.clientWidth - 24);
    if (naturalWidth > containerWidth) {
      setZoom(Math.max(ZOOM_MIN, containerWidth / naturalWidth));
    }
  }, [naturalWidth, userZoomed]);

  const handleRepair = useCallback(async () => {
    if (repairing) return;
    setRepairing(true);
    setRepairFailed(null);
    try {
      const fixed = await chatApi.repairMermaid(renderCode, rawError);

      // Persist the fix into the stored assistant message (content + execution
      // timeline + live store) so it survives app reloads; falls back to a
      // local-only repair when context is missing or persistence fails.
      const persisted = await persistFencedRepair({
        chatId,
        messageId,
        lang: "mermaid",
        code,
        fixed,
      });

      if (persisted) return; // store update re-renders the message with the fixed diagram

      setRepair({ baseCode: code, fixedCode: fixed });
      setShowOriginal(false);
      setError(null);
      setSizeError(false);
    } catch (err) {
      setRepairFailed(err instanceof Error ? err.message : "Failed to repair the diagram");
    } finally {
      setRepairing(false);
    }
  }, [repairing, renderCode, rawError, code, chatId, messageId]);

  const applyZoom = useCallback((next: number) => {
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)));
    setUserZoomed(true);
  }, []);

  const handleFit = useCallback(() => {
    setUserZoomed(true);
    if (!naturalWidth || !scrollRef.current) {
      setZoom(1);
      return;
    }
    const containerWidth = Math.max(80, scrollRef.current.clientWidth - 24);
    setZoom(naturalWidth > containerWidth ? Math.max(ZOOM_MIN, containerWidth / naturalWidth) : 1);
  }, [naturalWidth]);

  if (isStreaming) {
    return (
      <div ref={containerRef} className="space-y-1.5 my-3">
        <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 px-3 py-2 rounded-lg border border-warning/20">
          <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
          <span>Rendering Mermaid Diagram...</span>
        </div>
        <CodeBlock code={code} language="mermaid" />
      </div>
    );
  }

  if (error) {
    return (
      <div ref={containerRef} className="space-y-1.5 my-3">
        <div className="flex flex-col gap-1 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-destructive" />
            <span>{sizeError ? "Diagram Too Large" : "Mermaid Syntax / Parser Error"}</span>
          </div>
          <p className="text-xs text-muted-foreground break-words whitespace-normal">{error}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleRepair}
              disabled={repairing}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {repairing ? "Fixing with AI…" : "Fix with AI"}
            </button>
            {repair && (
              <button
                type="button"
                onClick={() => setShowOriginal(v => !v)}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {showOriginal ? "Show fixed diagram" : "Show original code"}
              </button>
            )}
          </div>
          {repairFailed && (
            <p className="text-xs text-destructive break-words whitespace-normal">{repairFailed}</p>
          )}
        </div>
        <div className="opacity-80">
          <CodeBlock code={renderCode} language="mermaid" />
        </div>
      </div>
    );
  }

  if (!isNearViewport) {
    return (
      <div
        ref={containerRef}
        className="my-3 h-24 rounded-lg border border-border/40 bg-card/90"
        aria-hidden="true"
      />
    );
  }

  if (!svg) {
    return (
      <div
        ref={containerRef}
        className="my-3 h-24 animate-pulse rounded-lg border border-border/40 bg-card/90 shadow-sm"
        aria-hidden="true"
      />
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="my-3 rounded-lg border border-border/40 bg-card/90 shadow-sm"
      >
        <div className="flex items-center justify-end gap-1 border-b border-border/40 px-2 py-1">
          <button
            type="button"
            onClick={() => applyZoom(zoom / ZOOM_STEP)}
            title="Zoom out"
            aria-label="Zoom out"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ZoomOut size={13} />
          </button>
          <span className="min-w-10 text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => applyZoom(zoom * ZOOM_STEP)}
            title="Zoom in"
            aria-label="Zoom in"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            onClick={handleFit}
            title="Fit diagram to column width"
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Fit
          </button>
        </div>
        <div ref={scrollRef} className="min-h-[96px] overflow-x-auto p-3">
          <div
            className="min-w-fit mx-auto"
            // Mermaid is strict-mode rendered and then DOMPurify-sanitized before SVG injection.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>
      {repair && !showOriginal && (
        <div className="my-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            Repaired with AI
          </span>
          <button
            type="button"
            onClick={() => setShowOriginal(true)}
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Show original
          </button>
        </div>
      )}
    </>
  );
}

