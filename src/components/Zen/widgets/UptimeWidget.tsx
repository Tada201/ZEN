import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/style';
import { Timer } from 'lucide-react';
import { Zap } from 'lucide-react';

interface UptimeWidgetProps {
  className?: string;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

export function UptimeWidget({ className = '' }: UptimeWidgetProps) {
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    setUptime(Math.floor(Math.random() * 86400 * 7));
    const timer = setInterval(() => setUptime(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={cn('card', className)}>
      {/* Header */}
      <div className="h-[34px] flex items-center justify-between px-3 bg-muted border-b border-border">
        <div className="flex items-center gap-2">
          <Timer size={14} className="text-primary opacity-60" />
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">SYSTEM_UPTIME</span>
        </div>
        <div className="flex items-center gap-2">
          <Zap size={10} className="text-[hsl(160_84%_39%)] animate-pulse" />
        </div>
      </div>

      {/* Uptime display */}
      <div className="p-4 flex items-center gap-3">
        <div className="flex flex-col">
          <span className="text-lg font-mono font-bold text-[hsl(160_84%_39%)]">
            {formatUptime(uptime)}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground uppercase">continuous</span>
        </div>
      </div>
    </div>
  );
}