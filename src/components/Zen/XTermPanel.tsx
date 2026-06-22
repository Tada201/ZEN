import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, SquareTerminal, X } from 'lucide-react';
import { terminalApi } from '@/api/terminalApi';
import { cn } from '@/lib/utils/style';
import { XTermSessionView } from './XTermSessionView';

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
    }
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    if (activeId === id) setActiveId(next.at(-1)?.id ?? null);
  }, [activeId, tabs]);

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? null;

  return (
    <section className={cn('flex h-full min-h-0 flex-col bg-[#09090b] text-zinc-100', className)} aria-label="Terminal">
      <header className="flex min-h-12 items-center border-b border-white/[0.10] px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <SquareTerminal size={15} className="mr-2 shrink-0 text-emerald-300" />
          {tabs.map((tab) => (
            <div key={tab.id} className={cn('flex shrink-0 items-center border-l border-white/[0.08] text-xs', tab.id === activeId ? 'bg-white/[0.08] text-white' : 'text-zinc-400 hover:bg-white/[0.04]')}>
              <button type="button" className="px-3 py-3 font-mono" onClick={() => setActiveId(tab.id)}>{tab.name}</button>
              <button type="button" className="px-2 py-3 text-zinc-500 hover:text-white" onClick={() => void closeTerminal(tab.id)} aria-label={`Close ${tab.name}`}><X size={13} /></button>
            </div>
          ))}
          <button type="button" className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center border border-white/[0.12] text-zinc-300 hover:bg-white/[0.08] hover:text-white" onClick={() => setConfirmOpen(true)} title="Open terminal"><Plus size={15} /></button>
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 sm:inline">interactive workspace shell</span>
      </header>

      {error ? <div role="alert" className="border-b border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}

      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <div key={tab.id} className={cn('absolute inset-0', tab.id === activeId ? 'block' : 'hidden')}>
            <XTermSessionView sessionId={tab.id} active={tab.id === activeId} onError={setError} />
          </div>
        ))}
        {!activeTab ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <SquareTerminal size={22} className="mb-4 text-zinc-500" />
            <h2 className="text-sm font-medium text-zinc-100">Open a workspace terminal</h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-zinc-400">Commands run in the active workspace under your account. Agent commands remain separate and cannot write into this shell.</p>
            <button type="button" className="mt-5 border border-emerald-300/40 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-300/10" onClick={() => setConfirmOpen(true)}>Open terminal</button>
          </div>
        ) : null}
      </div>

      {confirmOpen ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-5" role="dialog" aria-modal="true" aria-label="Open terminal confirmation">
          <div className="w-full max-w-md border border-white/[0.16] bg-[#121214] p-5 shadow-2xl">
            <h2 className="text-sm font-semibold">Open workspace terminal?</h2>
            <p className="mt-2 text-xs leading-5 text-zinc-400">This starts an interactive shell in the configured workspace. It has your normal user permissions and remains isolated from agent command execution.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="border border-white/[0.12] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06]" onClick={() => setConfirmOpen(false)} disabled={opening}>Cancel</button>
              <button type="button" className="border border-emerald-300/50 bg-emerald-300/10 px-3 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-300/20 disabled:opacity-50" onClick={() => void openTerminal()} disabled={opening}>{opening ? 'Opening...' : 'Open terminal'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
