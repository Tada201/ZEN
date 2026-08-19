import { memo, useEffect, useMemo, useState } from 'react';
import { WorkbenchButton } from '@/components/ui/WorkbenchButton';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';
import { mcpApi, type McpScope, type McpServerEntry, type McpTransport } from '@/api';
import { McpSecretFields, secretKeysIn } from './McpSecretFields';

export interface McpFormSubmit {
  scope: McpScope;
  name: string;
  /** Raw entry object persisted under `mcpServers[name]`. */
  config: Record<string, unknown>;
  /** Credential values to store in the OS keyring before the config upsert so
   *  `${secret:key}` references in `config` resolve at connect time. Values
   *  never enter `.mcp.json`. */
  secrets: Array<{ key: string; value: string }>;
}

interface Props {
  /** When set, the form edits this row (name + scope locked). */
  editing?: McpServerEntry | null;
  busy: boolean;
  onSubmit: (payload: McpFormSubmit) => Promise<void>;
  onCancel: () => void;
}

type Mode = 'form' | 'json';


/** Parse a space-separated args string, respecting simple double quotes so
 *  `--flag "a b"` yields two args. Empty tokens are dropped. */
function parseArgs(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    out.push(m[1] ?? m[2]);
  }
  return out;
}

/** Build the raw entry object for the form fields. Only fields relevant to
 *  the chosen transport are emitted so we never persist a mixed entry. */
function buildEntry(fields: {
  transport: McpTransport;
  url: string;
  command: string;
  args: string;
  envJson: string;
  timeoutMs: string;
}): Record<string, unknown> {
  const entry: Record<string, unknown> = { type: fields.transport };
  const timeout = fields.timeoutMs.trim();
  if (timeout) {
    const n = Number(timeout);
    if (Number.isFinite(n) && n > 0) entry.timeout_ms = Math.floor(n);
  }
  const env = fields.envJson.trim();
  if (env) {
    // Validated before submit; parse again here for the final shape.
    entry[fields.transport === 'http' ? 'headers' : 'env'] = JSON.parse(env);
  }
  if (fields.transport === 'http') {
    entry.url = fields.url.trim();
  } else {
    entry.command = fields.command.trim();
    const args = parseArgs(fields.args);
    if (args.length) entry.args = args;
  }
  return entry;
}

// PLACEHOLDER_BODY

/** Reconstruct the raw `mcpServers[name]` entry object from a typed row so
 *  the JSON editor and form show the config actually saved on the backend.
 *  Mirrors `buildEntry` field selection (transport-scoped, `timeout_ms`
 *  snake_case, `disabled` only when true). */
function entryToConfig(e: McpServerEntry): Record<string, unknown> {
  const c: Record<string, unknown> = { type: e.transport };
  if (e.transport === 'http') {
    if (e.url) c.url = e.url;
    if (e.headers && Object.keys(e.headers).length) c.headers = e.headers;
  } else {
    if (e.command) c.command = e.command;
    if (e.args?.length) c.args = e.args;
    if (e.env && Object.keys(e.env).length) c.env = e.env;
  }
  if (e.timeoutMs != null) c.timeout_ms = e.timeoutMs;
  if (e.disabled) c.disabled = true;
  return c;
}

const INPUT_CLASS =
  'h-8 px-3 rounded-lg border border-border bg-background text-[11px] font-mono focus:outline-none focus:border-primary/50';
const LABEL_CLASS =
  'text-[9px] uppercase tracking-wider font-semibold text-muted-foreground';

export const McpServerForm = memo(({ editing, busy, onSubmit, onCancel }: Props) => {
  const isEdit = !!editing;
  const [mode, setMode] = useState<Mode>('form');

  const [scope, setScope] = useState<McpScope>(editing?.scope ?? 'workspace');
  const [name, setName] = useState(editing?.name ?? '');
  const [transport, setTransport] = useState<McpTransport>(
    editing?.transport ?? 'stdio',
  );
  const [url, setUrl] = useState(editing?.url ?? '');
  const [command, setCommand] = useState(editing?.command ?? '');
  const [args, setArgs] = useState((editing?.args ?? []).join(' '));
  const [timeoutMs, setTimeoutMs] = useState(
    editing?.timeoutMs != null ? String(editing.timeoutMs) : '',
  );
  const [envOpen, setEnvOpen] = useState(false);
  const initialEnvJson = useMemo(() => {
    const src = editing?.transport === 'http' ? editing?.headers : editing?.env;
    return src && Object.keys(src).length ? JSON.stringify(src, null, 2) : '';
  }, [editing]);
  const [envJson, setEnvJson] = useState(initialEnvJson);

  // Write-only credential editor. Keys are the `${secret:KEY}` references
  // found in the active config text; values are what the user types to store
  // in the OS keyring. `storedKeys` tracks which keys already hold a value so
  // an edit can leave them blank ("keep existing") instead of clobbering.
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [storedKeys, setStoredKeys] = useState<Set<string>>(new Set());


  // JSON mode: a single textarea holding either `{"name":{...}}` or
  // `{"mcpServers":{"name":{...}}}`. On edit, prefill with the row's
  // actual saved config so the user edits real values, not a blank box.
  const [jsonText, setJsonText] = useState(() =>
    editing ? JSON.stringify({ [editing.name]: entryToConfig(editing) }, null, 2) : '',
  );
  const [error, setError] = useState<string | null>(null);

  // Secret references in whichever config surface is active drive the editor.
  const referencedSecretKeys = useMemo(
    () => secretKeysIn(mode === 'json' ? jsonText : envJson),
    [mode, jsonText, envJson],
  );

  // Ask the backend which referenced keys already hold a keyring value so the
  // editor can mark them "stored" and treat a blank input as "keep existing".
  useEffect(() => {
    if (referencedSecretKeys.length === 0) {
      setStoredKeys(new Set());
      return;
    }
    let cancelled = false;
    mcpApi
      .secretStatus(referencedSecretKeys)
      .then((present) => {
        if (!cancelled) setStoredKeys(new Set(present));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [referencedSecretKeys]);

  /** Collect non-empty secret inputs for keys still referenced by the config.
   *  A blank value for an already-stored key is skipped (keep existing); a
   *  blank value for an unstored key is skipped too (the reference stays
   *  literal until the user provides it). */
  const collectSecrets = (): McpFormSubmit['secrets'] =>
    referencedSecretKeys
      .map((key) => ({ key, value: (secretValues[key] ?? '').trim() }))
      .filter((s) => s.value.length > 0);


  const submitForm = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }
    if (transport === 'http') {
      const u = url.trim();
      if (!u) {
        setError('URL is required for HTTP servers');
        return;
      }
      try {
        const parsed = new URL(u);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          setError(`Unsupported URL scheme: ${parsed.protocol}`);
          return;
        }
      } catch {
        setError('URL is not parseable');
        return;
      }
    } else if (!command.trim()) {
      setError('Command is required for stdio servers');
      return;
    }
    const envRaw = envJson.trim();
    if (envRaw) {
      try {
        const parsed = JSON.parse(envRaw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setError('Environment/headers must be a JSON object');
          return;
        }
      } catch {
        setError('Environment/headers is not valid JSON');
        return;
      }
    }
    setError(null);
    try {
      const config = buildEntry({ transport, url, command, args, envJson, timeoutMs });
      await onSubmit({ scope, name: trimmedName, config, secrets: collectSecrets() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const submitJson = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError('Pasted config is not valid JSON');
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      setError('Config must be a JSON object');
      return;
    }
    // Accept both {"mcpServers":{name:{...}}} and {name:{...}} shapes.
    const record = parsed as Record<string, unknown>;
    const servers =
      'mcpServers' in record && typeof record.mcpServers === 'object'
        ? (record.mcpServers as Record<string, unknown>)
        : record;
    const names = Object.keys(servers);
    if (names.length !== 1) {
      setError('Paste exactly one server entry');
      return;
    }
    const entryName = names[0];
    const entry = servers[entryName];
    if (typeof entry !== 'object' || entry === null) {
      setError(`Entry '${entryName}' must be an object`);
      return;
    }
    // On edit the name is immutable — upsert against the original row so a
    // renamed key in the textarea updates this server instead of creating
    // a second one.
    const targetName = isEdit ? editing!.name : entryName;
    setError(null);
    try {
      await onSubmit({ scope, name: targetName, config: entry as Record<string, unknown>, secrets: collectSecrets() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // PLACEHOLDER_RENDER
  return (
    <div className="border border-border rounded-xl p-3 bg-card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          <WorkbenchIcon
            name={isEdit ? 'lucide:pencil' : 'lucide:plus'}
            size={11}
            className="text-primary"
          />
          {isEdit ? `Edit ${editing?.name}` : 'New MCP Server'}
        </div>
        {/* Form / JSON toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {(['form', 'json'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`h-6 px-2 rounded-md text-[9px] uppercase tracking-wider font-semibold transition-colors ${
                mode === m
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {mode === 'json' ? (
        <div className="space-y-2">
          <label className={LABEL_CLASS}>Scope</label>
          <ScopeSelect scope={scope} disabled={isEdit} onChange={setScope} />
          <label className={LABEL_CLASS}>Server JSON</label>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={'{\n  "my-server": {\n    "command": "npx",\n    "args": ["-y", "server"]\n  }\n}'}
            rows={8}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[11px] font-mono focus:outline-none focus:border-primary/50 resize-y"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className={LABEL_CLASS}>Scope</label>
              <ScopeSelect scope={scope} disabled={isEdit} onChange={setScope} />
            </div>
            <div className="space-y-1">
              <label className={LABEL_CLASS}>Type</label>
              <select
                value={transport}
                onChange={(e) => setTransport(e.target.value as McpTransport)}
                className={`${INPUT_CLASS} w-full`}
              >
                <option value="stdio">stdio (command)</option>
                <option value="http">HTTP (url)</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className={LABEL_CLASS}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEdit}
              placeholder="server-name"
              className={`${INPUT_CLASS} w-full disabled:opacity-60`}
            />
          </div>
          {transport === 'http' ? (
            <div className="space-y-1">
              <label className={LABEL_CLASS}>URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://localhost:8080/mcp"
                className={`${INPUT_CLASS} w-full`}
              />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className={LABEL_CLASS}>Command</label>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx"
                  className={`${INPUT_CLASS} w-full`}
                />
              </div>
              <div className="space-y-1">
                <label className={LABEL_CLASS}>Args (space-separated)</label>
                <input
                  type="text"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder='-y @modelcontextprotocol/server-memory'
                  className={`${INPUT_CLASS} w-full`}
                />
              </div>
            </>
          )}
          <div className="space-y-1">
            <label className={LABEL_CLASS}>Timeout (ms, optional)</label>
            <input
              type="number"
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(e.target.value)}
              placeholder="30000"
              className={`${INPUT_CLASS} w-full`}
            />
          </div>
          {/* Collapsible env / headers JSON box. */}
          <button
            type="button"
            onClick={() => setEnvOpen((v) => !v)}
            className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground"
          >
            <WorkbenchIcon
              name={envOpen ? 'lucide:chevron-down' : 'lucide:chevron-right'}
              size={11}
            />
            {transport === 'http' ? 'Headers' : 'Environment variables'} (JSON, ${'{env:VAR}'} / ${'{secret:KEY}'} supported)
          </button>
          <p className="text-[9px] text-muted-foreground/60 leading-snug">
            Reference a secret with{' '}
            <span className="font-mono">{'${secret:KEY}'}</span> here, then set its
            value below — it is stored in the OS keyring, not in config.
          </p>
          {envOpen && (
            <textarea
              value={envJson}
              onChange={(e) => setEnvJson(e.target.value)}
              placeholder={'{\n  "API_TOKEN": "${secret:MCP_TOKEN}"\n}'}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[11px] font-mono focus:outline-none focus:border-primary/50 resize-y"
            />
          )}
        </div>
      )}

      <McpSecretFields
        keys={referencedSecretKeys}
        stored={storedKeys}
        values={secretValues}
        onChange={(key, value) =>
          setSecretValues((prev) => ({ ...prev, [key]: value }))
        }
      />

      {error && (
        <p className="text-[10px] text-red-600 dark:text-red-400 font-mono">{error}</p>
      )}
      <div className="flex items-center justify-end gap-2">
        <WorkbenchButton
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={busy}
          className="h-7 text-[10px] px-3 font-semibold uppercase tracking-wider"
        >
          Cancel
        </WorkbenchButton>
        <WorkbenchButton
          variant="primary"
          size="sm"
          onClick={mode === 'json' ? submitJson : submitForm}
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
McpServerForm.displayName = 'McpServerForm';

function ScopeSelect({
  scope,
  disabled,
  onChange,
}: {
  scope: McpScope;
  disabled?: boolean;
  onChange: (s: McpScope) => void;
}) {
  return (
    <select
      value={scope}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as McpScope)}
      className="h-8 px-3 rounded-lg border border-border bg-background text-[11px] font-mono focus:outline-none focus:border-primary/50 w-full disabled:opacity-60"
    >
      <option value="workspace">Workspace (this project)</option>
      <option value="user">Global (all projects)</option>
    </select>
  );
}
