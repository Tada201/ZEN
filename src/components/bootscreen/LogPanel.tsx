import React from "react";
import { LogEntry } from "./types";

interface LogPanelProps {
  bootComplete: boolean;
  logs: LogEntry[];
  metrics: any;
  panelStyle: React.CSSProperties;
  logContainerRef: React.RefObject<HTMLDivElement | null>;
}

export const LogPanel: React.FC<LogPanelProps> = ({
  bootComplete,
  logs,
  metrics,
  panelStyle,
  logContainerRef,
}) => {
  return (
    <div
      className="h-full flex flex-col overflow-hidden shadow-2xl"
      style={{ ...panelStyle, flex: '1 1 0%', minWidth: 0, maxWidth: 'clamp(240px, 30vw, 420px)' }}
    >
      {/* Header */}
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="uppercase" style={{ fontSize: 'clamp(8px, 0.85vw, 11px)', letterSpacing: '0.15em', color: '#a1a1aa' }}>System Boot Log</span>
          <span style={{ fontSize: 'clamp(8px, 0.85vw, 11px)', color: '#3f3f46' }}>|</span>
          <span style={{ fontSize: 'clamp(7px, 0.7vw, 9px)', color: '#52525b' }}>kernel 6.8.12-300.fc40.x86_64</span>
        </div>
        <span className="uppercase" style={{
          fontSize: 'clamp(7px, 0.7vw, 9px)', letterSpacing: '0.15em',
          color: bootComplete ? '#34d399' : 'rgba(251,191,36,0.8)',
        }}>
          {bootComplete ? '● system ready' : '● booting...'}
        </span>
      </div>

      {/* Log content */}
      <div ref={logContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {logs.map((entry, i) => (
          <div key={i} className="flex" style={{ fontSize: 'clamp(9px, 0.9vw, 12px)', lineHeight: '1.65' }}>
            <span className="shrink-0 mr-2" style={{ color: '#52525b' }}>{entry.timestamp}</span>
            <span className={entry.color || 'text-zinc-300'}>{entry.message}</span>
          </div>
        ))}
        {!bootComplete && logs.length > 0 && (
          <div className="flex mt-0.5" style={{ fontSize: 'clamp(9px, 0.9vw, 12px)', color: '#34d399' }}>
            <span className="shrink-0 mr-2" style={{ color: '#52525b' }}>
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
            <span className="animate-pulse">▌</span>
          </div>
        )}
        {bootComplete && (
          <div className="mt-2" style={{ fontSize: 'clamp(9px, 0.9vw, 12px)', color: '#34d399' }}>
            <span className="mr-2" style={{ color: '#52525b' }}>                              </span>
            zenos login: _
          </div>
        )}
      </div>

      {/* Footer status bar */}
      <div className="px-3 sm:px-4 py-1.5 border-t border-white/[0.06] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 uppercase" style={{ fontSize: 'clamp(6px, 0.65vw, 8px)', letterSpacing: '0.12em', color: '#52525b' }}>
          <span>uptime: {(logs.length * 0.055).toFixed(1)}s</span>
          <span style={{ color: '#27272a' }}>|</span>
          <span>mem: {metrics ? (metrics.mem_used / 1024 / 1024 / 1024).toFixed(1) : "24.2"}G / {metrics ? Math.round(metrics.mem_total / 1024 / 1024 / 1024) : "32"}G</span>
          <span style={{ color: '#27272a' }}>|</span>
          <span>cpu: {metrics ? metrics.cpu_load.toFixed(1) : "2.1"}%</span>
        </div>
        <div className="uppercase" style={{ fontSize: 'clamp(6px, 0.65vw, 8px)', letterSpacing: '0.12em', color: '#52525b' }}>
          tty1 — 80x24
        </div>
      </div>
    </div>
  );
};
