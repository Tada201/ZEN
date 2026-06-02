import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Clock, Copy, ExternalLink, Loader2, CheckCircle2, XCircle, Search, Terminal, FileText, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ToolCall, ArtifactData } from './types';
import { ToolTimer } from './tool/ToolTimer';
import { buildToolOutputPreview } from './tool/toolOutputPreview';
import { buildToolChecklistPreview } from './tool/toolInputPreview';
import { buildToolCompactPreview } from './tool/toolCompactPreview';

export interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
  onViewArtifact?: (artifact: ArtifactData) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  chatId?: string;
  defaultExpanded?: boolean;
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

function stringifyDetail(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function getToolIcon(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('search') || normalized.includes('web')) return Search;
  if (normalized.includes('bash') || normalized.includes('shell') || normalized.includes('command') || normalized.includes('test')) return Terminal;
  if (normalized.includes('file') || normalized.includes('read') || normalized.includes('edit')) return FileText;
  return Wrench;
}

function humanizeToolName(name: string) {
  return name.replace(/[_-]+/g, ' ').trim() || 'tool';
}

function getToolActionVerb(name: string, status: ToolCall['status']) {
  if (status === 'awaiting_approval') return 'Needs approval';
  if (status === 'error') return 'Failed';
  if (status === 'completed') return 'Complete';

  const normalized = name.toLowerCase();
  if (normalized.includes('search') || normalized.includes('web')) return 'Searching';
  if (normalized.includes('read') || normalized.includes('grep') || normalized.includes('list') || normalized.includes('file')) return 'Reading';
  if (normalized.includes('write') || normalized.includes('edit') || normalized.includes('patch') || normalized.includes('create')) return 'Writing';
  if (normalized.includes('bash') || normalized.includes('shell') || normalized.includes('command') || normalized.includes('test') || normalized.includes('npm') || normalized.includes('cargo')) return 'Running';
  return 'Using tool';
}

function getStatusLabel(status: ToolCall['status']) {
  return {
    running: 'Running',
    awaiting_approval: 'Needs approval',
    completed: 'Complete',
    error: 'Failed',
  }[status];
}

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return null;
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

export function ToolCallCard({ toolCall, className, onViewArtifact, onCancel, onRetry, defaultExpanded }: ToolCallCardProps) {
  const { id, name, status, input, output, durationMs, attempts, startTime, approvalContext, agentName, agentId, parentAgentId, iteration } = toolCall;
  const batchId = toolCall.toolBatchId || toolCall.batchId;
  const ToolIcon = getToolIcon(name);

  const safeInput = useMemo(() => toRecord(input), [input]);
  const outputPreview = useMemo(() => buildToolOutputPreview(output || ''), [output]);
  const checklistPreview = useMemo(() => buildToolChecklistPreview(safeInput), [safeInput]);
  const argPreview = String(
    safeInput.query ||
    safeInput.url ||
    safeInput.command ||
    safeInput.title ||
    safeInput.path ||
    ''
  );
  const outputSummary = outputPreview.summary;
  const compactPreview = useMemo(
    () => buildToolCompactPreview({ name, input: safeInput, outputSummary, status, checklistItems: checklistPreview }),
    [checklistPreview, name, outputSummary, safeInput, status]
  );

  const statusLabel = getStatusLabel(status);
  const toolActionVerb = getToolActionVerb(name, status);
  const actionText = useMemo(() => {
    if (status === 'running' || status === 'awaiting_approval') {
      return argPreview ? `${toolActionVerb} ${argPreview}` : toolActionVerb;
    }
    if (status === 'error') return outputSummary || `${humanizeToolName(name)} failed`;
    return outputSummary || `${humanizeToolName(name)} completed`;
  }, [argPreview, name, outputSummary, status, toolActionVerb]);

  const copyValue = (value: unknown, label: string) => {
    navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    toast.success(`${label} copied`);
  };

  const statusStyle = {
    running: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
    awaiting_approval: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
    completed: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    error: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  }[status];
  const durationLabel = formatDuration(durationMs);
  const childAgentLabel = agentName || agentId;
  const agentLabel = parentAgentId && childAgentLabel && parentAgentId !== childAgentLabel
    ? `${parentAgentId} -> ${childAgentLabel}`
    : childAgentLabel;
  const riskStyle = {
    low: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    medium: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    high: 'border-orange-400/25 bg-orange-400/10 text-orange-200',
    critical: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  }[approvalContext?.riskLevel || ''] || 'border-zinc-600/40 bg-white/[0.025] text-zinc-400';
  const exactCommand = safeInput.command || safeInput.cmd || safeInput.script || safeInput.query || safeInput.path || safeInput.url;
  const exactCommandText = exactCommand === undefined || exactCommand === null ? "" : String(exactCommand);
  const inputDetail = stringifyDetail(input);
  const stdout = outputPreview.stdout || '';
  const stderr = outputPreview.stderr || '';
  const exitCode = outputPreview.exitCode;
  const files = outputPreview.files;
  const artifact = outputPreview.artifact;
  const fallbackOutput = outputPreview.raw;
  const hasStructuredPreview = Boolean(
    outputPreview.results.length > 0 ||
    files.length > 0 ||
    artifact ||
    stdout ||
    stderr ||
    exitCode !== undefined ||
    outputSummary
  );
  const [isExpanded, setIsExpanded] = useState(
    defaultExpanded ?? (status === 'awaiting_approval' || status === 'error')
  );
  const userToggledRef = useRef(false);

  useEffect(() => {
    if (!userToggledRef.current && defaultExpanded) {
      setIsExpanded(true);
    }
  }, [defaultExpanded]);

  return (
    <div className={cn('min-w-0', className)}>
      <button
        type="button"
        onClick={() => {
          userToggledRef.current = true;
          setIsExpanded(!isExpanded);
        }}
        className={cn(
          'group flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-zinc-800/70 bg-white/[0.012] px-2 py-1.5 text-left transition-colors',
          'hover:bg-white/[0.025]'
        )}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-zinc-500">
          {status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {status === 'awaiting_approval' && <Clock className="h-3.5 w-3.5 text-amber-400/80" />}
          {status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />}
          {status === 'error' && <XCircle className="h-3.5 w-3.5 text-rose-400/80" />}
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-2">
          <ToolIcon className="h-3.5 w-3.5 shrink-0 opacity-75" />
          <code className="max-w-[11rem] shrink truncate rounded bg-white/[0.035] px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
            {name}
          </code>
          <span className={cn(
            'min-w-0 flex-1 truncate text-[12px] leading-5 text-zinc-400',
            status === 'running' && 'text-premium-shimmer',
            status === 'error' && 'text-rose-300/90'
          )}>
            {actionText}
          </span>
          {status === 'running' && <ToolTimer startTime={startTime} />}
          {status !== 'running' && durationLabel && <span className="shrink-0 text-[11px] text-zinc-600">{durationLabel}</span>}
          <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase leading-none', statusStyle)}>
            {statusLabel}
          </span>
        </span>

        {status === 'awaiting_approval' && (
          <span className="ml-auto flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancel?.(id); }}
              className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-white/[0.04] hover:text-rose-300"
            >
              Deny
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRetry?.(id); }}
              className="rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-white/[0.04] hover:text-emerald-300"
            >
              Approve
            </button>
          </span>
        )}

        <ChevronRight className={cn(
          'h-3 w-3 shrink-0 text-zinc-500 transition-transform group-hover:text-zinc-300',
          isExpanded && 'rotate-90'
        )} />
      </button>

      {!isExpanded && compactPreview && (
        <div
          className={cn(
            'ml-8 mr-2 -mt-0.5 flex min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-[11px] leading-5',
            compactPreview.tone === 'command' && 'border-blue-400/10 bg-blue-400/[0.035] font-mono text-blue-100/70',
            compactPreview.tone === 'file' && 'border-zinc-700/40 bg-white/[0.018] font-mono text-zinc-400',
            compactPreview.tone === 'search' && 'border-cyan-400/10 bg-cyan-400/[0.03] text-cyan-100/70',
            compactPreview.tone === 'checklist' && 'border-amber-400/10 bg-amber-400/[0.035] text-amber-100/70',
            compactPreview.tone === 'result' && 'border-emerald-400/10 bg-emerald-400/[0.03] text-emerald-100/70',
            compactPreview.tone === 'error' && 'border-rose-400/15 bg-rose-400/[0.035] text-rose-100/80',
            compactPreview.tone === 'default' && 'border-zinc-800/80 bg-white/[0.018] text-zinc-500'
          )}
        >
          <span className="min-w-0 flex-1 truncate">{compactPreview.primary}</span>
          {compactPreview.secondary && (
            <span className="min-w-0 max-w-[40%] shrink truncate text-zinc-500">{compactPreview.secondary}</span>
          )}
        </div>
      )}

      {isExpanded && (
        <div className="ml-2 border-l border-zinc-800/80 py-1 pl-3">
          <div className="mb-1.5 rounded-md bg-white/[0.018] px-2 py-1.5">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Tool</div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] leading-5">
              <ToolIcon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <code className="min-w-0 max-w-full truncate rounded bg-white/[0.035] px-1.5 py-0.5 font-mono text-zinc-300">
                {name}
              </code>
              <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase leading-none', statusStyle)}>
                {statusLabel}
              </span>
              {approvalContext?.riskLevel && (
                <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase leading-none', riskStyle)}>
                  {approvalContext.riskLevel} risk
                </span>
              )}
            </div>
          </div>

          {status === 'awaiting_approval' && approvalContext && (
            <div className="mb-1.5 rounded-md border border-amber-400/10 bg-amber-400/[0.035] px-2 py-1.5">
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-amber-300/80">
                <span>Approval context</span>
                {approvalContext.riskLevel && <span className="rounded bg-black/20 px-1.5 py-0.5">{approvalContext.riskLevel}</span>}
              </div>
              {approvalContext.description && (
                <div className="text-[11px] leading-relaxed text-zinc-400">{approvalContext.description}</div>
              )}
              {approvalContext.argumentsPreview && (
                <pre className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-500">
                  {approvalContext.argumentsPreview}
                </pre>
              )}
              {approvalContext.suggestedPatterns && approvalContext.suggestedPatterns.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {approvalContext.suggestedPatterns.slice(0, 4).map((pattern) => (
                    <span key={pattern} className="min-w-0 max-w-full truncate rounded bg-white/[0.035] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                      {pattern}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {(exactCommandText || inputDetail) && (
            <div className="mb-1.5 rounded-md bg-white/[0.018] px-2 py-1.5">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Input</div>
              {checklistPreview.length > 0 && (
                <div className="mb-1.5 grid gap-1">
                  {checklistPreview.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5 text-[11px] leading-5">
                      {item.completed ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-300/80" />
                      ) : (
                        <Clock className="h-3 w-3 shrink-0 text-blue-300/80" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-zinc-400">{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-400">
                {exactCommandText || inputDetail}
              </pre>
            </div>
          )}
          {(stdout || stderr || exitCode !== undefined || files.length > 0 || outputSummary) && (
            <div className="mb-1.5 grid gap-1.5">
              {(exitCode !== undefined || files.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
                  {exitCode !== undefined && <span>exit {String(exitCode)}</span>}
                  {files.length > 0 && <span>{files.length} file{files.length === 1 ? '' : 's'}</span>}
                </div>
              )}
              {outputPreview.results.length > 0 && (
                <div className="rounded-md bg-white/[0.018] px-2 py-1.5">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Result preview</div>
                  <div className="grid gap-1">
                    {outputPreview.results.map((result, index) => (
                      <div key={`${result.title}-${index}`} className="min-w-0">
                        <div className="truncate text-[11px] font-medium leading-5 text-zinc-300">{result.title}</div>
                        {result.summary && <div className="line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{result.summary}</div>}
                        {result.url && <div className="truncate font-mono text-[10px] text-zinc-600">{result.url}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {files.length > 0 && (
                <div className="rounded-md bg-white/[0.018] px-2 py-1.5">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Files</div>
                  <div className="grid gap-1">
                    {files.map((file) => (
                      <div key={file.path} className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2 text-[11px] leading-5">
                          <span className="shrink-0 text-zinc-600">{file.changeType}</span>
                          <span className="min-w-0 flex-1 truncate font-mono text-zinc-400">{file.path}</span>
                          {(file.linesAdded !== undefined || file.linesRemoved !== undefined) && (
                            <span className="shrink-0 font-mono text-zinc-600">
                              +{file.linesAdded || 0}/-{file.linesRemoved || 0}
                            </span>
                          )}
                        </div>
                        {file.diff && (
                          <pre className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words rounded bg-black/20 px-2 py-1 font-mono text-[10px] leading-relaxed text-zinc-500">
                            {file.diff.slice(0, 1200)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {artifact && (
                <div className="rounded-md bg-white/[0.018] px-2 py-1.5">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Artifact</div>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-5 text-zinc-300">{artifact.title}</span>
                    <span className="shrink-0 rounded bg-white/[0.035] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">{artifact.type}</span>
                    {onViewArtifact && (
                      <button
                        type="button"
                        onClick={() => onViewArtifact(artifact)}
                        className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                      >
                        <ExternalLink className="h-3 w-3" /> Open
                      </button>
                    )}
                  </div>
                </div>
              )}
              {outputSummary && outputPreview.results.length === 0 && files.length === 0 && !artifact && !stdout && !stderr && (
                <div className="rounded-md bg-white/[0.018] px-2 py-1.5">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Result preview</div>
                  <div className="line-clamp-3 text-[11px] leading-relaxed text-zinc-400">{outputSummary}</div>
                </div>
              )}
              {stdout && (
                <div className="rounded-md bg-white/[0.018] px-2 py-1.5">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Stdout</div>
                  <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-500">{stdout}</pre>
                </div>
              )}
              {stderr && (
                <div className="rounded-md bg-rose-950/10 px-2 py-1.5">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-rose-500/70">Stderr</div>
                  <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-rose-300/80">{stderr}</pre>
                </div>
              )}
            </div>
          )}
          {fallbackOutput ? (
            hasStructuredPreview ? (
              <details className="rounded-md bg-white/[0.018] p-2">
                <summary className="cursor-pointer select-none text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400">
                  Raw output
                </summary>
                <pre className="mt-1 max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-500">
                  {fallbackOutput}
                </pre>
              </details>
            ) : (
              <div className="rounded-md bg-white/[0.018] p-2">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Raw output</div>
                <pre className="max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-500">
                  {fallbackOutput}
                </pre>
              </div>
            )
          ) : (
            <div className="rounded-md bg-white/[0.018] px-2 py-1.5 text-[11px] text-zinc-600">
              {status === "running" ? "Waiting for tool output..." : "No output returned."}
            </div>
          )}
          {(status === 'running' || durationLabel || agentLabel || iteration !== undefined || batchId || (attempts && attempts.length > 1)) && (
            <div className="mt-1.5 rounded-md bg-white/[0.018] px-2 py-1.5">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Runtime</div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] leading-5 text-zinc-500">
                {status === 'running' && <ToolTimer startTime={startTime} />}
                {status !== 'running' && durationLabel && <span>{durationLabel}</span>}
                {agentLabel && <span className="min-w-0 max-w-full truncate font-mono">agent {agentLabel}</span>}
                {iteration !== undefined && <span className="font-mono">iter {iteration}</span>}
                {batchId && <span className="min-w-0 max-w-full truncate font-mono">batch {batchId}</span>}
                {attempts && attempts.length > 1 && <span>{attempts.length} attempts</span>}
              </div>
            </div>
          )}
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
