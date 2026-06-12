import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Clock, Copy, ExternalLink, Loader2, CheckCircle2, XCircle, Search, Terminal, FileText, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ToolCall, ArtifactData } from './types';
import { ToolTimer } from './tool/ToolTimer';
import { buildToolOutputPreview } from './tool/toolOutputPreview';
import { buildToolChecklistPreview } from './tool/toolInputPreview';

export interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
  onViewArtifact?: (artifact: ArtifactData) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  chatId?: string;
  defaultExpanded?: boolean;
  streamingPreview?: string;
}

function toRecord(value: ToolCall['input']): Record<string, unknown> {
  if (!value) return {};
  if (typeof value !== 'string') return value as Record<string, unknown>;
  try {
    return JSON.parse(value);
  } catch {
    return {
      _previewError: 'Tool arguments preview is not valid JSON.',
    };
  }
}

function redactDisplayValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (/(api[_-]?key|authorization|bearer|credential|password|secret|token)/.test(lower)) {
      return '[redacted]';
    }
    return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => redactDisplayValue(item, depth + 1));
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 48)) {
    output[key] = /(api[_-]?key|authorization|bearer|credential|password|secret|token)/i.test(key)
      ? '[redacted]'
      : redactDisplayValue(item, depth + 1);
  }
  return output;
}

function stringifyDetail(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function redactPreviewDetail(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return stringifyDetail(redactDisplayValue(JSON.parse(value)));
    } catch {
      return stringifyDetail(redactDisplayValue(value));
    }
  }
  return stringifyDetail(redactDisplayValue(value));
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

export function ToolCallCard({ toolCall, className, onViewArtifact, onCancel, onRetry, defaultExpanded, streamingPreview }: ToolCallCardProps) {
  const { id, name, status, input, output, durationMs, attempts, startTime, approvalContext, agentName, agentId, parentAgentId, iteration } = toolCall;
  const batchId = toolCall.toolBatchId || toolCall.batchId;
  const ToolIcon = getToolIcon(name);

  const safeInput = useMemo(() => toRecord(input), [input]);
  const displayInput = useMemo(() => redactDisplayValue(safeInput) as Record<string, unknown>, [safeInput]);
  const outputPreview = useMemo(() => buildToolOutputPreview(output || ''), [output]);
  const checklistPreview = useMemo(() => buildToolChecklistPreview(displayInput), [displayInput]);
  const argPreview = String(
    displayInput.query ||
    displayInput.url ||
    displayInput.command ||
    displayInput.title ||
    displayInput.path ||
    displayInput._previewError ||
    ''
  );
  const outputSummary = outputPreview.summary;
  const statusLabel = getStatusLabel(status);
  const toolActionVerb = getToolActionVerb(name, status);
  const actionText = useMemo(() => {
    if (status === 'running' || status === 'awaiting_approval') {
      if (streamingPreview) return `${toolActionVerb} ${streamingPreview}`;
      return argPreview ? `${toolActionVerb} ${argPreview}` : toolActionVerb;
    }
    if (status === 'error') return outputSummary || `${humanizeToolName(name)} failed`;
    return outputSummary || `${humanizeToolName(name)} completed`;
  }, [argPreview, name, outputSummary, status, streamingPreview, toolActionVerb]);

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
  const exactCommand = displayInput.command || displayInput.cmd || displayInput.script || displayInput.query || displayInput.path || displayInput.url || displayInput._previewError;
  const exactCommandText = exactCommand === undefined || exactCommand === null ? "" : String(exactCommand);
  const inputDetail = stringifyDetail(displayInput);
  const approvalArgumentsPreview = useMemo(
    () => redactPreviewDetail(approvalContext?.argumentsPreview),
    [approvalContext?.argumentsPreview]
  );
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
    () => defaultExpanded ?? (status === 'awaiting_approval' || status === 'error')
  );
  const userToggledRef = useRef(false);

  useEffect(() => {
    if (!userToggledRef.current && defaultExpanded !== undefined) {
      setIsExpanded(defaultExpanded);
    }
  }, [defaultExpanded]);

  const handleToggle = () => {
    userToggledRef.current = true;
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={cn('min-w-0', className)}>
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'group flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md border border-white/[0.04] px-2 py-1 text-left transition-all duration-200',
          'hover:border-white/[0.08] hover:bg-white/[0.015]'
        )}
      >
        <span className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center",
          status === 'completed' ? "text-emerald-400/80" : status === 'error' ? "text-rose-400/80" : "text-zinc-400"
        )}>
          {status === 'running' && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />}
          {status === 'awaiting_approval' && <Clock className="h-3.5 w-3.5 text-amber-400/80" />}
          {status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />}
          {status === 'error' && <XCircle className="h-3.5 w-3.5" />}
        </span>

        <span className={cn(
          'min-w-0 flex-1 truncate text-[12px] leading-5',
          status === 'running' ? 'text-premium-shimmer text-zinc-300' : status === 'error' ? 'text-rose-300' : 'text-zinc-400'
        )}>
          {actionText}
        </span>
        {status === 'running' && <ToolTimer startTime={startTime} />}
        {status !== 'running' && durationLabel && <span className="shrink-0 text-[11px] text-zinc-500 tabular-nums">{durationLabel}</span>}

        {status === 'awaiting_approval' && (
          <span className="ml-auto flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancel?.(id); }}
              className="rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-white/[0.04] hover:text-rose-300"
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

      <div className={cn("ml-2 tool-expand-grid", isExpanded && "open")}>
        <div className="tool-expand-inner">
          <div className="border-l border-zinc-800/80 py-1 pl-3">
          <div className="mb-1.5 rounded-md bg-white/[0.018] px-2 py-1.5">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">Tool</div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px] leading-5">
              <ToolIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <code className="min-w-0 max-w-full truncate rounded bg-white/[0.035] px-1.5 py-0.5 font-mono text-zinc-300">
                {name}
              </code>
              <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[11px] uppercase leading-none', statusStyle)}>
                {statusLabel}
              </span>
              {approvalContext?.riskLevel && (
                <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[11px] uppercase leading-none', riskStyle)}>
                  {approvalContext.riskLevel} risk
                </span>
              )}
            </div>
          </div>

          {status === 'awaiting_approval' && approvalContext && (
            <div className="mb-1.5 rounded-md border border-amber-400/10 bg-amber-400/[0.035] px-2 py-1.5">
              <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-300/80">
                <span>Approval context</span>
                {approvalContext.riskLevel && <span className="rounded bg-black/20 px-1.5 py-0.5">{approvalContext.riskLevel}</span>}
              </div>
              {approvalContext.description && (
                <div className="text-[12px] leading-relaxed text-zinc-300">{approvalContext.description}</div>
              )}
              {approvalArgumentsPreview && (
                <pre className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-zinc-400">
                  {approvalArgumentsPreview}
                </pre>
              )}
              {approvalContext.suggestedPatterns && approvalContext.suggestedPatterns.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {approvalContext.suggestedPatterns.slice(0, 4).map((pattern) => (
                    <span key={pattern} className="min-w-0 max-w-full truncate rounded bg-white/[0.035] px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                      {pattern}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {(exactCommandText || inputDetail) && (
            <div className="mb-1.5 rounded-md bg-white/[0.018] px-2 py-1.5">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">Input</div>
              {checklistPreview.length > 0 && (
                <div className="mb-1.5 grid gap-1">
                  {checklistPreview.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5 text-[12px] leading-5">
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
              <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-zinc-300">
                {exactCommandText || inputDetail}
              </pre>
            </div>
          )}
          {(stdout || stderr || exitCode !== undefined || files.length > 0 || outputSummary) && (
            <div className="mb-1.5 grid gap-1.5">
              {(exitCode !== undefined || files.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                  {exitCode !== undefined && <span>exit {String(exitCode)}</span>}
                  {files.length > 0 && <span>{files.length} file{files.length === 1 ? '' : 's'}</span>}
                </div>
              )}
              {outputPreview.results.length > 0 && (
                <div className="rounded-md bg-white/[0.018] px-2 py-1.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">Result preview</div>
                  <div className="grid gap-1">
                    {outputPreview.results.map((result, index) => (
                      <div key={`${result.title}-${index}`} className="min-w-0">
                        <div className="truncate text-[11px] font-medium leading-5 text-zinc-300">{result.title}</div>
                        {result.summary && <div className="line-clamp-2 text-[12px] leading-relaxed text-zinc-400">{result.summary}</div>}
                        {result.url && <div className="truncate font-mono text-[11px] text-zinc-400">{result.url}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {files.length > 0 && (
                <div className="rounded-md bg-white/[0.018] px-2 py-1.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">Files</div>
                  <div className="grid gap-1">
                    {files.map((file) => (
                      <div key={file.path} className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2 text-[12px] leading-5">
                          <span className="shrink-0 text-zinc-400">{file.changeType}</span>
                          <span className="min-w-0 flex-1 truncate font-mono text-zinc-400">{file.path}</span>
                          {(file.linesAdded !== undefined || file.linesRemoved !== undefined) && (
                            <span className="shrink-0 font-mono text-zinc-400">
                              +{file.linesAdded || 0}/-{file.linesRemoved || 0}
                            </span>
                          )}
                        </div>
                        {file.diff && (
                          <pre className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words rounded bg-black/20 px-2 py-1 font-mono text-[11px] leading-relaxed text-zinc-400">
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
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">Artifact</div>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-5 text-zinc-300">{artifact.title}</span>
                    <span className="shrink-0 rounded bg-white/[0.035] px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">{artifact.type}</span>
                    {onViewArtifact && (
                      <button
                        type="button"
                        onClick={() => onViewArtifact(artifact)}
                        className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-300"
                      >
                        <ExternalLink className="h-3 w-3" /> Open
                      </button>
                    )}
                  </div>
                </div>
              )}
              {outputSummary && outputPreview.results.length === 0 && files.length === 0 && !artifact && !stdout && !stderr && (
                <div className="rounded-md bg-white/[0.018] px-2 py-1.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">Result preview</div>
                  <div className="line-clamp-3 text-[12px] leading-relaxed text-zinc-300">{outputSummary}</div>
                </div>
              )}
              {stdout && (
                <div className="rounded-md bg-white/[0.018] px-2 py-1.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">Stdout</div>
                  <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-zinc-400">{stdout}</pre>
                </div>
              )}
              {stderr && (
                <div className="rounded-md bg-rose-950/10 px-2 py-1.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-rose-400">Stderr</div>
                  <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-rose-300">{stderr}</pre>
                </div>
              )}
            </div>
          )}
          {fallbackOutput ? (
            hasStructuredPreview ? (
              <details className="rounded-md bg-white/[0.018] p-2">
                <summary className="cursor-pointer select-none text-[11px] uppercase tracking-wider text-zinc-400 hover:text-zinc-300">
                  Raw output
                </summary>
                <pre className="mt-1 max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-zinc-400">
                  {fallbackOutput}
                </pre>
              </details>
            ) : (
              <div className="rounded-md bg-white/[0.018] p-2">
                <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">Raw output</div>
                <pre className="max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-zinc-400">
                  {fallbackOutput}
                </pre>
              </div>
            )
          ) : (
            <div className={cn(
              "rounded-md bg-white/[0.018] px-2 py-1.5 text-[12px]",
              status === "error" ? "text-rose-300/80" : "text-zinc-400"
            )}>
              {status === "running" ? "Waiting for tool output..." : status === "error" ? "Tool failed — no output returned." : "No output returned."}
            </div>
          )}
          {(status === 'running' || durationLabel || agentLabel || iteration !== undefined || batchId || (attempts && attempts.length > 1)) && (
            <div className="mt-1.5 rounded-md bg-white/[0.018] px-2 py-1.5">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-400">Runtime</div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] leading-5 text-zinc-400">
                {status === 'running' && <ToolTimer startTime={startTime} />}
                {status !== 'running' && durationLabel && <span>{durationLabel}</span>}
                {agentLabel && <span className="min-w-0 max-w-full truncate font-mono">agent {agentLabel}</span>}
                {iteration !== undefined && <span className="font-mono">iter {iteration}</span>}
                {batchId && <span className="min-w-0 max-w-full truncate font-mono">batch {batchId}</span>}
                {attempts && attempts.length > 1 && <span>{attempts.length} attempts</span>}
              </div>
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-400">
            <button
              type="button"
              onClick={() => copyValue(displayInput, 'Input')}
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
        </div>
      </div>
    </div>
  );
}
