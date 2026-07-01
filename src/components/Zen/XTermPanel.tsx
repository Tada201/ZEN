import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, SquareTerminal, X } from 'lucide-react';
import { terminalApi } from '@/api/terminalApi';
import { cn } from '@/lib/utils/style';
import { XTermSessionView } from './XTermSessionView';
import { AppDialog } from '@/components/ui/AppDialog';

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 32;

interface TerminalTab {
  id: string;
  name: string;
}

interface XTermPanelProps {
  className?: string;
}

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function XTermPanel({ className = '' }: XTermPanelProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabsRef = useRef<TerminalTab[]>([]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => () => {
    for (const tab of tabsRef.current) void terminalApi.kill(tab.id);
  }, []);

  const openTerminal = useCallback(async () => {
    // This function runs only after the user explicitly confirmed the
    // "Open workspace terminal?" dialog. The dialog click is the human
    // approval event: the backend records it as the canonical
    // interactive-terminal approval (one-time grant) via
    // TerminalService::request_interactive_approval.
    setOpening(true);
    setError(null);
    try {
      const approval = await terminalApi.requestApproval();
      const id = await terminalApi.spawn(DEFAULT_COLS, DEFAULT_ROWS, approval.approvalId);
      setTabs((current) => [...current, { id, name: `Shell ${current.length + 1}` }]);
      setActiveId(id);
      setConfirmOpen(false);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setOpening(false);
    }
  }, []);

  const closeTerminal = useCallback(async (id: string) => {
    setError(null);
    try {
      await terminalApi.kill(id);
    } catch (cause) {
      setError(getErrorMessage(cause));
      return;
    }
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    if (activeId === id) setActiveId(next.at(-1)?.id ?? null);
  }, [activeId, tabs]);

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? null;

  return (
    <section className={cn('flex h-full min-h-0 flex-col bg-code-background text-code-foreground', className)} aria-label="Terminal">
      <header className="flex min-h-12 items-center border-b border-code-border px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <SquareTerminal size={15} className="mr-2 shrink-0 text-success" />
          {tabs.map((tab) => (
            <div key={tab.id} className={cn('flex shrink-0 items-center border-l border-code-border text-xs', tab.id === activeId ? 'bg-code-foreground/10 text-code-foreground' : 'text-code-foreground/60 hover:bg-code-foreground/5')}>
              <button type="button" className="px-3 py-3 font-mono" onClick={() => setActiveId(tab.id)}>{tab.name}</button>
              <button type="button" className="px-2 py-3 text-code-foreground/50 hover:text-code-foreground" onClick={() => void closeTerminal(tab.id)} aria-label={`Close ${tab.name}`}><X size={13} /></button>
            </div>
          ))}
          <button type="button" className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center border border-code-border text-code-foreground/75 hover:bg-code-foreground/10 hover:text-code-foreground" onClick={() => setConfirmOpen(true)} title="Open terminal"><Plus size={15} /></button>
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-code-foreground/50 sm:inline">interactive workspace shell</span>
      </header>

      {error ? <div role="alert" className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}

      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <div key={tab.id} className={cn('absolute inset-0', tab.id === activeId ? 'block' : 'hidden')}>
            <XTermSessionView sessionId={tab.id} active={tab.id === activeId} onError={setError} />
          </div>
        ))}
        {!activeTab ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <SquareTerminal size={22} className="mb-4 text-code-foreground/50" />
            <h2 className="text-sm font-medium text-code-foreground">Open a workspace terminal</h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-code-foreground/65">Commands run in the active workspace under your account. Agent commands remain separate and cannot write into this shell.</p>
            <button type="button" className="mt-5 border border-success/40 px-3 py-2 text-xs font-medium text-success hover:bg-success/10" onClick={() => setConfirmOpen(true)}>Open terminal</button>
          </div>
        ) : null}
      </div>

      <AppDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Open workspace terminal?"
        description="This starts an interactive shell in the configured workspace with your user permissions. Agent command execution remains isolated."
        footer={<><button type="button" className="border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted" onClick={() => setConfirmOpen(false)} disabled={opening}>Cancel</button><button type="button" className="border border-success/50 bg-success/10 px-3 py-2 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-50" onClick={() => void openTerminal()} disabled={opening}>{opening ? 'Opening...' : 'Open terminal'}</button></>}
      >
        <p className="text-xs leading-5 text-muted-foreground">The shell opens only after you confirm this action. It has your normal account permissions.</p>
      </AppDialog>
    </section>
  );
}
