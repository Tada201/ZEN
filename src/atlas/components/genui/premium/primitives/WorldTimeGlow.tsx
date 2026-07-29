import { useMemo } from "react";

interface WorldTimeGlowProps {
  timeStr?: string; // e.g. "10:30 AM" or "22:15" or "14:40"
  className?: string;
}

export function WorldTimeGlow({ timeStr = "12:00 PM", className }: WorldTimeGlowProps) {
  // Parse hour to determine day/night phase
  const isNight = useMemo(() => {
    const clean = timeStr.toLowerCase().trim();
    let hour = 12;
    const match = clean.match(/(\d+):/);
    if (match) {
      hour = parseInt(match[1], 10);
    }
    if (clean.includes("pm") && hour < 12) {
      hour += 12;
    } else if (clean.includes("am") && hour === 12) {
      hour = 0;
    }
    return hour < 6 || hour >= 18; // Night is 6 PM to 6 AM
  }, [timeStr]);

  // Compute position of day/night terminator (from 0 to 100% of the map width)
  const terminatorPos = useMemo(() => {
    const clean = timeStr.toLowerCase().trim();
    let hour = 12;
    let minute = 0;
    const match = clean.match(/(\d+):(\d+)/);
    if (match) {
      hour = parseInt(match[1], 10);
      minute = parseInt(match[2], 10);
    }
    if (clean.includes("pm") && hour < 12) hour += 12;
    else if (clean.includes("am") && hour === 12) hour = 0;

    const totalMinutes = hour * 60 + minute;
    // Map time to width (12:00 PM / noon is centered, night is on the edges)
    return (totalMinutes / 1440) * 100;
  }, [timeStr]);

  // Simple dot matrix grid representing continents
  const dots = [
    { x: 10, y: 15 }, { x: 12, y: 14 }, { x: 14, y: 13 }, // NA
    { x: 11, y: 18 }, { x: 13, y: 19 }, { x: 16, y: 22 }, // SA
    { x: 38, y: 10 }, { x: 42, y: 11 }, { x: 40, y: 13 }, // Europe
    { x: 41, y: 19 }, { x: 43, y: 22 }, { x: 45, y: 25 }, // Africa
    { x: 62, y: 12 }, { x: 66, y: 13 }, { x: 70, y: 15 }, // Asia
    { x: 72, y: 24 }, { x: 75, y: 26 }, { x: 78, y: 25 }, // Australia
  ];

  return (
    <div className={`flex items-center gap-3 p-2 rounded-xl bg-card border border-border ${className}`}>
      {/* iOS style animated Day/Night Clock indicator */}
      <div className="relative shrink-0 w-8 h-8 rounded-full border border-border flex items-center justify-center overflow-hidden transition-all duration-500 bg-gradient-to-br">
        {isNight ? (
          // Night Sky theme (Indigo/Violet)
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 to-slate-900 flex items-center justify-center">
            {/* Stars */}
            <div className="absolute w-0.5 h-0.5 rounded-full bg-white top-1 left-2 opacity-60" />
            <div className="absolute w-0.5 h-0.5 rounded-full bg-white top-5 left-5 opacity-40" />
            {/* Crescent Moon */}
            <div className="w-3.5 h-3.5 rounded-full bg-slate-100 shadow-[2px_0_0_0_rgba(255,255,255,0.8)_inset]" />
          </div>
        ) : (
          // Day Sun theme (Sky Blue/Amber Glow)
          <div className="absolute inset-0 bg-gradient-to-br from-sky-400 to-amber-200 flex items-center justify-center">
            {/* Sun */}
            <div className="w-3.5 h-3.5 rounded-full bg-amber-400 border border-amber-300 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
          </div>
        )}
        {/* Subtle center pin */}
        <div className="absolute w-1 h-1 rounded-full bg-muted-foreground z-10" />
      </div>

      {/* Mini Dot-Matrix World Map day/night indicator */}
      <div className="relative h-7 w-28 bg-muted border border-border rounded-md overflow-hidden shrink-0">
        <svg viewBox="0 0 90 30" className="w-full h-full">
          {/* Day/Night terminator shading */}
          <defs>
            <linearGradient id="dayNightGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(15,23,42,0.4)" />
              <stop offset={`${Math.max(0, terminatorPos - 15)}%`} stopColor="rgba(15,23,42,0.4)" />
              <stop offset={`${terminatorPos}%`} stopColor="rgba(245,158,11,0.08)" />
              <stop offset={`${Math.min(100, terminatorPos + 15)}%`} stopColor="rgba(15,23,42,0.4)" />
              <stop offset="100%" stopColor="rgba(15,23,42,0.4)" />
            </linearGradient>
          </defs>
          
          {/* Shadow layer */}
          <rect width="90" height="30" fill="url(#dayNightGrad)" />
          
          {/* Dot matrix landmasses */}
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r="1.2"
              className="fill-muted-foreground"
              style={{
                // Light up the dots if they fall into the daytime region
                fill: Math.abs(d.x - (terminatorPos * 0.9)) < 15 ? "hsl(var(--primary))" : undefined,
                opacity: Math.abs(d.x - (terminatorPos * 0.9)) < 15 ? 0.8 : 0.25,
                transition: "fill 0.5s ease, opacity 0.5s ease"
              }}
            />
          ))}
        </svg>
      </div>

      {/* Time label */}
      <div className="flex flex-col min-w-0">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono">Local Time</span>
        <span className="text-xs font-bold text-primary-foreground font-mono truncate">{timeStr}</span>
      </div>
    </div>
  );
}
