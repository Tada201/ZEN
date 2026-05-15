import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/style';
import { Clock } from 'lucide-react';

interface ClockWidgetProps {
  className?: string;
}

export function ClockWidget({ className = '' }: ClockWidgetProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className={cn('card', className)}>
      {/* Header */}
      <div className="h-[34px] flex items-center justify-between px-3 bg-muted border-b border-border">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-primary opacity-60" />
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">SYSTEM_TIME</span>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground uppercase">
          {Intl.DateTimeFormat().resolvedOptions().timeZone || 'LOCAL'}
        </span>
      </div>

      {/* Clock display */}
      <div className="p-4 flex flex-col items-center gap-2">
        <div className="text-2xl font-mono font-bold tracking-wider text-primary">
          {formatTime(time)}
        </div>
        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          {formatDate(time)}
        </div>
      </div>
    </div>
  );
}