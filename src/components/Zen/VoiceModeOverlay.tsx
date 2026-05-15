import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useUIStore } from '@/lib/stores/useUIStore';
import { useChatStore } from '@/lib/stores/useChatStore';
import { VoiceOscilloscope } from './VoiceOscilloscope';
import { cn } from '@/lib/utils/style';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Radio, Activity, Database, Layers, Shield, ChevronDown, Search, X } from 'lucide-react';

type VoiceState = 'initializing' | 'listening' | 'processing' | 'speaking' | 'idle';

const StatusPill = React.memo(({ state }: { state: string }) => (
  <Badge variant="outline" className="font-mono text-[9px] tracking-widest">
    {state.toUpperCase()}
  </Badge>
));

const DiagnosticPanel = React.memo(({ amplitude, activeModel, micStatus }: any) => (
  <aside className="flex flex-col border border-border bg-card rounded-lg overflow-hidden">
    <div className="h-[34px] flex items-center justify-between px-3 bg-muted border-b border-border">
      <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        <Zap size={14} className="opacity-60" />
        DIAGNOSTICS
      </div>
      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
    </div>
    <div className="p-3 space-y-3">
      <div className="flex flex-col gap-1">
        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">SIGNAL_STRENGTH</label>
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${Math.min(100, amplitude * 250)}%` }} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">MIC_STATUS</label>
        <span className={cn(
          'text-xs font-mono font-bold',
          micStatus === 'live' ? 'text-[hsl(160_84%_39%)]' : 'text-destructive'
        )}>
          {micStatus.toUpperCase()}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">ACTIVE_MODEL</label>
        <span className="text-[10px] font-mono text-muted-foreground truncate">{activeModel || 'NONE'}</span>
      </div>
    </div>
  </aside>
));

const RetrievalPanel = React.memo(({ sources }: { sources: any[] }) => (
  <aside className="flex flex-col border border-border bg-card rounded-lg overflow-hidden">
    <div className="h-[34px] flex items-center justify-between px-3 bg-muted border-b border-border">
      <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">ARCHIVE_RETRIEVAL</span>
    </div>
    <div className="p-3 flex-1 overflow-y-auto scrollbar-thin">
      {sources.length > 0 ? sources.map((s, i) => (
        <div key={i} className="mb-2 p-2 bg-background border border-border rounded-md">
          <div className="text-[8px] text-muted-foreground font-mono mb-1">
            SCORE: {(s.score * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-foreground">{s.chunk?.text?.slice(0, 80)}...</div>
        </div>
      )) : (
        <div className="text-[10px] text-muted-foreground opacity-30 italic text-center py-8">
          No active knowledge context...
        </div>
      )}
    </div>
  </aside>
));

const LogPanel = React.memo(({ lines }: { lines: string[] }) => (
  <aside className="flex flex-col border border-border bg-card rounded-lg overflow-hidden">
    <div className="h-[34px] flex items-center justify-between px-3 bg-muted border-b border-border">
      <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">SYSTEM_LOGS</span>
    </div>
    <div className="p-3 flex-1 overflow-y-auto scrollbar-thin font-mono text-[9px] space-y-1">
      {lines.map((line, i) => (
        <div key={i} className={cn(
          'text-muted-foreground',
          i === lines.length - 1 ? 'text-primary' : ''
        )}>
          {line}
        </div>
      ))}
    </div>
  </aside>
));

const ActionPanel = React.memo(({ toolAction, micStatus }: any) => (
  <aside className="flex flex-col border border-border bg-card rounded-lg overflow-hidden">
    <div className="h-[34px] flex items-center justify-between px-3 bg-muted border-b border-border">
      <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Cognitive_ACTIONS</span>
    </div>
    <div className="p-3 flex flex-col items-center justify-center gap-4">
      {toolAction ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-8 h-8 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
          </div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-primary">{toolAction}</div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center opacity-30">
          <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center">
            <span className="text-[10px]">⚡</span>
          </div>
          <div className="text-[9px] tracking-widest uppercase">Awaiting instruction...</div>
        </div>
      )}
      <div className="w-full px-2">
        <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
          <span>SIGNAL_LOCK</span>
          <span>{micStatus === 'live' ? '88%' : '0%'}</span>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-[hsl(160_84%_39%)] transition-all duration-1000" style={{ width: micStatus === 'live' ? '88%' : '0%' }} />
        </div>
      </div>
    </div>
  </aside>
));

export default function VoiceModeOverlay() {
  const voiceModeOpen = useUIStore(s => s.voiceModeOpen);
  const toggleVoiceMode = useUIStore(s => s.toggleVoiceMode);
  const aiSpeaking = useUIStore(s => s.aiSpeaking);
  const setAiSpeaking = useUIStore(s => s.setAiSpeaking);
  const appUptimeSecs = useUIStore(s => s.appUptimeSecs);
  const sessions = useChatStore(s => s.sessions);

  const [voiceState, setVoiceState] = useState<VoiceState>('initializing');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [micStatus, setMicStatus] = useState<'inactive' | 'live' | 'error'>('inactive');
  const [transcript, setTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [toolAction, setToolAction] = useState<string | null>(null);
  const [amplitude, setAmplitude] = useState(0);

  const amplitudeRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const aiTranscriptDomRef = useRef<HTMLDivElement>(null);
  const fullAiResponseRef = useRef('');
  const isOpenRef = useRef(voiceModeOpen);

  const appendLog = useCallback((msg: string, status: 'OK' | 'ERR' = 'OK') => {
    const ts = new Date().toLocaleTimeString();
    setLogLines(prev => [...prev.slice(-49), `[${ts}] ${status === 'ERR' ? '!! ' : '> '}${msg}`]);
  }, []);

  const retrievalSources = useMemo(() => {
    // Knowledge context would come from a separate message store
    return [];
  }, []);

  useEffect(() => {
    isOpenRef.current = voiceModeOpen;
    if (voiceModeOpen) {
      setLogLines([]);
      setVoiceState('listening');
      setMicStatus('live');
      appendLog('Cognitive link established.');
    }
  }, [voiceModeOpen, appendLog]);

  useEffect(() => {
    if (!voiceModeOpen) return;
    const id = setInterval(() => setAmplitude(amplitudeRef.current), 150);
    return () => clearInterval(id);
  }, [voiceModeOpen]);

  useEffect(() => {
    if (voiceState === 'speaking' || aiSpeaking) {
      // AI response tracking would need a separate messages store
    }
  }, [aiSpeaking, voiceState]);

  if (!voiceModeOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xl flex items-center justify-center p-8">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <header className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-primary/20 border border-primary/30 flex items-center justify-center">
                <span className="text-primary text-xs">⚡</span>
              </div>
              <span className="font-bold tracking-[0.2em] text-[11px] text-muted-foreground">VOICE MODE v2.0</span>
            </div>
            <div className="flex items-center gap-4 text-[9px] font-mono text-muted-foreground">
              <span>MEM: {Math.floor((amplitude * 100))}%</span>
              <span>UPTIME: {Math.floor(appUptimeSecs / 60)}M</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <StatusPill state={voiceState} />
            <Button
              variant="outline"
              size="sm"
              onClick={toggleVoiceMode}
              className="press text-[10px] tracking-widest h-8"
            >
              [ CLOSE ]
            </Button>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-[240px_1fr_200px] gap-4">
          {/* Left Column */}
          <div className="space-y-4">
            <DiagnosticPanel
              amplitude={amplitude}
              activeModel="gemini-2.0-flash"
              micStatus={micStatus}
            />
            <ActionPanel toolAction={toolAction} micStatus={micStatus} />
          </div>

          {/* Center - Visual Display */}
          <div className="flex flex-col gap-4">
            <div className="card flex-1 flex items-center justify-center min-h-[200px]">
              <VoiceOscilloscope
                analyserRef={analyserRef}
                isAiSpeaking={aiSpeaking}
                isActive={voiceModeOpen}
                className="w-full h-full"
              />
            </div>

            {/* Transcript */}
            <div className="card">
              <div className="min-h-[60px] flex items-center justify-center">
                <div ref={aiTranscriptDomRef} className="text-sm font-mono text-foreground text-center" />
                {(transcript || partialTranscript) && (
                  <div className="text-[11px] font-mono text-muted-foreground text-center mt-2">
                    {transcript || partialTranscript}
                  </div>
                )}
                {!aiSpeaking && !transcript && !partialTranscript && (
                  <div className="text-[11px] text-muted-foreground opacity-40 italic tracking-widest">
                    MONITORING VOICE LINK
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <RetrievalPanel sources={retrievalSources} />
            <LogPanel lines={logLines} />
          </div>
        </div>
      </div>
    </div>
  );
}