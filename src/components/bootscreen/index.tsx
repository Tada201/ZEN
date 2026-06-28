import React, { useCallback, useEffect, useState, useRef } from "react";
import { useAppInit } from "@/hooks/useAppInit";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { systemApi } from "@/api/systemApi";
import { IS_TAURI, callCommand } from "@/api/tauriClient";

import { LogEntry, StatusItem } from "./types";
import { generateBootLog, generateStatusItems, BootHardwareInfo } from "./data";
import { BackgroundVideo } from "./BackgroundVideo";
import { StatusPanel } from "./StatusPanel";
import { LogoProgress } from "./LogoProgress";
import { LogPanel } from "./LogPanel";

export function BootScreen({ onComplete }: { onComplete: () => void }) {
  const bootEnabled = useSettingsStore((s) => s.bootEnabled ?? true);
  const bootDurationMs = useSettingsStore((s) => s.bootDurationMs ?? 2500);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion ?? false);
  const durationMs = Math.min(10_000, Math.max(500, bootDurationMs));

  const { isInitialized } = useAppInit();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [backendCriticalDone, setBackendCriticalDone] = useState(IS_TAURI ? false : true);

  // UI States
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [statusItems, setStatusItems] = useState<StatusItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [bootComplete, setBootComplete] = useState(false);
  const [logoVisible, setLogoVisible] = useState(false);
  const [logoSubVisible, setLogoSubVisible] = useState(false);
  const [barVisible, setBarVisible] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [bootPhase, setBootPhase] = useState<"bios" | "kernel" | "hardware" | "services" | "apps" | "ready">("bios");

  const [isFadingOut, setIsFadingOut] = useState(false);

  // Real data state
  const [hardwareInfo, setHardwareInfo] = useState<BootHardwareInfo | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [totalLogsCount, setTotalLogsCount] = useState(0);

  const allLogs = useRef<LogEntry[]>([]);
  const logIndexRef = useRef(0);
  const [visibleStatusCount, setVisibleStatusCount] = useState(0);

  // Generate logs once hardware info is available and reset log index
  useEffect(() => {
    if (hardwareInfo) {
      allLogs.current = generateBootLog(hardwareInfo);
      setTotalLogsCount(allLogs.current.length);
      logIndexRef.current = 0;
      // Only reset visibleStatusCount in Tauri mode; the non-Tauri fallback
      // path seeds it to 4 and we must not overwrite that.
      if (IS_TAURI) {
        setVisibleStatusCount(0);
      }
    }
  }, [hardwareInfo]);

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

  // Fetch real hardware info (Tauri) or seed fallback (browser/dev)
  useEffect(() => {
    if (!bootEnabled) return;
    if (!IS_TAURI) {
      // Non-Tauri fallback: seed data immediately so boot animation progresses
      setHardwareInfo({
        cpu: "Browser Runtime",
        cores: navigator.hardwareConcurrency || 4,
        threads: (navigator.hardwareConcurrency || 4) * 2,
        memory_gb: 16,
        os: navigator.platform || "Web Browser",
        hostname: "zen-web",
        has_cuda: false,
        gpus: [],
        disks: [],
      });
      // Seed fallback status items so the panel isn't blank
      setStatusItems(generateStatusItems([
        { id: "critical.fs", label: "Virtual FS", status: "done" },
        { id: "critical.db", label: "IndexedDB", status: "done" },
        { id: "critical.settings", label: "Settings", status: "done" },
        { id: "critical.finalize", label: "Runtime", status: "done" },
      ]));
      setVisibleStatusCount(4);
      return;
    }
    systemApi.getHardwareInfo()
      .then((info) => {
        setHardwareInfo({
          cpu: info.cpu,
          cores: info.cores,
          threads: info.threads,
          memory_gb: info.memory_gb,
          os: info.os,
          hostname: info.hostname,
          has_cuda: info.has_cuda,
          gpus: info.gpus,
          disks: info.disks,
        });
      })
      .catch(() => {
        // Fallback to minimal info if hardware API fails
        setHardwareInfo({
          cpu: "Unknown CPU",
          cores: 4,
          threads: 8,
          memory_gb: 16,
          os: "Unknown OS",
          hostname: "zenos",
          has_cuda: false,
          gpus: [],
          disks: [],
        });
      });
  }, [bootEnabled]);

  // Fetch telemetry
  useEffect(() => {
    if (!bootEnabled || !IS_TAURI) return;
    callCommand("get_system_metrics").then((met) => setMetrics(met)).catch(() => {});
  }, [bootEnabled]);

  // Poll backend init status for real phases
  useEffect(() => {
    if (!bootEnabled || !IS_TAURI) return;
    let mounted = true;
    const poll = async () => {
      try {
        const status = await systemApi.getInitStatus();
        if (!mounted) return;

        // Update real init phases
        if (status.phases) {
          const newItems = generateStatusItems(status.phases);
          setStatusItems(newItems);
          // Progressively reveal status items based on how many are non-pending
          const activeCount = newItems.filter(i => i.status !== 'pending').length;
          setVisibleStatusCount(prev => Math.max(prev, activeCount));
        }

        if (status.critical_complete) setBackendCriticalDone(true);
      } catch {}
      if (mounted) setTimeout(poll, 200);
    };
    poll();
    return () => { mounted = false; };
  }, [bootEnabled]);

  // Logo reveal — skip delays when reducedMotion is on
  useEffect(() => {
    if (!bootEnabled) return;
    if (reducedMotion) {
      setLogoVisible(true);
      setLogoSubVisible(true);
      setBarVisible(true);
      return;
    }
    const t1 = setTimeout(() => setLogoVisible(true), 200);
    const t2 = setTimeout(() => setLogoSubVisible(true), 800);
    const t3 = setTimeout(() => setBarVisible(true), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [bootEnabled, reducedMotion]);

  // Boot log progression
  useEffect(() => {
    if (!bootEnabled) return;
    const logs = allLogs.current;
    if (logs.length === 0) return;

    const intervalMs = Math.max(10, Math.floor(durationMs / logs.length));

    const interval = setInterval(() => {
      if (logIndexRef.current < logs.length) {
        const entry = logs[logIndexRef.current];
        setLogs((prev) => [...prev, entry]);
        setProgress(Math.min(((logIndexRef.current + 1) / logs.length) * 100, 100));

        const idx = logIndexRef.current;
        if (idx < 7) setBootPhase("bios");
        else if (idx < 20) setBootPhase("kernel");
        else if (idx < 30) setBootPhase("hardware");
        else if (idx < 40) setBootPhase("services");
        else setBootPhase("ready");

        logIndexRef.current++;
      } else {
        clearInterval(interval);
        setBootComplete(true);
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, [bootEnabled, durationMs, hardwareInfo]);

  // Auto-scroll
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Transition out when both visual boot and backend are done
  useEffect(() => {
    if (bootEnabled && bootComplete && minTimeElapsed && isInitialized && backendCriticalDone) {
      setIsFadingOut(true);
      const fadeTimer = setTimeout(onComplete, 600);
      return () => clearTimeout(fadeTimer);
    }
  }, [bootEnabled, bootComplete, minTimeElapsed, isInitialized, onComplete, backendCriticalDone]);

  // Absolute safety timeout (8s max)
  useEffect(() => {
    if (!bootEnabled) return;
    const timeout = setTimeout(() => {
      setMinTimeElapsed(true);
      setBootComplete(true);
      setIsFadingOut(true);
      setTimeout(onComplete, 500);
    }, Math.max(8000, durationMs + 1000));
    return () => clearTimeout(timeout);
  }, [bootEnabled, durationMs, onComplete]);

  const getStatusIcon = useCallback((status: StatusItem["status"]) => {
    switch (status) {
      case "ok": return <span className="text-emerald-400">[OK]</span>;
      case "running": return <span className="text-amber-400">[..]</span>;
      case "fail": return <span className="text-red-400">[!!]</span>;
      case "warn": return <span className="text-yellow-400">[WW]</span>;
      default: return <span className="text-zinc-600">[  ]</span>;
    }
  }, []);

  const panelStyle: React.CSSProperties = {
    background: "rgba(8, 8, 10, 0.95)",
    border: "1px solid rgba(74, 138, 154, 0.35)",
    borderRadius: "8px",
    boxShadow: "0 4px 30px rgba(0, 0, 0, 0.5)",
    backdropFilter: "blur(10px)",
  };

  if (!bootEnabled) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black overflow-hidden select-none ${
        reducedMotion ? "" : "transition-opacity duration-500 ease-in-out"
      } ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ fontFamily: "var(--font-geist-mono), monospace" }}
    >
      <BackgroundVideo />

      <div className="relative z-10 flex w-full h-full p-5 sm:p-6 md:p-8 lg:p-10 gap-5 sm:gap-6 md:gap-8">
        <StatusPanel
          logoVisible={logoVisible}
          logoSubVisible={logoSubVisible}
          bootPhase={bootPhase}
          statusItems={statusItems}
          visibleCount={visibleStatusCount}
          logsCount={logs.length}
          totalLogsCount={totalLogsCount}
          bootComplete={bootComplete}
          getStatusIcon={getStatusIcon}
          panelStyle={panelStyle}
          reducedMotion={reducedMotion}
        />

        <LogoProgress
          logoVisible={logoVisible}
          logoSubVisible={logoSubVisible}
          barVisible={barVisible}
          progress={progress}
          bootComplete={bootComplete}
          hardwareInfo={hardwareInfo}
          reducedMotion={reducedMotion}
        />

        <LogPanel
          bootComplete={bootComplete}
          logs={logs}
          metrics={metrics}
          panelStyle={panelStyle}
          logContainerRef={logContainerRef}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
}
