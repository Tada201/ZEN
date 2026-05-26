import { useMemo, useState } from 'react';
import { ChevronRight, Clock, Copy, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ToolCall, ArtifactData } from './types';
import { ToolTimer } from './tool/ToolTimer';

export interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
  onViewArtifact?: (artifact: ArtifactData) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  chatId?: string;
}

function toRecord(value: ToolCall['input']): Record<string, unknown> {
  if (!value) return {};
  if (typeof value !== 'string') return value as Record<string, unknown>;
  try {
    return JSON.parse(value);
  } catch {
    const query = /"query":\s*"([^"]*)/.exec(value)?.[1];
    const command = /"command":\s*"([^"]*)/.exec(value)?.[1];
    const title = /"title":\s*"([^"]*)/.exec(value)?.[1];
    return { query, command, title };
  }
}

function parseOutput(output: string): unknown {
  if (!output) return '';
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

function summarizeOutput(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 220);
  const record = value as Record<string, unknown>;
  const results = Array.isArray(record.results) ? record.results : undefined;
  if (results) return `${results.length} results returned`;
  if (record.error) return String(record.error).slice(0, 220);
  if (record.content) return String(record.content).slice(0, 220);
  return JSON.stringify(value).slice(0, 220);
}

export function ToolCallCard({ toolCall, className, onCancel, onRetry }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { id, name, status, input, output, durationMs, attempts, startTime } = toolCall;

  const safeInput = useMemo(() => toRecord(input), [input]);
  const parsedOutput = useMemo(() => parseOutput(output || ''), [output]);
  const argPreview = String(
    safeInput.query ||
    safeInput.url ||
    safeInput.command ||
    safeInput.title ||
    safeInput.path ||
    ''
  );
  const outputSummary = summarizeOutput(parsedOutput);

  const actionText = useMemo(() => {
    if (status === 'running') return `Using ${name}${argPreview ? `: ${argPreview}` : ''}...`;
    if (status === 'awaiting_approval') return `Waiting for approval to use ${name}`;
    if (status === 'error') return `${name} failed${outputSummary ? `: ${outputSummary}` : ''}`;
    return `${name} completed${outputSummary ? `: ${outputSummary}` : ''}`;
  }, [argPreview, name, outputSummary, status]);

  const copyValue = (value: unknown, label: string) => {
    navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    toast.success(`${label} copied`);
  };

  return (
    <div className={cn('min-w-0 py-0.5', className)}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex w-full min-w-0 items-start gap-2 rounded px-0 py-1 text-left transition-colors hover:bg-white/[0.025]"
      >
        <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500">
          {status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {status === 'awaiting_approval' && <Clock className="h-3.5 w-3.5 text-amber-400/80" />}
          {status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />}
          {status === 'error' && <XCircle className="h-3.5 w-3.5 text-rose-400/80" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className={cn(
            'block truncate text-[13px] leading-5 text-zinc-400',
            status === 'running' && 'text-premium-shimmer'
          )}>
            {actionText}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
            <code className="font-mono text-zinc-500">{name}</code>
            {argPreview && <span className="max-w-[280px] truncate">{argPreview}</span>}
            {status === 'running' && <ToolTimer startTime={startTime} />}
            {status !== 'running' && durationMs !== undefined && durationMs > 0 && <span>{Math.floor(durationMs / 1000)}s</span>}
            {attempts && attempts.length > 1 && <span>{attempts.length} attempts</span>}
          </span>
        </span>

        {status === 'awaiting_approval' && (
          <span className="ml-auto flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onCancel?.(id); }}
              className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-white/[0.04] hover:text-rose-300"
            >
              Deny
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onRetry?.(id); }}
              className="rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-white/[0.04] hover:text-emerald-300"
            >
              Approve
            </span>
          </span>
        )}

        <ChevronRight className={cn(
          'mt-1 h-3 w-3 shrink-0 text-zinc-700 transition-transform group-hover:text-zinc-500',
          isExpanded && 'rotate-90'
        )} />
      </button>

      {isExpanded && (
        <div className="ml-6 border-l border-zinc-800/80 pl-4">
          <div className="rounded-md bg-[#1f1f1f]/40 p-2">
            <pre className="max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-500">
              {typeof parsedOutput === 'string'
                ? (parsedOutput || 'Output unavailable')
                : JSON.stringify(parsedOutput ?? output ?? 'Output unavailable', null, 2)}
            </pre>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-600">
            <button
              type="button"
              onClick={() => copyValue(input, 'Input')}
              className="flex items-center gap-1 hover:text-zinc-300"
            >
              <Copy className="h-3 w-3" /> Input
            </button>
            <button
              type="button"
              onClick={() => copyValue(output, 'Output')}
              className="flex items-center gap-1 hover:text-zinc-300"
            >
              <Copy className="h-3 w-3" /> Output
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
