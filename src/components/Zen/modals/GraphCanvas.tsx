import { useEffect, useRef, useState, useCallback } from 'react';
import { Crosshair, ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils/style';

interface GraphCanvasProps {
    className?: string;
}

interface Viewport {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

const PRIMARY = 'hsl(262 83% 70%)';
const PRIMARY_GLOW = 'hsl(262 83% 85%)';

export function GraphCanvas({ className = '' }: GraphCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [viewport, setViewport] = useState<Viewport>({ xMin: -10, xMax: 10, yMin: -6, yMax: 6 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMouse, setLastMouse] = useState<{ x: number; y: number } | null>(null);
    const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number } | null>(null);
    const [isReady, setIsReady] = useState(false);

    const mathToScreen = useCallback((x: number, y: number, width: number, height: number) => {
        const screenX = ((x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * width;
        const screenY = height - ((y - viewport.yMin) / (viewport.yMax - viewport.yMin)) * height;
        return { screenX, screenY };
    }, [viewport]);

    const screenToMath = useCallback((screenX: number, screenY: number, width: number, height: number) => {
        const x = viewport.xMin + (screenX / width) * (viewport.xMax - viewport.xMin);
        const y = viewport.yMin + ((height - screenY) / height) * (viewport.yMax - viewport.yMin);
        return { x, y };
    }, [viewport]);

    const drawGrid = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
        const xSpan = viewport.xMax - viewport.xMin;
        const ySpan = viewport.yMax - viewport.yMin;
        const xStep = Math.pow(10, Math.floor(Math.log10(xSpan / 5)));
        const yStep = Math.pow(10, Math.floor(Math.log10(ySpan / 5)));

        ctx.lineWidth = 1;

        // Minor grid
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.04)';
        ctx.beginPath();
        for (let x = Math.floor(viewport.xMin / (xStep / 5)) * (xStep / 5); x <= viewport.xMax; x += xStep / 5) {
            const { screenX } = mathToScreen(x, 0, width, height);
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, height);
        }
        for (let y = Math.floor(viewport.yMin / (yStep / 5)) * (yStep / 5); y <= viewport.yMax; y += yStep / 5) {
            const { screenY } = mathToScreen(0, y, width, height);
            ctx.moveTo(0, screenY);
            ctx.lineTo(width, screenY);
        }
        ctx.stroke();

        // Major grid
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.1)';
        ctx.beginPath();
        for (let x = Math.floor(viewport.xMin / xStep) * xStep; x <= viewport.xMax; x += xStep) {
            const { screenX } = mathToScreen(x, 0, width, height);
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, height);
        }
        for (let y = Math.floor(viewport.yMin / yStep) * yStep; y <= viewport.yMax; y += yStep) {
            const { screenY } = mathToScreen(0, y, width, height);
            ctx.moveTo(0, screenY);
            ctx.lineTo(width, screenY);
        }
        ctx.stroke();

        // Axes
        ctx.strokeStyle = PRIMARY;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const origin = mathToScreen(0, 0, width, height);
        if (origin.screenY >= 0 && origin.screenY <= height) {
            ctx.moveTo(0, origin.screenY);
            ctx.lineTo(width, origin.screenY);
        }
        if (origin.screenX >= 0 && origin.screenX <= width) {
            ctx.moveTo(origin.screenX, 0);
            ctx.lineTo(origin.screenX, height);
        }
        ctx.stroke();

        // Labels
        ctx.fillStyle = 'rgba(167, 139, 250, 0.5)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let x = Math.floor(viewport.xMin / xStep) * xStep; x <= viewport.xMax; x += xStep) {
            if (Math.abs(x) < 1e-10) continue;
            const { screenX } = mathToScreen(x, 0, width, height);
            if (screenX > 20 && screenX < width - 20) {
                ctx.fillText(x.toFixed(1), screenX, Math.min(Math.max(origin.screenY + 14, 10), height - 10));
            }
        }
        ctx.textAlign = 'right';
        for (let y = Math.floor(viewport.yMin / yStep) * yStep; y <= viewport.yMax; y += yStep) {
            if (Math.abs(y) < 1e-10) continue;
            const { screenY } = mathToScreen(0, y, width, height);
            if (screenY > 20 && screenY < height - 20) {
                ctx.fillText(y.toFixed(1), Math.max(origin.screenX - 10, 10), screenY);
            }
        }
    }, [viewport, mathToScreen]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;

        ctx.clearRect(0, 0, width, height);
        drawGrid(ctx, width, height);

        // Sine wave plot
        ctx.strokeStyle = PRIMARY;
        ctx.lineWidth = 2;
        ctx.shadowColor = PRIMARY_GLOW;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        let isPenDown = false;
        for (let i = 0; i <= width; i++) {
            const mathX = viewport.xMin + (i / width) * (viewport.xMax - viewport.xMin);
            const mathY = Math.sin(mathX);
            const { screenX, screenY } = mathToScreen(mathX, mathY, width, height);
            if (!isPenDown) { ctx.moveTo(screenX, screenY); isPenDown = true; }
            else ctx.lineTo(screenX, screenY);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        setIsReady(true);
    }, [viewport, drawGrid, mathToScreen]);

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const { x: mathX, y: mathY } = screenToMath(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
        const zoomFactor = e.deltaY > 0 ? 1.12 : 0.88;
        setViewport({
            xMin: mathX - (mathX - viewport.xMin) * zoomFactor,
            xMax: mathX + (viewport.xMax - mathX) * zoomFactor,
            yMin: mathY - (mathY - viewport.yMin) * zoomFactor,
            yMax: mathY + (viewport.yMax - mathY) * zoomFactor,
        });
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        setIsDragging(true);
        setLastMouse({ x: e.clientX, y: e.clientY });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        setHoverCoord(screenToMath(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height));

        if (isDragging && lastMouse) {
            const dx = e.clientX - lastMouse.x;
            const dy = e.clientY - lastMouse.y;
            const mathDx = (dx / rect.width) * (viewport.xMax - viewport.xMin);
            const mathDy = (dy / rect.height) * (viewport.yMax - viewport.yMin);
            setViewport(prev => ({
                xMin: prev.xMin - mathDx,
                xMax: prev.xMax - mathDx,
                yMin: prev.yMin + mathDy,
                yMax: prev.yMax + mathDy,
            }));
            setLastMouse({ x: e.clientX, y: e.clientY });
        }
    };

    const handlePointerUp = () => {
        setIsDragging(false);
        setLastMouse(null);
    };

    const handleReset = () => setViewport({ xMin: -10, xMax: 10, yMin: -6, yMax: 6 });

    return (
        <div className={cn("flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden shadow-2xl", className)}>
            {/* Header */}
            <div className="h-9 flex items-center justify-between px-4 bg-muted/30 border-b border-border shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className={cn(
                        "w-1.5 h-1.5 rounded-full animate-pulse",
                        isReady ? "bg-success shadow-[0_0_6px_var(--color-success)]" : "bg-warning"
                    )} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">FUNCTION_PLOTTER</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={handleReset} className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all" title="Reset View">
                        <RotateCcw size={11} />
                    </button>
                    <button className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all" title="Zoom Out">
                        <ZoomOut size={11} />
                    </button>
                    <button className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all" title="Zoom In">
                        <ZoomIn size={11} />
                    </button>
                    <button className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all" title="Fullscreen">
                        <Maximize2 size={11} />
                    </button>
                </div>
            </div>

            {/* Canvas */}
            <div className="relative flex-1 bg-background">
                <canvas
                    ref={canvasRef}
                    className={cn(
                        "absolute inset-0 w-full h-full touch-none",
                        isDragging ? "cursor-grabbing" : "cursor-crosshair"
                    )}
                    onWheel={handleWheel}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                />

                {/* Coordinates HUD */}
                {hoverCoord && (
                    <div className="absolute top-3 right-3 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-card/90 border border-border backdrop-blur-sm shadow-sm">
                        <Crosshair size={10} className="text-primary" />
                        <span className="font-mono text-[10px] text-foreground">
                            <span className="text-muted-foreground">x</span> {hoverCoord.x.toFixed(2)}{' '}
                            <span className="text-muted-foreground">y</span> {hoverCoord.y.toFixed(2)}
                        </span>
                    </div>
                )}

                {/* Range Info */}
                <div className="absolute bottom-3 left-3 font-mono text-[9px] text-muted-foreground/40 uppercase tracking-widest">
                    x: [{viewport.xMin.toFixed(1)}, {viewport.xMax.toFixed(1)}] y: [{viewport.yMin.toFixed(1)}, {viewport.yMax.toFixed(1)}]
                </div>
            </div>
        </div>
    );
}