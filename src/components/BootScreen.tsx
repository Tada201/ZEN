import { useCallback, useEffect, useState } from "react";
import { useAppInit } from "@/hooks/useAppInit";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { Progress } from "@/components/ui/progress";
import { systemApi, type InitPhase } from "@/api/systemApi";
import { IS_TAURI } from "@/api/tauriClient";
import { callCommand } from "@/api/tauriClient";
import { Cpu, Database, Activity, CheckCircle, Disc, Terminal, Settings } from "lucide-react";

interface BootScreenProps {
  onComplete: () => void;
}

function ScrambleText({ text, speed = 40 }: { text: string; speed?: number }) {
  const [displayText, setDisplayText] = useState("");
  
  useEffect(() => {
    let iteration = 0;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&+";
    const interval = setInterval(() => {
      setDisplayText(
        text
          .split("")
          .map((char, index) => {
            if (char === " ") return " ";
            if (index < iteration) return text[index];
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join("")
      );
      
      if (iteration >= text.length) clearInterval(interval);
      iteration += 1 / 3;
    }, speed);
    
    return () => clearInterval(interval);
  }, [text, speed]);

  return <span>{displayText}</span>;
}

export function BootScreen({ onComplete }: BootScreenProps) {
  const bootEnabled = useSettingsStore((s) => s.bootEnabled ?? true);
  const bootDurationMs = useSettingsStore((s) => s.bootDurationMs ?? 2500);
  const durationMs = Math.min(10_000, Math.max(500, bootDurationMs));

  const { isInitialized } = useAppInit();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [backendPhases, setBackendPhases] = useState<InitPhase[]>([]);
  const [backendCriticalDone, setBackendCriticalDone] = useState(IS_TAURI ? false : true);
  
  // Real telemetry state
  const [hardware, setHardware] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);

  // Skip boot screen if disabled
  useEffect(() => {
    if (!bootEnabled) {
      onComplete();
    }
  }, [bootEnabled, onComplete]);

  // Handle minimum display time
  useEffect(() => {
    if (!bootEnabled) return;
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [bootEnabled, durationMs]);

  // Fetch telemetry
  useEffect(() => {
    if (!bootEnabled) return;
    if (!IS_TAURI) {
      setHardware({
        cpu: "Intel Core i9-14900K (Mock)",
        cores: 24,
        threads: 32,
        memory_gb: 32.0,
        os: "Windows 11 (Mock)",
        hostname: "zen-desktop-mock",
        has_cuda: true,
      });
      setMetrics({
        cpu_load: 18.4,
        mem_used: 12.8 * 1024 * 1024 * 1024,
        mem_total: 32 * 1024 * 1024 * 1024,
      });
      return;
    }

    callCommand("get_hardware_info")
      .then((info) => setHardware(info))
      .catch(() => {});

    callCommand("get_system_metrics")
      .then((met) => setMetrics(met))
      .catch(() => {});
  }, [bootEnabled]);

  // Poll backend init status (only in Tauri)
  useEffect(() => {
    if (!bootEnabled || !IS_TAURI) return;
    let mounted = true;
    const poll = async () => {
      try {
        const status = await systemApi.getInitStatus();
        if (!mounted) return;
        setBackendPhases(status.phases);
        if (status.critical_complete) {
          setBackendCriticalDone(true);
        }
        if (status.background_complete) return;
      } catch {
        // Backend not ready yet
      }
      if (mounted) setTimeout(poll, 150);
    };
    poll();
    return () => { mounted = false; };
  }, [bootEnabled]);

  // Absolute safety timeout (8s max)
  useEffect(() => {
    if (!bootEnabled) return;
    const timeout = setTimeout(() => {
      setMinTimeElapsed(true);
      setIsFadingOut(true);
      setTimeout(onComplete, 500);
    }, Math.max(8000, durationMs + 1000));
    return () => clearTimeout(timeout);
  }, [bootEnabled, durationMs, onComplete]);

  // Compute progress
  const realProgress = useCallback(() => {
    if (backendPhases.length === 0) return null;
    const total = backendPhases.length;
    const done = backendPhases.filter(
      (p) => p.status === "done" || p.status === "skipped"
    ).length;
    return Math.round((done / total) * 100);
  }, [backendPhases]);

  useEffect(() => {
    if (isFadingOut) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (isInitialized && backendCriticalDone) return 100;
        const rp = realProgress();
        if (rp !== null && rp > prev) return Math.min(rp, 95);
        if (prev < 95) return Math.min(95, prev + 5);
        return prev;
      });
    }, 120);
    return () => clearInterval(interval);
  }, [isInitialized, isFadingOut, realProgress, backendCriticalDone]);

  // Transition out
  useEffect(() => {
    if (bootEnabled && minTimeElapsed && isInitialized && backendCriticalDone) {
      setProgress(100);
      setIsFadingOut(true);
      const fadeTimer = setTimeout(onComplete, 600);
      return () => clearTimeout(fadeTimer);
    }
  }, [bootEnabled, minTimeElapsed, isInitialized, onComplete, backendCriticalDone]);

  if (!bootEnabled) return null;

  const memUsagePercent = metrics 
    ? Math.round((metrics.mem_used / metrics.mem_total) * 100) 
    : 0;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 select-none overflow-hidden transition-opacity duration-500 ease-in-out ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Vercel-style Animated CSS Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] animate-[gridPulse_8s_ease-in-out_infinite]" />
      
      {/* Ambient Gradient Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Glass Container */}
      <div className="relative z-10 w-full max-w-lg mx-4 flex flex-col gap-5 p-6 rounded-xl bg-zinc-950/60 backdrop-blur-xl border border-zinc-800/60 shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
        
        {/* Header (Scrambled Brand Logo & Minimal Version Tag) */}
        <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center shadow-[0_0_12px_rgba(147,51,234,0.4)]">
              <span className="text-[10px] font-black text-white">Z</span>
            </div>
            <h1 className="text-sm font-bold tracking-[0.3em] uppercase text-zinc-100">
              <ScrambleText text="ZENOS" />
            </h1>
          </div>
          <span className="font-mono text-[9px] text-zinc-500 tracking-wider bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-800/40">
            SYSTEM INIT // v0.1.0
          </span>
        </div>

        {/* Space-Efficient Telemetry Board (VSCode Style Dense Grid) */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1 p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/40 font-mono">
            <div className="flex items-center gap-2 text-[9px] text-zinc-500 tracking-wider uppercase font-bold">
              <Cpu className="w-3 h-3 text-purple-400" />
              <span>Processor</span>
            </div>
            <span className="text-[10px] text-zinc-300 truncate font-semibold">
              {hardware ? hardware.cpu.replace(/\(R\)|\(TM\)/g, "") : "Probing core..."}
            </span>
            <span className="text-[8px] text-zinc-500">
              {hardware ? `${hardware.cores} Cores / ${hardware.threads} Threads` : "--"}
            </span>
          </div>

          <div className="flex flex-col gap-1 p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/40 font-mono">
            <div className="flex items-center gap-2 text-[9px] text-zinc-500 tracking-wider uppercase font-bold">
              <Activity className="w-3 h-3 text-blue-400" />
              <span>Memory</span>
            </div>
            <span className="text-[10px] text-zinc-300 font-semibold">
              {hardware ? `${hardware.memory_gb.toFixed(1)} GB RAM` : "Allocating..."}
            </span>
            <span className="text-[8px] text-zinc-500">
              {metrics ? `Utilized: ${memUsagePercent}% (${(metrics.mem_used / 1e9).toFixed(1)} GB)` : "--"}
            </span>
          </div>
        </div>

        {/* System Micro logs (VSCode Panel Resemblance) */}
        <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80 font-mono">
          <div className="flex items-center justify-between text-[9px] text-zinc-500 tracking-wider uppercase font-bold border-b border-zinc-900 pb-1.5 mb-1">
            <div className="flex items-center gap-2">
              <Terminal className="w-3 h-3 text-emerald-400" />
              <span>Initialization Pipeline</span>
            </div>
            <span className="text-zinc-600">Active</span>
          </div>
          
          <div className="flex flex-col gap-1.5 max-h-[72px] overflow-y-auto pr-1">
            {backendPhases.length === 0 ? (
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 animate-pulse" />
                <span>Synchronizing backend kernel logs...</span>
              </div>
            ) : (
              backendPhases.map((phase) => (
                <div key={phase.id} className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className={`w-1 h-1 rounded-full ${
                      phase.status === "done" ? "bg-emerald-400" :
                      phase.status === "running" ? "bg-purple-400 animate-ping" : "bg-zinc-700"
                    }`} />
                    <span>{phase.label}</span>
                  </div>
                  <span className={`text-[8px] tracking-wider uppercase px-1.5 py-0.2 rounded-sm ${
                    phase.status === "done" ? "text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/10" :
                    phase.status === "running" ? "text-purple-400/90 bg-purple-500/5 border border-purple-500/10" :
                    "text-zinc-600 bg-zinc-900/40"
                  }`}>
                    {phase.status === "done" ? "Ready" : phase.status === "running" ? "Init" : "Wait"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Progress & Transition Section */}
        <div className="space-y-2 mt-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span>{isInitialized && backendCriticalDone ? "Pipeline Nominal" : "Executing Kernel Handshake..."}</span>
            <span>{progress}%</span>
          </div>
          
          <Progress 
            value={progress} 
            className="h-1 bg-zinc-900 overflow-hidden" 
            indicatorClassName="bg-gradient-to-r from-purple-500 via-purple-600 to-blue-500 shadow-[0_0_12px_rgba(168,85,247,0.5)] transition-all duration-300" 
          />
        </div>
      </div>

      {/* Global CSS Inject */}
      <style>{`
        @keyframes gridPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
