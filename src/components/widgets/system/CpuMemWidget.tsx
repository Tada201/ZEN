import { memo } from 'react';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { useRenderLogger } from '@/hooks/useRenderLogger';
import type { WidgetContext } from './types';

export const CpuMemWidget = memo(function CpuMemWidget({ context }: { context: WidgetContext }) {
    const cpuPct = Math.round(context.cpuUsage);
    const memPct = Math.round(context.memoryPercent);
    useRenderLogger("CpuMemWidget", { cpuPct, memPct });

    return (
        <div className="widget-cpu-mem p-1">
            <div className="widget-cpu-mem__row">
                <span className="widget-cpu-mem__label">
                    <WorkbenchIcon name="solar:cpu-bold" size={12} className="text-primary" />
                    <span>CPU</span>
                </span>
                <div className="widget-cpu-mem__bar bg-card rounded-full overflow-hidden h-1.5 border border-border/25">
                    <div
                        className="widget-cpu-mem__fill h-full bg-primary/80 transition-all duration-300 rounded-full"
                        style={{ width: `${cpuPct}%` }}
                        data-warn={cpuPct > 80 ? '' : undefined}
                    />
                </div>
                <span className="widget-cpu-mem__pct text-[10px] font-mono text-muted-foreground">{cpuPct}%</span>
            </div>
            <div className="widget-cpu-mem__row">
                <span className="widget-cpu-mem__label">
                    <WorkbenchIcon name="solar:ssd-bold" size={12} className="text-primary" />
                    <span>MEM</span>
                </span>
                <div className="widget-cpu-mem__bar bg-card rounded-full overflow-hidden h-1.5 border border-border/25">
                    <div
                        className="widget-cpu-mem__fill h-full bg-primary/80 transition-all duration-300 rounded-full"
                        style={{ width: `${memPct}%` }}
                        data-warn={memPct > 85 ? '' : undefined}
                    />
                </div>
                <span className="widget-cpu-mem__pct text-[10px] font-mono text-muted-foreground">{memPct}%</span>
            </div>
        </div>
    );
});
