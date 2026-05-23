import { useState, useEffect } from 'react';

interface ToolTimerProps {
  startTime?: number;
  durationMs?: number;
}

export function ToolTimer({ startTime, durationMs }: ToolTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // If we have a completed duration, just show that
    if (durationMs !== undefined) {
      setElapsed(Math.floor(durationMs / 1000));
      return;
    }
    // If we have a start time, run live timer
    if (!startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, durationMs]);

  if (startTime === undefined && durationMs === undefined) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="tabular-nums text-white/30 font-mono text-[10px] ml-2">
      [{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}s]
    </span>
  );
}
