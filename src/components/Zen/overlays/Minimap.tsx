import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils/style';
import { Map } from 'lucide-react';

interface MinimapProps {
  className?: string;
  viewportCenter?: { lat: number; lon: number };
  entities?: Array<{ lat: number; lon: number; type: string }>;
  onViewportClick?: (lat: number, lon: number) => void;
}

const CANVAS_W = 480;
const CANVAS_H = 240;
const LAND_FILL = 'rgba(167, 139, 250, 0.04)';
const BORDER_COLOR = 'rgba(167, 139, 250, 0.25)';
const GRID_COLOR = 'rgba(167, 139, 250, 0.08)';
const CROSSHAIR_COLOR = 'rgba(167, 139, 250, 0.7)';

const lonToX = (lon: number) => ((lon + 180) / 360) * CANVAS_W;
const latToY = (lat: number) => ((90 - lat) / 180) * CANVAS_H;

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 5]);
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = lonToX(lon);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    const y = latToY(lat);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(167, 139, 250, 0.15)';
  ctx.lineWidth = 0.8;
  const eqY = latToY(0);
  ctx.beginPath(); ctx.moveTo(0, eqY); ctx.lineTo(CANVAS_W, eqY); ctx.stroke();
}

function drawGlobeOutline(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W / 2, CANVAS_H / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCrosshair(ctx: CanvasRenderingContext2D, lat: number, lon: number) {
  const x = lonToX(lon);
  const y = latToY(lat);
  ctx.strokeStyle = CROSSHAIR_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 15, y); ctx.lineTo(x + 15, y); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawEntity(ctx: CanvasRenderingContext2D, entity: { lat: number; lon: number; type: string }) {
  const x = lonToX(entity.lon);
  const y = latToY(entity.lat);
  const colors: Record<string, string> = {
    satellite: '#a78bfa',
    flight: '#22c55e',
    vessel: '#06b6d4',
    earthquake: '#ef4444',
    military: '#f59e0b',
    default: '#ffffff',
  };
  ctx.fillStyle = colors[entity.type] || colors.default;
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();
}

const Minimap: React.FC<MinimapProps> = ({
  className,
  viewportCenter = { lat: 35.6762, lon: 139.6503 },
  entities = [],
  onViewportClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawGrid(ctx);
    drawGlobeOutline(ctx);
    entities.forEach(e => drawEntity(ctx, e));
    drawCrosshair(ctx, viewportCenter.lat, viewportCenter.lon);
  }, [viewportCenter, entities]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onViewportClick || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const lon = (x / CANVAS_W) * 360 - 180;
    const lat = 90 - (y / CANVAS_H) * 180;
    onViewportClick(lat, lon);
  };

  return (
    <div className={cn(
      'card overflow-hidden bg-card border border-border shadow-2xl',
      className
    )}>
      {/* Header */}
      <div className="h-[34px] flex items-center justify-between px-3 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <Map size={14} className="text-primary opacity-60" />
          <span className="text-[10px] font-bold tracking-widest text-primary uppercase">
            TACTICAL_OVERVIEW
          </span>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
          {viewportCenter.lat.toFixed(2)}N, {viewportCenter.lon.toFixed(2)}E
        </span>
      </div>
      {/* Canvas */}
      <div className="relative bg-background overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none"
             style={{ backgroundImage: 'radial-gradient(var(--color-primary) 1px, transparent 1px)', backgroundSize: '15px 15px' }}
        />
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onClick={handleClick}
          className="w-full h-auto cursor-crosshair relative z-10"
        />
        <div className="absolute top-2 left-2 flex gap-1 z-20">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/80 border border-border backdrop-blur-sm">
                <div className="w-1 h-1 rounded-full bg-primary shadow-[0_0_5px_var(--color-primary-glow)]" />
                <span className="text-[8px] font-mono font-bold text-muted-foreground uppercase">Globe Link</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export { Minimap };
