import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Copy, Code2, Globe, Terminal, Cloud, Trophy, Map as MapIcon, History, AlertCircle, CheckCircle2, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils/style';
import { ToolCall } from './types';
import { toast } from 'sonner';

export interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
  onViewArtifact?: (artifact: { type: string; title: string; content: string }) => void;
}

export function ToolCallCard({ toolCall, className, onViewArtifact }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { name, status, input, output, durationMs, retries, attempts } = toolCall;

  // ── Specialized Parsers ───────────────────────────────────────
  const safeName = (name || '').toLowerCase();
  const isSearch = safeName.includes('search');
  const isWeather = safeName.includes('weather');
  const isSports = safeName.includes('sports') || safeName.includes('score');
  const isMap = safeName.includes('map') || safeName.includes('geocode') || safeName.includes('location');
  const isTerminal = safeName.includes('bash') || safeName.includes('exec') || safeName.includes('command');
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
    }
  } else {
    safeInput = safeInputRaw;
  }

  // Auto-expand artifacts or important results when they complete
  useEffect(() => {
    if ((isArtifact || isSports || isMap) && status === 'completed') {
      setIsExpanded(true);
    }
  }, [isArtifact, isSports, isMap, status]);

  const getBadgeText = () => {
    if (status === 'running') return 'executing...';
    if (status === 'error') return 'failed';
    if (durationMs) return `${(durationMs / 1000).toFixed(2)}s`;
    return 'done';
  };

  const getArgText = () => {
    if (isSearch) return safeInput.query || 'searching...';
    if (isWeather) return safeInput.location || 'current area';
    if (isSports) return safeInput.team || safeInput.league || 'fetching scores';
    if (isMap) return safeInput.address || safeInput.query || 'mapping';
    if (isArtifact) return safeInput.title || 'new module';
    if (isTerminal) return (safeInput.command || safeInput.script || '').slice(0, 50);
    
    const keys = Object.keys(safeInput);
    if (keys.length > 0) return String(safeInput[keys[0]]).slice(0, 50);
    return 'executing operation';
  };

  const handleCopy = (e: React.MouseEvent, text: any, label: string) => {
    e.stopPropagation();
    const str = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
    navigator.clipboard.writeText(str);
    toast.success(`Copied ${label} to clipboard`);
  };

  const statusConfig = {
    running: { color: "bg-amber-500", icon: <Settings2 className="w-3 h-3 animate-spin text-amber-500" /> },
    completed: { color: "bg-emerald-500", icon: <CheckCircle2 className="w-3 h-3 text-emerald-500" /> },
    error: { color: "bg-rose-500", icon: <AlertCircle className="w-3 h-3 text-rose-500" /> },
  };

  const config = statusConfig[status] || statusConfig.running;

  return (
    <div className={cn("flex flex-col w-full my-1", className)}>
      {/* ── The Tool Pill ── */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center gap-3 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] transition-all hover:bg-white/[0.06] cursor-pointer",
          isExpanded && "bg-white/[0.06] border-white/[0.12] shadow-lg"
        )}
      >
        <div className="flex items-center gap-2 shrink-0">
          {config.icon}
        </div>

        <span className="font-mono text-[11px] font-bold text-foreground/70 uppercase tracking-tight">
          {name}
        </span>

        <span className="text-white/[0.15] text-[11px]">·</span>

        <span className="font-mono text-[11px] text-white/30 truncate max-w-[200px]">
          {getArgText()}
        </span>

        {retries && retries > 0 && (
          <div className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[9px] font-bold border border-amber-500/20">
            {retries} RETRIES
          </div>
        )}

        <div className={cn(
          "ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all tabular-nums",
          status === 'completed' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : 
          status === 'error' ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : 
          "bg-amber-500/10 text-amber-400 border-amber-500/20"
        )}>
          {getBadgeText()}
        </div>

        <ChevronRight className={cn(
          "w-3 h-3 text-white/20 transition-transform duration-200",
          isExpanded && "rotate-90"
        )} />
      </div>

      {/* ── Expandable Body ── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "circOut" }}
            className="overflow-hidden border-l border-white/[0.06] ml-[11px] pl-4 mt-1"
          >
            <div className="pt-2 pb-4 space-y-3">
              {attempts && attempts.length > 1 && (
                <div className="flex flex-col gap-1 mb-2">
                  <div className="text-[9px] font-bold text-white/20 uppercase tracking-widest flex items-center gap-2">
                    <History size={10} /> Attempt History
                  </div>
                  <div className="flex gap-1">
                    {attempts.map((att, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "w-2 h-2 rounded-full",
                          att.status === 'completed' ? "bg-emerald-500" : att.status === 'error' ? "bg-rose-500" : "bg-amber-500"
                        )} 
                        title={`Attempt ${i+1}: ${att.status}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.02] shadow-inner">
                {isWeather && parsedOutput && <WeatherWidget data={parsedOutput} />}
                {isSports && parsedOutput && <SportsWidget data={parsedOutput} />}
                {isTerminal && <TerminalWidget output={parsedOutput} command={String(safeInput.command || safeInput.script || '')} />}
                {isSearch && parsedOutput?.results && <SearchResults results={parsedOutput.results} />}
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
                    <pre className="text-[12px] font-mono text-white/50 break-words whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-auto custom-scrollbar">
                      {typeof parsedOutput === 'object' ? JSON.stringify(parsedOutput, null, 2) : output}
                    </pre>
                  </div>
                )}
                
                <div className="flex items-center justify-end gap-3 px-3 py-2 bg-white/[0.04] border-t border-white/[0.06]">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Specialized Sub-Components ────────────────────────────────

function SportsWidget({ data }: { data: any }) {
  // Mock fallback if data is weird
  const game = data.game || data;
  return (
    <div className="p-4 flex flex-col gap-4 bg-gradient-to-br from-emerald-500/5 to-transparent">
      <div className="flex items-center justify-between text-[10px] font-bold text-white/30 uppercase tracking-widest">
        <span>{game.league || 'LEAGUE'}</span>
        <span className="text-emerald-500">{game.status || 'LIVE'}</span>
      </div>
      <div className="flex items-center justify-around gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xl">
            {game.homeTeamLogo || '🏠'}
          </div>
          <span className="text-xs font-bold text-white/80">{game.homeTeam || 'HOME'}</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="text-3xl font-black tabular-nums tracking-tighter text-white">
            {game.homeScore ?? 0} <span className="text-white/20 mx-1">-</span> {game.awayScore ?? 0}
          </div>
          <div className="text-[10px] font-mono text-white/40 mt-1">{game.time || 'Q4 12:00'}</div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xl">
            {game.awayTeamLogo || '✈️'}
          </div>
          <span className="text-xs font-bold text-white/80">{game.awayTeam || 'AWAY'}</span>
        </div>
      </div>
    </div>
  );
}

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
    <div className="p-4 flex items-center gap-6 bg-gradient-to-br from-blue-500/5 to-transparent">
      <div className="text-4xl drop-shadow-lg">{data.icon || '☀️'}</div>
      <div className="flex-1">
        <div className="text-2xl font-bold tracking-tight text-white/90 tabular-nums">{data.temp || data.temperature || '--'}°F</div>
        <div className="text-[12px] text-white/40">{data.location} · {data.condition || 'clear'}</div>
      </div>
    </div>
  );
}

function TerminalWidget({ output, command }: { output: any, command: string }) {
  const safeOutput = typeof output === 'object' ? (output || {}) : {};
  return (
    <div className="bg-black/60 font-mono text-[12.5px] leading-relaxed">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/[0.06]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/40" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/40" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
        </div>
        <div className="text-[9px] text-white/30 tracking-[0.2em] uppercase font-bold">TERMINAL v1.0</div>
      </div>
      <div className="p-3 overflow-x-auto custom-scrollbar">
        <div className="flex gap-2">
          <span className="text-emerald-500/50">❯</span>
          <span className="text-blue-400">{command}</span>
        </div>
        <div className={cn(
          "mt-2 whitespace-pre-wrap",
          safeOutput.exitCode === 0 ? "text-slate-300" : "text-rose-400"
        )}>
          {safeOutput.stdout || safeOutput.stderr || safeOutput.result || (safeOutput.exitCode === 0 ? 'Operation successful.' : 'Operation failed.')}
        </div>
      </div>
    </div>
  );
}

function ArtifactPreview({ content, title, onView }: { content: string, title: string, onView: () => void }) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Code2 size={14} />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/50">{title || 'Artifact'}</span>
        </div>
        <button 
          onClick={onView}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500/20 border border-blue-500/20 transition-all shadow-sm shadow-blue-500/10"
        >
          Open Panel
        </button>
      </div>
      <div className="text-[11px] text-white/40 line-clamp-2 font-mono bg-black/40 p-3 rounded-lg border border-white/[0.06] italic">
        {content}
      </div>
    </div>
  );
}
