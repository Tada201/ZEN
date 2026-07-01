import React from "react";
import { LogEntry, BootMetrics } from "./types";

interface LogPanelProps {
  bootComplete: boolean;
  backendReady: boolean;
  logs: LogEntry[];
  metrics?: BootMetrics | null;
  panelStyle: React.CSSProperties;
  logContainerRef: React.RefObject<HTMLDivElement | null>;
  reducedMotion?: boolean;
}

export const LogPanel: React.FC<LogPanelProps> = ({
  bootComplete,
  backendReady,
  logs,
  metrics,
  panelStyle,
  logContainerRef,
  reducedMotion = false,
}) => {
  const isActuallyReady = bootComplete && backendReady;

  return (
    <div
      className="h-full flex flex-col overflow-hidden shadow-2xl"
      style={{ ...panelStyle, flex: '1 1 0%', minWidth: 0, maxWidth: 'clamp(240px, 30vw, 420px)' }}
    >
      {/* Header */}
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="uppercase" style={{ fontSize: 'clamp(8px, 0.85vw, 11px)', letterSpacing: '0.15em', color: 'hsl(var(--muted-foreground))' }}>System Boot Log</span>
          <span style={{ fontSize: 'clamp(8px, 0.85vw, 11px)', color: 'hsl(var(--muted-foreground) / 0.45)' }}>|</span>
          <span style={{ fontSize: 'clamp(7px, 0.7vw, 9px)', color: 'hsl(var(--muted-foreground) / 0.65)' }}>kernel 6.8.12-300.fc40.x86_64</span>
        </div>
        <span className="uppercase" style={{
          fontSize: 'clamp(7px, 0.7vw, 9px)', letterSpacing: '0.15em',
          color: isActuallyReady ? 'hsl(var(--success))' : (bootComplete ? 'hsl(var(--warning))' : 'hsl(var(--warning) / 0.8)'),
        }}>
          {isActuallyReady ? '● system ready' : (bootComplete ? '● finalizing...' : '● booting...')}
        </span>
      </div>

      {/* Log content */}
      <div ref={logContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {logs.map((entry, i) => (
          <div key={i} className={`flex ${reducedMotion ? '' : 'boot-log-entry'}`} style={{ fontSize: 'clamp(9px, 0.9vw, 12px)', lineHeight: '1.65' }}>
            <span className="shrink-0 mr-2" style={{ color: 'hsl(var(--muted-foreground) / 0.65)' }}>{entry.timestamp}</span>
            <span className={entry.color || 'text-foreground/80'}>{entry.message}</span>
          </div>
        ))}
        {!bootComplete && logs.length > 0 && (
          <div className="flex mt-0.5" style={{ fontSize: 'clamp(9px, 0.9vw, 12px)', color: 'hsl(var(--success))' }}>
            <span className="shrink-0 mr-2" style={{ color: 'hsl(var(--muted-foreground) / 0.65)' }}>
              {(() => {
                const last = logs[logs.length - 1];
                const match = last?.timestamp?.match(/\[(\d+\.\d+\.\d+)\]/);
                if (!match) return '       ';
                const parts = match[1].split('.');
                const ms = (parseFloat(parts[0]) * 60000 + parseFloat(parts[1]) * 1000 + parseFloat(parts[2]) + 30);
                const m = Math.floor(ms / 60000);
                const s = Math.floor((ms % 60000) / 1000);
                const f = Math.floor(ms % 1000);
                return `[${String(m).padStart(2, '0')}.${String(s).padStart(2, '0')}.${String(f).padStart(3, '0')}]`;
              })()}
            </span>
            <span className={reducedMotion ? '' : 'animate-pulse'}>▌</span>
          </div>
        )}
        {bootComplete && (
          <div className="mt-2" style={{ fontSize: 'clamp(9px, 0.9vw, 12px)', color: 'hsl(var(--success))' }}>
            <span className="mr-2" style={{ color: 'hsl(var(--muted-foreground) / 0.65)' }}>                              </span>
            zenos login: _
          </div>
        )}
      </div>

      {/* Footer status bar */}
      <div className="px-3 sm:px-4 py-1.5 border-t border-border/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 uppercase" style={{ fontSize: 'clamp(6px, 0.65vw, 8px)', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground) / 0.65)' }}>
          <span>uptime: {(logs.length * 0.055).toFixed(1)}s</span>
          <span style={{ color: 'hsl(var(--muted-foreground) / 0.35)' }}>|</span>
          <span>mem: {metrics?.mem_used != null ? (metrics.mem_used / 1024 / 1024 / 1024).toFixed(1) : "--"}G / {metrics?.mem_total != null ? Math.round(metrics.mem_total / 1024 / 1024 / 1024) : "--"}G</span>
          <span style={{ color: 'hsl(var(--muted-foreground) / 0.35)' }}>|</span>
          <span>cpu: {metrics?.cpu_load != null ? metrics.cpu_load.toFixed(1) : "--"}%</span>
        </div>
        <div className="uppercase" style={{ fontSize: 'clamp(6px, 0.65vw, 8px)', letterSpacing: '0.12em', color: 'hsl(var(--muted-foreground) / 0.65)' }}>
          tty1 — 80x24
        </div>
      </div>
    </div>
  );
};
