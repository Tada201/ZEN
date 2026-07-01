import { useEffect, useState } from 'react';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { useGTSMStore } from '@/lib/stores/useGTSMStore';

/** Compact, in-layout frame-rate indicator used instead of Cesium's floating debug widget. */
export function MapPerformanceBadge() {
  const enabled = useGTSMStore((state) => state.showFps);
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let frameId = 0;
    let frames = 0;
    let sampleStartedAt = performance.now();
    let visible = !document.hidden;

    const onVisibilityChange = () => {
      visible = !document.hidden;
      frames = 0;
      sampleStartedAt = performance.now();
      if (!visible) setFps(null);
    };

    const sample = (now: number) => {
      if (visible) {
        frames += 1;
        const elapsed = now - sampleStartedAt;
        if (elapsed >= 500) {
          setFps(Math.round((frames * 1_000) / elapsed));
          frames = 0;
          sampleStartedAt = now;
        }
      }
      frameId = requestAnimationFrame(sample);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    frameId = requestAnimationFrame(sample);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelAnimationFrame(frameId);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none flex h-7 items-center gap-1.5 border border-border bg-background/45 px-2 text-[10px] text-foreground backdrop-blur-md">
      <WorkbenchIcon name="solar:chart-square-linear" size={12} className="text-muted-foreground" />
      <span>{fps === null ? 'FPS --' : `${fps} FPS`}</span>
    </div>
  );
}
