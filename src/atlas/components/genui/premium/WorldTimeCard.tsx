import { useState, useMemo, useEffect, useId } from "react";
import { Globe, MapPin, ChevronLeft, ChevronRight, Grid, ListCollapse, Layers } from "lucide-react";
import * as SunCalc from "suncalc";
import { CardShell, CardTitle } from "./CardShell";

interface ClockEntry {
  country: string;
  city: string;
  time: string; // e.g. "10:30 AM" or "22:15"
  timezone?: string;
  latitude?: number; // -90 to 90
  longitude?: number; // -180 to 180
}

interface WorldTimeCardData {
  title?: string;
  clocks: ClockEntry[];
}

export function WorldTimeCard({ data }: { data: WorldTimeCardData }) {
  const title = data.title || "World Clock Monitor";
  const clocks = useMemo(() => data.clocks || [], [data.clocks]);
  const mapId = useId().replace(/:/g, "");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [showTimezoneOverlay, setShowTimezoneOverlay] = useState(false);

  // Ticking seconds for smooth analog clock second hands
  const [secondsOffset, setSecondsOffset] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsOffset((prev) => (prev + 1) % 60);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Parse time details for all clocks
  const parsedClocks = useMemo(() => {
    return clocks.map((c) => {
      const clean = c.time.toLowerCase().trim();
      let hour = 12;
      let minute = 0;
      const match = clean.match(/(\d+):(\d+)/);
      if (match) {
        hour = parseInt(match[1], 10);
        minute = parseInt(match[2], 10);
      }
      if (clean.includes("pm") && hour < 12) hour += 12;
      else if (clean.includes("am") && hour === 12) hour = 0;

      const offsetHrs = Math.round((c.longitude ?? 0) / 15);

      // SunCalc calculations aligned with the displayed time
      const lat = c.latitude ?? 0;
      const lng = c.longitude ?? 0;
      
      // Construct a mock Date where the active local time corresponds to the solar time position
      const mockDate = new Date();
      // Adjust UTC hours/minutes of mockDate to reflect the displayed time
      mockDate.setUTCHours((hour - offsetHrs + 24) % 24);
      mockDate.setUTCMinutes(minute);

      const sunTimes = SunCalc.getTimes(mockDate, lat, lng);
      
      const formatTime = (date: Date) => {
        let hrs = date.getHours();
        const mins = date.getMinutes().toString().padStart(2, "0");
        const ampm = hrs >= 12 ? "PM" : "AM";
        hrs = hrs % 12;
        hrs = hrs ? hrs : 12;
        return `${hrs}:${mins} ${ampm}`;
      };

      const sunrise = sunTimes.sunrise ? formatTime(sunTimes.sunrise) : "N/A";
      const sunset = sunTimes.sunset ? formatTime(sunTimes.sunset) : "N/A";

      // A simple, accurate day/night threshold based on the parsed local hour (6 AM to 6 PM)
      const isNight = hour < 6 || hour >= 18;

      return {
        ...c,
        hour,
        minute,
        offsetHrs,
        sunrise,
        sunset,
        isNight
      };
    });
  }, [clocks]);

  const activeClock = parsedClocks[activeIndex] || {
    country: "GMT",
    city: "London",
    time: "12:00 PM",
    timezone: "UTC",
    latitude: 51.5074,
    longitude: -0.1278,
    hour: 12,
    minute: 0,
    offsetHrs: 0,
    sunrise: "6:00 AM",
    sunset: "6:00 PM",
    isNight: false
  };

  // Build the day/night terminator path dynamically based on active clock's time position
  const terminatorPath = useMemo(() => {
    const points: string[] = [];
    const width = 784.077;
    
    // Construct mock Date representing the active clock's solar time
    const mockDate = new Date();
    // Shift UTC hours to match the active clock local time relative to longitude
    mockDate.setUTCHours((activeClock.hour - (activeClock.offsetHrs ?? 0) + 24) % 24);
    mockDate.setUTCMinutes(activeClock.minute);

    // Check if the South Pole is currently in night under this time configuration
    const isSouthPoleNight = SunCalc.getPosition(mockDate, -90, 0).altitude <= 0;

    // We generate 40 longitudinal samples across the map (-180 to 180 degrees)
    for (let i = 0; i <= 40; i++) {
      const lng = -180 + (i / 40) * 360;
      
      // Binary search the exact boundary latitude where sun altitude is 0
      let low = -90;
      let high = 90;
      for (let step = 0; step < 8; step++) {
        const mid = (low + high) / 2;
        const alt = SunCalc.getPosition(mockDate, mid, lng).altitude;
        const altNorth = SunCalc.getPosition(mockDate, mid + 0.5, lng).altitude;
        const increasesNorth = altNorth > alt;

        if (alt > 0) {
          if (increasesNorth) {
            high = mid;
          } else {
            low = mid;
          }
        } else {
          if (increasesNorth) {
            low = mid;
          } else {
            high = mid;
          }
        }
      }
      const boundaryLat = (low + high) / 2;
      
      const px = 30.767 + (i / 40) * width;
      const py = 241.591 + ((90 - boundaryLat) / 180) * 458.627;
      points.push(`${px},${py}`);
    }

    if (isSouthPoleNight) {
      return `M 30.767,700.218 L ${points.join(" L ")} L 814.844,700.218 Z`;
    } else {
      return `M 30.767,241.591 L ${points.join(" L ")} L 814.844,241.591 Z`;
    }
  }, [activeClock, activeClock.hour, activeClock.minute]);

  // Map coordinate bounds to SVG viewBox (30.767 241.591 784.077 458.627)
  const getCoords = (lat: number, lng: number) => {
    const x = 30.767 + ((lng + 180) / 360) * 784.077;
    const y = 241.591 + ((90 - lat) / 180) * 458.627;
    return { x, y };
  };

  // Active clock rotations
  const activeHourRotation = activeClock.hour * 30 + activeClock.minute * 0.5;
  const activeMinuteRotation = activeClock.minute * 6;
  const activeSecondRotation = secondsOffset * 6;

  const handlePrev = () => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : clocks.length - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev < clocks.length - 1 ? prev + 1 : 0));
  };

  // Generate 24 Timezone Meridian Lines (spaced 15 degrees longitude apart)
  const timezoneMeridians = useMemo(() => {
    const lines = [];
    for (let offset = -12; offset <= 12; offset++) {
      const lng = offset * 15;
      const x = 30.767 + ((lng + 180) / 360) * 784.077;
      lines.push({ x, offset: offset >= 0 ? `+${offset}` : `${offset}` });
    }
    return lines;
  }, []);

  return (
    <CardShell motion={false} className="relative flex flex-col overflow-hidden border-border bg-muted p-0 gap-0">
      <style>{`
        @keyframes selection-sonar {
          0% { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .time-gradient-day {
          background: linear-gradient(135deg, rgba(250,204,21,0.06) 0%, rgba(56,189,248,0.02) 100%);
        }
        .time-gradient-night {
          background: linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(15,23,42,0.3) 100%);
        }
      `}</style>

      {/* Dynamic ambient backdrop shift */}
      <div className={`absolute inset-0 transition-colors duration-1000 ${activeClock.isNight ? 'time-gradient-night' : 'time-gradient-day'}`} />

      {/* Left-Right side-by-side split board */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 items-stretch min-h-[252px]">
        
        {/* Left Column (25% width / col-span-3) - Analog Clock Face Focus + Controls */}
        <div className="md:col-span-3 flex flex-col justify-between p-4 relative overflow-hidden border-b md:border-b-0 md:border-r border-border">
          {/* Header Title */}
          <div className="flex items-center gap-2 border-b border-border pb-3 mb-2">
            <Globe className="w-4 h-4 text-primary" />
            <CardTitle className="text-[10px] font-bold tracking-widest font-mono uppercase text-primary-foreground">
              {title}
            </CardTitle>
          </div>

          <div className="flex flex-col items-center justify-center text-center gap-3 py-3 relative group">
            {/* Nav Arrows directly integrated on top of the left clock panel */}
            {clocks.length > 1 && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-between pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-20">
                <button
                  onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-muted border-border text-primary-foreground hover:text-primary hover:scale-105 active:scale-95 transition-all pointer-events-auto shadow-md"
                  title="Previous City"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleNext(); }}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-muted border-border text-primary-foreground hover:text-primary hover:scale-105 active:scale-95 transition-all pointer-events-auto shadow-md"
                  title="Next City"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* iOS Style Large Analog Clock Face */}
            <div className={`relative w-24 h-24 rounded-full border flex items-center justify-center shadow-lg overflow-hidden ${
              activeClock.isNight ? "bg-[#18181b] border-border" : "bg-white border-zinc-200"
            }`}>
              <div className={`absolute inset-1.5 rounded-full border border-dashed opacity-10 ${activeClock.isNight ? "border-white" : "border-black"}`} />
              <span className={`absolute top-1.5 text-[9px] font-bold ${activeClock.isNight ? "text-zinc-500" : "text-zinc-400"}`}>12</span>
              <span className={`absolute right-2 text-[9px] font-bold ${activeClock.isNight ? "text-zinc-500" : "text-zinc-400"}`}>3</span>
              <span className={`absolute bottom-1.5 text-[9px] font-bold ${activeClock.isNight ? "text-zinc-500" : "text-zinc-400"}`}>6</span>
              <span className={`absolute left-2 text-[9px] font-bold ${activeClock.isNight ? "text-zinc-500" : "text-zinc-400"}`}>9</span>

              {/* Hour Hand */}
              <div
                className={`absolute w-0.5 rounded-full bottom-1/2 left-[calc(50%-1px)] origin-bottom transition-transform duration-500 ${
                  activeClock.isNight ? "bg-white" : "bg-zinc-900"
                }`}
                style={{ transform: `rotate(${activeHourRotation}deg)`, height: '18px' }}
              />
              {/* Minute Hand */}
              <div
                className={`absolute w-0.5 rounded-full bottom-1/2 left-[calc(50%-1px)] origin-bottom transition-transform duration-500 ${
                  activeClock.isNight ? "bg-zinc-300" : "bg-zinc-800"
                }`}
                style={{ transform: `rotate(${activeMinuteRotation}deg)`, height: '24px' }}
              />
              {/* Orange Second Hand */}
              <div
                className="absolute w-[0.5px] rounded-full bottom-1/2 left-[calc(50%-0.25px)] origin-bottom bg-amber-500"
                style={{ transform: `rotate(${activeSecondRotation}deg)`, height: '26px' }}
              />
              {/* Center Dot */}
              <div className={`absolute w-2.5 h-2.5 rounded-full border border-amber-500 ${
                activeClock.isNight ? "bg-white" : "bg-zinc-900"
              }`} />
            </div>

            {/* City details */}
            <div className="flex flex-col gap-0.5 min-w-0 w-full mt-1">
              <span className="text-[8px] font-mono tracking-widest text-primary/75 uppercase font-bold">
                {activeClock.country}
              </span>
              <h3 className="text-base font-black text-primary-foreground tracking-tight truncate leading-tight mt-0.5">
                {activeClock.city}
              </h3>
              <div className="flex flex-col items-center gap-0.5 mt-1 font-mono">
                {/* Clock timer text made bigger (text-2xl font-black) */}
                <span className="text-2xl font-black text-primary-foreground tracking-tighter drop-shadow-sm">
                  {activeClock.time}
                </span>
                <span className={`text-[9px] font-bold ${activeClock.offsetHrs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {activeClock.offsetHrs >= 0 ? `+${activeClock.offsetHrs} HOURS` : `${activeClock.offsetHrs} HOURS`}
                </span>
              </div>

              {/* Sunrise/Sunset times */}
              <div className="flex items-center justify-center gap-2 mt-2 border-t border-border pt-2 text-[8px] font-mono text-muted-foreground leading-none">
                <span>☀ {activeClock.sunrise}</span>
                <span>☾ {activeClock.sunset}</span>
              </div>
            </div>
          </div>

          {/* Bottom Left Corner: Expand/Collapse icon-only button */}
          {clocks.length > 1 && (
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <button
                onClick={() => setIsListExpanded(prev => !prev)}
                className="w-7 h-7 flex items-center justify-center rounded-lg border-border bg-muted hover:bg-muted text-primary hover:scale-105 active:scale-95 transition-all"
                title={isListExpanded ? "Collapse clocks panel" : "Expand clocks panel"}
              >
                {isListExpanded ? (
                  <ListCollapse className="w-4 h-4" />
                ) : (
                  <Grid className="w-4 h-4" />
                )}
              </button>
              <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest leading-none">
                OVERVIEW
              </span>
            </div>
          )}
        </div>

        {/* Right Column (75% width / col-span-9) - Flush Coordinate Projector Map */}
        <div className="md:col-span-9 bg-black relative flex flex-col justify-center min-h-[210px] md:min-h-[252px]">
          
          {/* Overlay Map Headers */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 text-[8.5px] font-mono text-muted-foreground bg-muted border-border rounded-md px-2 py-0.5 pointer-events-none">
            <MapPin className="w-3.5 h-3.5 text-primary" /> COORDINATE PROJECTOR
          </div>
          
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            {/* Timezone Map Overlay Toggle Button */}
            <button
              onClick={() => setShowTimezoneOverlay(prev => !prev)}
              className={`flex items-center gap-1 text-[8.5px] font-mono font-bold bg-card hover:bg-black border rounded-md px-2.5 py-1 transition-all shadow-md ${
                showTimezoneOverlay ? "text-primary border-primary" : "text-muted-foreground border-border"
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>ZONE MAP</span>
            </button>

            <div className="text-[8.5px] font-mono text-muted-foreground bg-muted border-border rounded-md px-2 py-1 pointer-events-none">
              LAT: {activeClock.latitude ?? 0}° · LNG: {activeClock.longitude ?? 0}°
            </div>
          </div>

          {/* SVG Map Container stretched to fill edges */}
          <svg viewBox="30.767 241.591 784.077 458.627" className="w-full h-full object-cover">
            <defs>
              <mask id={`${mapId}-mapMask`}>
                <rect x="30.767" y="241.591" width="784.077" height="458.627" fill="black" />
                <image href="/world-map.svg" x="30.767" y="241.591" width="784.077" height="458.627" style={{ filter: "invert(1)" }} />
              </mask>
            </defs>

            {/* Ocean layer */}
            <rect x="30.767" y="241.591" width="784.077" height="458.627" fill="#070708" />

            {/* Base Continents map outline */}
            <image href="/world-map.svg" x="30.767" y="241.591" width="784.077" height="458.627" style={{ filter: "invert(1) sepia(0) saturate(0) brightness(0.20)" }} />

            {/* Local Accurate Geographic Timezone Meridian Lines Grid Overlay */}
            {showTimezoneOverlay && (
              <g opacity="0.25">
                {timezoneMeridians.map((m, i) => (
                  <g key={i}>
                    {/* Vertical Meridian Boundary */}
                    <line
                      x1={m.x}
                      y1="241.591"
                      x2={m.x}
                      y2="700.218"
                      stroke="rgba(255,255,255,0.4)"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    {/* Meridian UTC offset label */}
                    <text
                      x={m.x}
                      y="690"
                      textAnchor="middle"
                      className="fill-white font-mono text-[7px]"
                    >
                      {m.offset}
                    </text>
                  </g>
                ))}
              </g>
            )}

            {/* Day/Night Shading */}
            <g mask={`url(#${mapId}-mapMask)`}>
              <path d={terminatorPath} fill="black" opacity="0.45" />
            </g>

            {/* Terminator boundary curve line */}
            <path
              d={terminatorPath.replace(/ Z$/, "")}
              fill="none"
              stroke="rgba(255, 255, 255, 0.22)"
              strokeWidth="2.5"
            />

            {/* City coordinate pins */}
            {parsedClocks.map((c, idx) => {
              if (c.latitude === undefined || c.longitude === undefined) return null;
              const { x, y } = getCoords(c.latitude, c.longitude);
              const isActive = idx === activeIndex;

              return (
                <g key={idx} className="cursor-pointer" onClick={() => setActiveIndex(idx)}>
                  {/* Active Radar Sonar wave */}
                  {isActive && (
                    <circle
                      cx={x}
                      cy={y}
                      r="22"
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="2.2"
                      className="origin-center"
                      style={{
                        animation: "selection-sonar 1.8s infinite cubic-bezier(0.215, 0.610, 0.355, 1)",
                        transformOrigin: `${x}px ${y}px`
                      }}
                    />
                  )}

                  <circle
                    cx={x}
                    cy={y}
                    r={isActive ? "6.5" : "5"}
                    className={isActive ? "fill-primary" : "fill-amber-500"}
                  />

                  <text
                    x={x + 10}
                    y={y + 3}
                    className="font-sans font-bold select-none"
                    style={{
                      fontSize: isActive ? "13px" : "11px",
                      fill: isActive ? "white" : "rgba(255, 255, 255, 0.75)",
                      textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,0.9)"
                    }}
                  >
                    {c.city} <tspan fontStyle="normal" fontWeight="normal" fill="rgba(255,255,255,0.4)">{c.time}</tspan>
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

      </div>

      {/* Expanded City Grid Cards Panel (Row) */}
      {isListExpanded && clocks.length > 1 && (
        <div className="relative z-10 p-4 border-t border-border bg-muted animate-[fadeIn_0.2s_ease-out]">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {parsedClocks.map((c, idx) => {
              const isActive = idx === activeIndex;
              const hourRotation = c.hour * 30 + c.minute * 0.5;
              const minuteRotation = c.minute * 6;
              const secondRotation = secondsOffset * 6;

              return (
                <div
                  key={idx}
                  onClick={() => setActiveIndex(idx)}
                  className={`cursor-pointer rounded-2xl border p-4 flex flex-col items-center text-center gap-3 transition-all ${
                    isActive
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border bg-muted hover:bg-muted"
                  }`}
                >
                  <div className={`relative w-16 h-16 rounded-full border flex items-center justify-center shadow-md overflow-hidden ${
                    c.isNight ? "bg-[#18181b] border-border" : "bg-white border-zinc-200"
                  }`}>
                    <div className={`absolute inset-1 rounded-full border border-dashed opacity-10 ${c.isNight ? "border-white" : "border-black"}`} />
                    <span className={`absolute top-0.5 text-[7px] font-bold ${c.isNight ? "text-zinc-500" : "text-zinc-400"}`}>12</span>
                    <span className={`absolute right-1 text-[7px] font-bold ${c.isNight ? "text-zinc-500" : "text-zinc-400"}`}>3</span>
                    <span className={`absolute bottom-0.5 text-[7px] font-bold ${c.isNight ? "text-zinc-500" : "text-zinc-400"}`}>6</span>
                    <span className={`absolute left-1 text-[7px] font-bold ${c.isNight ? "text-zinc-500" : "text-zinc-400"}`}>9</span>

                    {/* Hands */}
                    <div
                      className={`absolute w-0.5 rounded-full bottom-1/2 left-[calc(50%-1px)] origin-bottom transition-transform duration-500 ${
                        c.isNight ? "bg-white" : "bg-zinc-900"
                      }`}
                      style={{ transform: `rotate(${hourRotation}deg)`, height: '12px' }}
                    />
                    <div
                      className={`absolute w-0.5 rounded-full bottom-1/2 left-[calc(50%-1px)] origin-bottom transition-transform duration-500 ${
                        c.isNight ? "bg-zinc-300" : "bg-zinc-800"
                      }`}
                      style={{ transform: `rotate(${minuteRotation}deg)`, height: '16px' }}
                    />
                    <div
                      className="absolute w-[0.5px] rounded-full bottom-1/2 left-[calc(50%-0.25px)] origin-bottom bg-amber-500"
                      style={{ transform: `rotate(${secondRotation}deg)`, height: '18px' }}
                    />
                    <div className={`absolute w-1.5 h-1.5 rounded-full border border-amber-500 ${
                      c.isNight ? "bg-white" : "bg-zinc-900"
                    }`} />
                  </div>

                  <div className="flex-col gap-0.5 min-w-0 w-full">
                    <h4 className="text-xs font-bold text-primary-foreground truncate leading-tight">
                      {c.city}
                    </h4>
                    <span className="text-[9px] font-mono text-muted-foreground leading-none">
                      {c.time}
                    </span>
                    <span className={`text-[8px] font-mono leading-none mt-1 ${c.offsetHrs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {c.offsetHrs >= 0 ? `+${c.offsetHrs} HRS` : `${c.offsetHrs} HRS`}
                    </span>
                    
                    <div className="flex items-center justify-center gap-1.5 mt-1.5 border-t border-border pt-1.5 text-[7.5px] font-mono text-muted-foreground leading-none">
                      <span>☀ {c.sunrise}</span>
                      <span>☾ {c.sunset}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </CardShell>
  );
}
