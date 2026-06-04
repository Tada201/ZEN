import { AnimatePresence, motion } from "framer-motion";
import { Mic, Sparkles, Terminal, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceDiagnosticsPanel } from "./VoiceDiagnosticsPanel";
import { VoiceOscilloscope } from "./VoiceOscilloscope";
import { VoiceSubtitleBox } from "./VoiceSubtitleBox";

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
  onClose: () => void;
  onToggleDiagnostics: () => void;
  showDiagnostics: boolean;
  sttEngine: string;
  subtitleSpeaker: "user" | "agent" | "system";
  tokensPerSec: number;
  toolAction: string | null;
  userSpeechText: string;
  aiSpeechText: string;
  voiceInputMode: boolean;
  voiceModeOpen: boolean;
  voiceState: VoiceState;
}

const stateColors: Record<VoiceState, string> = {
  initializing: "text-amber-400 bg-amber-400/10 border-amber-500/20",
  listening: "text-purple-400 bg-purple-400/10 border-purple-500/20",
  processing: "text-blue-400 bg-blue-400/10 border-blue-500/20",
  speaking: "text-emerald-400 bg-emerald-400/10 border-emerald-500/20",
  idle: "text-zinc-400 bg-zinc-400/10 border-zinc-500/20",
};

export function VoiceModePanel({
  activeModel,
  aiSpeaking,
  amplitude,
  analyserRef,
  appUptimeSecs,
  logLines,
  memoryUsage,
  micStatus,
  onClose,
  onToggleDiagnostics,
  showDiagnostics,
  sttEngine,
  subtitleSpeaker,
  tokensPerSec,
  toolAction,
  userSpeechText,
  aiSpeechText,
  voiceInputMode,
  voiceModeOpen,
  voiceState,
}: VoiceModePanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-2xl transition-all duration-300">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-purple-500/10 to-cyan-500/10 blur-[80px] motion-safe:animate-pulse" />

      <div className="relative flex w-full max-w-lg flex-col items-center gap-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all duration-300 dark:border-white/5 dark:bg-black/35">
        <header className="z-10 flex w-full items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <Mic className="h-4 w-4 text-[#00FF9F]" />
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-zinc-400">Voice Mode v2.0</span>
          </div>

          <div className="flex items-center gap-3">
            <div className={cn("rounded border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest transition-colors duration-200", stateColors[voiceState])}>
              {voiceState}
            </div>

            <button
              onClick={onToggleDiagnostics}
              className="rounded border border-white/5 bg-white/5 p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              title="Diagnostics Console"
            >
              <Terminal size={13} />
            </button>

            <button
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/5 p-1 text-zinc-400 transition-all hover:border-red-500/30 hover:bg-red-500/20 hover:text-red-400"
              title="Close Overlay"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="z-10 flex w-full items-center justify-between px-2 py-1 font-mono text-[11px] text-zinc-400">
          <span>MODE: {voiceInputMode ? "PUSH-TO-TALK" : "VAD"}</span>
          <span className="max-w-[150px] truncate">SYS: {activeModel || "Zen Core"}</span>
          <span>MEM: {memoryUsage ? `${Number(memoryUsage).toFixed(1)}GB` : "---"}</span>
        </div>

        <div className="relative z-10 my-4 flex h-32 w-full items-center justify-center overflow-visible">
          <div className="bg-radial-gradient pointer-events-none absolute inset-0 from-[#06b6d4]/5 to-transparent blur-md" />
          <VoiceOscilloscope analyserRef={analyserRef} isAiSpeaking={aiSpeaking} isActive={voiceModeOpen} />
        </div>

        <AnimatePresence mode="wait">
          {toolAction && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2 rounded border border-orange-500/20 bg-orange-500/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-orange-400 motion-safe:animate-pulse"
            >
              <Sparkles size={10} />
              <span>AGENT ACTION: {toolAction}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showDiagnostics && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <VoiceDiagnosticsPanel
                appUptimeSecs={appUptimeSecs}
                sttEngine={sttEngine}
                micStatus={micStatus}
                amplitude={amplitude}
                tokensPerSec={tokensPerSec}
                logLines={logLines}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="z-10 flex w-full items-center justify-between border-t border-white/5 pt-4 text-[12px] text-zinc-400">
          <span className="flex items-center gap-1"><Volume2 size={12} /> Master Link Volume</span>
          <span className="font-mono text-zinc-300">80%</span>
        </div>
      </div>

      <VoiceSubtitleBox speaker={subtitleSpeaker} userText={userSpeechText} aiText={aiSpeechText} />
    </div>
  );
}
