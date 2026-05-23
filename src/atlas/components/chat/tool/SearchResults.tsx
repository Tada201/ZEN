export interface SearchResult {
  url?: string;
  title?: string;
  snippet?: string;
}

interface SearchResultsProps {
  results: SearchResult[];
}

export function SearchResults({ results }: SearchResultsProps) {
  const getHostname = (urlString: string) => {
    try {
      if (!urlString) return 'link';
      return new URL(urlString).hostname;
    } catch (e) {
      return 'link';
    }
  };

  return (
    <div className="divide-y divide-white/[0.04]">
      {results.slice(0, 5).map((res, i) => res && (
        <a
          key={i}
          href={res.url || '#'}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-3 p-3 hover:bg-white/[0.04] transition-colors group/res"
        >
          <div className="text-[11px] font-mono text-white/10 mt-0.5">{i + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white/80 group-hover/res:text-primary transition-colors truncate">
              {res.title || 'Untitled Result'}
            </div>
            <div className="text-[11px] font-mono text-white/20 mt-0.5 truncate italic">
              {getHostname(res.url || '')}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
