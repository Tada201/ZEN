import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Copy, Terminal as TerminalIcon, Globe, Map as MapIcon, Cloud, Trophy, FileText, Code2, Clock, XCircle, RotateCcw, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ToolCall, ArtifactData } from './chat/types';

export interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
  onViewArtifact?: (artifact: ArtifactData) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
}

/**
 * ToolTimer - Real-time elapsed timer for running tools.
 * Shows [MM:SSs] duration since tool started.
 */
function ToolTimer({ startTime, durationMs }: { startTime?: number; durationMs?: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // If we have a completed duration, just show that
    if (durationMs !== undefined) {
      setElapsed(Math.floor(durationMs / 1000));
      return;
    }
    // If we have a start time, run live timer
    if (!startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, durationMs]);

  if (startTime === undefined && durationMs === undefined) return null;

  // If we have durationMs and no startTime, we already set elapsed above
  // If we have startTime, the interval keeps it updated
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="tabular-nums text-white/30 font-mono text-[10px] ml-2">
      [{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}s]
    </span>
  );
}

export function ToolCallCard({ toolCall, className, onViewArtifact, onCancel, onRetry }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { name, status, input, output, durationMs, retries, attempts, startTime } = toolCall;

  // ── Specialized Parsers ───────────────────────────────────────
  const safeName = (name || '').toLowerCase();
  const isSearch = safeName.includes('search');
  const isWeather = safeName.includes('weather');
  const isSports = safeName.includes('sports');
  const isMap = safeName.includes('map') || safeName.includes('places');
  const isTerminal = safeName.includes('bash') || safeName.includes('exec');
  const isArtifact = safeName.includes('artifact');

  let parsedOutput: any = null;
  const safeOutput = output || '';
  try {
    parsedOutput = safeOutput ? JSON.parse(safeOutput) : null;
  } catch (e) {
    parsedOutput = safeOutput;
  }

  let safeInput: any = {};
  const safeInputRaw = input || {};
  if (typeof safeInputRaw === 'string') {
    try {
      safeInput = JSON.parse(safeInputRaw || '{}');
    } catch (e) {
      // Partial JSON extraction for streaming
      const rawStr = safeInputRaw as any;
      if (rawStr.includes('"query":')) {
        const match = /"query":\s*"([^"]*)/.exec(rawStr);
        if (match) safeInput.query = match[1];
      }
      if (rawStr.includes('"title":')) {
        const match = /"title":\s*"([^"]*)/.exec(rawStr);
        if (match) safeInput.title = match[1];
      }
      if (rawStr.includes('"content":')) {
        const match = /"content":\s*"([^]*?)(?:\")?$/.exec(rawStr);
        if (match) {
          safeInput.content = match[1].replace(/\\n/g, '\n').replace(/\\\"/g, '"').replace(/\\\\/g, '\\');
        }
      }
    }
  } else {
    safeInput = safeInputRaw;
  }

  // Auto-expand artifacts when they start running
  React.useEffect(() => {
    if (isArtifact && status === 'running') {
      setIsExpanded(true);
    }
  }, [isArtifact, status]);

  // ── Summary Text Logic ────────────────────────────────────────
  const getBadgeText = () => {
    if (status === 'running') return isArtifact ? 'streaming...' : 'fetching...';
    if (status === 'awaiting_approval') return 'pending';
    if (status === 'error') return 'error';
    if (isSearch) return `${parsedOutput?.results?.length || 0} results`;
    if (isWeather) return '200 OK';
    if (isTerminal) return `exit ${parsedOutput?.exitCode ?? 0}`;
    return 'done';
  };

  const getArgText = () => {
    if (isSearch) return safeInput.query || 'searching...';
    if (isWeather) return safeInput.location || 'current area';
    if (isArtifact) return safeInput.title || 'new module';
    if (isTerminal) return (safeInput.command || safeInput.script || '').slice(0, 50);
    
    const keys = Object.keys(safeInput);
    if (keys.length > 0) return String(safeInput[keys[0]]).slice(0, 50);
    return 'executing operation';
  };

  const hasRetries = retries && retries > 0 && !!(attempts && attempts.length > 1);

  const handleCopy = (e: React.MouseEvent, text: any, label: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    toast.success(`${label} copied`);
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCancel?.(toolCall.id);
  };

  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRetry?.(toolCall.id);
  };

  const dotColor = status === 'completed' ? "bg-emerald-500" 
    : status === 'error' ? "bg-rose-500" 
    : status === 'awaiting_approval' ? "bg-amber-500" 
    : "bg-amber-500";

  return (
    <div className={cn("flex flex-col w-full my-1", className)}>
      {/* ── The Tool Pill (Refined & Compact) ── */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center gap-3 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] transition-all hover:bg-white/[0.06] cursor-pointer",
          isExpanded && "bg-white/[0.06] border-white/[0.12]",
          status === 'awaiting_approval' && "border-amber-500/20 bg-amber-500/[0.04]"
        )}
      >
        {/* Status Dot / Spinner / Awaiting Icon */}
        <div className="flex items-center gap-2 shrink-0">
          {status === 'awaiting_approval' ? (
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          ) : (
            <>
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                dotColor,
                status === 'running' && "animate-premium-pulse-dot"
              )} />
              {status === 'running' && (
                <div className="w-2.5 h-2.5 rounded-full border-[1.5px] border-transparent border-t-amber-500 border-r-amber-500 animate-premium-spin-arc" />
              )}
            </>
          )}
        </div>

        {/* Tool Name */}
        <span className="font-mono text-[11px] font-bold text-foreground/70 uppercase tracking-tight">
          {name}
        </span>

        <span className="text-white/[0.15] text-[11px]">·</span>

        {/* Tool Argument (Condensed) */}
        <span className="font-mono text-[11px] text-white/30 truncate max-w-[200px]">
          {getArgText()}
        </span>

        {/* Retry indicator */}
        {hasRetries && (
          <span className="text-[9px] font-mono text-amber-500/50 ml-0.5">
            ({retries} retr{retries! > 1 ? 'ies' : 'y'})
          </span>
        )}

        {/* Live Timer (running tools only) */}
        {(status === 'running') && (
          <ToolTimer startTime={startTime} />
        )}

        {/* Results Badge */}
        <div className={cn(
          "ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all",
          status === 'completed' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : 
          status === 'error' ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : 
          status === 'awaiting_approval' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : 
          "bg-amber-500/10 text-amber-400 border-amber-500/20"
        )}>
          {getBadgeText()}
        </div>

        {/* Action Buttons for awaiting_approval */}
        {status === 'awaiting_approval' && (
          <div className="flex items-center gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => { e.stopPropagation(); onCancel?.(toolCall.id); }}
              className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition-colors"
              title="Cancel"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRetry?.(toolCall.id); }}
              className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors"
              title="Approve and retry"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Completed timer display */}
        {status === 'completed' && durationMs !== undefined && durationMs > 0 && (
          <span className="tabular-nums text-white/20 font-mono text-[10px]">
            [{Math.floor(durationMs / 1000)}s]
          </span>
        )}

        <ChevronRight className={cn(
          "w-3 h-3 text-white/20 transition-transform duration-200",
          isExpanded && "rotate-90"
        )} />
      </div>

      {/* ── Expandable Body (Maintains Rich Content) ── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "circOut" }}
            className="overflow-hidden border-l border-white/[0.06] ml-[11px] pl-4 mt-1"
          >
            <div className="pt-2 pb-4 space-y-4">
              <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.02]">
                {isWeather && parsedOutput && (
                  <WeatherWidget data={parsedOutput} />
                )}
                {isSports && parsedOutput && (
                  <SportsWidget data={parsedOutput} />
                )}
                {isTerminal && (
                  <TerminalWidget output={parsedOutput} command={String(safeInput.command || safeInput.script || '')} />
                )}
                {isSearch && parsedOutput?.results && (
                  <SearchResults results={parsedOutput.results} />
                )}
                {isArtifact && (
                  <ArtifactPreview 
                    content={safeInput.content || parsedOutput?.content || output} 
                    title={safeInput.title as string || 'Artifact'} 
                    onView={() => onViewArtifact?.({ 
                      type: 'openui', 
                      title: safeInput.title as string || 'Artifact', 
                      content: safeInput.content || parsedOutput?.content || output 
                    })}
                  />
                )}
                {!isWeather && !isSports && !isTerminal && !isSearch && !isArtifact && (
                  <div className="p-3">
                    <pre className="text-[12px] font-mono text-white/50 break-words whitespace-pre-wrap leading-relaxed">
                      {typeof parsedOutput === 'object' ? JSON.stringify(parsedOutput, null, 2) : output}
                    </pre>
                  </div>
                )}
                
                {/* Actions Footer */}
                <div className="flex items-center justify-between px-3 py-2 bg-white/[0.04] border-t border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    {/* Execution Time */}
                    {(durationMs !== undefined || startTime) && (
                      <span className="text-[9px] font-mono text-white/20">
                        <Clock className="w-2.5 h-2.5 inline mr-1" />
                        <ToolTimer startTime={startTime} durationMs={durationMs} />
                      </span>
                    )}
                    {/* Retry count */}
                    {hasRetries && (
                      <span className="text-[9px] font-mono text-amber-500/40">
                        {retries} retr{retries! > 1 ? 'ies' : 'y'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={(e) => handleCopy(e, input, "Input Parameters")}
                      className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors"
                    >
                      <Copy className="w-2.5 h-2.5" /> Input
                    </button>
                    <button 
                      onClick={(e) => handleCopy(e, output, "Raw Output")}
                      className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors"
                    >
                      <Copy className="w-2.5 h-2.5" /> Output
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Execution History (from attempts array) ── */}
              {attempts && attempts.length > 1 && (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowHistory(!showHistory); }}
                    className="flex items-center gap-2 text-[9px] font-mono text-white/30 hover:text-white/60 transition-colors px-1 uppercase tracking-widest w-fit"
                  >
                    <History className="w-2.5 h-2.5" />
                    Execution History ({attempts.length})
                    <ChevronRight className={cn(
                      "w-2 h-2 transition-transform",
                      showHistory && "rotate-90"
                    )} />
                  </button>

                  <AnimatePresence>
                    {showHistory && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="flex flex-col gap-1 overflow-hidden"
                      >
                        {attempts.map((attempt, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 px-2 py-1.5 rounded border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
                          >
                            <div className={cn(
                              "w-1 h-1 rounded-full shrink-0",
                              attempt.status === 'completed' ? "bg-emerald-500" :
                              attempt.status === 'error' ? "bg-rose-500" :
                              "bg-amber-500"
                            )} />
                            <span className="text-[10px] font-mono text-white/40 flex-1 truncate">
                              Attempt {idx + 1}
                              {attempt.error && ` — ${attempt.error.slice(0, 50)}`}
                            </span>
                            {attempt.durationMs !== undefined && (
                              <span className="text-[9px] font-mono text-white/20">
                                [{Math.floor(attempt.durationMs / 1000)}s]
                              </span>
                            )}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Specialized Sub-Components (Maintained but updated styles) ──

function SearchResults({ results }: { results: any[] }) {
  const getHostname = (urlString: string) => {
    try {
      if (!urlString) return 'link';
      return new URL(urlString).hostname;
    } catch (e) {
      return 'link';
    }
  };

  return (
    <div className="divide-y divide-white/[0.04]">
      {results.slice(0, 5).map((res, i) => res && (
        <a 
          key={i} 
          href={res.url || '#'} 
          target="_blank" 
          rel="noreferrer"
          className="flex items-start gap-3 p-3 hover:bg-white/[0.04] transition-colors group/res"
        >
          <div className="text-[11px] font-mono text-white/10 mt-0.5">{i + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white/80 group-hover/res:text-primary transition-colors truncate">
              {res.title || 'Untitled Result'}
            </div>
            <div className="text-[11px] font-mono text-white/20 mt-0.5 truncate italic">
              {getHostname(res.url)}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function WeatherWidget({ data }: { data: any }) {
  return (
    <div className="p-4 flex items-center gap-6">
      <div className="text-4xl">{data.icon || '☀️'}</div>
      <div className="flex-1">
        <div className="text-2xl font-bold tracking-tight text-white/90">{data.temp || data.temperature || '--'}°F</div>
        <div className="text-[12px] text-white/40">{data.location} · {data.condition || 'clear'}</div>
      </div>
    </div>
  );
}

function SportsWidget({ data }: { data: any }) {
  const matchups = data.matchups || [];
  return (
    <div className="divide-y divide-white/[0.04]">
      {matchups.slice(0, 3).map((m: any, i: number) => m && (
        <div key={i} className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            {m.status === 'live' && <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />}
            <div className="text-[13px] text-white/70">
              <span className="font-bold text-white">{m.team1}</span> vs <span>{m.team2}</span>
            </div>
          </div>
          <div className="font-mono text-[13px] tracking-widest text-white/50">{m.score1}–{m.score2}</div>
        </div>
      ))}
    </div>
  );
}

function TerminalWidget({ output, command }: { output: any, command: string }) {
  const safeOutput = typeof output === 'object' ? (output || {}) : {};
  return (
    <div className="bg-black/40 font-mono text-[12.5px] leading-relaxed">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/[0.06]">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-rose-500/30" />
          <div className="w-2 h-2 rounded-full bg-amber-500/30" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/30" />
        </div>
        <div className="text-[10px] text-white/20 tracking-widest uppercase">bash — exit {safeOutput.exitCode ?? 0}</div>
      </div>
      <div className="p-3 overflow-x-auto">
        <div className="flex gap-2">
          <span className="text-white/20">$</span>
          <span className="text-cyan-400/80">{command}</span>
        </div>
        <div className={cn(
          "mt-1.5",
          safeOutput.exitCode === 0 ? "text-white/40" : "text-rose-400/60"
        )}>
          {safeOutput.stdout || safeOutput.stderr || safeOutput.result || 'Done.'}
        </div>
      </div>
    </div>
  );
}

function ArtifactPreview({ content, title, onView }: { content: string, title: string, onView: () => void }) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-blue-500/10 text-blue-500">
            <Code2 className="w-3 h-3" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/40">{title || 'Artifact'}</span>
        </div>
        <button 
          onClick={onView}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500/20 transition-colors"
        >
          View Artifact
        </button>
      </div>
      <div className="text-[12px] text-white/40 line-clamp-3 font-mono bg-white/[0.03] p-2 rounded border border-white/[0.06]">
        {content}
      </div>
    </div>
  );
}
