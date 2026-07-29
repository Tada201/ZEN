import { useState, useEffect } from 'react';
import { Clock, Calendar } from 'lucide-react';
import { useUpdateStore } from '@/lib/stores/updateStore';

export function StatusBar() {
  const [time, setTime] = useState(new Date());
  const currentVersion = useUpdateStore((state) => state.currentVersion);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = time.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="flex items-center justify-between w-full h-full px-4 text-xs font-sans text-muted-foreground capitalize tracking-normal">
      {/* Left Section: Static Warning Banner */}
      <div className="flex items-center h-full gap-3 border-l border-border pl-2 select-none">
        <span className="text-[9px] uppercase font-bold tracking-widest text-warning whitespace-nowrap">
          ⚠️ UNDER ACTIVE DEVELOPMENT — DEV BUILD
        </span>
        <span className="text-[9px] font-mono text-muted-foreground whitespace-nowrap">
          ZEN v{currentVersion || '...'}
        </span>
      </div>

      {/* Right Section: Clock and Date */}
      <div className="flex items-center gap-4 text-muted-foreground font-medium text-[11px]">
        <div className="flex items-center gap-1.5">
          <Calendar size={12} className="text-muted-foreground" />
          <span>{formattedDate}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-muted-foreground" />
          <span>{formattedTime}</span>
        </div>
      </div>
    </div>
  );
}