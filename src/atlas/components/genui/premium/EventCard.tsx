import { MapPin, Clock } from 'lucide-react';

export function EventCard({ data }: { data: any }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-5 shadow-lg max-w-sm flex gap-4">
      <div className="flex-none flex flex-col items-center justify-center bg-primary/10 border border-primary/25 rounded-2xl w-14 h-16">
        <span className="text-[10px] font-black text-primary uppercase tracking-widest">{data.month || 'DEC'}</span>
        <span className="text-2xl font-black text-white tracking-tighter leading-none mt-0.5">{data.day || '01'}</span>
      </div>
      <div className="flex-grow flex flex-col justify-between min-w-0">
        <div>
          <h4 className="font-bold text-white leading-tight truncate">{data.name || 'Event Title'}</h4>
          <div className="flex items-center gap-1.5 text-xs text-white/50 mt-1.5 font-medium">
            <MapPin size={11} className="shrink-0 text-white/40" />
            <span className="truncate">{data.venue || 'Venue Location'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/50 mt-1 font-medium">
            <Clock size={11} className="shrink-0 text-white/40" />
            <span>{data.time || '7:00 PM'}</span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 mt-3">
          <span className="text-xs font-mono font-bold text-white/40">{data.price || 'Free'}</span>
          <button className="px-3 py-1 rounded-lg bg-primary hover:bg-primary-glow text-black text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all">
            RSVP
          </button>
        </div>
      </div>
    </div>
  );
}
