import { memo } from "react";
import { useAppUptime } from '@/hooks/useAppUptime';

function fmt(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export const UptimeWidget = memo(function UptimeWidget() {
    const appUptimeSecs = useAppUptime();
    return (
        <div className="widget-status-card">
            <span className="widget-status-card__value text-xs">{fmt(appUptimeSecs)}</span>
        </div>
    );
});
