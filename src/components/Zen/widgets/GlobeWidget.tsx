import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/style';
import { Globe } from 'lucide-react';

interface GlobeWidgetProps {
  className?: string;
}

export function GlobeWidget({ className = '' }: GlobeWidgetProps) {
  const [isReady, setIsReady] = useState(false);
  const [markers, setMarkers] = useState<Array<{ lat: number; lon: number; label: string }>>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMarkers([
        { lat: 35.6762, lon: 139.6503, label: 'NODE_TOKYO' },
        { lat: 51.5074, lon: -0.1278, label: 'NODE_LONDON' },
        { lat: 40.7128, lon: -74.0060, label: 'NODE_NYC' },
      ]);
      setIsReady(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={cn(
      'card overflow-hidden',
      className
    )}>
      {/* Header */}
      <div className="h-[34px] flex items-center justify-between px-3 bg-muted border-b border-border">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-primary opacity-60" />
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">GEOSPATIAL_NETWORK</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn(
            'h-1.5 w-1.5 rounded-full',
            isReady ? 'bg-[hsl(160_84%_39%)] animate-pulse' : 'bg-muted-foreground'
          )} />
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-tighter">
            {isReady ? 'LIVE_STREAM' : 'INITIALIZING'}
          </span>
        </div>
      </div>

      {/* Globe Placeholder */}
      <div className="relative w-full h-[240px] bg-background flex items-center justify-center">
        {!isReady ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Globe size={48} className="opacity-30 animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest">LOADING_GLOBE_</span>
          </div>
        ) : (
          <>
            {/* Wireframe globe effect */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-40 h-40 rounded-full border-2 border-primary/20 animate-spin" style={{ animationDuration: '20s' }} />
              <div className="absolute w-32 h-32 rounded-full border border-primary/10 animate-spin" style={{ animationDuration: '15s', animationDirection: 'reverse' }} />
            </div>

            {/* Node markers */}
            {markers.map((marker, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(167,139,250,0.5)]"
                style={{
                  top: `${30 + (i * 20)}%`,
                  left: `${20 + (i * 25)}%`,
                }}
              />
            ))}

            {/* Overlay stats */}
            <div className="absolute top-3 left-3 z-10">
              <div className="bg-card/60 backdrop-blur-md border border-border px-2 py-1.5 rounded-sm">
                <div className="text-[8px] text-primary/60 font-bold tracking-widest uppercase mb-0.5">CORE_LOC</div>
                <div className="text-[10px] font-mono font-bold text-[hsl(160_84%_39%)]">35.6762, 139.6503</div>
              </div>
            </div>

            {/* Radar info */}
            <div className="absolute bottom-3 right-3 z-10 text-right">
              <div className="text-[9px] font-mono text-primary/60 uppercase tracking-widest">RADAR: ACTIVE</div>
              <div className="text-[8px] font-mono text-muted-foreground uppercase tracking-tighter">WIREFRAME_LINK: SECURE</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}