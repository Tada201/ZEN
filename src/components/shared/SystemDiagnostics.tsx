import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { useSysMetrics } from '@/hooks/useSysMetrics';

export function SystemDiagnostics() {
    const metrics = useSysMetrics(3000);
    const memPercent = metrics.memoryTotal > 0 ? (metrics.memory / metrics.memoryTotal) * 100 : metrics.memory;

    const item = (icon: string, label: string, value: string, percent: number) => (
        <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <WorkbenchIcon name={icon} size={11} />
                    <span>{label}</span>
                </div>
                <span className="font-mono text-[11px] font-bold text-slate-300">{value}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, percent)}%`, backgroundColor: percent > 85 ? '#fb7185' : '#22d3ee' }}
                />
            </div>
        </div>
    );

    return (
        <div className="grid gap-3">
            {item('codicon:pulse', 'CPU_UTIL', `${metrics.cpu.toFixed(1)}%`, metrics.cpu)}
            {item('codicon:chip', 'RAM_LOAD', `${memPercent.toFixed(1)}%`, memPercent)}
            {item('codicon:database', 'DISK_LOAD', `${metrics.disk.toFixed(1)}%`, metrics.disk)}
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/10 bg-emerald-500/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                <WorkbenchIcon name="codicon:database" size={10} />
                <span>Local Station Stable</span>
            </div>
        </div>
    );
}
