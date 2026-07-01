import React from "react";
import type { BootHardwareInfo } from "./data";

interface LogoProgressProps {
  logoVisible: boolean;
  logoSubVisible: boolean;
  barVisible: boolean;
  progress: number;
  bootComplete: boolean;
  backendReady: boolean;
  hardwareInfo?: BootHardwareInfo | null;
  reducedMotion?: boolean;
}

export const LogoProgress: React.FC<LogoProgressProps> = ({
  logoVisible,
  logoSubVisible,
  barVisible,
  progress,
  bootComplete,
  backendReady,
  hardwareInfo,
  reducedMotion = false,
}) => {
  const cpuLabel = hardwareInfo?.cpu?.replace(/\s+/g, " ").trim() || "AI Operating System";
  const memLabel = hardwareInfo ? `${Math.round(hardwareInfo.memory_gb)} GB DDR5` : undefined;
  const gpuLabel = hardwareInfo?.gpus?.[0]?.name;

  const isActuallyReady = bootComplete && backendReady;
  const isFinalizing = bootComplete && !backendReady;

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-w-0" style={{ flex: "1.2 1 0%" }}>
      <div className="text-center">
        <div
          className={`${reducedMotion ? '' : 'transition-all duration-1000 ease-out'}`}
          style={{
            opacity: logoVisible ? 1 : 0,
            transform: reducedMotion ? 'scale(1)' : (logoVisible ? 'scale(1)' : 'scale(0.92)'),
            filter: reducedMotion ? 'blur(0px)' : (logoVisible ? 'blur(0px)' : 'blur(6px)'),
          }}
        >
          <div
            className="font-extralight tracking-[0.3em] uppercase"
            style={{ fontSize: "clamp(1.6rem, 5vw, 3.8rem)", color: "hsl(var(--foreground) / 0.9)" }}
          >
            ZENOS
          </div>
        </div>
        <div
          className={`mt-3 uppercase ${reducedMotion ? '' : 'transition-all duration-1000'}`}
          style={{
            fontSize: "clamp(0.5rem, 1vw, 0.75rem)",
            letterSpacing: "0.5em",
            color: "hsl(var(--muted-foreground))",
            opacity: logoSubVisible ? 1 : 0,
            transform: reducedMotion ? 'translateY(0)' : (logoSubVisible ? 'translateY(0)' : 'translateY(6px)'),
            transitionDelay: reducedMotion ? undefined : '300ms',
          }}
        >
          AI Operating System
        </div>
        <div
          className={`mt-1.5 uppercase ${reducedMotion ? '' : 'transition-all duration-1000'}`}
          style={{
            fontSize: "clamp(0.45rem, 0.8vw, 0.6rem)",
            letterSpacing: "0.3em",
            color: "hsl(var(--muted-foreground) / 0.5)",
            opacity: logoSubVisible ? 0.7 : 0,
            transitionDelay: reducedMotion ? undefined : '500ms',
          }}
        >
          {hardwareInfo
            ? `${cpuLabel}${memLabel ? ` · ${memLabel}` : ""}`
            : "Kernel v3.2.0 · x86_64"}
        </div>
        {gpuLabel && logoSubVisible && (
          <div
            className={`mt-1 uppercase ${reducedMotion ? '' : 'transition-all duration-1000'}`}
            style={{
              fontSize: "clamp(0.4rem, 0.7vw, 0.55rem)",
              letterSpacing: "0.25em",
              color: "hsl(var(--muted-foreground) / 0.5)",
              opacity: 0.5,
              transitionDelay: reducedMotion ? undefined : '700ms',
            }}
          >
            {gpuLabel}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div
        className={`w-full ${reducedMotion ? '' : 'transition-all duration-700'}`}
        style={{
          opacity: barVisible ? 1 : 0,
          transform: reducedMotion ? 'translateY(0)' : (barVisible ? 'translateY(0)' : 'translateY(8px)'),
          maxWidth: "clamp(180px, 20vw, 280px)",
          marginTop: "clamp(1.5rem, 4vh, 3rem)",
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="uppercase" style={{ fontSize: "clamp(0.45rem, 0.8vw, 0.65rem)", letterSpacing: "0.2em", color: "hsl(var(--muted-foreground))" }}>
            {isFinalizing ? "Finalizing Environment" : "Initializing System"}
          </span>
          <span className="tabular-nums" style={{ fontSize: "clamp(0.45rem, 0.8vw, 0.65rem)", color: "hsl(var(--muted-foreground))" }}>
            {Math.round(progress)}%
          </span>
        </div>
        <div className="w-full h-[2px] bg-border/60 overflow-hidden rounded-full">          <div className={`h-full ${reducedMotion ? '' : 'transition-all duration-100 ease-linear'} rounded-full`}
            style={{
              width: `${progress}%`,
              background: isActuallyReady
                ? "linear-gradient(90deg, hsl(var(--success)), hsl(var(--success) / 0.75))"
                : "linear-gradient(90deg, hsl(var(--success) / 0.6), hsl(var(--success) / 0.8))",
            }}
          />
        </div>
        {bootComplete && (
        <div
          className={`mt-3 text-center uppercase ${reducedMotion ? '' : 'transition-all duration-1000'}`}
          style={{
            fontSize: "clamp(0.45rem, 0.8vw, 0.65rem)",
            letterSpacing: "0.3em",
            color: isActuallyReady ? "hsl(var(--success) / 0.8)" : "hsl(var(--warning) / 0.8)"
          }}
        >
            {isActuallyReady ? "System Ready" : "Finalizing..."}
          </div>
        )}
      </div>
    </div>
  );
};
