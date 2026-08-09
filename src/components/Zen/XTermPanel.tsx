import { useEffect, useState } from 'react';
import { SquareTerminal } from 'lucide-react';
import { terminalApi } from '@/api/terminalApi';
import { cn } from '@/lib/utils/style';
import { XTermSessionView } from './XTermSessionView';

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 32;

interface XTermPanelProps {
  className?: string;
  chatId: string;
  /** Workbench tab identity. Used for mount tracking only — the actual
   *  backend PTY id is stored in local state after spawn. */
  sessionId: string;
  /** Whether this terminal tab is currently visible/focused in the
   *  workbench. When false the xterm canvas is hidden but kept mounted
   *  so scrolling position and output are preserved. */
  active: boolean;
}

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Single-session terminal renderer.
 *
 * Lifecycle:
 *   mount   → requestApproval + spawn (no user dialog — the backend mints
 *             the approval token automatically and audits the open/close)
 *   unmount → kill PTY
 *
 * The workbench tab system in RightPanel owns the tab identity and
 * ordering; this component owns only the PTY process lifecycle.
 */
export function XTermPanel({ className = '', chatId, sessionId: _sessionId, active }: XTermPanelProps) {
  const [ptyId, setPtyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Spawn the shell as soon as the tab mounts. `requestApproval` returns a
  // session-scoped one-time token that the backend grants without further
  // user interaction; `spawn` consumes it. Both steps are audited.
  useEffect(() => {
    let disposed = false;
    let spawnedPtyId: string | null = null;
    void (async () => {
      try {
        const approval = await terminalApi.requestApproval(chatId);
        if (disposed) return;
        const id = await terminalApi.spawn(chatId, DEFAULT_COLS, DEFAULT_ROWS, approval.approvalId);
        if (disposed) {
          // Tab closed while the shell was starting — kill the orphaned PTY.
          void terminalApi.kill(chatId, id).catch(() => undefined);
          return;
        }
        spawnedPtyId = id;
        setPtyId(id);
      } catch (cause) {
        setError(getErrorMessage(cause));
      }
    })();
    return () => {
      disposed = true;
      if (spawnedPtyId) {
        const id = spawnedPtyId;
        spawnedPtyId = null;
        void terminalApi.kill(chatId, id).catch(() => undefined);
      }
    };
  }, [chatId]);

  return (
    <section className={cn('flex h-full min-h-0 flex-col bg-code-background text-code-foreground', className)} aria-label="Terminal">
      {error ? <div role="alert" className="border-b border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}

      <div className="relative min-h-0 flex-1">
        {ptyId ? (
          <div className={cn('absolute inset-0', active ? 'block' : 'hidden')}>
            <XTermSessionView chatId={chatId} sessionId={ptyId} active={active} onError={setError} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <SquareTerminal size={22} className="mb-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-code-foreground">Starting terminal…</h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">Opening an interactive shell in the active workspace.</p>
          </div>
        )}
      </div>
    </section>
  );
}
