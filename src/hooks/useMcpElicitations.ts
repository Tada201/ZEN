import { useEffect, useState } from 'react';
import { mcpApi, type PendingElicitation } from '@/api';

/**
 * Subscribe to `mcp:elicitation:request` events and hold them in a FIFO queue.
 * The backend blocks its MRTR round on each request until `resolveElicitation`
 * fires, so one prompt is shown at a time and `resolveCurrent` advances the
 * queue. Returns the head request (or null) plus the advance callback.
 */
export function useMcpElicitations() {
  const [queue, setQueue] = useState<PendingElicitation[]>([]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;
    void mcpApi
      .subscribeElicitation((req) => {
        // De-dupe by requestId so a re-emitted event can't stack the queue.
        setQueue((prev) =>
          prev.some((q) => q.requestId === req.requestId) ? prev : [...prev, req],
        );
      })
      .then((fn) => {
        if (active) unlisten = fn;
        else fn();
      });
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const resolveCurrent = (requestId: string) =>
    setQueue((prev) => prev.filter((q) => q.requestId !== requestId));

  return { current: queue[0] ?? null, resolveCurrent };
}
