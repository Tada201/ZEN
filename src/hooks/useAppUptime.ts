import { useEffect, useState } from "react";

const appStartedAt = Date.now();

export function useAppUptime(intervalMs = 1000): number {
  const [uptimeSecs, setUptimeSecs] = useState(() => Math.floor((Date.now() - appStartedAt) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setUptimeSecs(Math.floor((Date.now() - appStartedAt) / 1000));
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return uptimeSecs;
}
