import { useEffect, useState, memo } from 'react';
import type { WidgetContext } from './types';
import { Sparkline } from '@/components/shared/Sparkline';
import { useRenderLogger } from '@/hooks/useRenderLogger';

export const GpuWidget = memo(function GpuWidget({ context }: { context: WidgetContext }) {
    useRenderLogger("GpuWidget", { gpuUsage: context.gpu?.usage });
    const [selectedGpuType, setSelectedGpuType] = useState<'dgpu' | 'igpu'>(
        context.dgpu ? 'dgpu' : 'igpu'
    );

    // Maintain history for both GPUs to prevent mixed sparklines
    const [dgpuHistory, setDgpuHistory] = useState<number[]>(Array(40).fill(0));
    const [igpuHistory, setIgpuHistory] = useState<number[]>(Array(40).fill(0));

    useEffect(() => {
        if (context.dgpu) {
            setDgpuHistory(prev => [...prev, context.dgpu!.usage].slice(-40));
        }
        if (context.igpu) {
            setIgpuHistory(prev => [...prev, context.igpu!.usage].slice(-40));
        }
    }, [context.dgpu?.usage, context.igpu?.usage]);

    const activeGpu = selectedGpuType === 'dgpu' ? (context.dgpu || context.igpu || context.gpu) : (context.igpu || context.gpu);
    const activeHistory = selectedGpuType === 'dgpu' ? dgpuHistory : igpuHistory;

    if (!activeGpu) {
        return (
            <div className="flex items-center justify-center h-24 bg-card/20 border border-border/40 rounded-sm">
                <span className="text-[10px] font-mono text-muted-foreground italic">GPU TELEMETRY OFFLINE</span>
            </div>
        );
    }

    const memPercent = (activeGpu.memoryUsed / (activeGpu.memoryTotal || 1)) * 100;

    return (
        <div className="flex flex-col gap-3 p-1">
            <div className="flex flex-col gap-1 px-1">
                <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold text-muted-foreground px-1 border border-border rounded bg-muted/50">GPU</span>
                    {context.dgpu && (
                        <div className="flex border border-border rounded bg-background p-[1px] shadow-sm">
                            <button
                                onClick={() => setSelectedGpuType('igpu')}
                                className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded transition-all duration-200 ${
                                    selectedGpuType === 'igpu'
                                        ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                                        : 'text-muted-foreground hover:text-muted-foreground border border-transparent'
                                }`}
                            >
                                iGPU
                            </button>
                            <button
                                onClick={() => setSelectedGpuType('dgpu')}
                                className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded transition-all duration-200 ${
                                    selectedGpuType === 'dgpu'
                                        ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                                        : 'text-muted-foreground hover:text-muted-foreground border border-transparent'
                                }`}
                            >
                                dGPU
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]" title={activeGpu.name}>
                        {activeGpu.name}
                    </span>
                </div>
            </div>

            <div className="bg-card/60 border border-border rounded-lg p-1">
                <Sparkline
                    data={activeHistory}
                    color="hsl(var(--primary))" // violet-500
                    height={32}
                    showDot={true}
                    maxValue={100}
                />
            </div>

            <div className="grid grid-cols-3 gap-1 px-1 mt-1">
                <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-muted-foreground leading-none">UTIL</span>
                    <span className="text-xs font-mono text-muted-foreground">{Math.round(activeGpu.usage)}%</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-muted-foreground leading-none">TEMP</span>
                    <span className="text-xs font-mono text-muted-foreground">
                        {activeGpu.temperature !== null ? `${activeGpu.temperature}°C` : '--'}
                    </span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[9px] font-mono text-muted-foreground leading-none">VRAM</span>
                    <span className="text-xs font-mono text-violet-400 font-bold">{Math.round(memPercent)}%</span>
                </div>
            </div>

            <div className="flex flex-col gap-1 px-1 mt-1">
                <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-muted-foreground">VRAM LOAD</span>
                    <span className="text-[9px] font-mono text-muted-foreground">
                        {(activeGpu.memoryUsed / 1024 / 1024 / 1024).toFixed(1)}G / {(activeGpu.memoryTotal / 1024 / 1024 / 1024).toFixed(0)}G
                    </span>
                </div>
                <div className="h-1 bg-card rounded-full overflow-hidden border border-border/25">
                    <div
                        className="h-full bg-violet-500/60 transition-all duration-300 rounded-full"
                        style={{ width: `${memPercent}%` }}
                    />
                </div>
            </div>
        </div>
    );
});
