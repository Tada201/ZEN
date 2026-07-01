import { Check, Star } from 'lucide-react';

export function ComparisonCard({ data }: { data: any }) {
  const title = data.title || 'Compare';
  const items = data.items || data.options || [];

  return (
    <div className="rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md p-5 shadow-lg w-full">
      {title && (
        <h4 className="text-xs font-bold text-primary-foreground/50 uppercase tracking-widest mb-4">{title}</h4>
      )}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, 1fr)` }}>
        {items.slice(0, 3).map((item: any, i: number) => {
          const isRecommended = item.recommended || item.best || item.featured;
          return (
            <div
              key={i}
              className={`rounded-xl border p-4 flex flex-col gap-3 relative ${
                isRecommended
                  ? 'border-primary/30 bg-primary/[0.03] ring-1 ring-primary/20'
                  : 'border-border/[0.06] bg-card/[0.01]'
              }`}
            >
              {isRecommended && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-primary text-[9px] font-black text-foreground uppercase tracking-wider flex items-center gap-1">
                  <Star size={9} /> Best
                </div>
              )}
              <div className="text-center pt-1">
                <p className="font-bold text-primary-foreground text-sm">{item.name || item.title || item.plan}</p>
                {item.price && <p className="text-lg font-black text-primary-foreground mt-1">{item.price}</p>}
              </div>
              {item.features && Array.isArray(item.features) && (
                <div className="space-y-1.5">
                  {item.features.map((feat: string, j: number) => (
                    <div key={j} className="flex items-start gap-1.5">
                      <Check size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-[10px] text-primary-foreground/50 leading-relaxed">{feat}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
