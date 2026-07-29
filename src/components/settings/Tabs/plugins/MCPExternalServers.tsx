import { memo, useState } from 'react';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { Badge } from '@/components/ui/badge';
import type { McpServerEntry, McpServerStatusEvent, McpTransport } from '@/api';

interface Props {
  servers: McpServerEntry[];
  busy: boolean;
  /** Per-row status keyed by server name. Rows with no entry are
   * rendered as `idle` (no pill). */
  statusMap: Record<string, McpServerStatusEvent>;
  onAdd: (name: string, url: string) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  onReconnect: () => Promise<void>;
}

const STATUS_COLORS: Record<McpServerStatusEvent['status'], string> = {
  reconnecting:
    'text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/10',
  connected: 'text-emerald-700 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  failed: 'text-red-700 dark:text-red-300 border-red-500/40 bg-red-500/10',
};

const STATUS_LABEL: Record<McpServerStatusEvent['status'], string> = {
  reconnecting: 'Reconnecting…',
  connected: 'Connected',
  failed: 'Failed',
};

function StatusPill({
  status,
  error,
}: {
  status?: McpServerStatusEvent;
  error?: string;
}) {
  if (!status) {
    return (
      <Badge
        variant="outline"
        className="text-[8px] h-4 font-mono text-muted-foreground border-border bg-muted"
      >
        Idle
      </Badge>
    );
  }
  if (status.status === 'failed' && (status.error || error)) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <Badge
          variant="outline"
          className={`text-[8px] h-4 font-mono whitespace-nowrap ${STATUS_COLORS.failed}`}
          title={status.error || error}
        >
          <WorkbenchIcon name="lucide:circle-x" size={9} className="mr-1 inline-block" />
          {STATUS_LABEL.failed}
        </Badge>
        <span className="text-[9px] font-mono text-red-700/70 dark:text-red-300/70 truncate min-w-0 max-w-[260px]">
          {status.error || error}
        </span>
      </div>
    );
  }
  return (
    <Badge
      variant="outline"
      className={`text-[8px] h-4 font-mono whitespace-nowrap ${STATUS_COLORS[status.status]}`}
    >
      {status.status === 'reconnecting' && (
        <WorkbenchIcon
          name="lucide:loader-pinwheel"
          size={9}
          className="mr-1 inline-block animate-spin"
        />
      )}
      {status.status === 'connected' && (
        <WorkbenchIcon
          name="lucide:circle-check"
          size={9}
          className="mr-1 inline-block"
        />
      )}
      {STATUS_LABEL[status.status]}
    </Badge>
  );
}

interface AddFormProps {
  busy: boolean;
  onSubmit: (name: string, url: string) => Promise<void>;
}

const AddForm = memo(({ busy, onSubmit }: AddFormProps) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }
    if (!trimmedUrl) {
      setError('URL is required');
      return;
    }
    try {
      // Basic URL sanity check — be permissive about schemes because
      // MCP servers may use ws:// or in-process unix sockets.
      const parsed = new URL(trimmedUrl);
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
        setError(`Unsupported URL scheme: ${parsed.protocol}`);
        return;
      }
    } catch {
      setError('URL is not parseable');
      return;
    }
    setError(null);
    try {
      await onSubmit(trimmedName, trimmedUrl);
      setName('');
      setUrl('');
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!open) {
    return (
      <WorkbenchButton
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="h-7 text-[10px] px-3 font-semibold uppercase tracking-wider"
      >
        <WorkbenchIcon name="lucide:plus" size={12} className="mr-1" />
        Add MCP Server
      </WorkbenchButton>
    );
  }

  return (
    <div className="border border-border rounded-xl p-3 bg-card space-y-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        <WorkbenchIcon name="lucide:plus" size={11} className="text-primary" />
        New MCP Server
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="server-name"
          className="h-8 px-3 rounded-lg border border-border bg-background text-[11px] font-mono focus:outline-none focus:border-brand-purple/50"
        />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:8080"
          className="h-8 px-3 rounded-lg border border-border bg-background text-[11px] font-mono focus:outline-none focus:border-brand-purple/50"
        />
      </div>
      {error && (
        <p className="text-[10px] text-red-600 dark:text-red-400 font-mono">{error}</p>
      )}
      <div className="flex items-center justify-end gap-2">
        <WorkbenchButton
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
            setName('');
            setUrl('');
          }}
          disabled={busy}
          className="h-7 text-[10px] px-3 font-semibold uppercase tracking-wider"
        >
          Cancel
        </WorkbenchButton>
        <WorkbenchButton
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={busy}
          className="h-7 text-[10px] px-3 font-semibold uppercase tracking-wider"
        >
          <WorkbenchIcon name="lucide:save" size={11} className="mr-1" />
          {busy ? 'Saving…' : 'Save & Connect'}
        </WorkbenchButton>
      </div>
    </div>
  );
});
AddForm.displayName = 'MCPAddForm';

const TRANSPORT_ICON: Record<McpTransport, string> = {
  http: 'lucide:globe',
  stdio: 'lucide:terminal-square',
};

const TRANSPORT_LABEL: Record<McpTransport, string> = {
  http: 'HTTP',
  stdio: 'stdio',
};

interface RowProps {
  server: McpServerEntry;
  status?: McpServerStatusEvent;
  busy: boolean;
  onRemove: (name: string) => Promise<void>;
}

const Row = memo(({ server, status, busy, onRemove }: RowProps) => {
  // Display string: URL for HTTP, "command args..." for stdio.
  const endpointDisplay = server.transport === 'http'
    ? server.url ?? '(no url)'
    : [server.command, ...(server.args ?? [])].filter(Boolean).join(' ');

  return (
    <div className="border border-border rounded-xl p-3 bg-card space-y-2 transition-colors hover:border-brand-purple/30">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <WorkbenchIcon
            name={TRANSPORT_ICON[server.transport]}
            size={13}
            className="text-muted-foreground shrink-0"
          />
          <div className="font-mono text-[12px] font-semibold text-foreground truncate">
            {server.name}
          </div>
          <Badge
            variant="outline"
            className="text-[8px] h-4 font-mono text-muted-foreground border-border bg-muted shrink-0"
          >
            {TRANSPORT_LABEL[server.transport]}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={status} />
          <WorkbenchButton
            variant="ghost"
            size="sm"
            onClick={() => onRemove(server.name)}
            disabled={busy}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
            title={`Remove ${server.name}`}
          >
            <WorkbenchIcon name="lucide:trash-2" size={12} />
          </WorkbenchButton>
        </div>
      </div>
      <div className="font-mono text-[10px] text-muted-foreground truncate" title={endpointDisplay}>
        {endpointDisplay}
      </div>
    </div>
  );
});
Row.displayName = 'MCPRow';

export const MCPExternalServers = memo(
  ({ servers, busy, statusMap, onAdd, onRemove, onReconnect }: Props) => {
    return (
      <div className="space-y-4 pt-4 border-t border-border">
        <div className="border-b border-border pb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <WorkbenchIcon
                  name="lucide:plug-zap"
                  size={14}
                  className="text-primary"
                />
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
              onClick={onReconnect}
              disabled={busy || servers.length === 0}
              className="h-7 text-[10px] px-3 font-semibold uppercase tracking-wider"
              title="Reconnect to every configured server"
            >
              <WorkbenchIcon name="lucide:refresh-cw" size={11} className="mr-1" />
              Reconnect All
            </WorkbenchButton>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Add external MCP servers to merge their tool catalog into the agent registry.
            On save, ZEN automatically reconnects to every row.
          </p>
        </div>

        <div className="space-y-3">
          {servers.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-6 text-center space-y-2">
              <WorkbenchIcon
                name="lucide:plug"
                size={22}
                className="mx-auto text-muted-foreground"
              />
              <p className="text-[11px] text-muted-foreground">
                No MCP servers configured yet. Click <span className="font-semibold">Add MCP Server</span> below to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {servers.map((server) => (
                <Row
                  key={server.name}
                  server={server}
                  status={statusMap[server.name]}
                  busy={busy}
                  onRemove={onRemove}
                />
              ))}
            </div>
          )}

          <AddForm busy={busy} onSubmit={onAdd} />
        </div>
      </div>
    );
  },
);
MCPExternalServers.displayName = 'MCPExternalServers';
