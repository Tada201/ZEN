import { useEffect, useState, useRef, memo } from 'react';
import type { SystemMetrics } from '@/hooks/useSysMetrics';
import { Sparkline } from '@/components/shared/Sparkline';
import { useRenderLogger } from '@/hooks/useRenderLogger';

export const CpuWidget = memo(function CpuWidget({ context }: { context: SystemMetrics }) {
    const { cpuUsage, cpuUsagePerCore, cpuBrand, cpuFrequency, numProcesses } = context;
    useRenderLogger("CpuWidget", { cpuUsage });

    // Maintain a small history for the dual sparklines
    const historySize = 40;
    const [history, setHistory] = useState<{ left: number[], right: number[] }>({
        left: Array(historySize).fill(0),
        right: Array(historySize).fill(0)
    });
    const lastValues = useRef({ left: 0, right: 0 });

    useEffect(() => {
        if (!cpuUsagePerCore || cpuUsagePerCore.length === 0) return;
        const mid = Math.ceil(cpuUsagePerCore.length / 2);
        const leftAvg = cpuUsagePerCore.slice(0, mid).reduce((a, b) => a + b, 0) / (mid || 1);
        const rightAvg = cpuUsagePerCore.slice(mid).reduce((a, b) => a + b, 0) / (cpuUsagePerCore.length - mid || 1);

        if (Math.abs(leftAvg - lastValues.current.left) > 0.5 || Math.abs(rightAvg - lastValues.current.right) > 0.5) {
            lastValues.current = { left: leftAvg, right: rightAvg };
            setHistory(prev => ({
                left: [...prev.left, leftAvg].slice(-historySize),
                right: [...prev.right, rightAvg].slice(-historySize)
            }));
        }
    }, [cpuUsagePerCore]); // Accumulate when cpuUsagePerCore changes

    return (
        <div className="flex flex-col gap-3 p-1">
            <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-mono font-bold text-muted-foreground tracking-wider">
                    {cpuBrand.toUpperCase()}
                </span>
                <span className="text-[10px] font-mono text-primary/80">ACTIVE</span>
            </div>

            {/* Per-Core Grid */}
            <div className="grid grid-cols-8 gap-1 px-1">
                {cpuUsagePerCore.map((usage, i) => (
                    <div
                        key={i}
                        className="h-8 bg-muted/40 border border-border/60 rounded relative overflow-hidden"
                        title={`Core ${i}: ${Math.round(usage)}%`}
                    >
                        <div
                            className="absolute bottom-0 left-0 right-0 bg-primary/45 transition-all duration-300"
                            style={{ height: `${Math.max(usage, usage > 0 ? 2 : 0)}%` }}
                        />
                    </div>
                ))}
            </div>

            {/* Dual Sparklines */}
            <div className="grid grid-cols-2 gap-2 px-1">
                <div className="bg-card/60 border border-border/60 rounded-lg p-1">
                    <Sparkline data={history.left} color="hsl(var(--primary))" height={32} showDot={true} maxValue={100} />
                </div>
                <div className="bg-card/60 border border-border/60 rounded-lg p-1">
                    <Sparkline data={history.right} color="hsl(var(--primary))" height={32} showDot={true} maxValue={100} />
                </div>
            </div>

            {/* Bottom Metadata */}
            <div className="grid grid-cols-3 gap-1 px-1 mt-1">
                <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-muted-foreground leading-none">SPD</span>
                    <span className="text-xs font-mono text-muted-foreground">{cpuFrequency.toFixed(2)}G</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-muted-foreground leading-none">TASKS</span>
                    <span className="text-xs font-mono text-muted-foreground">{numProcesses}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[9px] font-mono text-muted-foreground leading-none">USAGE</span>
                    <span className="text-xs font-mono text-primary font-bold">{Math.round(cpuUsage)}%</span>
                </div>
            </div>
        </div>
    );
});
