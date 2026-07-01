import { BookOpen } from 'lucide-react';

export function MovieCard({ data }: { data: any }) {
  return (
    <div className="rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md overflow-hidden shadow-lg max-w-md flex">
      <div className="w-28 bg-card/[0.03] flex items-center justify-center relative overflow-hidden flex-none">
        {data.poster ? (
          <img src={data.poster} alt={data.title} className="h-full w-full object-cover" />
        ) : (
          <BookOpen className="h-10 w-10 text-primary-foreground/10" />
        )}
      </div>
      <div className="p-4 flex-grow flex flex-col justify-between gap-3 min-w-0">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-1.5 py-0.5 rounded bg-card/5 border border-border/10 text-[8px] font-mono text-primary-foreground/50 font-bold uppercase">{data.rating || 'PG-13'}</span>
            <span className="text-[10px] font-mono text-primary-foreground/40">{data.year || '2026'} · {data.runtime || '2h'}</span>
          </div>
          <h4 className="font-bold text-primary-foreground leading-tight truncate">{data.title || 'Movie Title'}</h4>
          <p className="text-[11px] text-primary-foreground/50 line-clamp-2 mt-2 leading-relaxed font-medium">{data.synopsis || 'Movie description...'}</p>
        </div>
        <div className="flex flex-wrap gap-1 border-t border-border/[0.06] pt-3">
          {(data.genres || ['Action', 'Sci-Fi'] as string[]).map((g: string) => (
            <span key={g} className="px-1.5 py-0.5 rounded bg-primary/10 text-[9px] font-bold text-primary uppercase">
              {g}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
