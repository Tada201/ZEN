import React, { useCallback, useEffect, useState, useRef } from "react";
import { useAppInit } from "@/hooks/useAppInit";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { systemApi } from "@/api/systemApi";
import { IS_TAURI, callCommand } from "@/api/tauriClient";

import { LogEntry, StatusItem } from "./types";
import { generateBootLog, generateStatusItems, statusMap } from "./data";
import { BackgroundVideo } from "./BackgroundVideo";
import { StatusPanel } from "./StatusPanel";
import { LogoProgress } from "./LogoProgress";
import { LogPanel } from "./LogPanel";

export function BootScreen({ onComplete }: { onComplete: () => void }) {
  const bootEnabled = useSettingsStore((s) => s.bootEnabled ?? true);
  const bootDurationMs = useSettingsStore((s) => s.bootDurationMs ?? 2500);
  const durationMs = Math.min(10_000, Math.max(500, bootDurationMs));

  const { isInitialized } = useAppInit();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [backendCriticalDone, setBackendCriticalDone] = useState(IS_TAURI ? false : true);

  // UI States
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [statusItems, setStatusItems] = useState<StatusItem[]>(generateStatusItems());
  const [progress, setProgress] = useState(0);
  const [bootComplete, setBootComplete] = useState(false);
  const [logoVisible, setLogoVisible] = useState(false);
  const [logoSubVisible, setLogoSubVisible] = useState(false);
  const [barVisible, setBarVisible] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [bootPhase, setBootPhase] = useState<'bios' | 'kernel' | 'hardware' | 'services' | 'apps' | 'ready'>('bios');
  
  const [isFadingOut, setIsFadingOut] = useState(false);
  
  const allLogs = useRef(generateBootLog()).current;

  // Real telemetry state
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
    if (!bootEnabled || !IS_TAURI) return;
    callCommand("get_system_metrics").then((met) => setMetrics(met)).catch(() => {});
  }, [bootEnabled]);

  // Poll backend init status
  useEffect(() => {
    if (!bootEnabled || !IS_TAURI) return;
    let mounted = true;
    const poll = async () => {
      try {
        const status = await systemApi.getInitStatus();
        if (!mounted) return;
        if (status.critical_complete) setBackendCriticalDone(true);
      } catch {}
      if (mounted) setTimeout(poll, 150);
    };
    poll();
    return () => { mounted = false; };
  }, [bootEnabled]);

  // Logo reveal
  useEffect(() => {
    if (!bootEnabled) return;
    const t1 = setTimeout(() => setLogoVisible(true), 200);
    const t2 = setTimeout(() => setLogoSubVisible(true), 800);
    const t3 = setTimeout(() => setBarVisible(true), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [bootEnabled]);

  // Boot log progression
  useEffect(() => {
    if (!bootEnabled) return;
    let index = 0;
    const intervalMs = Math.max(10, Math.floor(durationMs / allLogs.length));
    
    const interval = setInterval(() => {
      if (index < allLogs.length) {
        const entry = allLogs[index];
        setLogs(prev => [...prev, entry]);
        setProgress(Math.min(((index + 1) / allLogs.length) * 100, 100));

        if (statusMap[index] !== undefined) {
          setStatusItems(prev => prev.map((item, i) => i === statusMap[index] ? { ...item, status: 'ok' as const } : item));
        }
        if (statusMap[index + 1] !== undefined) {
          setStatusItems(prev => prev.map((item, i) => i === statusMap[index + 1] && item.status === 'pending' ? { ...item, status: 'running' as const } : item));
        }

        if (index < 7) setBootPhase('bios');
        else if (index < 20) setBootPhase('kernel');
        else if (index < 30) setBootPhase('hardware');
        else if (index < 40) setBootPhase('services');
        else setBootPhase('ready');

        index++;
      } else {
        clearInterval(interval);
        setBootComplete(true);
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, [bootEnabled, durationMs, allLogs]);

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

  const getStatusIcon = useCallback((status: StatusItem['status']) => {
    switch (status) {
      case 'ok': return <span className="text-emerald-400">[OK]</span>;
      case 'running': return <span className="text-amber-400">[..]</span>;
      case 'fail': return <span className="text-red-400">[!!]</span>;
      case 'warn': return <span className="text-yellow-400">[WW]</span>;
      default: return <span className="text-zinc-600">[  ]</span>;
    }
  }, []);

  const panelStyle: React.CSSProperties = {
    background: 'rgba(8, 8, 10, 0.95)',
    border: '1px solid rgba(74, 138, 154, 0.35)',
    borderRadius: '8px',
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(10px)',
  };

  if (!bootEnabled) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black overflow-hidden select-none transition-opacity duration-500 ease-in-out ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
    >
      <BackgroundVideo />

      <div className="relative z-10 flex w-full h-full p-5 sm:p-6 md:p-8 lg:p-10 gap-5 sm:gap-6 md:gap-8">
        <StatusPanel
          logoVisible={logoVisible}
          logoSubVisible={logoSubVisible}
          bootPhase={bootPhase}
          statusItems={statusItems}
          logsCount={logs.length}
          totalLogsCount={allLogs.length}
          bootComplete={bootComplete}
          getStatusIcon={getStatusIcon}
          panelStyle={panelStyle}
        />

        <LogoProgress
          logoVisible={logoVisible}
          logoSubVisible={logoSubVisible}
          barVisible={barVisible}
          progress={progress}
          bootComplete={bootComplete}
        />

        <LogPanel
          bootComplete={bootComplete}
          logs={logs}
          metrics={metrics}
          panelStyle={panelStyle}
          logContainerRef={logContainerRef}
        />
      </div>
    </div>
  );
}
