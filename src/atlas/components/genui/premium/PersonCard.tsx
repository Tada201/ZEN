import { User } from 'lucide-react';

export function PersonCard({ data }: { data: any }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lg max-w-xs flex flex-col items-center text-center">
      <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary flex items-center justify-center text-primary font-black text-2xl shadow-inner relative">
        {data.avatar ? (
          <img src={data.avatar} alt={data.name} className="h-full w-full rounded-full object-cover" />
        ) : (
          <User size={28} />
        )}
        <div className="w-3 h-3 rounded-full bg-emerald-500 border border-border absolute bottom-0 right-0" />
      </div>

      <div className="mt-3">
        <h4 className="font-bold text-primary-foreground tracking-tight">{data.name || 'John Doe'}</h4>
        <p className="text-xs text-primary-foreground font-medium mt-0.5">{data.role || 'Principal Investigator'}</p>
        <p className="text-[10px] text-primary font-mono mt-1">{data.organization || 'Aegis Division'}</p>
      </div>

      <div className="w-full border-t border-border pt-3.5 mt-3.5 text-xs text-primary-foreground space-y-2">
        {data.email && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-mono text-primary-foreground">{data.email}</span>
          </div>
        )}
        {data.phone && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Phone</span>
            <span className="font-mono text-primary-foreground">{data.phone}</span>
          </div>
        )}
      </div>
    </div>
  );
}
