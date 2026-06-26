import React from "react";

interface LogoProgressProps {
  logoVisible: boolean;
  logoSubVisible: boolean;
  barVisible: boolean;
  progress: number;
  bootComplete: boolean;
}

export const LogoProgress: React.FC<LogoProgressProps> = ({
  logoVisible,
  logoSubVisible,
  barVisible,
  progress,
  bootComplete,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-w-0" style={{ flex: '1.2 1 0%' }}>
      <div className="text-center">
        <div
          className="transition-all duration-1000 ease-out"
          style={{
            opacity: logoVisible ? 1 : 0,
            transform: logoVisible ? 'scale(1)' : 'scale(0.92)',
            filter: logoVisible ? 'blur(0px)' : 'blur(6px)',
          }}
        >
          <div
            className="font-extralight tracking-[0.3em] uppercase"
            style={{ fontSize: 'clamp(1.6rem, 5vw, 3.8rem)', color: 'rgba(255,255,255,0.9)' }}
          >
            ZENOS
          </div>
        </div>
        <div
          className="mt-3 uppercase transition-all duration-1000"
          style={{
            fontSize: 'clamp(0.5rem, 1vw, 0.75rem)',
            letterSpacing: '0.5em',
            color: '#71717a',
            opacity: logoSubVisible ? 1 : 0,
            transform: logoSubVisible ? 'translateY(0)' : 'translateY(6px)',
            transitionDelay: '300ms',
          }}
        >
          AI Operating System
        </div>
        <div
          className="mt-1.5 uppercase transition-all duration-1000"
          style={{
            fontSize: 'clamp(0.45rem, 0.8vw, 0.6rem)',
            letterSpacing: '0.3em',
            color: '#3f3f46',
            opacity: logoSubVisible ? 0.7 : 0,
            transitionDelay: '500ms',
          }}
        >
          Kernel v3.2.0 · x86_64
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="w-full transition-all duration-700"
        style={{
          opacity: barVisible ? 1 : 0,
          transform: barVisible ? 'translateY(0)' : 'translateY(8px)',
          maxWidth: 'clamp(180px, 20vw, 280px)',
          marginTop: 'clamp(1.5rem, 4vh, 3rem)',
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="uppercase" style={{ fontSize: 'clamp(0.45rem, 0.8vw, 0.65rem)', letterSpacing: '0.2em', color: '#71717a' }}>
            Initializing System
          </span>
          <span className="tabular-nums" style={{ fontSize: 'clamp(0.45rem, 0.8vw, 0.65rem)', color: '#71717a' }}>
            {Math.round(progress)}%
          </span>
        </div>
        <div className="w-full h-[2px] bg-white/[0.06] overflow-hidden rounded-full">
          <div
            className="h-full transition-all duration-100 ease-linear rounded-full"
            style={{
              width: `${progress}%`,
              background: bootComplete
                ? 'linear-gradient(90deg, #10b981, #34d399)'
                : 'linear-gradient(90deg, rgba(16,185,129,0.6), rgba(52,211,153,0.8))',
            }}
          />
        </div>
        {bootComplete && (
          <div
            className="mt-3 text-center uppercase transition-all duration-1000"
            style={{ fontSize: 'clamp(0.45rem, 0.8vw, 0.65rem)', letterSpacing: '0.3em', color: 'rgba(52,211,153,0.8)' }}
          >
            System Ready
          </div>
        )}
      </div>
    </div>
  );
};
