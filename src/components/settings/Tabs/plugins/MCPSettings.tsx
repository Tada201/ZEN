import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { SettingsCard } from '@/components/settings/ui/SettingsCard';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { Badge } from '@/components/ui/badge';
import {
  mcpApi,
  type McpCapabilitySummary,
  type McpInventory,
  type McpServerEntry,
  type McpServerStatusEvent,
  type PendingConsent,
} from '@/api';
import { McpServerRow } from './McpServerRow';
import { McpServerForm, type McpFormSubmit } from './McpServerForm';
import { McpConsentDialog } from './McpConsentDialog';

export const MCPSettings = memo((_props: { embedded?: boolean }) => {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [pending, setPending] = useState<PendingConsent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-row status keyed by server name. Refreshed by the
  // `mcp:server:status` event stream so rows transition
  // reconnecting → connected | failed in real time.
  const [statusMap, setStatusMap] = useState<Record<string, McpServerStatusEvent>>({});
  // Advertised capabilities keyed by server name, sourced from inventory
  // snapshots. Gates the per-row resource/prompt browser.
  const [capsMap, setCapsMap] = useState<Record<string, McpCapabilitySummary>>({});
  // Snapshot cache is revisioned so an older async inventory event can never
  // roll the settings surface back to a stale connection state.
  const inventoryRevisionRef = useRef(0);
  // Form state: null = closed; { editing } = open (add when editing null).
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<McpServerEntry | null>(null);
  // Track the most recent fetch timestamp so concurrent refreshes can drop
  // the earlier result rather than racing.
  const lastFetchRef = useRef(0);

  const applyInventory = useCallback((inventory: McpInventory) => {
    if (inventory.revision < inventoryRevisionRef.current) return;
    inventoryRevisionRef.current = inventory.revision;
    const next: Record<string, McpServerStatusEvent> = {};
    const caps: Record<string, McpCapabilitySummary> = {};
    for (const record of inventory.servers) {
      caps[record.name] = record.capabilities;
      if (record.availability === 'configured') continue;
      const status: McpServerStatusEvent['status'] =
        record.availability === 'ready'
          ? 'connected'
          : record.availability === 'connecting'
            ? 'reconnecting'
            : record.availability === 'failed'
              ? 'failed'
              : record.availability === 'awaiting_consent'
                ? 'awaiting_consent'
                : 'disabled';
      next[record.name] = {
        name: record.name,
        status,
        ...(record.lastErrorCode ? { error: record.lastErrorCode } : {}),
      };
    }
    setStatusMap(next);
    setCapsMap(caps);
  }, []);

  const refetch = useCallback(async () => {
    const stamp = ++lastFetchRef.current;
    try {
      const [rows, pendingRows] = await Promise.all([
        mcpApi.listServers(),
        mcpApi.listPending(),
      ]);
      if (stamp !== lastFetchRef.current) return;
      setServers(rows);
      setPending(pendingRows);
      setError(null);
    } catch (e: unknown) {
      if (stamp !== lastFetchRef.current) return;
      console.error('[MCPSettings] Failed to load MCP servers:', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (stamp === lastFetchRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    mcpApi.getInventory().then(applyInventory).catch(() => undefined);
  }, [applyInventory, refetch]);

  // Subscribe to authoritative inventory snapshots and per-row status events;
  // detach both listeners on unmount.

  useEffect(() => {
    let cancelled = false;
    let unlistenStatus: (() => void) | null = null;
    let unlistenInventory: (() => void) | null = null;
    mcpApi
      .subscribeInventory((inventory) => {
        if (!cancelled) applyInventory(inventory);
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlistenInventory = fn;
      })
      .catch((e) => {
        if (!cancelled) console.warn('[MCPSettings] Failed to subscribe to mcp:inventory:', e);
      });
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
        unlistenStatus = fn;
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('[MCPSettings] Failed to subscribe to mcp:server:status:', e);
      });
    return () => {
      cancelled = true;
      if (unlistenStatus) unlistenStatus();
      if (unlistenInventory) unlistenInventory();
    };
  }, [applyInventory]);

  const handleSubmit = useCallback(
    async ({ scope, name, config }: McpFormSubmit) => {
      setBusy(true);
      try {
        setStatusMap((prev) => ({ ...prev, [name]: { name, status: 'reconnecting' } }));
        await mcpApi.upsertServer(scope, name, config);
        setFormOpen(false);
        setEditing(null);
        // Refetch to get the canonical typed row (transport/scope/fields).
        await refetch();
      } catch (e: unknown) {
        console.error('[MCPSettings] Failed to save MCP server:', e);
        const message = e instanceof Error ? e.message : String(e);
        setStatusMap((prev) => ({
          ...prev,
          [name]: { name, status: 'failed', error: message },
        }));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const handleToggleEnabled = useCallback(
    async (server: McpServerEntry, enabled: boolean) => {
      setBusy(true);
      // Optimistic flip.
      setServers((prev) =>
        prev.map((s) => (s.name === server.name ? { ...s, disabled: !enabled } : s)),
      );
      try {
        await mcpApi.setEnabled(server.scope, server.name, enabled);
      } catch (e: unknown) {
        console.error('[MCPSettings] Failed to toggle MCP server:', e);
        setError(e instanceof Error ? e.message : String(e));
        refetch();
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const handleRemove = useCallback(
    async (server: McpServerEntry) => {
      setBusy(true);
      try {
        const removed = await mcpApi.removeServer(server.scope, server.name);
        if (removed) {
          setServers((prev) => prev.filter((s) => s.name !== server.name));
          setStatusMap((prev) => {
            const next = { ...prev };
            delete next[server.name];
            return next;
          });
        }
      } catch (e: unknown) {
        console.error('[MCPSettings] Failed to remove MCP server:', e);
        setError(e instanceof Error ? e.message : String(e));
        refetch();
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const handleApproveConsent = useCallback(
    async (row: PendingConsent) => {
      setBusy(true);
      setStatusMap((prev) => ({
        ...prev,
        [row.name]: { name: row.name, status: 'reconnecting' },
      }));
      try {
        await mcpApi.approveServer(row.name, row.fingerprint);
        setPending((prev) => prev.filter((p) => p.name !== row.name));
        await refetch();
      } catch (e: unknown) {
        console.error('[MCPSettings] Failed to approve MCP server:', e);
        setError(e instanceof Error ? e.message : String(e));
        refetch();
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const handleDenyConsent = useCallback(
    async (row: PendingConsent) => {
      setBusy(true);
      try {
        await mcpApi.denyServer(row.name);
        setPending((prev) => prev.filter((p) => p.name !== row.name));
        setStatusMap((prev) => {
          const next = { ...prev };
          delete next[row.name];
          return next;
        });
      } catch (e: unknown) {
        console.error('[MCPSettings] Failed to deny MCP server:', e);
        setError(e instanceof Error ? e.message : String(e));
        refetch();
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const handleReconnect = useCallback(async () => {
    setBusy(true);
    try {
      setStatusMap(() => {
        const next: Record<string, McpServerStatusEvent> = {};
        for (const s of servers) {
          if (!s.disabled) next[s.name] = { name: s.name, status: 'reconnecting' };
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

  const openAdd = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);
  const openEdit = useCallback((server: McpServerEntry) => {
    setEditing(server);
    setFormOpen(true);
  }, []);
  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditing(null);
  }, []);

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
      <div className="space-y-4 pt-4">
        {error && (
          <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/15">
            <p className="text-[11px] text-destructive/80 font-mono">{error}</p>
          </div>
        )}

        <div className="border-b border-border pb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <WorkbenchIcon name="lucide:plug-zap" size={14} className="text-primary" />
                External MCP Servers
              </h3>
              <Badge
                variant="outline"
                className="text-[8px] h-4 font-mono text-muted-foreground border-border bg-muted"
              >
                {servers.length} configured
              </Badge>
            </div>
            <WorkbenchButton
              variant="ghost"
              size="sm"
              onClick={handleReconnect}
              disabled={busy || servers.length === 0}
              className="h-7 text-[10px] px-3 font-semibold uppercase tracking-wider"
              title="Reconnect to every configured server"
            >
              <WorkbenchIcon name="lucide:refresh-cw" size={11} className="mr-1" />
              Reconnect All
            </WorkbenchButton>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Add stdio or HTTP servers at the global (all projects) or workspace scope.
            Secrets can be referenced with{' '}
            <span className="font-mono">{'${env:VAR}'}</span> and are never written to disk.
          </p>
        </div>

        <div className="space-y-3">
          {pending.length > 0 && (
            <div className="space-y-2">
              {pending.map((row) => (
                <McpConsentDialog
                  key={`consent:${row.scope}:${row.name}`}
                  pending={row}
                  busy={busy}
                  onApprove={handleApproveConsent}
                  onDeny={handleDenyConsent}
                />
              ))}
            </div>
          )}

          {servers.length === 0 && pending.length === 0 && !formOpen ? (
            <div className="border border-dashed border-border rounded-xl p-6 text-center space-y-2">
              <WorkbenchIcon
                name="lucide:plug"
                size={22}
                className="mx-auto text-muted-foreground"
              />
              <p className="text-[11px] text-muted-foreground">
                No MCP servers configured yet. Click{' '}
                <span className="font-semibold">Add MCP Server</span> below to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {servers.map((server) => (
                <McpServerRow
                  key={`${server.scope}:${server.name}`}
                  server={server}
                  status={statusMap[server.name]}
                  capabilities={capsMap[server.name]}
                  busy={busy}
                  onEdit={openEdit}
                  onToggleEnabled={handleToggleEnabled}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}

          {formOpen ? (
            <McpServerForm
              key={editing ? `${editing.scope}:${editing.name}` : 'add'}
              editing={editing}
              busy={busy}
              onSubmit={handleSubmit}
              onCancel={closeForm}
            />
          ) : (
            <WorkbenchButton
              variant="primary"
              size="sm"
              onClick={openAdd}
              disabled={busy}
              className="h-7 text-[10px] px-3 font-semibold uppercase tracking-wider"
            >
              <WorkbenchIcon name="lucide:plus" size={12} className="mr-1" />
              Add MCP Server
            </WorkbenchButton>
          )}
        </div>
      </div>
    </SettingsCard>
  );
});
MCPSettings.displayName = 'MCPSettings';
