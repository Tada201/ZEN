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
      {/* Left Section: Scrolling Warning Banner */}
      <div className="flex items-center h-full max-w-[280px] overflow-hidden relative border-l border-white/5 pl-2">
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes subtle-flash {
            0%, 100% { color: rgba(251, 191, 36, 0.6); text-shadow: 0 0 4px rgba(251,191,36,0.1); }
            50% { color: rgba(251, 191, 36, 0.95); text-shadow: 0 0 8px rgba(251,191,36,0.3); }
          }
          @keyframes marquee {
            0% { transform: translateX(0%); }
            100% { transform: translateX(-50%); }
          }
          .animate-marquee {
            animation: marquee 15s linear infinite;
            display: inline-block;
            white-space: nowrap;
          }
          .animate-flash {
            animation: subtle-flash 3s ease-in-out infinite;
          }
        `}} />
        
        {/* Fading edges to make the scrolling smooth */}
        <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-[#0d0d11] to-transparent z-10 pointer-events-none"></div>
        <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-[#0d0d11] to-transparent z-10 pointer-events-none"></div>

        <div className="animate-marquee flex gap-8">
          <span className="text-[10px] uppercase font-bold tracking-widest animate-flash whitespace-nowrap">
            ⚠️ WARNING: APP IS UNDER ACTIVE DEVELOPMENT — EXPECT INSTABILITY
          </span>
          <span className="text-[10px] uppercase font-bold tracking-widest animate-flash whitespace-nowrap">
            ⚠️ WARNING: APP IS UNDER ACTIVE DEVELOPMENT — EXPECT INSTABILITY
          </span>
        </div>
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