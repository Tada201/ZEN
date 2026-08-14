import { memo, useCallback, useState } from 'react';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { Badge } from '@/components/ui/badge';
import {
  mcpApi,
  type McpPrompt,
  type McpPromptMessage,
  type McpResource,
  type McpResourceContents,
} from '@/api';

type Tab = 'resources' | 'prompts';

/**
 * Read-only browser for a connected server's resources and prompts. Both are
 * explicit user actions — nothing here is injected into a model automatically.
 * The backend safety-normalizes every value (URI allowlist, control-char
 * stripping, size caps, binary kept as base64), so this panel renders returned
 * text as-is inside a fixed, non-executed <pre>.
 */
export const McpFeaturesPanel = memo(({ serverName }: { serverName: string }) => {
  const [tab, setTab] = useState<Tab>('resources');
  const [resources, setResources] = useState<McpResource[] | null>(null);
  const [prompts, setPrompts] = useState<McpPrompt[] | null>(null);
  const [contents, setContents] = useState<McpResourceContents[] | null>(null);
  const [messages, setMessages] = useState<McpPromptMessage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>, apply: (v: T) => void) => {
    setBusy(true);
    setError(null);
    try {
      apply(await fn());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadResources = useCallback(() => {
    setContents(null);
    void run(() => mcpApi.listResources(serverName), setResources);
  }, [run, serverName]);

  const loadPrompts = useCallback(() => {
    setMessages(null);
    void run(() => mcpApi.listPrompts(serverName), setPrompts);
  }, [run, serverName]);

  const readResource = useCallback(
    (uri: string) => void run(() => mcpApi.readResource(serverName, uri), setContents),
    [run, serverName],
  );

  const getPrompt = useCallback(
    (name: string) => void run(() => mcpApi.getPrompt(serverName, name), setMessages),
    [run, serverName],
  );

  const switchTab = useCallback(
    (next: Tab) => {
      setTab(next);
      setError(null);
      if (next === 'resources') loadResources();
      else loadPrompts();
    },
    [loadResources, loadPrompts],
  );

  return (
    <div className="border border-border rounded-xl p-3 bg-card space-y-2">
      <div className="flex items-center gap-2">
        <WorkbenchButton
          variant={tab === 'resources' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => switchTab('resources')}
          disabled={busy}
          className="h-6 text-[10px] px-2 font-semibold uppercase tracking-wider"
        >
          Resources
        </WorkbenchButton>
        <WorkbenchButton
          variant={tab === 'prompts' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => switchTab('prompts')}
          disabled={busy}
          className="h-6 text-[10px] px-2 font-semibold uppercase tracking-wider"
        >
          Prompts
        </WorkbenchButton>
        {busy && (
          <WorkbenchIcon
            name="lucide:loader-pinwheel"
            size={11}
            className="animate-spin text-muted-foreground"
          />
        )}
      </div>

      {error && (
        <p className="text-[10px] text-destructive/80 font-mono break-words">{error}</p>
      )}

      {tab === 'resources' && (
        <div className="space-y-1">
          {resources?.length === 0 && (
            <p className="text-[10px] text-muted-foreground">No resources advertised.</p>
          )}
          {resources?.map((r) => (
            <button
              key={r.uri}
              type="button"
              disabled={busy}
              onClick={() => readResource(r.uri)}
              className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/60 disabled:opacity-50"
              title={r.uri}
            >
              <WorkbenchIcon name="lucide:file" size={11} className="text-muted-foreground shrink-0" />
              <span className="font-mono text-[10px] text-foreground truncate">{r.name}</span>
              {r.mimeType && (
                <Badge variant="outline" className="text-[8px] h-4 font-mono text-muted-foreground border-border bg-muted shrink-0">
                  {r.mimeType}
                </Badge>
              )}
            </button>
          ))}
          {contents?.map((c, i) => (
            <div key={`${c.uri}:${i}`} className="rounded-lg border border-border bg-muted/30 p-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] text-muted-foreground truncate">{c.uri}</span>
                {c.truncated && (
                  <Badge variant="outline" className="text-[8px] h-4 font-mono text-amber-600 border-amber-500/40 bg-amber-500/10">
                    truncated
                  </Badge>
                )}
              </div>
              {c.text !== undefined ? (
                <pre className="text-[10px] font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto text-foreground">
                  {c.text}
                </pre>
              ) : c.blobBase64 !== undefined ? (
                <p className="text-[10px] text-muted-foreground italic">
                  Binary content ({c.blobBase64.length} base64 chars) — not rendered.
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground italic">Empty content.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'prompts' && (
        <div className="space-y-1">
          {prompts?.length === 0 && (
            <p className="text-[10px] text-muted-foreground">No prompts advertised.</p>
          )}
          {prompts?.map((p) => (
            <button
              key={p.name}
              type="button"
              disabled={busy}
              onClick={() => getPrompt(p.name)}
              className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/60 disabled:opacity-50"
              title={p.description ?? p.name}
            >
              <WorkbenchIcon name="lucide:message-square" size={11} className="text-muted-foreground shrink-0" />
              <span className="font-mono text-[10px] text-foreground truncate">{p.title ?? p.name}</span>
              {p.arguments.some((a) => a.required) && (
                <Badge variant="outline" className="text-[8px] h-4 font-mono text-muted-foreground border-border bg-muted shrink-0">
                  args
                </Badge>
              )}
            </button>
          ))}
          {messages?.map((m, i) => (
            <div key={i} className="rounded-lg border border-border bg-muted/30 p-2 space-y-1">
              <span className="text-[8px] uppercase tracking-wider text-muted-foreground">{m.role}</span>
              <pre className="text-[10px] font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto text-foreground">
                {m.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
McpFeaturesPanel.displayName = 'McpFeaturesPanel';
