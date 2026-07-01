import { MapPin, DollarSign, Calendar } from 'lucide-react';

export function JobCard({ data }: { data: any }) {
  return (
    <div className="rounded-2xl border border-border/[0.08] bg-background/40 backdrop-blur-md p-5 shadow-lg max-w-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-card/5 border border-border/10 flex items-center justify-center text-primary-foreground/60 font-black text-lg font-sans">
            {data.company?.slice(0, 1) || 'J'}
          </div>
          <div>
            <h4 className="font-bold text-primary-foreground leading-tight">{data.title || 'Software Engineer'}</h4>
            <p className="text-xs text-primary-foreground/50 font-medium mt-0.5">{data.company || 'Tech Company'}</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary uppercase tracking-wider">
          {data.type || 'Full Time'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 my-3.5 text-xs text-primary-foreground/60 font-medium">
        <div className="flex items-center gap-1.5">
          <MapPin size={12} className="text-primary-foreground/40" />
          <span>{data.location || 'Remote'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <DollarSign size={12} className="text-primary-foreground/40" />
          <span>{data.salary || 'Competitive'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar size={12} className="text-primary-foreground/40" />
          <span>{data.postedDate || 'Just posted'}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-border/[0.06] pt-3.5">
        {(data.requirements || ['React', 'TypeScript', 'Node.js'] as string[]).map((req: string) => (
          <span key={req} className="px-2 py-0.5 rounded-full bg-card/5 border border-border/[0.08] text-[9px] font-bold text-primary-foreground/70 uppercase">
            {req}
          </span>
        ))}
      </div>
    </div>
  );
}
