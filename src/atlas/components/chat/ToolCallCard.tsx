import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Clock, Copy, ExternalLink, Loader2, CheckCircle2, XCircle, Search, Terminal, FileText, Wrench, Brush, Sparkles, ShieldOff, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ToolCall, ArtifactData } from './types';
import { ToolTimer } from './tool/ToolTimer';
import { buildToolOutputPreview } from './tool/toolOutputPreview';
import { buildToolChecklistPreview } from './tool/toolInputPreview';
import { isSafeGeneratedHref } from '@/lib/security/generatedLinks';
import { toAssetUrl } from '@/lib/utils/assetUrl';

function ImageGenPreview({ status, output, input }: { status: ToolCall['status']; output?: string; input: Record<string, unknown> }) {
  const [statusIndex, setStatusIndex] = useState(0);
  
  useEffect(() => {
    if (status !== 'running') return;
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(interval);
  }, [status]);

  const statuses = [
    "Formulating composition...",
    "Sketching layout and contours...",
    "Applying lighting and textures...",
    "Polishing creative details..."
  ];

  // Try to parse the image URI from the output if completed
  const imageUri = useMemo(() => {
    if (status !== 'completed' || !output) return null;
    try {
      const parsed = JSON.parse(output);
      return parsed.image_uri || null;
    } catch {
      return null;
    }
  }, [status, output]);

  if (status === 'running') {
    return (
      <div className="relative w-full max-w-[380px] aspect-square rounded-xl border border-border bg-card/80 overflow-hidden flex flex-col items-center justify-center gap-4 p-6 shadow-2xl backdrop-blur-md animate-pulse">
        {/* Shimmering/rotating background effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-purple-500/5 to-pink-500/10" />
        <div className="absolute w-[150%] h-[150%] -top-[25%] -left-[25%] bg-[radial-gradient(circle_at_center,hsl(var(--primary) / 0.08)_0%,transparent_60%)] animate-spin [animation-duration:15s]" />
        
        {/* Animated pulsating icon */}
        <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-muted/40 border border-border">
          <Brush className="w-6 h-6 text-primary animate-bounce" />
          <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-primary animate-pulse" />
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center z-10">
          <div className="text-[13px] font-semibold text-foreground font-sans tracking-tight">
            {statuses[statusIndex]}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-primary animate-ping" />
            Generating Artwork
          </div>
        </div>
      </div>
    );
  }

  if (status === 'completed' && imageUri) {
    const isSafe = isSafeGeneratedHref(imageUri);
    if (!isSafe) {
      return (
        <div className="relative w-full max-w-[380px] aspect-square rounded-xl border border-rose-500/20 bg-rose-950/10 overflow-hidden flex flex-col items-center justify-center gap-3 p-6 text-center">
          <ShieldOff className="w-10 h-10 text-rose-500/80" />
          <div className="text-[12px] font-semibold text-destructive">Preview Blocked</div>
          <p className="text-[11px] text-muted-foreground max-w-[280px]">
            The generated image link was blocked by security policies.
          </p>
        </div>
      );
    }

    return (
      <div className="relative w-full max-w-[380px] aspect-square rounded-xl border border-border bg-card overflow-hidden group shadow-2xl">
        <img
          src={toAssetUrl(imageUri)}
          alt={String(input.prompt || "Generated Artwork")}
          className="w-full h-full object-cover animate-in fade-in zoom-in-95 duration-700 ease-out"
        />
        {/* Hover overlay with prompt and action */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <p className="text-[11px] text-foreground line-clamp-2 mb-2 font-sans italic">
            "{String(input.prompt || '')}"
          </p>
          <div className="flex items-center gap-2">
            <a
              href={imageUri}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[11px] font-bold text-foreground bg-primary hover:bg-primary px-3 py-1.5 rounded-lg transition-colors shadow-lg"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Fullscreen
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="relative w-full max-w-[380px] aspect-square rounded-xl border border-rose-500/20 bg-rose-950/10 overflow-hidden flex flex-col items-center justify-center gap-3 p-6 text-center">
        <XCircle className="w-10 h-10 text-rose-500/80" />
        <div className="text-[12px] font-semibold text-destructive">Generation Failed</div>
        <p className="text-[11px] text-muted-foreground max-w-[280px]">
          Unable to complete image generation. Check settings or API quota.
        </p>
      </div>
    );
  }

  return null;
}

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

function isWrappedWebSearch(name: string, input: Record<string, unknown>, outputPreview?: { results: unknown[] }) {
  const normalized = name.toLowerCase();
  const innerTool = String(input.tool_id || input.tool || input.name || '').toLowerCase();
  const args = input.arguments && typeof input.arguments === 'object' && !Array.isArray(input.arguments)
    ? input.arguments as Record<string, unknown>
    : {};
  const hasSearchArgs = Boolean(input.query || args.query || input.url || args.url);
  return (
    normalized.includes('search') ||
    normalized.includes('web') ||
    innerTool.includes('search') ||
    innerTool.includes('web') ||
    (normalized === 'tool_exec' && (hasSearchArgs || Boolean(outputPreview?.results.length)))
  );
}

function displayToolName(name: string, input: Record<string, unknown>, outputPreview?: { results: unknown[] }) {
  return isWrappedWebSearch(name, input, outputPreview) ? 'Web search' : humanizeToolName(name);
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

function safeExternalUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function ToolCallCard({ toolCall, className, onViewArtifact, onCancel, onRetry, defaultExpanded, streamingPreview }: ToolCallCardProps) {
  const { id, name, status, input, output, durationMs, attempts, startTime, approvalContext, agentName, agentId, parentAgentId, iteration } = toolCall;
  const batchId = toolCall.toolBatchId || toolCall.batchId;

  const safeInput = useMemo(() => toRecord(input), [input]);
  const displayInput = useMemo(() => redactDisplayValue(safeInput) as Record<string, unknown>, [safeInput]);
  const outputPreview = useMemo(() => buildToolOutputPreview(output || ''), [output]);
  const effectiveName = displayToolName(name, displayInput, outputPreview);
  const isWebSearch = effectiveName === 'Web search';
  const ToolIcon = getToolIcon(effectiveName);
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
    if (status === 'error') return outputSummary || `${effectiveName} failed`;
    if (isWebSearch && outputSummary) return `Web search — ${outputSummary}`;
    return outputSummary || `${effectiveName} completed`;
  }, [argPreview, effectiveName, isWebSearch, outputSummary, status, streamingPreview, toolActionVerb]);

  const copyValue = (value: unknown, label: string) => {
    navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    toast.success(`${label} copied`);
  };

  const statusStyle = {
    running: 'border-blue-400/20 bg-blue-400/10 text-primary',
    awaiting_approval: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
    completed: 'border-emerald-400/20 bg-success/10 text-success',
    error: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  }[status];
  const durationLabel = formatDuration(durationMs);
  const childAgentLabel = agentName || agentId;
  const agentLabel = parentAgentId && childAgentLabel && parentAgentId !== childAgentLabel
    ? `${parentAgentId} -> ${childAgentLabel}`
    : childAgentLabel;
  const riskStyle = {
    low: 'border-emerald-400/20 bg-success/10 text-success',
    medium: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    high: 'border-orange-400/25 bg-orange-400/10 text-orange-200',
    critical: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  }[approvalContext?.riskLevel || ''] || 'border-border/50 bg-background/45 text-foreground';
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

  const isImageGen = name === 'generate_image';
  const imageGenUri = isImageGen ? outputPreview.imageUri : undefined;

  return (
    <div className={cn('min-w-0', className)}>
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'group flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1 text-left backdrop-blur-sm transition-all duration-200',
          'hover:border-border hover:bg-background/50',
          status === 'running' && 'animate-border-pulse'
        )}
      >
        <span className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center",
          status === 'completed' ? "text-success/80" : status === 'error' ? "text-destructive/80" : "text-muted-foreground"
        )}>
          {status === 'running' && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />}
          {status === 'awaiting_approval' && <Clock className="h-3.5 w-3.5 text-warning/80" />}
          {status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />}
          {status === 'error' && <XCircle className="h-3.5 w-3.5" />}
        </span>

        <span className={cn(
          'min-w-0 flex-1 truncate text-[12px] leading-5',
          status === 'running' ? 'animate-text-shimmer font-semibold' : status === 'error' ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {actionText}
        </span>
        {imageGenUri && status === 'completed' && (
          <img
            src={toAssetUrl(imageGenUri)}
            alt=""
            className="h-5 w-5 shrink-0 rounded-sm object-cover border border-border"
          />
        )}
        {isImageGen && status === 'running' && !imageGenUri && (
          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-primary animate-pulse" />
        )}
        {status === 'running' && <ToolTimer startTime={startTime} />}
        {status !== 'running' && durationLabel && <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{durationLabel}</span>}

        {status === 'awaiting_approval' && (
          <span className="ml-auto flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancel?.(id); }}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-destructive"
            >
              Deny
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRetry?.(id); }}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-success"
            >
              Approve
            </button>
          </span>
        )}

        <ChevronRight className={cn(
          'h-3 w-3 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground',
          isExpanded && 'rotate-90'
        )} />
      </button>



      <div className={cn("ml-2 tool-expand-grid", isExpanded && "open")}>
        <div className="tool-expand-inner">
          <div className="border-l border-border/80 py-1 pl-3">
          <div className="mb-1.5 rounded-md bg-muted/20 px-2 py-1.5">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Tool</div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px] leading-5">
              <ToolIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <code className="min-w-0 max-w-full truncate rounded bg-muted/40 px-1.5 py-0.5 font-mono text-foreground">
                {effectiveName}
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

          {isImageGen && (
            <ImageGenPreview status={status} output={output} input={safeInput} />
          )}

          {status === 'awaiting_approval' && approvalContext && (
            <div className="mb-1.5 rounded-md border border-amber-400/10 bg-amber-400/[0.035] px-2 py-1.5">
              <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-warning/80">
                <span>Approval context</span>
                {approvalContext.riskLevel && <span className="rounded bg-background/20 px-1.5 py-0.5">{approvalContext.riskLevel}</span>}
              </div>
              {approvalContext.description && (
                <div className="text-[12px] leading-relaxed text-foreground">{approvalContext.description}</div>
              )}
              {approvalArgumentsPreview && (
                <pre className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-muted-foreground">
                  {approvalArgumentsPreview}
                </pre>
              )}
              {approvalContext.suggestedPatterns && approvalContext.suggestedPatterns.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {approvalContext.suggestedPatterns.slice(0, 4).map((pattern) => (
                    <span key={pattern} className="min-w-0 max-w-full truncate rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {pattern}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {(exactCommandText || inputDetail) && (
            <div className="mb-1.5 rounded-md bg-muted/20 px-2 py-1.5">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Input</div>
              {checklistPreview.length > 0 && (
                <div className="mb-1.5 grid gap-1">
                  {checklistPreview.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5 text-[12px] leading-5">
                      {item.completed ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-success/80" />
                      ) : (
                        <Clock className="h-3 w-3 shrink-0 text-primary/80" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-foreground">
                {exactCommandText || inputDetail}
              </pre>
            </div>
          )}
          {(stdout || stderr || exitCode !== undefined || files.length > 0 || outputSummary) && (
            <div className="mb-1.5 grid gap-1.5">
              {(exitCode !== undefined || files.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {exitCode !== undefined && <span>exit {String(exitCode)}</span>}
                  {files.length > 0 && <span>{files.length} file{files.length === 1 ? '' : 's'}</span>}
                </div>
              )}
              {outputPreview.results.length > 0 && (
                <div className="rounded-md bg-muted/20 px-2 py-1.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Result preview</div>
                  <div className="grid gap-1">
                    {outputPreview.results.map((result, index) => (
                      <div key={`${result.title}-${index}`} className="min-w-0">
                        <div className="truncate text-[11px] font-medium leading-5 text-foreground">{result.title}</div>
                        {result.summary && <div className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{result.summary}</div>}
                        {result.url && safeExternalUrl(result.url) && (
                          <a
                            href={safeExternalUrl(result.url) || undefined}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] text-primary/80 hover:text-primary"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{result.url}</span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {files.length > 0 && (
                <div className="rounded-md bg-muted/20 px-2 py-1.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Files</div>
                  <div className="grid gap-1">
                    {files.map((file) => (
                      <div key={file.path} className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2 text-[12px] leading-5">
                          <span className="shrink-0 text-muted-foreground">{file.changeType}</span>
                          <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{file.path}</span>
                          {(file.linesAdded !== undefined || file.linesRemoved !== undefined) && (
                            <span className="shrink-0 font-mono text-muted-foreground">
                              +{file.linesAdded || 0}/-{file.linesRemoved || 0}
                            </span>
                          )}
                        </div>
                        {file.diff && (
                          <pre className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words rounded bg-background/20 px-2 py-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
                            {file.diff.slice(0, 1200)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {artifact && (
                <div className="rounded-md bg-muted/20 px-2 py-1.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Artifact</div>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-5 text-foreground">{artifact.title}</span>
                    <span className="shrink-0 rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{artifact.type}</span>
                    {onViewArtifact && (
                      <button
                        type="button"
                        onClick={() => onViewArtifact(artifact)}
                        className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" /> Open
                      </button>
                    )}
                  </div>
                </div>
              )}
              {outputSummary && outputPreview.results.length === 0 && files.length === 0 && !artifact && !stdout && !stderr && (
                <div className="rounded-md bg-muted/20 px-2 py-1.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Result preview</div>
                  <div className="line-clamp-3 text-[12px] leading-relaxed text-foreground">{outputSummary}</div>
                </div>
              )}
              {stdout && (
                <div className="rounded-md bg-muted/20 px-2 py-1.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Stdout</div>
                  <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-muted-foreground">{stdout}</pre>
                </div>
              )}
              {stderr && (
                <div className="rounded-md bg-rose-950/10 px-2 py-1.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-destructive">Stderr</div>
                  <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-destructive">{stderr}</pre>
                </div>
              )}
            </div>
          )}
          {fallbackOutput ? (
            hasStructuredPreview ? (
              <details className="rounded-md bg-muted/20 p-2">
                <summary className="cursor-pointer select-none text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  Raw output
                </summary>
                <pre className="mt-1 max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-muted-foreground">
                  {fallbackOutput}
                </pre>
              </details>
            ) : (
              <div className="rounded-md bg-muted/20 p-2">
                <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Raw output</div>
                <pre className="max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-muted-foreground">
                  {fallbackOutput}
                </pre>
              </div>
            )
          ) : (
            <div className={cn(
              "rounded-md bg-muted/20 px-2 py-1.5 text-[12px]",
              status === "error" ? "text-destructive/80" : "text-muted-foreground"
            )}>
              {status === "running" ? "Waiting for tool output..." : status === "error" ? "Tool failed — no output returned." : "No output returned."}
            </div>
          )}
          {(status === 'running' || durationLabel || agentLabel || iteration !== undefined || batchId || (attempts && attempts.length > 1)) && (
            <div className="mt-1.5 rounded-md bg-muted/20 px-2 py-1.5">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Runtime</div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] leading-5 text-muted-foreground">
                {status === 'running' && <ToolTimer startTime={startTime} />}
                {status !== 'running' && durationLabel && <span>{durationLabel}</span>}
                {agentLabel && <span className="min-w-0 max-w-full truncate font-mono">agent {agentLabel}</span>}
                {iteration !== undefined && <span className="font-mono">iter {iteration}</span>}
                {batchId && <span className="min-w-0 max-w-full truncate font-mono">batch {batchId}</span>}
                {attempts && attempts.length > 1 && <span>{attempts.length} attempts</span>}
              </div>
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={() => copyValue(displayInput, 'Input')}
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Copy className="h-3 w-3" /> Input
            </button>
            <button
              type="button"
              onClick={() => copyValue(output, 'Output')}
              className="flex items-center gap-1 hover:text-foreground"
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
