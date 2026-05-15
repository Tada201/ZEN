import React from 'react';
import { cn } from '@/lib/utils/style';
import { Activity } from 'lucide-react';

interface SystemMetricsWidgetProps {
  cpuUsage?: number;
  memoryPercent?: number;
  className?: string;
}

export function SystemMetricsWidget({
  cpuUsage = 0,
  memoryPercent = 0,
  className = '',
}: SystemMetricsWidgetProps) {
  const cpuPct = Math.round(cpuUsage);
  const memPct = Math.round(memoryPercent);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 w-20">
          <Activity size={12} className="text-primary" />
          <span className="text-[9px] font-mono text-muted-foreground uppercase">CPU</span>
        </div>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              cpuPct > 80 ? 'bg-destructive animate-pulse' : 'bg-primary'
            )}
            style={{ width: `${cpuPct}%` }}
          />
        </div>
        <span className={cn(
          'text-[9px] font-mono w-10 text-right',
          cpuPct > 80 ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {cpuPct}%
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 w-20">
          <Activity size={12} className="text-primary" />
          <span className="text-[9px] font-mono text-muted-foreground uppercase">MEM</span>
        </div>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              memPct > 85 ? 'bg-[hsl(32_95%_50%)] animate-pulse' : 'bg-[hsl(262_83%_65%)]'
            )}
            style={{ width: `${memPct}%` }}
          />
        </div>
        <span className={cn(
          'text-[9px] font-mono w-10 text-right',
          memPct > 85 ? 'text-[hsl(32_95%_50%)]' : 'text-muted-foreground'
        )}>
          {memPct}%
        </span>
      </div>
    </div>
  );
}