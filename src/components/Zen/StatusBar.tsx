import { useState, useEffect } from 'react';
import { Clock, Calendar } from 'lucide-react';

export function StatusBar() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = time.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="flex items-center justify-between w-full h-full px-4 text-xs font-sans text-zinc-400 capitalize tracking-normal">
      {/* Left Section: Static Warning Banner */}
      <div className="flex items-center h-full border-l border-white/5 pl-2 select-none">
        <span className="text-[9px] uppercase font-bold tracking-widest text-amber-500/70 whitespace-nowrap">
          ⚠️ UNDER ACTIVE DEVELOPMENT — DEV BUILD
        </span>
      </div>

      {/* Right Section: Clock and Date */}
      <div className="flex items-center gap-4 text-zinc-500 font-medium text-[11px]">
        <div className="flex items-center gap-1.5">
          <Calendar size={12} className="text-zinc-500/80" />
          <span>{formattedDate}</span>
        </div>
        <div className="h-3 w-px bg-white/5" />
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-zinc-500/80" />
          <span>{formattedTime}</span>
        </div>
      </div>
    </div>
  );
}