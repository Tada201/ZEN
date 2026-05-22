import { useEffect, useRef, useMemo, useState, memo } from 'react';
import type { SystemMetrics } from '@/hooks/useSysMetrics';

export const MemoryWidget = memo(function MemoryWidget({ context }: { context: SystemMetrics }) {
    const { memoryUsed, memoryTotal, memoryPercent, swapUsed, swapTotal, memoryAvailable } = context;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(280);

    const usedGiB = (memoryUsed / (1024 * 1024 * 1024)).toFixed(1);
    const totalGiB = (memoryTotal / (1024 * 1024 * 1024)).toFixed(1);
    const swapPercent = swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0;
    
    const roundedPercent = Math.round(memoryPercent * 10) / 10;

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Stable shuffled indices for the "scattered" fill effect
    const shuffleArray = useMemo(() => {
        const arr = Array.from({ length: 440 }, (_, i) => i);
        // Using a deterministic-ish shuffle based on array length
        for (let i = arr.length - 1; i > 0; i--) {
            const j = (i * 31) % (i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // HIGH-DPI SCALING
        const dpr = window.devicePixelRatio || 1;
        const displayWidth = containerWidth;
        const displayHeight = 64;

        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        ctx.scale(dpr, dpr);

        const cols = Math.max(10, Math.floor(displayWidth / 6.2));
        const numDots = Math.min(440, cols * 10);
        const gap = displayWidth / cols;
        const dotSize = 1.6;

        const activeLimit = Math.round((numDots * roundedPercent) / 100);
        const availableLimit = Math.round((numDots * (memoryAvailable || 0)) / memoryTotal);

        ctx.clearRect(0, 0, displayWidth, displayHeight);

        for (let i = 0; i < numDots; i++) {
            const r = Math.floor(i / cols);
            const c = i % cols;

            const x = c * gap + gap/2;
            const y = r * 6.2 + 5;

            ctx.beginPath();
            ctx.arc(x, y, dotSize, 0, Math.PI * 2);

            if (i < activeLimit) {
                ctx.fillStyle = '#10b981'; // emerald-500
            } else if (i < activeLimit + availableLimit) {
                ctx.fillStyle = 'rgba(16, 185, 129, 0.35)'; // emerald-500/35
            } else {
                ctx.fillStyle = 'rgba(16, 185, 129, 0.08)'; // emerald-500/08
            }

            ctx.fill();
        }
    }, [roundedPercent, memoryAvailable, memoryTotal, shuffleArray, containerWidth]);

    return (
        <div className="flex flex-col gap-3 p-1">
            <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-mono font-bold text-slate-500 tracking-wider">
                    RAM USAGE
                </span>
                <span className="text-[10px] font-mono text-slate-300">
                    {usedGiB} / {totalGiB} GiB
                </span>
            </div>

            <div ref={containerRef} className="bg-slate-900/40 border border-slate-800/40 rounded p-1 flex justify-center overflow-hidden">
                <canvas
                    ref={canvasRef}
                    style={{ width: '100%', height: '64px' }}
                />
            </div>

            <div className="flex flex-col gap-1 px-1">
                <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-slate-500">SWAP</span>
                    <span className="text-[9px] font-mono text-slate-400">{Math.round(swapPercent)}%</span>
                </div>
                <div className="h-1 bg-slate-800/50 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-emerald-500/60 transition-all duration-300"
                        style={{ width: `${swapPercent}%` }}
                    />
                </div>
            </div>
        </div>
    );
});
