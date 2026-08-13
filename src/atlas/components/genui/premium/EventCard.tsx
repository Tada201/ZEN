import { MapPin, Clock } from 'lucide-react';

export function EventCard({ data }: { data: any }) {
  return (
    <div className="genui-card-surface w-full max-w-none min-w-0 rounded-2xl border border-border bg-card p-5 shadow-lg flex gap-4">
      <div className="flex-none flex flex-col items-center justify-center bg-primary/10 border border-primary rounded-2xl w-14 h-16">
        <span className="text-[10px] font-black text-primary uppercase tracking-widest">{data.month || 'DEC'}</span>
        <span className="text-2xl font-black text-primary-foreground tracking-tighter leading-none mt-0.5">{data.day || '01'}</span>
      </div>
      <div className="flex-grow flex flex-col justify-between min-w-0">
        <div>
          <h4 className="font-bold text-primary-foreground leading-tight truncate">{data.name || 'Event Title'}</h4>
          <div className="flex items-center gap-1.5 text-xs text-primary-foreground mt-1.5 font-medium">
            <MapPin size={11} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{data.venue || 'Venue Location'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-primary-foreground mt-1 font-medium">
            <Clock size={11} className="shrink-0 text-muted-foreground" />
            <span>{data.time || '7:00 PM'}</span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3 mt-3">
          <span className="text-xs font-mono font-bold text-muted-foreground">{data.price || 'Free'}</span>
          <button className="px-3 py-1 rounded-lg bg-primary hover:bg-primary-glow text-foreground text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all">
            RSVP
          </button>
        </div>
      </div>
    </div>
  );
}
