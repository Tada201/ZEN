import { useEffect, useState } from 'react';

/** Formats a millisecond duration as a short user-readable string. */
export function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

/**
 * Live-elapsed display with a 1s tick. Renders the textual duration between
 * `start` and `end` (or, if `end` is undefined, the current wall clock).
 */
export function ElapsedTime({ start, end }: { start: number; end?: number | null }) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (end) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [end]);

    const effectiveEnd = end || now;
    return <>{formatDuration(effectiveEnd - start)}</>;
}
