import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/style';
import { Button } from '@/components/ui/button';
import { Plane, Satellite, Activity, Ship, Crosshair } from 'lucide-react';

interface SpatialEntity {
  id: string;
  type: string;
  position: { lat: number; lon: number; alt?: number };
  metadata: Record<string, unknown>;
  velocity?: number;
}

interface TelemetrySnapshot {
  entity_id: string;
  timestamp: number;
  alt?: number;
  velocity?: number;
  raw_data?: string;
}

interface TargetInspectorProps {
  className?: string;
  selectedTarget?: SpatialEntity | null;
  recentSnapshots?: TelemetrySnapshot[];
  isAnalyzing?: boolean;
  onAnalyze?: () => void;
}

function SignalSparkline({ target, snapshots }: { target: SpatialEntity; snapshots: TelemetrySnapshot[] }) {
  const entitySnaps = snapshots.filter(s => s.entity_id === target.id).sort((a, b) => a.timestamp - b.timestamp);

  let values: number[] = [];
  if (target.type === 'earthquake') {
    values = entitySnaps.map(s => {
      try {
        const meta = JSON.parse(s.raw_data || '{}');
        return parseFloat(meta.magnitude || meta.mag || (target.metadata.mag as string) || '0');
      } catch { return 0; }
    });
  } else {
    values = entitySnaps.map(s => s.alt || s.velocity || 0);
  }

  let points = "0,20 10,22 20,15 30,25 40,10 50,18 60,5 70,15 80,8 90,20 100,10";
  if (values.length > 1) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    points = values.map((val, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 25 - ((val - min) / range) * 20;
      return `${x},${y}`;
    }).join(" ");
  } else if (values.length === 1) {
    points = "0,15 100,15";
  }

  return (
    <div className="flex flex-col bg-background border border-border px-4 py-3 relative overflow-hidden group shrink-0 mt-3">
      <div className="flex justify-between items-center mb-2 relative z-10">
        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1">
          DATALINK TREND
        </span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[7px]">RAW</Button>
          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[7px]">EXP</Button>
        </div>
      </div>
      <div className="h-12 w-full relative z-10">
        <div className="absolute inset-0 flex flex-col justify-between py-1">
          <div className="w-full h-[1px] bg-border" />
          <div className="w-full h-[1px] bg-border" />
          <div className="w-full h-[1px] bg-border" />
          <div className="w-full h-[1px] bg-border" />
        </div>
        <svg viewBox="0 0 100 30" width="100%" height="100%" className="overflow-visible opacity-80 group-hover:opacity-100 transition-opacity" preserveAspectRatio="none">
          <defs>
            <linearGradient id="signalGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="30%" stopColor="hsl(262 83% 65% / 0.4)" />
              <stop offset="100%" stopColor="hsl(262 83% 65%)" />
            </linearGradient>
          </defs>
          <polyline
            points={points}
            fill="none"
            stroke="url(#signalGradient)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx="100" cy="10" r="2" fill="hsl(262 83% 65%)" className="animate-pulse" />
          {Array.from({ length: 20 }).map((_, i) => (
            <rect key={i} x={i * 5} y="28" width="3" height={((Math.sin(i * 1.5) + 1) / 2) * 8} fill="hsl(262 83% 65% / 0.2)" />
          ))}
        </svg>
      </div>
    </div>
  );
}

function renderTypeIcon(type: string) {
  const iconMap: Record<string, React.ReactNode> = {
    flight: <Plane size={14} className="text-muted-foreground" />,
    military: <Plane size={14} className="text-muted-foreground" />,
    satellite: <Satellite size={14} className="text-muted-foreground" />,
    earthquake: <Activity size={14} className="text-muted-foreground" />,
    vessel: <Ship size={14} className="text-muted-foreground" />,
  };
  return <div className="flex items-center">{iconMap[type] || <Crosshair size={14} className="text-muted-foreground" />}</div>;
}

const TargetInspector: React.FC<TargetInspectorProps> = ({
  className,
  selectedTarget = null,
  recentSnapshots = [],
  isAnalyzing = false,
  onAnalyze,
}) => {
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  function renderTimeSinceUpdate(target: SpatialEntity) {
    const timeVal = target.metadata.time;
    if (!timeVal) {
      return (
        <div className="flex items-center gap-1.5 mt-2 bg-primary/10 px-3 py-2 border border-primary/20">
          <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
          <span className="text-[8px] text-primary font-bold tracking-widest uppercase">LIVE DATALINK ACTIVE</span>
        </div>
      );
    }
    const timestamp = Number(timeVal);
    if (!isNaN(timestamp) && timestamp > 1000000000) {
      const diffMs = now - timestamp;
      const mins = Math.max(0, Math.floor(diffMs / 60000));
      const colorClass = mins > 60 ? 'text-destructive' : 'text-primary';
      return (
        <div className="flex items-center gap-1.5 mt-2 bg-background px-3 py-2 border border-border">
          <span className={cn('text-[8px] text-muted-foreground font-bold tracking-widest uppercase', colorClass)}>
            LAST UPDATE: {mins} MINS AGO
          </span>
        </div>
      );
    }
    return null;
  }

  function renderDataWidget(target: SpatialEntity) {
    if (target.type === 'earthquake') {
      const mag = Number(target.metadata.mag) || 0;
      const depth = Number(target.metadata.depth) || 0;
      const magPercentage = Math.min((mag / 10) * 100, 100);
      const isSevere = mag >= 6.0;
      return (
        <div className="flex flex-col gap-2 mt-3 shrink-0">
          <div className="bg-background border border-border px-4 py-3 relative overflow-hidden">
            <div className="flex justify-between items-center z-10 mb-2">
              <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1">
                {isSevere ? 'SEVERE' : 'SEISMIC MAGNITUDE'}
              </span>
              <span className="text-sm font-mono font-bold text-primary">{mag.toFixed(1)}</span>
            </div>
            <div className="h-1.5 w-full bg-muted border border-border relative overflow-hidden">
              <div className="h-full transition-all duration-1000 bg-primary" style={{ width: `${magPercentage}%` }} />
            </div>
          </div>
          <div className="bg-background border border-border px-4 py-3 flex justify-between items-center">
            <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">DEPTH TO CORE</span>
            <div className="text-xs text-foreground font-mono">{depth.toFixed(1)} <span className="text-[9px] text-muted-foreground">km</span></div>
          </div>
        </div>
      );
    }

    if (target.type === 'flight' || target.type === 'military') {
      const heading = Number(target.metadata.true_track) || 0;
      const altitude = target.position.alt || 0;
      const velocity = target.velocity || 0;

      return (
        <div className="grid grid-cols-2 gap-2 mt-3 shrink-0">
          <div className="bg-background border border-border flex flex-col items-center justify-center py-2 relative overflow-hidden">
            <span className="text-[8px] text-muted-foreground uppercase tracking-widest font-bold mb-1 w-full text-center border-b border-border pb-1">HEADING</span>
            <div className="relative w-12 h-12 my-1">
              <svg viewBox="0 0 50 50" className="w-full h-full">
                <circle cx="25" cy="25" r="20" fill="none" stroke="hsl(0 0% 100% / 0.1)" strokeWidth="1" strokeDasharray="2 4" />
                <g style={{ transform: `rotate(${heading}deg)`, transformOrigin: 'center' }}>
                  <path d="M25 5 L30 35 L25 30 L20 35 Z" fill="hsl(160 84% 39%)" />
                </g>
              </svg>
            </div>
            <div className="text-xs text-primary font-mono font-bold mt-1 z-10">{heading.toFixed(0)}°</div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="bg-background px-3 py-3 border border-border flex justify-between items-center flex-1">
              <div className="flex flex-col">
                <span className="text-[8px] text-muted-foreground uppercase tracking-widest font-bold mb-0.5">ALTITUDE</span>
                <div className="text-sm text-foreground font-mono font-bold">{(altitude / 1000).toFixed(1)} <span className="text-[9px] text-muted-foreground">km</span></div>
              </div>
            </div>
            <div className="bg-background px-3 py-2 border border-border flex justify-between items-center flex-1">
              <span className="text-[8px] text-muted-foreground uppercase tracking-widest font-bold">VELOCITY</span>
              <div className="text-sm text-primary font-mono font-bold flex items-baseline gap-1">
                {velocity.toFixed(2)}<span className="text-[9px] text-muted-foreground">km/s</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (target.type === 'satellite') {
      const velocity = target.velocity || 0;
      const altitude = target.position.alt || 0;

      return (
        <div className="flex flex-col gap-2 mt-3 shrink-0">
          <div className="bg-background border border-primary/30 px-4 py-3 flex justify-between relative overflow-hidden">
            <div className="flex flex-col">
              <span className="text-[8px] text-muted-foreground uppercase tracking-widest font-bold mb-1">ORBITAL VELOCITY</span>
              <div className="text-base text-primary font-mono font-bold">
                {velocity.toFixed(3)} <span className="text-[9px] text-muted-foreground">km/s</span>
              </div>
            </div>
          </div>
          <div className="bg-background border border-border px-4 py-3 flex justify-between items-center">
            <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">ORBITAL ALTITUDE</span>
            <div className="text-sm text-foreground font-mono font-bold">
              {(altitude / 1000).toFixed(1)} <span className="text-[9px] text-muted-foreground">km</span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <aside className={cn(
      'flex flex-col bg-card border-l border-border pointer-events-auto w-[260px] h-full',
      className
    )}>
      {/* Header */}
      <div className="h-[44px] flex items-center justify-between px-3 border-b border-border bg-muted/50 cursor-pointer select-none">
        <div className="flex items-center gap-2 overflow-hidden">
          {selectedTarget ? renderTypeIcon(selectedTarget.type) : <span className="text-muted-foreground text-sm">Target</span>}
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">TARGET_INSPECTOR</span>
        </div>
      </div>

      {!selectedTarget && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-30 p-4">
          <span className="text-muted-foreground text-sm animate-pulse">AWAITING TARGET SIGNAL...</span>
        </div>
      )}

      {selectedTarget && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
          {/* Identification Block */}
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Tracking ID</span>
                <div className="text-[13px] font-mono font-bold text-foreground truncate">{selectedTarget.id}</div>
              </div>
              <span className="px-2 py-0.5 border border-primary/20 bg-primary/5 rounded-sm text-[8px] text-primary font-bold tracking-widest uppercase">{selectedTarget.type}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Designation</span>
              <div className="text-[11px] text-muted-foreground font-medium truncate">
                {String(selectedTarget.metadata.name || selectedTarget.metadata.callsign || selectedTarget.metadata.flight || selectedTarget.metadata.title || "UNKNOWN DESIGNATION")}
              </div>
            </div>
            {renderTimeSinceUpdate(selectedTarget)}
          </div>

          {/* Dynamic Data Widget */}
          {renderDataWidget(selectedTarget)}

          {/* Sparkline */}
          <SignalSparkline target={selectedTarget} snapshots={recentSnapshots} />

          {/* Analyze Button */}
          <Button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className={cn(
              'press w-full flex items-center justify-center gap-2 py-2.5 rounded-md border transition-all',
              isAnalyzing
                ? 'border-primary/20 bg-primary/5 text-primary/40 cursor-not-allowed'
                : 'border-border bg-muted text-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary'
            )}
          >
            {isAnalyzing ? <span className="animate-spin">⟳</span> : <span>⚡</span>}
            <span className="text-[10px] font-bold tracking-widest uppercase">{isAnalyzing ? 'Processing' : 'Tactical Analysis'}</span>
          </Button>

          {/* Metadata Grid */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">DATALINK GRID</span>
            <div className="grid grid-cols-1 gap-px bg-border border border-border rounded-sm overflow-hidden">
              {Object.entries(selectedTarget.metadata).map(([key, value]) => {
                if (value === undefined || value === null || value === '') return null;
                let displayValue = String(value);
                if (typeof value === 'object') displayValue = '{...}';
                return (
                  <div key={key} className="flex justify-between items-center px-2 py-1.5 bg-background">
                    <span className="text-[9px] text-muted-foreground font-medium uppercase">{key}</span>
                    <span className="text-[9px] text-foreground font-mono">{displayValue}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export { TargetInspector };