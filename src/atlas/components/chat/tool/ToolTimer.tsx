interface ToolTimerProps {
  startTime?: number;
  durationMs?: number;
}

export function ToolTimer({ startTime, durationMs }: ToolTimerProps) {
  if (startTime === undefined && durationMs === undefined) return null;

  const elapsed = durationMs !== undefined
    ? Math.floor(durationMs / 1000)
    : Math.max(0, Math.floor((Date.now() - (startTime || 0)) / 1000));

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="tabular-nums text-white/30 font-mono text-[10px] ml-2">
      [{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}s]
    </span>
  );
}
