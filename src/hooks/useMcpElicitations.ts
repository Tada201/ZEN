import { useEffect, useState } from 'react';
import { mcpApi, type PendingElicitation } from '@/api';

/**
 * Subscribe to `mcp:elicitation:request` events and hold them in a FIFO queue.
 * The backend blocks its MRTR round on each request until `resolveElicitation`
 * fires (or its own deadline elapses), so one prompt is shown at a time and
 * `resolveCurrent` advances the queue.
 *
 * Two backend signals keep the queue honest:
 * - `mcp:elicitation:close` drops a request the backend already abandoned
 *   (timeout / run cancelled) so a stale modal can't submit into a dead call.
 * - on mount we call `replayElicitations` so a prompt that fired before this
 *   listener attached — or that survived a webview reload — is recovered.
 *
 * Returns the head request (or null), the advance callback, and the number of
 * prompts waiting behind the current one.
 */
export function useMcpElicitations() {
  const [queue, setQueue] = useState<PendingElicitation[]>([]);

  useEffect(() => {
    let active = true;
    const unlisteners: Array<() => void> = [];
    const track = (p: Promise<() => void>) =>
      void p.then((fn) => (active ? unlisteners.push(fn) : fn()));

    track(
      mcpApi.subscribeElicitation((req) => {
        // De-dupe by requestId so a re-emit (or replay) can't stack the queue.
        setQueue((prev) =>
          prev.some((q) => q.requestId === req.requestId) ? prev : [...prev, req],
        );
      }),
    );
    track(
      mcpApi.subscribeElicitationClose((requestId) => {
        setQueue((prev) => prev.filter((q) => q.requestId !== requestId));
      }),
    );

    // Recover any prompt already awaiting a decision before we were listening.
    void mcpApi.replayElicitations().catch(() => {});

    return () => {
      active = false;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  const resolveCurrent = (requestId: string) =>
    setQueue((prev) => prev.filter((q) => q.requestId !== requestId));

  return {
    current: queue[0] ?? null,
    pending: Math.max(0, queue.length - 1),
    resolveCurrent,
  };
}
