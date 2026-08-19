import { memo, useState } from 'react';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { Badge } from '@/components/ui/badge';
import type { PendingConsent } from '@/api';

const SCOPE_LABEL: Record<string, string> = {
  user: 'Global',
  workspace: 'Workspace',
};

interface ConsentProps {
  pending: PendingConsent;
  busy: boolean;
  onApprove: (pending: PendingConsent) => void;
  onDeny: (pending: PendingConsent) => void;
}

/**
 * Privilege-warning card for a server held at the connection-consent gate.
 * Shows exactly what will run — command/args for stdio, origin for HTTP, plus
 * the *names* of any credentials it will be handed — so approval is informed.
 * No server connects until the user approves this exact fingerprint.
 */
export const McpConsentDialog = memo(
  ({ pending, busy, onApprove, onDeny }: ConsentProps) => {
    const [ack, setAck] = useState(false);
    const isStdio = pending.transport === 'stdio';

    return (
      <div className="border border-amber-500/40 bg-amber-500/5 rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <WorkbenchIcon
              name="lucide:shield-alert"
              size={14}
              className="text-amber-600 dark:text-amber-400 shrink-0"
            />
            <div className="font-mono text-[12px] font-semibold text-foreground truncate">
              {pending.name}
            </div>
            <Badge
              variant="outline"
              className="text-[8px] h-4 font-mono text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/10 shrink-0"
            >
              Awaiting consent
            </Badge>
            <Badge
              variant="outline"
              className="text-[8px] h-4 font-mono text-muted-foreground border-border bg-muted shrink-0"
            >
              {SCOPE_LABEL[pending.scope] ?? pending.scope}
            </Badge>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {isStdio
            ? 'This server runs a local command with full access to your machine. Approve only if you trust it.'
            : 'This server will receive requests from the agent, including any configured credentials. Approve only if you trust it.'}
        </p>

        <div className="space-y-1.5 rounded-lg border border-border bg-card p-2.5">
          <Field label={isStdio ? 'Command' : 'Origin'} value={pending.origin} mono />
          {isStdio && pending.args.length > 0 && (
            <Field label="Arguments" value={pending.args.join(' ')} mono />
          )}
          {pending.credentialKeys.length > 0 && (
            <Field
              label="Credentials"
              value={pending.credentialKeys.join(', ')}
              hint="names only — values are never shown"
              mono
            />
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={ack}
            disabled={busy}
            onChange={(e) => setAck(e.target.checked)}
            className="h-3 w-3 accent-primary cursor-pointer"
          />
          <span className="text-[10px] text-muted-foreground">
            I trust this server and understand what it can access.
          </span>
        </label>

        <div className="flex items-center justify-end gap-2">
          <WorkbenchButton
            variant="ghost"
            size="sm"
            onClick={() => onDeny(pending)}
            disabled={busy}
            className="h-7 text-[10px] px-3 font-semibold uppercase tracking-wider text-red-600 hover:text-red-500"
          >
            <WorkbenchIcon name="lucide:x" size={11} className="mr-1" />
            Deny
          </WorkbenchButton>
          <WorkbenchButton
            variant="primary"
            size="sm"
            onClick={() => onApprove(pending)}
            disabled={busy || !ack}
            className="h-7 text-[10px] px-3 font-semibold uppercase tracking-wider"
            title={ack ? 'Approve this connection' : 'Confirm you trust this server first'}
          >
            <WorkbenchIcon name="lucide:shield-check" size={11} className="mr-1" />
            Approve &amp; Connect
          </WorkbenchButton>
        </div>
      </div>
    );
  },
);
McpConsentDialog.displayName = 'McpConsentDialog';

function Field({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0 w-20 pt-0.5">
        {label}
      </span>
      <div className="min-w-0">
        <div
          className={`text-[11px] text-foreground break-all ${mono ? 'font-mono' : ''}`}
        >
          {value}
        </div>
        {hint && <div className="text-[9px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}
