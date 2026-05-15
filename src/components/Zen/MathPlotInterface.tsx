import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { cn } from '@/lib/utils/style';
import { Activity, BarChart3, Maximize2 } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface MathPlotInterfaceProps {
    data: number[];
    labels: string[];
    title?: string;
    className?: string;
}

export function MathPlotInterface({ data, labels, title = 'PROBABILITY_DENSITY', className }: MathPlotInterfaceProps) {
    const chartData = useMemo(() => ({
        labels,
        datasets: [
            {
                label: title,
                data,
                fill: true,
                borderColor: 'var(--color-primary)',
                backgroundColor: 'rgba(167, 139, 250, 0.05)',
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.4,
            },
        ],
    }), [data, labels, title]);

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                borderWidth: 1,
                titleColor: 'var(--color-foreground)',
                bodyColor: 'var(--color-muted-foreground)',
                titleFont: { family: 'ui-monospace, monospace', size: 9 },
                bodyFont: { family: 'ui-monospace, monospace', size: 9 },
                padding: 8,
                cornerRadius: 4,
            },
        },
        scales: {
            x: {
                grid: { color: 'var(--color-border)', lineWidth: 0.5 },
                ticks: { color: 'var(--color-muted-foreground)', font: { family: 'ui-monospace, monospace', size: 8 } },
            },
            y: {
                grid: { color: 'var(--color-border)', lineWidth: 0.5 },
                ticks: { color: 'var(--color-muted-foreground)', font: { family: 'ui-monospace, monospace', size: 8 } },
            },
        },
    };

    return (
        <div className={cn('card overflow-hidden bg-card border border-border flex flex-col h-full', className)}>
            {/* Header */}
            <div className="h-9 flex items-center justify-between px-4 bg-muted/50 border-b border-border">
                <div className="flex items-center gap-2">
                    <Activity size={14} className="text-primary opacity-60" />
                    <span className="text-[10px] font-bold tracking-[0.2em] text-primary uppercase">Mathematical Engine</span>
                    <span className="text-white/10 font-mono text-[10px]">::</span>
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">{title}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors">
                        <BarChart3 size={12} />
                    </button>
                    <button className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors">
                        <Maximize2 size={12} />
                    </button>
                </div>
            </div>

            {/* Plot Area */}
            <div className="flex-1 p-6">
                <div className="w-full h-full min-h-[200px]">
                    <Line data={chartData} options={options} />
                </div>
            </div>

            {/* Footer Stats */}
            <div className="h-8 px-4 border-t border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[8px] text-muted-foreground font-mono uppercase tracking-widest">Confidence:</span>
                        <span className="text-[9px] text-success font-bold font-mono">99.82%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[8px] text-muted-foreground font-mono uppercase tracking-widest">Sampling:</span>
                        <span className="text-[9px] text-foreground font-bold font-mono">ADAPTIVE</span>
                    </div>
                </div>
                <span className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-widest">Node: Quantum-01</span>
            </div>
        </div>
    );
}
