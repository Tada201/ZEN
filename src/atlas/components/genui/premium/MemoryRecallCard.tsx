import { Database, Clock, FileText } from "lucide-react";

interface RecallChunk {
  text: string;
  source: string;
  timestamp: string;
  similarity: number;
}

interface MemoryRecallData {
  query: string;
  chunks: RecallChunk[];
  totalRetrieved: number;
  usedInContext: boolean;
}

export function MemoryRecallCard({ data }: { data: MemoryRecallData }) {
  const query = data.query || "semantic_search";
  const chunks = data.chunks || [];
  const totalRetrieved = data.totalRetrieved ?? chunks.length;
  const usedInContext = !!data.usedInContext;

  return (
    <div className="w-full max-w-md rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md p-5 shadow-lg flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[9px] font-mono text-primary-foreground/30 uppercase tracking-widest block">
              Vector Database Recall
            </span>
            <h3 className="text-sm font-semibold text-primary-foreground leading-tight font-mono truncate max-w-[220px]" title={query}>
              "{query}"
            </h3>
          </div>
        </div>

        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${
          usedInContext
            ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
            : "text-muted-foreground border-border/20 bg-muted/10"
        }`}>
          {usedInContext ? "In Prompt Context" : "Surfaced Only"}
        </span>
      </div>

      <div className="space-y-2.5 flex-1 max-h-64 overflow-y-auto pr-1">
        {chunks.map((chunk, idx) => (
          <div
            key={idx}
            className="flex flex-col p-3 rounded-xl bg-card/[0.02] border border-border/[0.04] relative group/chunk"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5 text-[9px] font-mono text-primary-foreground/30">
              <span className="flex items-center gap-1.5 text-primary-foreground/50">
                <FileText className="w-2.5 h-2.5 text-primary-foreground/20" /> {chunk.source}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> {chunk.timestamp}
              </span>
              <span className="font-bold text-primary">
                {(chunk.similarity * 100).toFixed(1)}% Match
              </span>
            </div>

            <p className="text-[11px] text-primary-foreground/80 leading-relaxed italic line-clamp-3 select-all">
              "{chunk.text}"
            </p>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center mt-4 pt-3 border-t border-border/[0.06] text-[9px] text-primary-foreground/30 font-mono">
        <span>Surfaced Chunks</span>
        <span>{chunks.length} of {totalRetrieved} found</span>
      </div>
    </div>
  );
}
