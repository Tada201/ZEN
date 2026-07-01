import { BookOpen, ExternalLink } from "lucide-react";

interface CitationData {
  title: string;
  authors: string[];
  year: number;
  journal: string;
  doi: string;
  url: string;
  abstract: string;
  citationKey?: string;
}

export function CitationCard({ data }: { data: CitationData }) {
  const title = data.title || "Academic Paper";
  const authors = data.authors || [];
  const year = data.year || "--";
  const journal = data.journal || "Publication";
  const doi = data.doi || "";
  const url = data.url || "#";
  const abstract = data.abstract || "";
  const citationKey = data.citationKey;

  return (
    <div className="w-full max-w-md rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md p-5 shadow-lg flex flex-col">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg border border-border/10 bg-card/5 text-primary shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[9px] font-mono text-primary-foreground/30 uppercase tracking-widest block">
              Academic Citation
            </span>
            {citationKey && (
              <span className="text-[9px] font-mono text-primary/70 font-bold block mt-0.5">
                [{citationKey}]
              </span>
            )}
          </div>
        </div>
        <span className="px-2 py-0.5 rounded text-[9px] font-mono text-primary-foreground/40 bg-card/5 border border-border/10 shrink-0">
          {year}
        </span>
      </div>

      <div className="flex-1 mb-4">
        <h3 className="text-sm font-semibold text-primary-foreground leading-snug mb-1">
          {title}
        </h3>
        {authors.length > 0 && (
          <p className="text-[11px] text-primary-foreground/50 truncate mb-2">
            {authors.join(", ")}
          </p>
        )}
        <span className="text-[10px] font-mono italic text-primary-foreground/30 block mb-3">
          Published in: {journal}
        </span>

        {abstract && (
          <div className="p-3 rounded-xl bg-card/[0.02] border border-border/[0.04]">
            <span className="text-[9px] font-mono uppercase tracking-wider text-primary-foreground/20 block mb-1">
              Abstract Excerpt
            </span>
            <p className="text-[11px] text-primary-foreground/70 leading-relaxed line-clamp-3 italic">
              "{abstract}"
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 pt-3 border-t border-border/[0.06] text-[10px] font-mono text-primary-foreground/30">
        {doi ? (
          <span className="truncate max-w-[150px]" title={doi}>DOI: {doi}</span>
        ) : (
          <div />
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-primary/60 hover:text-primary transition-colors ml-auto"
        >
          View source <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
