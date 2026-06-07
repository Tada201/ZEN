import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Captions, CaptionsOff, Sparkles, Terminal } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { TtftMetricSnapshot } from "@/lib/ttft";
import { VoiceDiagnosticsPanel } from "./VoiceDiagnosticsPanel";
import { VoiceOscilloscope } from "./VoiceOscilloscope";
import { VoiceStage } from "./VoiceStage";
import { VoiceSubtitleBox } from "./VoiceSubtitleBox";
import type { SttServiceStatus } from "./voiceStatus";

export type VoiceState = "initializing" | "listening" | "processing" | "speaking" | "idle";

interface VoiceModePanelProps {
  activeModel: string;
  aiSpeaking: boolean;
  amplitude: number;
  analyserRef: React.RefObject<AnalyserNode | null>;
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
  showDiagnostics: boolean;
  sttEngine: string;
  sttModel?: string;
  sttStatus: SttServiceStatus;
  subtitleSpeaker: "user" | "agent" | "system";
  ttftMetric?: TtftMetricSnapshot | null;
  tokensPerSec: number;
  toolAction: string | null;
  ttsModel?: string;
  userSpeechText: string;
  aiSpeechText: string;
  voiceInputMode: boolean;
  voiceModeOpen: boolean;
  voiceState: VoiceState;
  whisperBackend?: string;
  whisperBackendDetail?: string;
}

const stateColors: Record<VoiceState, string> = {
  initializing: "text-amber-400 bg-amber-400/10 border-amber-500/20",
  listening: "text-purple-400 bg-purple-400/10 border-purple-500/20",
  processing: "text-blue-400 bg-blue-400/10 border-blue-500/20",
  speaking: "text-emerald-400 bg-emerald-400/10 border-emerald-500/20",
  idle: "text-zinc-400 bg-zinc-400/10 border-zinc-500/20",
};

const sttStatusColors: Record<SttServiceStatus, string> = {
  idle: "border-zinc-500/20 bg-zinc-400/10 text-zinc-300",
  starting: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  ready: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  recording: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
  transcribing: "border-blue-400/20 bg-blue-400/10 text-blue-300",
  failed: "border-red-400/20 bg-red-400/10 text-red-300",
};

export function VoiceModePanel({
  activeModel,
  aiSpeaking,
  amplitude,
  analyserRef,
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
  showDiagnostics,
  sttEngine,
  sttModel,
  sttStatus,
  subtitleSpeaker,
  ttftMetric,
  tokensPerSec,
  toolAction,
  ttsModel = "",
  userSpeechText,
  aiSpeechText,
  voiceInputMode,
  voiceModeOpen,
  voiceState,
  whisperBackend = "unknown",
  whisperBackendDetail = "",
}: VoiceModePanelProps) {
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const ttftLabel = ttftMetric?.ttftMs != null ? `${Math.round(ttftMetric.ttftMs)}ms` : "—";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black p-5 text-zinc-100 transition-all duration-300 md:p-8">

      {/* 1. Top Bar — Agent | Speech | TTS | STT | Status */}
      <header className="z-10 flex w-full items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-4 font-mono text-[11px] text-zinc-400">
          {/* Agent Model */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">Agent</span>
            <span className="text-zinc-300">{activeModel || "—"}</span>
          </div>
          <span className="h-3 w-[1px] bg-white/8" />
          {/* Speech Mode */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">Speech</span>
            <span className="text-zinc-300">{voiceInputMode ? "Hold to Talk" : "Voice Activity"}</span>
          </div>
          <span className="h-3 w-[1px] bg-white/8" />
          {/* TTS Model */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">TTS</span>
            <span className="text-zinc-300">{ttsModel || "—"}</span>
          </div>
          <span className="h-3 w-[1px] bg-white/8" />
          {/* Active STT service */}
          <div className="flex items-center gap-1.5" title={`Active speech-to-text service: ${sttModel || sttEngine || "unknown"}`}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">STT Service</span>
            <span className="font-semibold text-white">{sttModel || sttEngine || "—"}</span>
          </div>
          <span className="h-3 w-[1px] bg-white/8" />
          <div className="flex items-center gap-1.5" title={`Speech-to-text service is ${sttStatus}`}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">STT</span>
            <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase", sttStatusColors[sttStatus])}>{sttStatus}</span>
          </div>
          <span className="h-3 w-[1px] bg-white/8" />
          <div className="flex items-center gap-1.5" title={whisperBackendDetail}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">Runtime</span>
            <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase", whisperBackend !== "checking" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300")}>
              {whisperBackend}
            </span>
          </div>
          <span className="h-3 w-[1px] bg-white/8" />
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">TTFT</span>
            <span className="text-zinc-300">{ttftLabel}</span>
          </div>
          <span className="h-3 w-[1px] bg-white/8" />
          {/* Status Badge */}
          <div className={cn("rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest transition-colors duration-200", stateColors[voiceState])}>
            {voiceState}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCaptionsVisible((value) => !value)}
            className="rounded border border-white/5 bg-white/5 p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            title={captionsVisible ? "Hide captions" : "Show captions"}
          >
            {captionsVisible ? <Captions size={12} /> : <CaptionsOff size={12} />}
          </button>
          <button
            type="button"
            onClick={onToggleDiagnostics}
            className="rounded border border-white/5 bg-white/5 p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            title="Diagnostics Console"
          >
            <Terminal size={12} />
          </button>
          <button
            type="button"
            onClick={onRequestClose}
            className="rounded border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-mono text-zinc-300 transition-all hover:border-red-500/30 hover:bg-red-500/20 hover:text-red-400"
            title="Close Overlay"
          >
            DISCONNECT
          </button>
        </div>
      </header>

      {/* 2. Voice Stage */}
      <main className="relative min-h-0 flex-1 py-5">
        {/* Diagnostics overlay in Canvas Zone if toggled */}
        <AnimatePresence>
          {showDiagnostics && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute left-4 top-4 z-30 max-w-sm rounded-xl border border-white/5 bg-zinc-950/90 p-4 backdrop-blur-md shadow-2xl"
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
              className="absolute top-2 z-20 flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-950/30 px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-orange-400 backdrop-blur-sm motion-safe:animate-pulse"
            >
              <Sparkles size={10} />
              <span>AGENT ACTION: {toolAction}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {exitConfirmationOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="absolute inset-0 z-40 flex items-center justify-center rounded-lg border border-white/10 bg-black/70 p-4 backdrop-blur-md"
            >
              <div className="w-full max-w-lg rounded-lg border border-amber-300/20 bg-zinc-950/95 p-5 shadow-2xl">
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-2 text-amber-200">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-100">Exit voice mode?</div>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                      {hasActiveWork
                        ? "Voice mode is still active. You can leave the visual voice room while the main agent keeps working, or stop the full run."
                        : "Voice mode is idle. Leaving will close the voice room and keep the blackboard snapshot for this session."}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={onConfirmLeaveVoice}
                    className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/15"
                  >
                    Leave Voice Mode
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmStopEverything}
                    className="rounded-md border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm font-semibold text-red-100 transition-colors hover:bg-red-400/15"
                  >
                    Stop Everything
                  </button>
                  <button
                    type="button"
                    onClick={onCancelExit}
                    className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08]"
                  >
                    Stay
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <VoiceStage
          activeModel={activeModel}
          aiText={aiSpeechText}
          subtitleSpeaker={subtitleSpeaker}
          toolAction={toolAction}
          userText={userSpeechText}
          voiceState={voiceState}
        />

      </main>

      {/* 3. Voice Dock - CC | Waveform */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 pb-6 pt-2 shrink-0">
        {/* Left: Closed Captions */}
        <div className="min-w-0">
          <AnimatePresence>
            {captionsVisible && (
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

        {/* Compact voice wave */}
        <div className="h-20 w-20 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] p-2">
          <VoiceOscilloscope analyserRef={analyserRef} isAiSpeaking={aiSpeaking} isActive={voiceModeOpen} />
        </div>

        <div aria-hidden="true" />
      </div>

    </div>
  );
}
