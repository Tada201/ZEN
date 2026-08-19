import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { useVoiceStageStore, type VoiceStageBlock } from "./voiceStageStore";
import type { VoiceState } from "./VoiceModePanel";
import { sanitizeGeneratedSvg } from "@/lib/security/generatedContent";
import { isSafeGeneratedHref } from "@/lib/security/generatedLinks";
import { gridCoordinates, preferredGridSpan } from "./board/registry";
import { Maximize2, Minimize2, Minus, Plus } from "lucide-react";

const OpenUIRenderer = lazy(() => import("@/atlas/components/OpenUIRenderer").then((module) => ({ default: module.OpenUIRenderer })));
const PremiumCard = lazy(() => import("@/atlas/components/genui/PremiumCard").then((module) => ({ default: module.PremiumCard })));
const BoardMap = lazy(() => import("./board/BoardMediaWidgets").then((module) => ({ default: module.BoardMap })));
const BoardVideo = lazy(() => import("./board/BoardMediaWidgets").then((module) => ({ default: module.BoardVideo })));
const BoardCamera = lazy(() => import("./board/BoardMediaWidgets").then((module) => ({ default: module.BoardCamera })));
const BoardHtml = lazy(() => import("./board/BoardMediaWidgets").then((module) => ({ default: module.BoardHtml })));
const BoardChart = lazy(() => import("./board/BoardVisualizations").then((module) => ({ default: module.BoardChart })));
const BoardEquation = lazy(() => import("./board/BoardVisualizations").then((module) => ({ default: module.BoardEquation })));
const BoardDiagram = lazy(() => import("./board/BoardVisualizations").then((module) => ({ default: module.BoardDiagram })));
const BoardQr = lazy(() => import("./board/BoardQr").then((module) => ({ default: module.BoardQr })));

function WidgetFallback() {
  return <div className="flex min-h-32 items-center justify-center text-xs text-primary-foreground/50">Loading presentation...</div>;
}

interface VoiceStageProps {
  voiceState: VoiceState;
}

const borderStyles: Record<string, string> = {
  initializing: "border-border/30",
  listening: "border-border/85",
  speaking: "border-border/85",
  processing: "border-border/40",
  idle: "border-border/[0.06]",
  error: "border-border/50",
};

function safePaletteColor(value: string): string {
  const color = value.trim();
  return /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d.%\s,/-]+\)|[a-z]{3,20})$/i.test(color)
    ? color
    : "transparent";
}

function BoardBlock({ block, focused = false }: { block: VoiceStageBlock; focused?: boolean }) {
  switch (block.kind) {
    case "note":
      return (
        <div className="p-3 rounded-lg bg-card/[0.02] border border-border/[0.04]">
          {block.title && <div className="text-xs font-semibold text-primary-foreground/70 mb-1">{block.title}</div>}
          <div className={cn("text-xs text-primary-foreground/50 whitespace-pre-wrap leading-relaxed", !focused && "line-clamp-6")}>{block.body}</div>
        </div>
      );

    case "metric":
      return (
        <div className="p-3 rounded-lg bg-card/[0.02] border border-border/[0.04] text-center">
          {block.title && <div className="text-[10px] font-bold text-primary-foreground/30 uppercase tracking-widest mb-1">{block.title}</div>}
          <div className="text-2xl font-black text-primary-foreground tabular-nums">{block.value}</div>
          {block.detail && <div className="text-[10px] text-primary-foreground/40 mt-1">{block.detail}</div>}
        </div>
      );

    case "table":
      return (
        <div className="rounded-lg border border-border/[0.04] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-card/[0.03]">
                {block.columns.map((col, i) => (
                  <th key={i} className="px-2 py-1.5 text-left font-semibold text-primary-foreground/50 uppercase tracking-wider text-[10px]">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(focused ? block.rows : block.rows.slice(0, 6)).map((row, i) => (
                <tr key={i} className="border-t border-border/[0.02]">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2 py-1 text-primary-foreground/60">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "chart":
      return <Suspense fallback={<WidgetFallback />}><BoardChart block={block} /></Suspense>;

    case "equation":
      return <Suspense fallback={<WidgetFallback />}><BoardEquation block={block} /></Suspense>;

    case "code":
      return (
        <div className="rounded-lg border border-border/[0.04] overflow-hidden">
          {block.title && <div className="px-3 py-1.5 bg-card/[0.02] text-[10px] font-semibold text-primary-foreground/40 uppercase tracking-wider">{block.title} {block.language && <span className="text-primary-foreground/20">· {block.language}</span>}</div>}
          <pre className={cn("p-3 text-[11px] font-mono text-primary-foreground/60 whitespace-pre-wrap break-words", !focused && "line-clamp-[12]")}>{block.code}</pre>
        </div>
      );

    case "map":
      return (
        <div className="overflow-hidden rounded-lg border border-border/[0.08] bg-background">
          <Suspense fallback={<WidgetFallback />}><BoardMap widget={block} /></Suspense>
        </div>
      );

    case "video":
      return <div className="overflow-hidden rounded-lg border border-border/[0.08]"><Suspense fallback={<WidgetFallback />}><BoardVideo widget={block} /></Suspense></div>;

    case "camera":
      return <div className="overflow-hidden rounded-lg border border-border/[0.08]"><Suspense fallback={<WidgetFallback />}><BoardCamera widget={block} /></Suspense></div>;

    case "gen-ui":
      return <div className="rounded-lg border border-border/[0.08] bg-background/30 p-4"><Suspense fallback={<WidgetFallback />}><OpenUIRenderer content={block.content} /></Suspense></div>;

    case "premium-card":
      return <div className="flex min-h-32 items-center justify-center"><Suspense fallback={<WidgetFallback />}><PremiumCard type={block.cardType} data={block.cardData} /></Suspense></div>;

    case "html":
      return <div className="overflow-hidden rounded-lg border border-border/[0.08]"><Suspense fallback={<WidgetFallback />}><BoardHtml widget={block} /></Suspense></div>;

    case "image":
      if (!isSafeGeneratedHref(block.url)) {
        return <div className="p-3 text-xs text-primary-foreground/50">Image URL was blocked.</div>;
      }
      return (
        <div className="rounded-lg border border-border/[0.04] overflow-hidden">
          <img src={block.url} alt={block.alt || block.title || ""} className="h-full max-h-full w-full object-contain" loading="lazy" />
          {block.caption && <div className="px-3 py-1.5 text-[10px] text-primary-foreground/40">{block.caption}</div>}
        </div>
      );

    case "link-preview":
      if (!isSafeGeneratedHref(block.url)) {
        return <div className="p-3 text-xs text-primary-foreground/50">Link URL was blocked.</div>;
      }
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 p-3 rounded-lg bg-card/[0.02] border border-border/[0.04] hover:bg-card/[0.04] transition-colors group"
        >
          {block.thumbnail && isSafeGeneratedHref(block.thumbnail) && (
            <img src={block.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" loading="lazy" />
          )}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-primary-foreground/70 truncate group-hover:text-primary-foreground/90 transition-colors">{block.title}</div>
            {block.description && <div className="text-[10px] text-primary-foreground/40 truncate mt-0.5">{block.description}</div>}
            <div className="text-[9px] text-primary-foreground/30 truncate mt-0.5 font-mono">{block.url}</div>
          </div>
        </a>
      );

    case "progress":
      const pct = block.max ? Math.min(100, Math.round((block.value / block.max) * 100)) : Math.min(100, Math.round(block.value));
      return (
        <div className="p-3 rounded-lg bg-card/[0.02] border border-border/[0.04]">
          <div className="flex items-center justify-between mb-1.5">
            {block.label && <span className="text-[10px] font-medium text-primary-foreground/50">{block.label}</span>}
            <span className="text-[10px] font-bold text-primary-foreground/60 tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-card/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-primary/60 transition-colors duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      );

    case "divider":
      return <hr className="border-border/[0.06]" />;

    case "svg":
      return (
        <div className="rounded-lg border border-border/[0.04] overflow-hidden">
          {block.title && <div className="px-3 py-1.5 bg-card/[0.02] text-[10px] font-semibold text-primary-foreground/40 uppercase tracking-wider">{block.title}</div>}
          <div
            className="flex h-full min-h-0 items-center justify-center p-2 [&_svg]:h-full [&_svg]:max-h-full [&_svg]:w-full [&_svg]:max-w-full"
            // Model-generated SVG is untrusted; sanitize before injection.
            dangerouslySetInnerHTML={{ __html: sanitizeGeneratedSvg(block.markup) }}
          />
        </div>
      );

    case "qr": {
      return <Suspense fallback={<WidgetFallback />}><BoardQr block={block} /></Suspense>;
    }

    case "palette":
      return (
        <div className="rounded-lg border border-border/[0.04] overflow-hidden">
          {block.title && <div className="px-3 py-1.5 bg-card/[0.02] text-[10px] font-semibold text-primary-foreground/40 uppercase tracking-wider">{block.title}</div>}
          <div className="flex">
            {(block.colors || []).map((color, i) => (
              <div
                key={i}
                className="flex-1 h-16 relative group cursor-default"
                style={{ backgroundColor: safePaletteColor(color) }}
                title={color}
              >
                <div className="absolute inset-x-0 bottom-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/60">
                  <span className="text-[9px] font-mono text-primary-foreground truncate block text-center">{color}</span>
                  {block.names?.[i] && <span className="text-[8px] text-primary-foreground/50 truncate block text-center">{block.names[i]}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case "kroki": {
      return <Suspense fallback={<WidgetFallback />}><BoardDiagram block={block} /></Suspense>;
    }

    case "diff":
      return (
        <div className="rounded-lg border border-border/[0.04] overflow-hidden font-mono text-[11px]">
          <div className="flex border-b border-border/[0.04]">
            <div className="flex-1 px-3 py-1 text-[10px] font-semibold text-rose-400/60 uppercase tracking-wider bg-rose-500/[0.03]">{block.oldLabel || "Before"}</div>
            <div className="flex-1 px-3 py-1 text-[10px] font-semibold text-emerald-400/60 uppercase tracking-wider bg-emerald-500/[0.03]">{block.newLabel || "After"}</div>
          </div>
          <div className="flex">
            <pre className={cn("min-w-0 flex-1 break-words whitespace-pre-wrap bg-rose-500/[0.02] p-2 text-rose-300/60", !focused && "line-clamp-[12]")}>{block.oldCode}</pre>
            <pre className={cn("min-w-0 flex-1 break-words whitespace-pre-wrap bg-emerald-500/[0.02] p-2 text-emerald-300/60", !focused && "line-clamp-[12]")}>{block.newCode}</pre>
          </div>
        </div>
      );

    default:
      return (
        <div className="p-3 rounded-lg bg-card/[0.02] border border-border/[0.04] text-xs text-primary-foreground/30 italic">
          Unknown block: {(block as { kind: string }).kind}
        </div>
      );
  }
}

export function VoiceStage({ voiceState }: VoiceStageProps) {
  const blocks = useVoiceStageStore((s) => s.document.widgets);
  const focusedBlockId = useVoiceStageStore((s) => s.focusedBlockId);
  const layout = useVoiceStageStore((s) => s.document.layout);
  const resizeBlock = useVoiceStageStore((s) => s.resizeBlock);
  const moveBlock = useVoiceStageStore((s) => s.moveBlock);
  const focus = useVoiceStageStore((s) => s.focus);
  const visibleBlocks = layout === "focus" && focusedBlockId
    ? blocks.filter((block) => block.id === focusedBlockId)
    : blocks;

  return (
    <section
      data-voice-stage
      aria-label="Voice display canvas"
      className={cn(
        "h-full w-full min-h-0 rounded-sm border bg-transparent transition-colors",
        layout === "focus" ? "overflow-auto" : "overflow-hidden",
        borderStyles[voiceState] || "border-border/[0.06]"
      )}
    >
      {blocks.length === 0 && (
        <div className="flex h-full w-full items-center justify-center text-xs text-primary-foreground/30 italic">
        </div>
      )}
      {blocks.length > 0 && (
        <div className={cn(
          "grid h-full min-h-0 w-full grid-cols-4 grid-rows-4 gap-2 p-2",
          layout === "focus" && "min-h-full h-auto grid-cols-1 grid-rows-1 p-3"
        )}>
          {[...visibleBlocks].sort((a, b) => (a.layout?.order ?? 0) - (b.layout?.order ?? 0)).map((block) => {
            const span = preferredGridSpan(block);
            const coordinates = gridCoordinates(block);
            return (
              <div
                key={block.id}
                draggable={layout !== "focus"}
                onDragStart={(event) => event.dataTransfer.setData("application/x-zen-board-widget", block.id)}
                onClick={layout === "focus" ? undefined : () => focus(block.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("application/x-zen-board-widget");
                  const target = event.currentTarget.parentElement?.getBoundingClientRect();
                  if (!id || !target) return;
                  const column = Math.min(3, Math.max(0, Math.floor(((event.clientX - target.left) / target.width) * 4)));
                  const row = Math.min(3, Math.max(0, Math.floor(((event.clientY - target.top) / target.height) * 4)));
                  moveBlock(id, row * 4 + column);
                }}
                className={cn(
                  "group relative min-h-0 min-w-0 overflow-hidden rounded-lg transition-[box-shadow] duration-150",
                  layout !== "focus" && "cursor-zoom-in",
                  focusedBlockId === block.id && "ring-1 ring-primary/40"
                )}
                style={layout === "focus" ? { gridColumn: "1 / -1", gridRow: "1 / -1" } : coordinates ? {
                  gridColumn: `${coordinates.column + 1} / span ${Math.min(span.colSpan, 4 - coordinates.column)}`,
                  gridRow: `${coordinates.row + 1} / span ${Math.min(span.rowSpan, 4 - coordinates.row)}`,
                } : {
                  gridColumn: `span ${span.colSpan}`,
                  gridRow: `span ${span.rowSpan}`,
                }}
              >
                <div className={cn("min-h-0 [&>*]:min-h-0", layout === "focus" ? "min-h-full" : "h-full [&>*]:h-full")}><BoardBlock block={block} focused={layout === "focus"} /></div>
                {layout === "focus" && (
                  <button
                    type="button"
                    title="Restore board grid"
                    aria-label="Restore board grid"
                    onClick={() => focus(null)}
                    className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg border border-border/15 bg-background/80 text-primary-foreground/70 shadow-sm hover:text-primary-foreground"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                )}
                {layout !== "focus" && (
                  <div onClick={(event) => event.stopPropagation()} className="sticky bottom-1 ml-auto mr-1 flex w-fit items-center gap-0.5 rounded-lg border border-border/10 bg-background/85 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button type="button" title="Focus widget" aria-label="Focus widget" onClick={() => focus(block.id)} className="flex h-7 w-7 items-center justify-center text-primary-foreground/65 hover:text-primary-foreground"><Maximize2 className="h-3.5 w-3.5" /></button>
                    <button type="button" title="Reduce width" aria-label="Reduce widget width" onClick={() => resizeBlock(block.id, span.colSpan - 1, span.rowSpan)} className="flex h-7 w-7 items-center justify-center text-primary-foreground/65 hover:text-primary-foreground"><Minus className="h-3.5 w-3.5" /></button>
                    <span className="min-w-12 text-center font-mono text-[10px] text-primary-foreground/55">{coordinates ? `#${coordinates.cell} ` : ""}{span.colSpan}×{span.rowSpan}</span>
                    <button type="button" title="Increase width" aria-label="Increase widget width" onClick={() => resizeBlock(block.id, span.colSpan + 1, span.rowSpan)} className="flex h-7 w-7 items-center justify-center text-primary-foreground/65 hover:text-primary-foreground"><Plus className="h-3.5 w-3.5" /></button>
                    <button type="button" title="Reduce height" aria-label="Reduce widget height" onClick={() => resizeBlock(block.id, span.colSpan, span.rowSpan - 1)} className="flex h-7 w-7 items-center justify-center text-primary-foreground/65 hover:text-primary-foreground"><Minus className="h-3.5 w-3.5 rotate-90" /></button>
                    <button type="button" title="Increase height" aria-label="Increase widget height" onClick={() => resizeBlock(block.id, span.colSpan, span.rowSpan + 1)} className="flex h-7 w-7 items-center justify-center text-primary-foreground/65 hover:text-primary-foreground"><Plus className="h-3.5 w-3.5 rotate-90" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
