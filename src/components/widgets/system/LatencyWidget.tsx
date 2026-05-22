import { memo, useState, useEffect } from "react";
import type { WidgetContext } from './types';
import { Sparkline } from '@/components/shared/Sparkline';

function getLatencyStatus(ms: number | null): { label: string; cls: string } {
    if (ms === null) return { label: '--ms', cls: '' };
    if (ms < 200) return { label: `${Math.round(ms)}ms`, cls: 'widget-status-card--good' };
    if (ms < 1000) return { label: `${Math.round(ms)}ms`, cls: 'widget-status-card--warn' };
    return { label: `${Math.round(ms)}ms`, cls: 'widget-status-card--error' };
}

export const LatencyWidget = memo(function LatencyWidget({ context }: { context: WidgetContext }) {
    const { label, cls } = getLatencyStatus(context.apiLatencyMs);
    const [history, setHistory] = useState<number[]>(Array(40).fill(0));

    useEffect(() => {
        if (context.apiLatencyMs !== null) {
            setHistory(prev => [...prev, context.apiLatencyMs!].slice(-40));
        }
    }, [context.apiLatencyMs]);

    return (
        <div className={`widget-status-card flex flex-col gap-1 ${cls}`}>
            <span className="widget-status-card__value">{label}</span>
            <div className="h-6 w-full opacity-60">
                <Sparkline data={history} color={cls.includes('good') ? '#10b981' : cls.includes('warn') ? '#f59e0b' : '#ef4444'} height={24} maxValue={2000} />
            </div>
        </div>
    );
});
