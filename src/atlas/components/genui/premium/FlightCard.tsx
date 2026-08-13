import { Plane } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FlightCard({ data }: { data: any }) {
  return (
    <div className="genui-card-surface w-full max-w-none min-w-0 rounded-2xl border border-border bg-card p-5 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Plane className="text-primary h-4 w-4 rotate-45" />
          <span className="text-xs font-bold text-primary-foreground tracking-wider font-mono">{data.airline || 'Airline'} {data.flightNumber || 'FL000'}</span>
        </div>
        <span className={cn(
          "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
          data.status === 'on time' ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" : "bg-amber-500/10 border-amber-500 text-amber-400"
        )}>
          {data.status || 'On Time'}
        </span>
      </div>

      <div className="flex items-center justify-between my-4">
        <div className="flex-1">
          <h3 className="text-3xl font-black tracking-tighter text-primary-foreground">{data.departureCode || 'DEP'}</h3>
          <p className="text-[10px] text-muted-foreground uppercase truncate">{data.departureCity || 'Departure City'}</p>
          <p className="text-xs font-mono font-bold text-primary-foreground mt-1">{data.departureTime || '00:00 AM'}</p>
        </div>
        <div className="flex flex-col items-center px-4 flex-none gap-1">
          <span className="text-[10px] text-muted-foreground font-mono">{data.duration || '0h 0m'}</span>
          <div className="w-20 h-px bg-muted relative">
            <div className="w-1.5 h-1.5 rounded-full bg-primary absolute -top-[3px] left-[50%] -translate-x-1/2" />
          </div>
          <span className="text-[9px] text-primary font-bold uppercase tracking-widest">Non-Stop</span>
        </div>
        <div className="flex-grow text-right">
          <h3 className="text-3xl font-black tracking-tighter text-primary-foreground">{data.arrivalCode || 'ARR'}</h3>
          <p className="text-[10px] text-muted-foreground uppercase truncate">{data.arrivalCity || 'Arrival City'}</p>
          <p className="text-xs font-mono font-bold text-primary-foreground mt-1">{data.arrivalTime || '00:00 PM'}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-[11px] font-mono text-center">
        <div>
          <span className="text-muted-foreground block uppercase tracking-wider">Gate</span>
          <span className="text-primary-foreground font-bold text-xs">{data.gate || '--'}</span>
        </div>
        <div>
          <span className="text-muted-foreground block uppercase tracking-wider">Seat</span>
          <span className="text-primary-foreground font-bold text-xs">{data.seat || '--'}</span>
        </div>
        <div>
          <span className="text-muted-foreground block uppercase tracking-wider">Terminal</span>
          <span className="text-primary-foreground font-bold text-xs">{data.terminal || '--'}</span>
        </div>
      </div>
    </div>
  );
}
