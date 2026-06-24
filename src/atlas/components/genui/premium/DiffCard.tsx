import { GitCompare, Plus, Minus } from "lucide-react";

interface DiffLine {
  type: "add" | "remove" | "context" | string;
  content: string;
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

export function DiffCard({ data }: { data: DiffData }) {
  const filename = data.filename || "file.diff";
  const hunks = data.hunks || [];
  const additions = data.additions ?? 0;
  const deletions = data.deletions ?? 0;
  const description = data.description;

  const getLineClass = (type: string) => {
    switch (type) {
      case "add":
        return "bg-emerald-500/10 text-emerald-300 border-l-2 border-emerald-500";
      case "remove":
        return "bg-rose-500/10 text-rose-300 border-l-2 border-rose-500";
      default:
        return "text-white/60 pl-1";
    }
  };

  const getLinePrefix = (type: string) => {
    switch (type) {
      case "add":
        return "+";
      case "remove":
        return "-";
      default:
        return " ";
    }
  };

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md overflow-hidden shadow-lg flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <GitCompare className="w-3.5 h-3.5 text-white/40" />
          <span className="text-[11px] font-mono text-white/70 truncate max-w-xs">
            {filename}
          </span>
        </div>

        <div className="flex items-center gap-2.5 font-mono text-[10px]">
          <span className="flex items-center text-emerald-400 bg-emerald-400/10 border border-emerald-500/20 px-1.5 py-0.5 rounded gap-0.5 font-bold">
            <Plus className="w-2.5 h-2.5" /> {additions}
          </span>
          <span className="flex items-center text-rose-400 bg-rose-400/10 border border-rose-500/20 px-1.5 py-0.5 rounded gap-0.5 font-bold">
            <Minus className="w-2.5 h-2.5" /> {deletions}
          </span>
        </div>
      </div>

      <div className="relative bg-black/60 max-h-72 overflow-y-auto font-mono text-[10px] p-2 flex flex-col gap-2">
        {hunks.map((hunk, hunkIdx) => (
          <div key={hunkIdx} className="flex flex-col rounded overflow-hidden border border-white/[0.02]">
            <div className="bg-white/[0.02] text-white/30 text-[9px] px-2 py-0.5 border-b border-white/[0.04]">
              Hunk #{hunkIdx + 1}
            </div>
            <div className="flex flex-col whitespace-pre font-mono">
              {hunk.lines.map((line, lineIdx) => (
                <div
                  key={lineIdx}
                  className={`flex py-0.5 px-2 font-mono ${getLineClass(line.type)}`}
                >
                  <span className="w-4 select-none opacity-40 font-bold shrink-0">
                    {getLinePrefix(line.type)}
                  </span>
                  <span className="flex-1 overflow-x-auto whitespace-pre font-mono">
                    {line.content}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {description && (
        <div className="px-4 py-2 border-t border-white/[0.04] bg-white/[0.01]">
          <p className="text-[11px] text-white/40 leading-normal">{description}</p>
        </div>
      )}
    </div>
  );
}
