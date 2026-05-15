import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/style';
import { Radio } from 'lucide-react';

interface LatencyWidgetProps {
  className?: string;
}

export function LatencyWidget({ className = '' }: LatencyWidgetProps) {
  const [latency, setLatency] = useState<number>(0);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    const updateLatency = () => {
      const newLatency = Math.round(5 + Math.random() * 15);
      setLatency(newLatency);
      setHistory(prev => {
        const next = [...prev, newLatency];
        return next.slice(-20);
      });
    };

    updateLatency();
    const timer = setInterval(updateLatency, 2000);
    return () => clearInterval(timer);
  }, []);

  const avgLatency = history.length > 0
    ? Math.round(history.reduce((a, b) => a + b, 0) / history.length)
    : 0;

  const latencyColor = latency < 20 ? 'text-[hsl(160_84%_39%)]' : latency < 50 ? 'text-[hsl(32_95%_50%)]' : 'text-destructive';
  const dotColor = latency < 20 ? 'bg-[hsl(160_84%_39%)] animate-pulse' : latency < 50 ? 'bg-[hsl(32_95%_50%)]' : 'bg-destructive';

  return (
    <div className={cn('card', className)}>
      {/* Header */}
      <div className="h-[34px] flex items-center justify-between px-3 bg-muted border-b border-border">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-primary/80 opacity-60" />
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">NETWORK_LATENCY</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={cn('h-1.5 w-1.5 rounded-full', dotColor)} />
        </div>
      </div>

      {/* Latency display */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex flex-col">
          <span className={cn('text-2xl font-mono font-bold', latencyColor)}>{latency}</span>
          <span className="text-[9px] font-mono text-muted-foreground uppercase">ms</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-mono text-muted-foreground uppercase">AVG</span>
          <span className="text-[12px] font-mono text-muted-foreground">{avgLatency}ms</span>
        </div>
      </div>

      {/* Mini sparkline */}
      {history.length > 1 && (
        <div className="px-4 pb-3">
          <svg width="100%" height="24" viewBox="0 0 100 24" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-primary"
              points={history.map((val, i) => {
                const x = (i / (history.length - 1)) * 100;
                const y = 24 - (val / 100) * 24;
                return `${x},${y}`;
              }).join(' ')}
            />
          </svg>
        </div>
      )}
    </div>
  );
}