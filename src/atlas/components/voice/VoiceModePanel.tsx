import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Bot, Captions, CaptionsOff, Sparkles, Terminal } from "lucide-react";
import { useEffect, useRef, useState, memo } from "react";
import { cn } from "@/lib/utils";
import type { TtftMetricSnapshot } from "@/lib/ttft";
import { VoiceDiagnosticsPanel } from "./VoiceDiagnosticsPanel";
import { VoiceOscilloscope } from "./VoiceOscilloscope";
import { VoiceStage } from "./VoiceStage";
import { VoiceSubtitleBox } from "./VoiceSubtitleBox";
import type { SttServiceStatus, TtsServiceStatus } from "./voiceStatus";
import type { VoiceAgentActivity } from "./useVoiceAgentActivity";
import { AppDialog } from '@/components/ui/AppDialog';

export type VoiceState = "initializing" | "listening" | "processing" | "speaking" | "idle";

interface VoiceModePanelProps {
  activeModel: string;
  agentActivity: VoiceAgentActivity;
  aiSpeaking: boolean;
  aiSpeechText: string;
  captionsAvailable: boolean;
  amplitude: number;
  analyserRef: React.RefObject<AnalyserNode | null>;
  playbackEnergy: number;
  appUptimeSecs: number;
  logLines: string[];
  memoryUsage: number;
  micStatus: "inactive" | "live" | "error";
  exitConfirmationOpen: boolean;
  hasActiveWork: boolean;
  onCancelExit: () => void;
  onConfirmLeaveVoice: () => void;
  onConfirmStopEverything: () => void;
  onRequestClose: () => void;
  onToggleDiagnostics: () => void;
  pttHeld: boolean;
  showDiagnostics: boolean;
  sttEngine: string;
  sttModel?: string;
  sttStatus: SttServiceStatus;
  subtitleSpeaker: "user" | "agent" | "system";
  ttftMetric?: TtftMetricSnapshot | null;
  tokensPerSec: number;
  toolAction: string | null;
  ttsModel?: string;
  ttsStatus: TtsServiceStatus;
  userSpeechText: string;
  voiceInputMode: boolean;
  voiceModeOpen: boolean;
  voiceState: VoiceState;
  whisperBackend?: string;
  whisperBackendDetail?: string;
}

const stateColors: Record<VoiceState, string> = {
  initializing: "text-amber-400 bg-amber-400/10 border-amber-500/20",
  listening: "text-primary bg-primary/10 border-primary/20",
  processing: "text-blue-400 bg-blue-400/10 border-blue-500/20",
  speaking: "text-emerald-400 bg-emerald-400/10 border-emerald-500/20",
  idle: "text-muted-foreground bg-muted/10 border-border/20",
};

const sttStatusColors: Record<SttServiceStatus, string> = {
  idle: "border-border/20 bg-muted/10 text-muted-foreground",
  starting: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  ready: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  recording: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
  transcribing: "border-blue-400/20 bg-blue-400/10 text-blue-300",
  failed: "border-red-400/20 bg-red-400/10 text-red-300",
};

const ttsStatusColors: Record<TtsServiceStatus, string> = {
  idle: "border-border/20 bg-muted/10 text-muted-foreground",
  starting: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  ready: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  speaking: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
  failed: "border-red-400/20 bg-red-400/10 text-red-300",
};

export function VoiceModePanelInner({
  activeModel,
  agentActivity,
  aiSpeaking,
  captionsAvailable,
  amplitude,
  analyserRef,
  playbackEnergy,
  appUptimeSecs,
  logLines,
  micStatus,
  exitConfirmationOpen,
  hasActiveWork,
  onCancelExit,
  onConfirmLeaveVoice,
  onConfirmStopEverything,
  onRequestClose,
  onToggleDiagnostics,
  pttHeld,
  showDiagnostics,
  sttEngine,
  sttModel,
  sttStatus,
  subtitleSpeaker,
  ttftMetric,
  tokensPerSec,
  toolAction,
  ttsModel = "",
  ttsStatus,
  userSpeechText,
  aiSpeechText,
  voiceInputMode,
  voiceModeOpen,
  voiceState,
  whisperBackend = "unknown",
  whisperBackendDetail = "",
}: VoiceModePanelProps) {
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!captionsAvailable) setCaptionsVisible(false);
  }, [captionsAvailable]);
  // Full-screen overlay: pull focus in on open so keyboard users land inside,
  // and let Escape leave (onRequestClose guards against closing mid-recording).
  useEffect(() => {
    if (voiceModeOpen) rootRef.current?.focus();
  }, [voiceModeOpen]);
  const ttftLabel = ttftMetric?.ttftMs != null ? `${Math.round(ttftMetric.ttftMs)}ms` : "—";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Voice mode"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onRequestClose();
        }
      }}
      className="fixed inset-x-0 bottom-0 top-[var(--titlebar-height)] z-50 flex flex-col bg-background p-3 text-foreground transition-opacity duration-300 outline-none md:p-4"
    >

      {/* 1. Top Bar — Agent | Speech | TTS | STT | Status */}
      <header className="z-10 flex w-full items-center justify-between gap-3 border-b border-border/5 pb-2">
        <div className="flex items-center gap-2 sm:gap-4 font-mono text-[11px] text-muted-foreground flex-wrap">
          {/* Agent Model */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Agent</span>
            <span className="text-muted-foreground">{activeModel || "—"}</span>
          </div>
          <span className="h-3 w-[1px] bg-card/8 hidden sm:block" />
          {/* Speech Mode */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Speech</span>
            <span className="text-muted-foreground">{voiceInputMode ? "Hold to Talk" : "Voice Activity"}</span>
          </div>
          <span className="h-3 w-[1px] bg-card/8 hidden sm:block" />
          {/* TTS Model */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">TTS</span>
            <span className="text-muted-foreground">{ttsModel || "—"}</span>
          </div>
          <span className="h-3 w-[1px] bg-card/8 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5" title={`Text-to-speech service is ${ttsStatus}`}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">TTS</span>
            <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase", ttsStatusColors[ttsStatus])}>{ttsStatus}</span>
          </div>
          <span className="h-3 w-[1px] bg-card/8 hidden sm:block" />
          {/* Active STT service */}
          <div className="hidden sm:flex items-center gap-1.5" title={`Active speech-to-text service: ${sttModel || sttEngine || "unknown"}`}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">STT Service</span>
            <span className="font-semibold text-primary-foreground">{sttModel || sttEngine || "—"}</span>
          </div>
          <span className="h-3 w-[1px] bg-card/8 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5" title={`Speech-to-text service is ${sttStatus}`}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">STT</span>
            <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase", sttStatusColors[sttStatus])}>{sttStatus}</span>
          </div>
          <span className="h-3 w-[1px] bg-card/8 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5" title={whisperBackendDetail}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Runtime</span>
            <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase", whisperBackend !== "checking" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300")}>
              {whisperBackend}
            </span>
          </div>
          <span className="h-3 w-[1px] bg-card/8 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">TTFT</span>
            <span className="text-muted-foreground">{ttftLabel}</span>
          </div>
          <span className="h-3 w-[1px] bg-card/8" />
          {/* Status Badge */}
          <div className={cn("rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest transition-colors duration-200", stateColors[voiceState])}>
            {voiceState}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!captionsAvailable}
            onClick={() => setCaptionsVisible((value) => !value)}
            className={cn("rounded border p-1.5 transition-colors", captionsAvailable ? "border-border/5 bg-card/5 text-muted-foreground hover:bg-card/10 hover:text-primary-foreground" : "cursor-not-allowed border-border/5 bg-card/[0.02] text-foreground")}
            title={captionsAvailable ? (captionsVisible ? "Hide captions" : "Show captions") : "Captions require Web Speech STT"}
          >
            {captionsVisible ? <Captions size={12} /> : <CaptionsOff size={12} />}
          </button>
          <button
            type="button"
            onClick={onToggleDiagnostics}
            className="rounded border border-border/5 bg-card/5 p-1.5 text-muted-foreground transition-colors hover:bg-card/10 hover:text-primary-foreground"
            title="Diagnostics Console"
          >
            <Terminal size={12} />
          </button>
          <button
            type="button"
            onClick={onRequestClose}
            className="rounded border border-border/15 bg-card/5 px-3 py-1 text-[11px] font-mono text-muted-foreground transition-colors hover:border-red-500/30 hover:bg-red-500/20 hover:text-red-400"
            title="Close Overlay"
          >
            DISCONNECT
          </button>
        </div>
      </header>

      {/* 2. Voice Stage */}
      <main className="relative min-h-0 flex-1 py-1.5">
        {/* Diagnostics overlay in Canvas Zone if toggled */}
        <AnimatePresence>
          {showDiagnostics && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute left-4 top-4 z-30 max-w-sm rounded-xl border border-border/5 bg-background/90 p-4 backdrop-blur-md shadow-2xl"
            >
              <VoiceDiagnosticsPanel
                appUptimeSecs={appUptimeSecs}
                sttEngine={sttEngine}
                micStatus={micStatus}
                amplitude={amplitude}
                tokensPerSec={tokensPerSec}
                logLines={logLines}
                whisperBackend={whisperBackend}
                whisperBackendDetail={whisperBackendDetail}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Tool Action alert in Canvas Zone */}
        <AnimatePresence>
          {toolAction && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute top-2 z-20 flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-950/30 px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-orange-400 backdrop-blur-sm animate-pulse"
            >
              <Sparkles size={10} />
              <span>AGENT ACTION: {toolAction}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AppDialog
          open={exitConfirmationOpen}
          onOpenChange={(open) => { if (!open) onCancelExit(); }}
          title="Exit voice mode?"
          description={hasActiveWork
            ? 'Voice mode is still active. You can leave the visual voice room while the main agent keeps working, or stop the full run.'
            : 'Voice mode is idle. Leaving closes the voice room and keeps the blackboard snapshot for this session.'}
          footer={<><button type="button" onClick={onConfirmLeaveVoice} className="border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-300/15">Leave Voice Mode</button>{hasActiveWork ? <button type="button" onClick={onConfirmStopEverything} className="border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs font-medium text-red-100 hover:bg-red-400/15">Stop Everything</button> : null}<button type="button" onClick={onCancelExit} className="border border-border/10 bg-card/[0.04] px-3 py-2 text-xs font-medium text-foreground hover:bg-card/[0.08]">Stay</button></>}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle size={15} className="text-amber-200" /> Voice activity and board state are preserved unless you stop the full run.</div>
        </AppDialog>

        <VoiceStage voiceState={voiceState} />

      </main>

      {/* 3. Voice Dock - CC | Waveform */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-2 pb-3 pt-1 shrink-0">
        {/* Left: Closed Captions */}
        <div className="min-w-0">
          <AnimatePresence>
            {captionsAvailable && captionsVisible && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
              >
                <VoiceSubtitleBox speaker={subtitleSpeaker} userText={userSpeechText} aiText={aiSpeechText} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <VoiceOscilloscope
          analyserRef={analyserRef}
          isAiSpeaking={aiSpeaking}
          isActive={voiceModeOpen}
          isCapturing={!voiceInputMode || pttHeld}
          voiceInputMode={voiceInputMode}
          amplitude={amplitude}
          playbackEnergy={playbackEnergy}
        />

        <div className="flex items-center justify-start gap-2 font-mono text-[10px]">
          <div
            className={cn(
              "flex h-9 items-center gap-2 rounded-full border px-3 transition-colors",
              agentActivity.displayAgentRunning
                ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                : "border-border/10 bg-card/[0.03] text-muted-foreground"
            )}
            title={agentActivity.displayAgentRunning ? "Voice display agent is rendering the board" : "Voice display agent is idle"}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", agentActivity.displayAgentRunning ? "bg-cyan-300 animate-pulse" : "bg-muted")} />
            <Bot size={13} />
            <span>{agentActivity.displayAgentRunning ? "DISPLAY" : "IDLE"}</span>
          </div>
          {agentActivity.otherAgentCount > 0 && (
            <div className="flex h-9 items-center rounded-full border border-border/25 bg-muted/10 px-3 text-muted-foreground" title={`${agentActivity.otherAgentCount} additional agent${agentActivity.otherAgentCount === 1 ? "" : "s"} running`}>
              +{agentActivity.otherAgentCount} AGENT{agentActivity.otherAgentCount === 1 ? "" : "S"}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
export const VoiceModePanel = memo(VoiceModePanelInner);
