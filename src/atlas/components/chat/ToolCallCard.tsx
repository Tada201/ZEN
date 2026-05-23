import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Copy, Clock, XCircle, RotateCcw, History, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ToolCall, ArtifactData } from './types';

// Import GenUI Components
import { WeatherCard } from '../genui/WeatherCard';
import { SportsCard } from '../genui/SportsCard';
import { RecipeCard } from '../genui/RecipeCard';
import { PremiumCard } from '../genui/PremiumCard';
import { MapComponent } from '../genui/Map';
import { MessageComposer } from '../genui/MessageComposer';

// Import Modular Tool Components
import { ToolTimer } from './tool/ToolTimer';
import { SearchResults, SearchResult } from './tool/SearchResults';
import { TerminalWidget, TerminalOutput } from './tool/TerminalWidget';
import { ArtifactPreview } from './tool/ArtifactPreview';

export interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
  onViewArtifact?: (artifact: ArtifactData) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  chatId?: string;
}

export function ToolCallCard({ toolCall, className, onViewArtifact, onCancel, onRetry, chatId }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { name, status, input, output, durationMs, retries, attempts, startTime } = toolCall;

  // ── Specialized Parsers ───────────────────────────────────────
  const safeName = (name || '').toLowerCase();
  const isSearch = safeName.includes('search');
  const isWeather = safeName.includes('weather') || safeName === 'get_weather';
  const isSports = safeName.includes('sports') || safeName === 'get_sports';
  const isRecipe = safeName.includes('recipe') || safeName === 'get_recipe';
  const isTerminal = safeName.includes('bash') || safeName.includes('exec');
  const isArtifact = safeName.includes('artifact');
  const isMap = safeName.includes('map');
  const isComposer = safeName.includes('composer');

  const getPremiumCardType = (toolName: string): string | null => {
    const n = toolName.toLowerCase();
    if (n.includes('stock') || n.includes('financial')) return 'stock';
    if (n.includes('flight')) return 'flight';
    if (n.includes('package') || n.includes('tracking')) return 'package';
    if (n.includes('product')) return 'product';
    if (n.includes('job')) return 'job';
    if (n.includes('event')) return 'event';
    if (n.includes('movie') || n.includes('show')) return 'movie';
    if (n.includes('book')) return 'book';
    if (n.includes('person') || n.includes('contact')) return 'person';
    if (n.includes('nutrition') || n.includes('food')) return 'nutrition';
    return null;
  };

  const premiumCardType = getPremiumCardType(name);

  let parsedOutput: Record<string, unknown> | string | null = null;
  const safeOutput = output || '';
  try {
    parsedOutput = safeOutput ? JSON.parse(safeOutput) : null;
  } catch (e) {
    parsedOutput = safeOutput;
  }

  let safeInput: Record<string, unknown> = {};
  const safeInputRaw = input || {};
  if (typeof safeInputRaw === 'string') {
    try {
      safeInput = JSON.parse(safeInputRaw || '{}');
    } catch (e) {
      // Partial JSON extraction for streaming
      const rawStr = safeInputRaw as string;
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
    safeInput = safeInputRaw as Record<string, unknown>;
  }

  // Auto-expand artifacts when they start running
  React.useEffect(() => {
    if (isArtifact && status === 'running') {
      setIsExpanded(true);
    }
  }, [isArtifact, status]);

  // ── Summary Text Logic ────────────────────────────────────────
  const getBadgeText = () => {
    if (status === 'running') return isArtifact ? 'Streaming' : 'Running';
    if (status === 'awaiting_approval') return 'Pending Approval';
    if (status === 'error') return 'Error';
    if (isSearch) {
      const results = (parsedOutput as Record<string, unknown>)?.results as unknown[] | undefined;
      return `${results?.length || 0} Results`;
    }
    if (isWeather) return 'Success';
    if (isTerminal) {
      const terminalOut = parsedOutput as TerminalOutput;
      return `Exit Code ${terminalOut?.exitCode ?? 0}`;
    }
    return 'Success';
  };

  const getArgText = () => {
    if (isSearch) return String(safeInput.query || '');
    if (isWeather) return String(safeInput.location || '');
    if (isArtifact) return String(safeInput.title || '');
    if (isTerminal) return String(safeInput.command || safeInput.script || '').slice(0, 50);

    const keys = Object.keys(safeInput);
    if (keys.length > 0) return String(safeInput[keys[0]]).slice(0, 50);
    return '';
  };

  const hasRetries = retries && retries > 0 && !!(attempts && attempts.length > 1);

  const handleCopy = (e: React.MouseEvent, text: string | Record<string, unknown>, label: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    toast.success(`${label} copied`);
  };

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
          {status === 'awaiting_approval' && (
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          )}
          {status === 'running' && (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          )}
          {status === 'completed' && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          )}
          {status === 'error' && (
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
          )}
        </div>

        {/* Tool Name */}
        <span className="font-mono text-[11px] font-semibold text-foreground/80 lowercase tracking-tight">
          {name}
        </span>

        {getArgText() && (
          <>
            <span className="text-white/[0.15] text-[11px]">·</span>
            {/* Tool Argument (Condensed) */}
            <span className="font-mono text-[11px] text-white/30 truncate max-w-[200px]">
              {getArgText()}
            </span>
          </>
        )}

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
          "ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all font-sans",
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
                {isWeather && parsedOutput && typeof parsedOutput === 'object' && (
                  <WeatherCard
                    location={(parsedOutput as any).location}
                    temp={(parsedOutput as any).temp ?? (parsedOutput as any).temperature}
                    condition={(parsedOutput as any).condition}
                    high={(parsedOutput as any).high}
                    low={(parsedOutput as any).low}
                    forecast={(parsedOutput as any).forecast || []}
                  />
                )}
                {isSports && parsedOutput && typeof parsedOutput === 'object' && (
                  <SportsCard
                    league={(parsedOutput as any).league ?? "Sports"}
                    status={(parsedOutput as any).status ?? "Live"}
                    data={(parsedOutput as any).data ?? parsedOutput}
                  />
                )}
                {isRecipe && parsedOutput && typeof parsedOutput === 'object' && (
                  <RecipeCard
                    title={(parsedOutput as any).title}
                    description={(parsedOutput as any).description}
                    ingredients={(parsedOutput as any).ingredients || []}
                    instructions={(parsedOutput as any).instructions || []}
                    servings={(parsedOutput as any).servings ?? 1}
                  />
                )}
                {isMap && parsedOutput && typeof parsedOutput === 'object' && (
                  <div className="p-4 bg-black/25 flex justify-center">
                    <MapComponent
                      latitude={(parsedOutput as any).latitude ?? (parsedOutput as any).lat ?? 0}
                      longitude={(parsedOutput as any).longitude ?? (parsedOutput as any).lng ?? (parsedOutput as any).long ?? 0}
                      zoom={(parsedOutput as any).zoom}
                      label={(parsedOutput as any).label}
                      className="w-full max-w-sm"
                    />
                  </div>
                )}
                {isComposer && parsedOutput && typeof parsedOutput === 'object' && (
                  <div className="p-4 bg-black/25 flex justify-center">
                    <MessageComposer
                      topic={(parsedOutput as any).topic ?? "Draft"}
                      variants={(parsedOutput as any).variants || []}
                    />
                  </div>
                )}
                {isTerminal && (
                  <TerminalWidget output={typeof parsedOutput === 'object' ? parsedOutput as TerminalOutput : null} command={String(safeInput.command || safeInput.script || '')} />
                )}
                {isSearch && parsedOutput && typeof parsedOutput === 'object' && (
                  <SearchResults results={(parsedOutput as Record<string, unknown>).results as SearchResult[]} />
                )}
                {isArtifact && (
                  <ArtifactPreview
                    content={(safeInput.content || (typeof parsedOutput === 'object' ? (parsedOutput as Record<string, unknown>).content : null) || output) as string}
                    title={String(safeInput.title || 'Artifact')}
                    onView={() => onViewArtifact?.({
                      type: 'openui',
                      title: String(safeInput.title || 'Artifact'),
                      content: (safeInput.content || (typeof parsedOutput === 'object' && parsedOutput !== null ? (parsedOutput as Record<string, unknown>).content : null) || output) as string,
                      chatId,
                    })}
                  />
                )}
                {premiumCardType && parsedOutput && typeof parsedOutput === 'object' && (
                  <div className="p-4 flex justify-center bg-black/25">
                    <PremiumCard type={premiumCardType} data={parsedOutput} />
                  </div>
                )}
                {!isWeather && !isSports && !isRecipe && !isTerminal && !isSearch && !isArtifact && !premiumCardType && !isMap && !isComposer && (
                  <div className="p-3 bg-[#0c0c0e]/50 border-t border-white/[0.04]">
                    <div className="bg-[#08080a] p-3 rounded-lg border border-zinc-800/80 max-h-[300px] overflow-y-auto">
                      <pre className="text-[11px] font-mono text-zinc-300 break-words whitespace-pre-wrap leading-relaxed">
                        {typeof parsedOutput === 'object' ? JSON.stringify(parsedOutput, null, 2) : output}
                      </pre>
                    </div>
                  </div>
                )}
                
                {/* Actions Footer */}
                <div className="flex items-center justify-between px-3 py-2 bg-white/[0.04] border-t border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    {/* Execution Time */}
                    {(durationMs !== undefined || startTime) && (
                      <span className="text-[9px] font-mono text-white/20">
                        <Clock className="w-2.5 h-2.5 inline mr-1 text-white/40" />
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
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-sans"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy Input
                    </button>
                    <button 
                      onClick={(e) => handleCopy(e, output, "Raw Output")}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-sans"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy Output
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
