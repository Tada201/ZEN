import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils/style';
import { Button } from '@/components/ui/button';
import { Globe, MessageSquare, ShieldAlert, X } from 'lucide-react';
import { mcpApi, type PendingElicitation } from '@/api';

/** One flat schema property we are willing to render as a form field. */
interface SchemaField {
  key: string;
  title: string;
  description?: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'enum';
  required: boolean;
  enumValues?: string[];
}

/**
 * Flatten an elicitation `requestedSchema` into renderable fields. Only
 * top-level primitive properties are supported (the spec restricts form-mode
 * schemas to flat primitives); anything nested/object is skipped so a server
 * can't smuggle structured or opaque input through the form.
 */
function toFields(schema: Record<string, unknown> | undefined): SchemaField[] {
  const props = (schema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set(
    Array.isArray(schema?.required) ? (schema!.required as string[]) : [],
  );
  const out: SchemaField[] = [];
  for (const [key, def] of Object.entries(props)) {
    const rawType = typeof def.type === 'string' ? def.type : 'string';
    const enumValues = Array.isArray(def.enum) ? (def.enum as unknown[]).map(String) : undefined;
    let type: SchemaField['type'] = 'string';
    if (enumValues && enumValues.length > 0) type = 'enum';
    else if (rawType === 'number' || rawType === 'integer') type = rawType;
    else if (rawType === 'boolean') type = 'boolean';
    else if (rawType === 'object' || rawType === 'array') continue; // not a flat primitive
    out.push({
      key,
      title: typeof def.title === 'string' ? def.title : key,
      description: typeof def.description === 'string' ? def.description : undefined,
      type,
      required: required.has(key),
      enumValues,
    });
  }
  return out;
}

interface Props {
  request: PendingElicitation;
  /** Resolve this request and advance the queue. */
  onResolved: (requestId: string) => void;
}

/**
 * Human-in-the-loop prompt for an MCP MRTR elicitation. Two modes:
 * - `form`: renders the server's flat-primitive schema as inputs; the backend
 *   has already refused any credential-bearing schema, so no secret field ever
 *   reaches this component.
 * - `url`: shows the full URL verbatim for review. The URL is never fetched or
 *   embedded; accepting asks the backend to open it in the OS browser.
 *
 * Every path ends in a single `resolveElicitation` call (accept/decline/cancel)
 * so the awaiting backend request is always released.
 */
export function McpElicitationModal({ request, onResolved }: Props) {
  const fields = useMemo(
    () => (request.mode === 'form' ? toFields(request.schema) : []),
    [request.mode, request.schema],
  );
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  // A fresh request resets the collected values so a prior form can't leak into
  // the next prompt.
  useEffect(() => {
    setValues({});
    setBusy(false);
  }, [request.requestId]);

  const missingRequired = fields.some(
    (f) => f.required && (values[f.key] === undefined || values[f.key] === ''),
  );

  const resolve = useCallback(
    async (action: 'accept' | 'decline' | 'cancel') => {
      if (busy) return;
      setBusy(true);
      try {
        const content =
          action === 'accept' && request.mode === 'form' ? values : undefined;
        await mcpApi.resolveElicitation(request.requestId, action, content);
      } finally {
        onResolved(request.requestId);
      }
    },
    [busy, onResolved, request.mode, request.requestId, values],
  );

  const isUrl = request.mode === 'url';

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-8">
      <div className="absolute inset-0 bg-card/95 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted">
          <div className="flex items-center gap-3">
            {isUrl ? (
              <Globe size={16} className="text-brand-purple" />
            ) : (
              <MessageSquare size={16} className="text-brand-purple" />
            )}
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground">
              Server Input Request
            </span>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground truncate max-w-[140px]">
            {request.serverName}
          </span>
        </div>

        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {request.message && (
            <p className="text-[12px] text-foreground leading-relaxed whitespace-pre-wrap">
              {request.message}
            </p>
          )}

          {isUrl ? (
            <div className="space-y-2">
              <label className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">
                Opens in your browser
              </label>
              <div className="p-3 bg-muted/40 rounded-lg border border-border text-[11px] font-mono text-foreground break-all">
                {request.url}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-warning">
                <ShieldAlert size={11} />
                Only continue if you trust this server. Zen never opens this URL
                until you approve.
              </div>
            </div>
          ) : fields.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              This server asked for input Zen can&apos;t render safely. Decline to
              continue.
            </p>
          ) : (
            <div className="space-y-4">
              {fields.map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  disabled={busy}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-border bg-muted">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => resolve('cancel')}
            disabled={busy}
            className="h-9 gap-2 px-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
          >
            <X size={12} />
            Cancel
          </Button>
          <div className="ml-auto flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resolve('decline')}
              disabled={busy}
              className="h-9 px-4 text-[10px] font-bold uppercase tracking-widest"
            >
              Decline
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => resolve('accept')}
              disabled={busy || (!isUrl && (fields.length === 0 || missingRequired))}
              className="h-9 px-4 text-[10px] font-bold uppercase tracking-widest"
            >
              {isUrl ? 'Open & Continue' : 'Submit'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  field,
  value,
  disabled,
  onChange,
}: {
  field: SchemaField;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const inputClass = cn(
    'w-full px-3 py-2 bg-background border border-border rounded-lg',
    'text-[12px] text-foreground focus:outline-none focus:border-brand-purple',
  );
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
        {field.title}
        {field.required && <span className="text-destructive"> *</span>}
      </label>
      {field.description && (
        <span className="text-[10px] text-muted-foreground">{field.description}</span>
      )}
      {field.type === 'boolean' ? (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-purple cursor-pointer"
          />
          <span className="text-[11px] text-foreground">Enabled</span>
        </label>
      ) : field.type === 'enum' ? (
        <select
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Select…
          </option>
          {field.enumValues?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
          value={value === undefined || value === null ? '' : String(value)}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            if (field.type === 'number' || field.type === 'integer') {
              onChange(raw === '' ? '' : Number(raw));
            } else {
              onChange(raw);
            }
          }}
          className={inputClass}
        />
      )}
    </div>
  );
}
