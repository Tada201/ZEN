import { memo, useState } from 'react';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { Badge } from '@/components/ui/badge';
import { McpFeaturesPanel } from './McpFeaturesPanel';
import type {
  McpCapabilitySummary,
  McpScope,
  McpServerEntry,
  McpServerStatusEvent,
  McpTransport,
} from '@/api';

const STATUS_COLORS: Record<McpServerStatusEvent['status'], string> = {
  reconnecting:
    'text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/10',
  connected:
    'text-emerald-700 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  failed: 'text-red-700 dark:text-red-300 border-red-500/40 bg-red-500/10',
  disabled: 'text-muted-foreground border-border bg-muted',
  awaiting_consent:
    'text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/10',
};

const STATUS_LABEL: Record<McpServerStatusEvent['status'], string> = {
  reconnecting: 'Reconnecting…',
  connected: 'Connected',
  failed: 'Failed',
  disabled: 'Disabled',
  awaiting_consent: 'Awaiting consent',
};

function StatusPill({ status }: { status?: McpServerStatusEvent }) {
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
  if (status.status === 'failed' && status.error) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <Badge
          variant="outline"
          className={`text-[8px] h-4 font-mono whitespace-nowrap ${STATUS_COLORS.failed}`}
          title={status.error}
        >
          <WorkbenchIcon name="lucide:circle-x" size={9} className="mr-1 inline-block" />
          {STATUS_LABEL.failed}
        </Badge>
        <span className="text-[9px] font-mono text-red-700/70 dark:text-red-300/70 truncate min-w-0 max-w-[220px]">
          {status.error}
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
        <WorkbenchIcon name="lucide:circle-check" size={9} className="mr-1 inline-block" />
      )}
      {status.status === 'disabled' && (
        <WorkbenchIcon name="lucide:circle-pause" size={9} className="mr-1 inline-block" />
      )}
      {status.status === 'awaiting_consent' && (
        <WorkbenchIcon name="lucide:shield-alert" size={9} className="mr-1 inline-block" />
      )}
      {STATUS_LABEL[status.status]}
    </Badge>
  );
}

const TRANSPORT_ICON: Record<McpTransport, string> = {
  http: 'lucide:globe',
  stdio: 'lucide:terminal-square',
};

const TRANSPORT_LABEL: Record<McpTransport, string> = {
  http: 'HTTP',
  stdio: 'stdio',
};

const SCOPE_LABEL: Record<McpScope, string> = {
  user: 'Global',
  workspace: 'Workspace',
};

interface RowProps {
  server: McpServerEntry;
  status?: McpServerStatusEvent;
  /** Advertised server features (from inventory). Gates the resource/prompt browser. */
  capabilities?: McpCapabilitySummary;
  busy: boolean;
  onEdit: (server: McpServerEntry) => void;
  onToggleEnabled: (server: McpServerEntry, enabled: boolean) => void;
  onRemove: (server: McpServerEntry) => void;
}

export const McpServerRow = memo(
  ({ server, status, capabilities, busy, onEdit, onToggleEnabled, onRemove }: RowProps) => {
    const [expanded, setExpanded] = useState(false);
    // Display string: URL for HTTP, "command args..." for stdio.
    const endpointDisplay =
      server.transport === 'http'
        ? server.url ?? '(no url)'
        : [server.command, ...(server.args ?? [])].filter(Boolean).join(' ');

    const disabled = server.disabled;
    const connected = status?.status === 'connected';
    const hasFeatures = connected && (capabilities?.resources || capabilities?.prompts);

    return (
      <div
        className={`border border-border rounded-xl p-3 bg-card space-y-2 transition-colors hover:border-primary/30 ${
          disabled ? 'opacity-55' : ''
        }`}
      >
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
            <Badge
              variant="outline"
              className="text-[8px] h-4 font-mono text-muted-foreground border-border bg-muted shrink-0"
            >
              {SCOPE_LABEL[server.scope]}
            </Badge>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusPill status={disabled ? undefined : status} />
            {/* Enable/disable toggle: native checkbox styled as a switch-ish
                control. Toggling re-syncs so tools register/unregister. */}
            <label
              className="flex items-center gap-1 cursor-pointer select-none"
              title={disabled ? 'Enable server' : 'Disable server'}
            >
              <input
                type="checkbox"
                checked={!disabled}
                disabled={busy}
                onChange={(e) => onToggleEnabled(server, e.target.checked)}
                className="h-3 w-3 accent-primary cursor-pointer"
              />
              <span className="text-[8px] uppercase tracking-wider text-muted-foreground">
                {disabled ? 'Off' : 'On'}
              </span>
            </label>
            <WorkbenchButton
              variant="ghost"
              size="sm"
              onClick={() => onEdit(server)}
              disabled={busy}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
              title={`Edit ${server.name}`}
            >
              <WorkbenchIcon name="lucide:pencil" size={12} />
            </WorkbenchButton>
            <WorkbenchButton
              variant="ghost"
              size="sm"
              onClick={() => onRemove(server)}
              disabled={busy}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
              title={`Remove ${server.name}`}
            >
              <WorkbenchIcon name="lucide:trash-2" size={12} />
            </WorkbenchButton>
          </div>
        </div>
        <div
          className="font-mono text-[10px] text-muted-foreground truncate"
          title={endpointDisplay}
        >
          {endpointDisplay}
        </div>
        {hasFeatures && (
          <div>
            <WorkbenchButton
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              disabled={busy}
              className="h-6 text-[9px] px-2 font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <WorkbenchIcon
                name={expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'}
                size={11}
                className="mr-1"
              />
              Resources &amp; Prompts
            </WorkbenchButton>
            {expanded && (
              <div className="mt-2">
                <McpFeaturesPanel serverName={server.name} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);
McpServerRow.displayName = 'McpServerRow';
