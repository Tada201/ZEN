import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { mcpApi, type McpServerEntry, type McpServerStatusEvent } from '@/api';
import { MCPExternalServers } from './MCPExternalServers';

export const MCPSettings = memo((_props: { embedded?: boolean }) => {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-row status keyed by server name. Refreshed by the
  // `mcp:server:status` event stream so rows transition
  // reconnecting → connected | failed in real time.
  const [statusMap, setStatusMap] = useState<Record<string, McpServerStatusEvent>>(
    {},
  );
  // Track the most recent fetch timestamp so concurrent refreshes
  // (a user adds a row while the previous list is loading back) can
  // drop the earlier result rather than racing.
  const lastFetchRef = useRef(0);

  const refetch = useCallback(async () => {
    const stamp = ++lastFetchRef.current;
    try {
      const rows = await mcpApi.listServers();
      if (stamp !== lastFetchRef.current) {
        // Superseded by a newer fetch — drop.
        return;
      }
      setServers(rows);
      setError(null);
    } catch (e: unknown) {
      if (stamp !== lastFetchRef.current) return;
      console.error('[MCPSettings] Failed to load MCP servers:', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (stamp === lastFetchRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Subscribe to per-row status events. The unlisten function detaches
  // when the settings tab unmounts so a hot-reload doesn't pile up
  // duplicate subscribers.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    mcpApi
      .subscribeServerStatus((event) => {
        if (cancelled) return;
        setStatusMap((prev) => ({ ...prev, [event.name]: event }));
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('[MCPSettings] Failed to subscribe to mcp:server:status:', e);
      });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const handleAdd = useCallback(async (name: string, url: string) => {
    setBusy(true);
    try {
      // Optimistically mark the row as `reconnecting` so the new row
      // shows activity immediately, before the backend's first sync
      // event arrives.
      setStatusMap((prev) => ({
        ...prev,
        [name]: { name, status: 'reconnecting' },
      }));
      setServers((prev) => {
        if (prev.some((s) => s.name === name)) {
          // Upsert: replace existing url, keep transport as HTTP
          // (the typed Add form only supports HTTP servers).
          return prev.map((s) =>
            s.name === name
              ? { name, transport: 'http' as const, url }
              : s,
          );
        }
        return [...prev, { name, transport: 'http' as const, url }];
      });
      await mcpApi.addServer(name, url);
      // Backend kicks off a background sync; UI listens for events
      // to update each row's status pill to connected | failed.
    } catch (e: unknown) {
      console.error('[MCPSettings] Failed to add MCP server:', e);
      const message = e instanceof Error ? e.message : String(e);
      // Revert optimistic insert + mark the row as failed so the
      // UI surfaces the error rather than silently dropping it.
      setServers((prev) => prev.filter((s) => s.name !== name));
      setStatusMap((prev) => ({
        ...prev,
        [name]: { name, status: 'failed', error: message },
      }));
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const handleRemove = useCallback(async (name: string) => {
    setBusy(true);
    try {
      const removed = await mcpApi.removeServer(name);
      if (removed) {
        setServers((prev) => prev.filter((s) => s.name !== name));
        setStatusMap((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    } catch (e: unknown) {
      console.error('[MCPSettings] Failed to remove MCP server:', e);
      setError(e instanceof Error ? e.message : String(e));
      // Best-effort: refetch in case the file is now out-of-sync.
      refetch();
    } finally {
      setBusy(false);
    }
  }, [refetch]);

  const handleReconnect = useCallback(async () => {
    setBusy(true);
    try {
      // Mark every row as `reconnecting` so the user sees activity
      // immediately, rather than a blank state while the backend
      // progresses through every server's handshake.
      setStatusMap(() => {
        const next: Record<string, McpServerStatusEvent> = {};
        for (const s of servers) {
          next[s.name] = { name: s.name, status: 'reconnecting' };
        }
        return next;
      });
      await mcpApi.reconnect();
    } catch (e: unknown) {
      console.error('[MCPSettings] Failed to reconnect MCP servers:', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [servers]);

  if (loading) {
    return (
      <SettingsCard
        title="Model Context Protocol (MCP)"
        subtitle="External connections"
        description="Manage external MCP server connections."
      >
        <div className="py-12 flex items-center justify-center">
          <span className="text-muted-foreground animate-pulse text-[13px]">
            Loading MCP configuration...
          </span>
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      title="Model Context Protocol (MCP)"
      subtitle="External connections"
      description="Connect to external MCP servers to extend agent capabilities."
    >
      <div className="space-y-8">
        {error && (
          <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/15">
            <p className="text-[11px] text-destructive/80 font-mono">{error}</p>
          </div>
        )}

        <MCPExternalServers
          servers={servers}
          busy={busy}
          statusMap={statusMap}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onReconnect={handleReconnect}
        />
      </div>
    </SettingsCard>
  );
});
