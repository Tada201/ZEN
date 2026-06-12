import { cn } from "@/lib/utils";
import { useVoiceStageStore, type VoiceStageBlock } from "./voiceStageStore";
import type { VoiceState } from "./VoiceModePanel";
import { sanitizeGeneratedSvg } from "@/lib/security/generatedContent";
import { isSafeGeneratedHref } from "@/lib/security/generatedLinks";

interface VoiceStageProps {
  voiceState: VoiceState;
}

const borderStyles: Record<string, string> = {
  initializing: "border-white/30",
  listening: "border-white/85",
  speaking: "border-white/85",
  processing: "border-white/40",
  idle: "border-white/[0.06]",
  error: "border-white/50",
};

function safePaletteColor(value: string): string {
  const color = value.trim();
  return /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d.%\s,/-]+\)|[a-z]{3,20})$/i.test(color)
    ? color
    : "transparent";
}

function BoardBlock({ block }: { block: VoiceStageBlock }) {
  switch (block.kind) {
    case "note":
      return (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          {block.title && <div className="text-xs font-semibold text-white/70 mb-1">{block.title}</div>}
          <div className="text-xs text-white/50 whitespace-pre-wrap leading-relaxed">{block.body}</div>
        </div>
      );

    case "metric":
      return (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-center">
          {block.title && <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">{block.title}</div>}
          <div className="text-2xl font-black text-white tabular-nums">{block.value}</div>
          {block.detail && <div className="text-[10px] text-white/40 mt-1">{block.detail}</div>}
        </div>
      );

    case "table":
      return (
        <div className="rounded-lg border border-white/[0.04] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/[0.03]">
                {block.columns.map((col, i) => (
                  <th key={i} className="px-2 py-1.5 text-left font-semibold text-white/50 uppercase tracking-wider text-[10px]">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t border-white/[0.02]">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2 py-1 text-white/60">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "chart":
      return (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          {block.title && <div className="text-xs font-semibold text-white/70 mb-2">{block.title}</div>}
          <div className="flex items-end gap-1 h-24">
            {block.points.map((pt, i) => {
              const max = Math.max(...block.points.map((p) => p.value), 1);
              const h = Math.max(4, (pt.value / max) * 80);
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0">
                  <span className="text-[9px] text-white/40 mb-0.5">{pt.value}</span>
                  <div
                    className="w-full rounded-sm bg-primary/50 min-w-[8px] transition-all duration-300"
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-[8px] text-white/30 mt-0.5 truncate w-full text-center">{pt.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      );

    case "equation":
      return (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-center">
          {block.title && <div className="text-xs font-semibold text-white/70 mb-1">{block.title}</div>}
          <div className="text-sm font-mono text-white/80">{block.expression}</div>
        </div>
      );

    case "code":
      return (
        <div className="rounded-lg border border-white/[0.04] overflow-hidden">
          {block.title && <div className="px-3 py-1.5 bg-white/[0.02] text-[10px] font-semibold text-white/40 uppercase tracking-wider">{block.title} {block.language && <span className="text-white/20">· {block.language}</span>}</div>}
          <pre className="p-3 text-[11px] font-mono text-white/60 overflow-x-auto whitespace-pre-wrap">{block.code}</pre>
        </div>
      );

    case "map-placeholder":
      return (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">📍</span>
            <span className="text-xs font-semibold text-white/70">{block.title || block.location}</span>
          </div>
          <div className="text-[10px] text-white/40">{block.detail || block.location}</div>
        </div>
      );

    case "image":
      if (!isSafeGeneratedHref(block.url)) {
        return <div className="p-3 text-xs text-white/50">Image URL was blocked.</div>;
      }
      return (
        <div className="rounded-lg border border-white/[0.04] overflow-hidden">
          <img src={block.url} alt={block.alt || block.title || ""} className="w-full max-h-64 object-cover" loading="lazy" />
          {block.caption && <div className="px-3 py-1.5 text-[10px] text-white/40">{block.caption}</div>}
        </div>
      );

    case "link-preview":
      if (!isSafeGeneratedHref(block.url)) {
        return <div className="p-3 text-xs text-white/50">Link URL was blocked.</div>;
      }
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors group"
        >
          {block.thumbnail && isSafeGeneratedHref(block.thumbnail) && (
            <img src={block.thumbnail} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" loading="lazy" />
          )}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white/70 truncate group-hover:text-white/90 transition-colors">{block.title}</div>
            {block.description && <div className="text-[10px] text-white/40 truncate mt-0.5">{block.description}</div>}
            <div className="text-[9px] text-white/30 truncate mt-0.5 font-mono">{block.url}</div>
          </div>
        </a>
      );

    case "progress":
      const pct = block.max ? Math.min(100, Math.round((block.value / block.max) * 100)) : Math.min(100, Math.round(block.value));
      return (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <div className="flex items-center justify-between mb-1.5">
            {block.label && <span className="text-[10px] font-medium text-white/50">{block.label}</span>}
            <span className="text-[10px] font-bold text-white/60 tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      );

    case "divider":
      return <hr className="border-white/[0.06]" />;

    case "svg":
      return (
        <div className="rounded-lg border border-white/[0.04] overflow-hidden">
          {block.title && <div className="px-3 py-1.5 bg-white/[0.02] text-[10px] font-semibold text-white/40 uppercase tracking-wider">{block.title}</div>}
          <div
            className="p-2 flex justify-center"
            // Model-generated SVG is untrusted; sanitize before injection.
            dangerouslySetInnerHTML={{ __html: sanitizeGeneratedSvg(block.markup) }}
          />
        </div>
      );

    case "qr": {
      return (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          {block.title && <div className="mb-1 text-xs font-semibold text-white/70">{block.title}</div>}
          <div className="break-all font-mono text-[11px] text-white/55">{block.data}</div>
          <div className="mt-2 text-[10px] text-white/35">QR rendering is unavailable offline.</div>
        </div>
      );
    }

    case "palette":
      return (
        <div className="rounded-lg border border-white/[0.04] overflow-hidden">
          {block.title && <div className="px-3 py-1.5 bg-white/[0.02] text-[10px] font-semibold text-white/40 uppercase tracking-wider">{block.title}</div>}
          <div className="flex">
            {(block.colors || []).map((color, i) => (
              <div
                key={i}
                className="flex-1 h-16 relative group cursor-default"
                style={{ backgroundColor: safePaletteColor(color) }}
                title={color}
              >
                <div className="absolute inset-x-0 bottom-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60">
                  <span className="text-[9px] font-mono text-white truncate block text-center">{color}</span>
                  {block.names?.[i] && <span className="text-[8px] text-white/50 truncate block text-center">{block.names[i]}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case "kroki": {
      return (
        <div className="rounded-lg border border-white/[0.04] overflow-hidden">
          {block.title && <div className="px-3 py-1.5 bg-white/[0.02] text-[10px] font-semibold text-white/40 uppercase tracking-wider">{block.title} · {block.diagram}</div>}
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] text-white/55">{block.content}</pre>
        </div>
      );
    }

    case "diff":
      return (
        <div className="rounded-lg border border-white/[0.04] overflow-hidden font-mono text-[11px]">
          <div className="flex border-b border-white/[0.04]">
            <div className="flex-1 px-3 py-1 text-[10px] font-semibold text-rose-400/60 uppercase tracking-wider bg-rose-500/[0.03]">{block.oldLabel || "Before"}</div>
            <div className="flex-1 px-3 py-1 text-[10px] font-semibold text-emerald-400/60 uppercase tracking-wider bg-emerald-500/[0.03]">{block.newLabel || "After"}</div>
          </div>
          <div className="flex">
            <pre className="flex-1 p-2 text-rose-300/60 whitespace-pre-wrap overflow-x-auto bg-rose-500/[0.02]">{block.oldCode}</pre>
            <pre className="flex-1 p-2 text-emerald-300/60 whitespace-pre-wrap overflow-x-auto bg-emerald-500/[0.02]">{block.newCode}</pre>
          </div>
        </div>
      );

    default:
      return (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-white/30 italic">
          Unknown block: {(block as any).kind}
        </div>
      );
  }
}

export function VoiceStage({ voiceState }: VoiceStageProps) {
  const blocks = useVoiceStageStore((s) => s.blocks);
  const focusedBlockId = useVoiceStageStore((s) => s.focusedBlockId);

  return (
    <section
      aria-label="Voice display canvas"
      className={cn(
        "h-full w-full rounded-sm border bg-transparent transition-colors overflow-y-auto",
        borderStyles[voiceState] || "border-white/[0.06]"
      )}
    >
      {blocks.length > 0 && (
        <div className="p-3 space-y-2">
          {blocks.map((block) => (
            <div
              key={block.id}
              className={cn(
                "transition-all duration-200",
                focusedBlockId === block.id && "ring-1 ring-primary/40 rounded-lg"
              )}
            >
              <BoardBlock block={block} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
