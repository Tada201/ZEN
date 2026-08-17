import { memo } from 'react';
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon';

const SECRET_REF_RE = /\$\{secret:([A-Za-z0-9_.-]+)\}/g;

/** Unique `${secret:KEY}` reference names in `text`, preserving order. */
export function secretKeysIn(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(SECRET_REF_RE)) seen.add(m[1]);
  return [...seen];
}

const INPUT_CLASS =
  'h-8 px-3 rounded-lg border border-border bg-background text-[11px] font-mono focus:outline-none focus:border-brand-purple/50';
const LABEL_CLASS =
  'text-[9px] uppercase tracking-wider font-semibold text-muted-foreground';

interface Props {
  /** `${secret:KEY}` references found in the active config surface. */
  keys: string[];
  /** Keys that already hold a keyring value (blank input keeps them). */
  stored: Set<string>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

/** Write-only credential editor: one masked input per referenced secret key.
 *  Values are stored in the OS keyring by the caller — never in `.mcp.json`. */
export const McpSecretFields = memo(({ keys, stored, values, onChange }: Props) => {
  if (keys.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background/40 p-2">
      <div className="flex items-center gap-1.5">
        <WorkbenchIcon name="lucide:key-round" size={11} className="text-brand-purple" />
        <span className={LABEL_CLASS}>Secret values (stored in OS keyring)</span>
      </div>
      <p className="text-[10px] text-muted-foreground/80 leading-snug">
        Enter the value for each <span className="font-mono">{'${secret:KEY}'}</span>{' '}
        reference. Values go to the OS keyring — never to{' '}
        <span className="font-mono">.mcp.json</span>.
      </p>
      {keys.map((key) => (
        <div key={key} className="space-y-1">
          <label className="flex items-center gap-1.5 text-[10px] font-mono text-foreground">
            {key}
            {stored.has(key) && (
              <span className="text-[8px] uppercase tracking-wider text-emerald-500 font-semibold">
                stored
              </span>
            )}
          </label>
          <input
            type="password"
            autoComplete="off"
            value={values[key] ?? ''}
            onChange={(e) => onChange(key, e.target.value)}
            placeholder={stored.has(key) ? 'Leave blank to keep stored value' : 'Enter value to store'}
            className={`${INPUT_CLASS} w-full`}
          />
        </div>
      ))}
    </div>
  );
});
McpSecretFields.displayName = 'McpSecretFields';
