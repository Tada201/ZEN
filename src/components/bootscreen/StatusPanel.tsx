import React from "react";
import { StatusItem } from "./types";

interface StatusPanelProps {
  logoVisible: boolean;
  logoSubVisible: boolean;
  bootPhase: string;
  statusItems: StatusItem[];
  logsCount: number;
  totalLogsCount: number;
  bootComplete: boolean;
  getStatusIcon: (status: StatusItem['status']) => React.ReactNode;
  panelStyle: React.CSSProperties;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({
  logoVisible,
  logoSubVisible,
  bootPhase,
  statusItems,
  logsCount,
  totalLogsCount,
  bootComplete,
  getStatusIcon,
  panelStyle,
}) => {
  return (
    <div
      className="h-full flex flex-col overflow-hidden shadow-2xl"
      style={{ ...panelStyle, flex: '1 1 0%', minWidth: 0, maxWidth: 'clamp(240px, 30vw, 420px)' }}
    >
      {/* Header */}
      <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3 border-b border-white/[0.06]">
        <div
          className="uppercase font-light transition-all duration-700"
          style={{
            fontSize: 'clamp(8px, 0.85vw, 11px)',
            letterSpacing: '0.4em',
            color: 'rgba(52,211,153,0.9)',
            opacity: logoVisible ? 1 : 0,
            transform: logoVisible ? 'translateY(0)' : 'translateY(-8px)',
          }}
        >
          {'>'} ZENOS
        </div>
        <div
          className="mt-0.5 uppercase transition-all duration-700"
          style={{
            fontSize: 'clamp(7px, 0.7vw, 9px)',
            letterSpacing: '0.25em',
            color: '#71717a',
            opacity: logoSubVisible ? 1 : 0,
          }}
        >
          v3.2.0 — System Boot
        </div>
      </div>

      {/* Phase */}
      <div className="px-3 sm:px-4 py-2 border-b border-white/[0.06]">
        <div className="uppercase" style={{ fontSize: 'clamp(7px, 0.7vw, 9px)', letterSpacing: '0.2em', color: '#52525b' }}>Phase</div>
        <div className="mt-0.5 uppercase font-light" style={{ fontSize: 'clamp(8px, 0.8vw, 10px)', letterSpacing: '0.2em', color: 'rgba(52,211,153,0.8)' }}>
          {bootPhase}
        </div>
      </div>

      {/* Status list */}
      <div className="flex-1 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {statusItems.map((item) => (
          <div
            key={item.label}
            className={`flex items-start gap-1.5 px-3 sm:px-4 py-[3px] transition-colors duration-75 ${
              item.status === 'running' ? 'bg-white/[0.03]' : ''
            }`}
            style={{ fontSize: 'clamp(9px, 0.85vw, 11px)', lineHeight: '1.4' }}
          >
            <span className="shrink-0 text-right" style={{ width: 'clamp(22px, 2.2vw, 30px)' }}>{getStatusIcon(item.status)}</span>
            <div className="min-w-0">
              <span className="tracking-wider" style={{
                color: item.status === 'ok' ? '#d4d4d8' : item.status === 'running' ? '#a1a1aa' : '#52525b',
              }}>
                {item.label}
              </span>
              {item.status === 'ok' && (
                <span className="ml-1" style={{ color: '#52525b', fontSize: 'clamp(8px, 0.75vw, 10px)' }}>{item.detail}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 sm:px-4 py-2 border-t border-white/[0.06] flex items-center justify-between">
        <span className="uppercase" style={{ fontSize: 'clamp(7px, 0.7vw, 9px)', letterSpacing: '0.15em', color: '#52525b' }}>
          {logsCount}/{totalLogsCount}
        </span>
        <span className="uppercase" style={{
          fontSize: 'clamp(7px, 0.7vw, 9px)', letterSpacing: '0.15em',
          color: bootComplete ? '#34d399' : '#52525b',
        }}>
          {bootComplete ? 'READY' : 'BOOTING'}
        </span>
      </div>
    </div>
  );
};
