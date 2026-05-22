import { memo } from 'react';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import type { WidgetContext } from './types';

export const CpuMemWidget = memo(function CpuMemWidget({ context }: { context: WidgetContext }) {
    const cpuPct = Math.round(context.cpuUsage);
    const memPct = Math.round(context.memoryPercent);

    return (
        <div className="widget-cpu-mem p-1">
            <div className="widget-cpu-mem__row">
                <span className="widget-cpu-mem__label">
                    <WorkbenchIcon name="solar:cpu-bold" size={12} className="text-emerald-400" />
                    <span>CPU</span>
                </span>
                <div className="widget-cpu-mem__bar bg-slate-800/60 rounded-full overflow-hidden h-1.5">
                    <div
                        className="widget-cpu-mem__fill h-full bg-emerald-500/80 transition-all duration-300"
                        style={{ width: `${cpuPct}%` }}
                        data-warn={cpuPct > 80 ? '' : undefined}
                    />
                </div>
                <span className="widget-cpu-mem__pct text-[10px] font-mono text-slate-300">{cpuPct}%</span>
            </div>
            <div className="widget-cpu-mem__row">
                <span className="widget-cpu-mem__label">
                    <WorkbenchIcon name="solar:ssd-bold" size={12} className="text-emerald-400" />
                    <span>MEM</span>
                </span>
                <div className="widget-cpu-mem__bar bg-slate-800/60 rounded-full overflow-hidden h-1.5">
                    <div
                        className="widget-cpu-mem__fill h-full bg-emerald-500/80 transition-all duration-300"
                        style={{ width: `${memPct}%` }}
                        data-warn={memPct > 85 ? '' : undefined}
                    />
                </div>
                <span className="widget-cpu-mem__pct text-[10px] font-mono text-slate-300">{memPct}%</span>
            </div>
        </div>
    );
});
