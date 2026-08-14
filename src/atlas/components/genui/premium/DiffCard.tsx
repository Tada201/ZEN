import { useMemo } from "react";
import { GitCompare, Plus, Minus } from "lucide-react";
import { highlightToHtml } from "@/atlas/components/chat/prismHighlight";

interface WordSegment {
  text: string;
  changed: boolean;
}

interface DiffLine {
  type: "add" | "remove" | "context" | string;
  content: string;
  oldLine?: number;
  newLine?: number;
  segments?: WordSegment[];
}

interface DiffHunk {
  lines: DiffLine[];
}

interface DiffData {
  filename: string;
  language?: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  description?: string;
}

// Cap rendered lines so a huge diff stays a compact inline card; the "Open"
// action in ToolDetailView routes the full diff to the artifact panel.
const MAX_LINES = 400;

function getLineClass(type: string): string {
  switch (type) {
    case "add":
      return "bg-success/5 border-l-2 border-success";
    case "remove":
      return "bg-destructive/5 border-l-2 border-destructive";
    default:
      return "border-l-2 border-transparent";
  }
}

function getLinePrefix(type: string): string {
  return type === "add" ? "+" : type === "remove" ? "-" : " ";
}

function textColor(type: string): string {
  return type === "add" ? "text-success" : type === "remove" ? "text-destructive" : "text-foreground";
}

/** Render line content: word-level tint when available, else syntax-highlighted. */
function LineContent({ line, language }: { line: DiffLine; language?: string }) {
  const html = useMemo(() => highlightToHtml(line.content, language), [line.content, language]);

  if (line.segments && line.segments.length > 0) {
    const tint = line.type === "add" ? "bg-success/25" : "bg-destructive/25";
    return (
      <span className="flex-1 whitespace-pre-wrap break-words">
        {line.segments.map((seg, i) => (
          <span key={i} className={seg.changed ? tint : undefined}>
            {seg.text}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span
      className="flex-1 whitespace-pre-wrap break-words"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function DiffCard({ data }: { data: DiffData }) {
  const filename = data.filename || "file.diff";
  const hunks = data.hunks || [];
  const additions = data.additions ?? 0;
  const deletions = data.deletions ?? 0;
  const description = data.description;
  const language = data.language;

  // Flatten with a running budget so truncation spans hunks.
  let rendered = 0;
  let truncated = false;

  return (
    <div className="genui-card-surface w-full max-w-none min-w-0 rounded-2xl border border-border bg-card overflow-hidden shadow-lg flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted">
        <div className="flex items-center gap-2">
          <GitCompare className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] font-mono text-foreground truncate max-w-xs">
            {filename}
          </span>
        </div>

        <div className="flex items-center gap-2.5 font-mono text-[10px]">
          <span className="flex items-center text-success bg-success/10 border border-success px-1.5 py-0.5 rounded gap-0.5 font-bold">
            <Plus className="w-2.5 h-2.5" /> {additions}
          </span>
          <span className="flex items-center text-destructive bg-destructive/10 border border-destructive px-1.5 py-0.5 rounded gap-0.5 font-bold">
            <Minus className="w-2.5 h-2.5" /> {deletions}
          </span>
        </div>
      </div>

      <div className="relative bg-card max-h-72 overflow-y-auto font-mono text-[10px] p-2 flex flex-col gap-2">
        {hunks.map((hunk, hunkIdx) => {
          if (truncated) return null;
          return (
            <div key={hunkIdx} className="flex flex-col rounded overflow-hidden border border-border">
              <div className="bg-muted text-muted-foreground text-[9px] px-2 py-0.5 border-b border-border">
                Hunk #{hunkIdx + 1}
              </div>
              <div className="flex flex-col font-mono">
                {hunk.lines.map((line, lineIdx) => {
                  if (rendered >= MAX_LINES) {
                    truncated = true;
                    return null;
                  }
                  rendered++;
                  return (
                    <div
                      key={lineIdx}
                      className={`flex py-0.5 pr-2 font-mono ${getLineClass(line.type)}`}
                    >
                      <span className="w-8 shrink-0 select-none pr-1 text-right text-muted-foreground/60 tabular-nums">
                        {line.oldLine ?? ""}
                      </span>
                      <span className="w-8 shrink-0 select-none pr-2 text-right text-muted-foreground/60 tabular-nums">
                        {line.newLine ?? ""}
                      </span>
                      <span className={`w-3 shrink-0 select-none font-bold ${textColor(line.type)}`}>
                        {getLinePrefix(line.type)}
                      </span>
                      <LineContent line={line} language={language} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {truncated && (
          <div className="text-center text-[10px] text-muted-foreground py-1">
            Diff truncated — use “Open” for the full view.
          </div>
        )}
      </div>

      {description && (
        <div className="px-4 py-2 border-t border-border bg-card">
          <p className="text-[11px] text-muted-foreground leading-normal">{description}</p>
        </div>
      )}
    </div>
  );
}
