import { useCallback, useEffect, useState, useRef } from "react";
import { useAppInit } from "@/hooks/useAppInit";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { Progress } from "@/components/ui/progress";
import { systemApi, type InitPhase } from "@/api/systemApi";
import { IS_TAURI } from "@/api/tauriClient";
import { callCommand } from "@/api/tauriClient";
import { Cpu, Activity, Terminal, Shield, Layers, Server } from "lucide-react";

interface BootScreenProps {
  onComplete: () => void;
}

const BOOT_LOG_TEMPLATES = [
  "BIOS: UEFI Firmware v2.8 initialized",
  "BIOS: CPU platform detected (x86_64 topology)",
  "BIOS: Allocating host memory registers...",
  "Boot loader: Loading zenos-kernel-core.img...",
  "Kernel: Booting ZenOS Kernel v0.1.0 (x86_64)...",
  "Kernel: Preemption Model: Voluntary Preemption (Desktop)",
  "x86/fpu: Supporting XSAVE features: AVX-512 enabled",
  "Memory: Mapping physical RAM registers...",
  "Memory: ZenOS virtual mapping layer configured",
  "ACPI: 12 ACPI tables found and verified",
  "PCI: Probing PCI express bus controllers...",
  "PCI: 00:02.0 VGA: Acceleration interface active",
  "usbcore: Registered new interface driver hub",
  "usb: Port 1: Core keyboard interface active",
  "usb: Port 2: Mouse input subsystem connected",
  "igc: Ethernet controller driver initialized",
  "igc: Link is Up - 1Gbps Full Duplex",
  "iwlwifi: Wi-Fi driver loaded (802.11ax/be)",
  "wlp2s0: Associated with local network SSID",
  "snd_hda_intel: HD Audio codec driver online",
  "VFS: Mounted root (sqlite) in memory on device 259:2",
  "systemd[1]: Set hostname to <zenos-workstation>",
  "systemd[1]: Reached target Local File Systems",
  "[ OK ] Started Journal Service (zenos-journald)",
  "[ OK ] Reached target Network online",
  "[ OK ] Started Database Engine (SQLite/LanceDB)",
  "[ OK ] Started Vector Store Service (ChromaDB/Lance)",
  "[ OK ] Started AI Provider Gateway (Tauri Client)",
  "[ OK ] Started Secret Storage Manager (Stronghold)",
  "zenos[1]: Initializing ZenOS system controller...",
  "zenos[1]: Vector store connected (1536-dim embeddings)",
  "zenos[1]: Tool registry loaded (24 canonical tools)",
  "zenos[1]: Security policies applied (sandboxed mode)",
  "zenos[1]: File system watcher active (monitoring workspace)",
  "zenos[1]: System handshake completed successfully",
  "zenos[1]: ─────────────────────────────────────────",
  "zenos[1]: SYSTEM READY",
];

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

  const logEndRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [progress]);

  if (!bootEnabled) return null;

  const memUsagePercent = metrics 
    ? Math.round((metrics.mem_used / metrics.mem_total) * 100) 
    : 0;

  // Stream logs proportional to progress percentage
  const logLimit = Math.max(1, Math.floor((progress / 100) * BOOT_LOG_TEMPLATES.length));
  const activeLogs = BOOT_LOG_TEMPLATES.slice(0, logLimit);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950 text-zinc-100 select-none overflow-hidden p-6 sm:p-8 md:p-10 transition-opacity duration-500 ease-in-out ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Vercel-style Animated CSS Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] animate-[gridPulse_8s_ease-in-out_infinite]" />
      
      {/* Ambient Gradient Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[140px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 left-1/3 w-[350px] h-[350px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* 3-Column Glassmorphic Layout following the Layout structure of the original boot screen but styled to match Zen */}
      <div className="relative z-10 w-full h-full max-w-7xl flex flex-col md:flex-row gap-6">
        
        {/* Left Column: System Hardware & Initialization Steps */}
        <div className="w-full md:w-80 shrink-0 flex flex-col gap-4 p-5 rounded-xl bg-zinc-950/60 backdrop-blur-xl border border-zinc-800/60 shadow-[0_24px_60px_rgba(0,0,0,0.8)] font-mono">
          <div className="flex items-center gap-2.5 border-b border-zinc-800/50 pb-3">
            <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center">
              <span className="text-[10px] font-black text-white">Z</span>
            </div>
            <span className="text-xs font-bold tracking-[0.2em] text-zinc-100">SYSTEM INIT</span>
          </div>

          {/* Hardware Specs Section */}
          <div className="flex flex-col gap-3">
            <div className="text-[10px] text-zinc-500 tracking-wider uppercase font-bold flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span>Core Specifications</span>
            </div>
            <div className="flex flex-col gap-2 bg-zinc-900/30 border border-zinc-800/40 p-3 rounded-lg text-[10px]">
              <div className="flex justify-between">
                <span className="text-zinc-500">Host:</span>
                <span className="text-zinc-300 font-semibold truncate max-w-[140px]">{hardware ? hardware.hostname : "zenos-host"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Platform:</span>
                <span className="text-zinc-300 font-semibold truncate max-w-[140px]">{hardware ? hardware.os.replace("Windows", "Win") : "Tauri OS"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">CPU:</span>
                <span className="text-zinc-300 font-semibold truncate max-w-[140px]">{hardware ? hardware.cpu.replace(/\(R\)|\(TM\)/g, "") : "Probing..."}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">RAM:</span>
                <span className="text-zinc-300 font-semibold">{hardware ? `${hardware.memory_gb.toFixed(1)} GB` : "Allocating..."}</span>
              </div>
            </div>
          </div>

          {/* Initialization Phases Section */}
          <div className="flex flex-col gap-2.5 flex-1 overflow-hidden">
            <div className="text-[10px] text-zinc-500 tracking-wider uppercase font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>Initialization Pipeline</span>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {backendPhases.length === 0 ? (
                <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 animate-pulse" />
                  <span>Synchronizing...</span>
                </div>
              ) : (
                backendPhases.map((phase) => (
                  <div key={phase.id} className="flex items-center justify-between text-[10px] bg-zinc-900/10 border border-zinc-900/30 p-2 rounded-md">
                    <span className="text-zinc-400 font-medium">{phase.label}</span>
                    <span className={`text-[8px] tracking-wider uppercase px-1.5 py-0.5 rounded-sm font-semibold ${
                      phase.status === "done" ? "text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/10" :
                      phase.status === "running" ? "text-purple-400/90 bg-purple-500/5 border border-purple-500/10 animate-pulse" :
                      "text-zinc-600 bg-zinc-900/40"
                    }`}>
                      {phase.status === "done" ? "Ready" : phase.status === "running" ? "Running" : "Pending"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center Column: Logo & Main Progress */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center font-mono">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-[0.4em] ml-[0.4em] text-zinc-100 drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
              <ScrambleText text="ZENOS" />
            </h1>
            <p className="text-[10px] md:text-xs tracking-[0.6em] ml-[0.6em] text-zinc-500 uppercase">
              AI Operating System
            </p>
            <p className="text-[8px] md:text-[9px] tracking-[0.3em] text-zinc-600 uppercase">
              Kernel v0.1.0 · Tauri Framework
            </p>
          </div>

          {/* Main Progress Indicator */}
          <div className="w-full max-w-xs mt-12 space-y-2">
            <div className="flex justify-between text-[9px] text-zinc-500">
              <span>{isInitialized && backendCriticalDone ? "Bootstrap Nominal" : "Executing Kernel Handshake..."}</span>
              <span>{progress}%</span>
            </div>
            <Progress 
              value={progress} 
              className="h-1 bg-zinc-900 overflow-hidden rounded-full" 
              indicatorClassName="bg-gradient-to-r from-purple-500 via-purple-600 to-blue-500 shadow-[0_0_12px_rgba(168,85,247,0.5)] transition-all duration-300" 
            />
          </div>
        </div>

        {/* Right Column: Detailed Verbose Boot Log Stream */}
        <div className="w-full md:w-[420px] shrink-0 flex flex-col gap-3 p-5 rounded-xl bg-zinc-950/60 backdrop-blur-xl border border-zinc-800/60 shadow-[0_24px_60px_rgba(0,0,0,0.8)] font-mono overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-800/50 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-bold tracking-[0.2em] text-zinc-100">SYSTEM BOOT LOG</span>
            </div>
            <span className="text-[8px] text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded font-semibold animate-pulse">
              STREAMING
            </span>
          </div>

          {/* Scrolling Log Stream */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1 text-[9px] leading-relaxed [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {activeLogs.map((log, i) => {
              const isOk = log.startsWith("[ OK ]");
              return (
                <div key={i} className="flex items-start">
                  <span className="text-zinc-600 select-none mr-2">
                    [{(i * 0.045).toFixed(4)}]
                  </span>
                  <span className={
                    isOk ? "text-emerald-400 font-semibold" :
                    log.startsWith("BIOS:") ? "text-zinc-500" :
                    log.startsWith("Kernel:") ? "text-cyan-400" : "text-zinc-300"
                  }>
                    {log}
                  </span>
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>

          {/* Log Stream Footer / Live Metrics */}
          <div className="border-t border-zinc-900 pt-3 flex items-center justify-between text-[8px] text-zinc-500 shrink-0">
            <div className="flex items-center gap-2">
              <Server className="w-3 h-3 text-zinc-600" />
              <span>CPU: {metrics ? `${metrics.cpu_load.toFixed(1)}%` : "0.0%"}</span>
            </div>
            <span>MEM: {metrics ? `${memUsagePercent}%` : "0%"}</span>
            <span>Uptime: {(progress * 0.025).toFixed(1)}s</span>
          </div>
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
