import { BookOpen } from 'lucide-react';

export function MovieCard({ data }: { data: any }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-lg max-w-md flex">
      <div className="w-28 bg-card flex items-center justify-center relative overflow-hidden flex-none">
        {data.poster ? (
          <img src={data.poster} alt={data.title} className="h-full w-full object-cover" />
        ) : (
          <BookOpen className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <div className="p-4 flex-grow flex flex-col justify-between gap-3 min-w-0">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-1.5 py-0.5 rounded bg-muted border border-border text-[8px] font-mono text-primary-foreground font-bold uppercase">{data.rating || 'PG-13'}</span>
            <span className="text-[10px] font-mono text-muted-foreground">{data.year || '2026'} · {data.runtime || '2h'}</span>
          </div>
          <h4 className="font-bold text-primary-foreground leading-tight truncate">{data.title || 'Movie Title'}</h4>
          <p className="text-[11px] text-primary-foreground line-clamp-2 mt-2 leading-relaxed font-medium">{data.synopsis || 'Movie description...'}</p>
        </div>
        <div className="flex flex-wrap gap-1 border-t border-border pt-3">
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
