import { useEffect, useState } from "react";
import { useAppInit } from "@/hooks/useAppInit";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { Progress } from "@/components/ui/progress";

interface BootScreenProps {
  onComplete: () => void;
}

export function BootScreen({ onComplete }: BootScreenProps) {
  const bootEnabled = useSettingsStore((s) => s.bootEnabled ?? true);
  const bootDurationMs = useSettingsStore((s) => s.bootDurationMs ?? 2500);
  const durationMs = Math.min(10_000, Math.max(500, bootDurationMs));

  const { isInitialized } = useAppInit();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [showLoadingBar, setShowLoadingBar] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // If boot screen is disabled, immediately complete
  useEffect(() => {
    if (!bootEnabled) {
      onComplete();
    }
  }, [bootEnabled, onComplete]);

  // Respect the configured intro duration without imposing an extra startup delay.
  useEffect(() => {
    if (!bootEnabled) return;

    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, durationMs);

    // Show loading bar after 2 seconds if still loading
    const loadingBarTimer = setTimeout(() => {
      setShowLoadingBar(true);
    }, 2000);

    return () => {
      clearTimeout(timer);
      clearTimeout(loadingBarTimer);
    };
  }, [bootEnabled, durationMs]);

  // Never let an optional startup task strand the user behind the boot overlay.
  useEffect(() => {
    if (!bootEnabled) return;
    const timeout = setTimeout(() => {
      setMinTimeElapsed(true);
      setIsFadingOut(true);
      setTimeout(onComplete, 500);
    }, Math.max(8000, durationMs + 1000));
    return () => clearTimeout(timeout);
  }, [bootEnabled, durationMs, onComplete]);

  // Loading bar progress simulation while waiting for initialization
  useEffect(() => {
    if (!showLoadingBar || isFadingOut) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (isInitialized) {
          return 100;
        }
        // Slowly approach 95% if not yet initialized
        if (prev < 95) {
          return Math.min(95, prev + 4);
        }
        return prev;
      });
    }, 150);

    return () => clearInterval(interval);
  }, [showLoadingBar, isInitialized, isFadingOut]);

  // Handle transition out when both minimum time has elapsed and app is initialized
  useEffect(() => {
    if (bootEnabled && minTimeElapsed && isInitialized) {
      setProgress(100);
      setIsFadingOut(true);
      const fadeTimer = setTimeout(() => {
        onComplete();
      }, 600); // match transition duration
      return () => clearTimeout(fadeTimer);
    }
  }, [bootEnabled, minTimeElapsed, isInitialized, onComplete]);

  if (!bootEnabled) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black transition-opacity duration-500 ease-in-out ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Localized Custom Sci-Fi VFX Styles */}
      <style>{`
        .scifi-text {
          background: linear-gradient(90deg, #ffffff 0%, #e2e8f0 25%, #ffffff 50%, #e2e8f0 75%, #ffffff 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: textShimmer 4s linear infinite, glowPulse 3s ease-in-out infinite;
        }
        @keyframes textShimmer {
          to { background-position: 200% center; }
        }
        @keyframes glowPulse {
          0%, 100% {
            filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.25)) drop-shadow(0 0 8px rgba(255, 255, 255, 0.1));
          }
          50% {
            filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.6)) drop-shadow(0 0 16px rgba(255, 255, 255, 0.3));
          }
        }
        .glass-panel {
          position: relative;
          overflow: hidden;
        }
        .glass-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, transparent 50%, rgba(255, 255, 255, 0.02) 50%);
          background-size: 100% 4px;
          pointer-events: none;
        }
        .glass-panel::after {
          content: "";
          position: absolute;
          top: -100%;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.08), transparent);
          animation: scanline 4s linear infinite;
          pointer-events: none;
        }
        @keyframes scanline {
          0% { top: -100%; }
          100% { top: 100%; }
        }
        .glowing-bar [class*="ProgressPrimitive-Indicator"] {
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
          background: #ffffff;
          position: relative;
        }
        .glowing-bar [class*="ProgressPrimitive-Indicator"]::after {
          content: "";
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 4px;
          height: 4px;
          background: #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 8px #ffffff;
        }
      `}</style>

      {/* Background Video (Full Viewport) */}
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <video
          src="/video/boot.mp4"
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-90"
        />
        {/* Subtle overlay gradient to ensure text readability */}
        <div className="absolute inset-0 bg-black/55" />
      </div>

      {/* Sci-Fi Content Overlay with Glassmorphic Container for high legibility */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full mx-4 p-8 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.95)] text-center select-none glass-panel">
        {/* Brand Text */}
        <h1 className="text-4xl font-extrabold tracking-[0.55em] font-sans ml-[0.55em] mb-6 scifi-text">
          ZENOS
        </h1>

        {/* Loading Indicator */}
        <div className="w-full h-12 flex flex-col items-center justify-center transition-all duration-500">
          {showLoadingBar ? (
            <div className="w-full space-y-3">
              <Progress value={progress} className="h-1 bg-white/10 glowing-bar" />
              <p className="text-[9px] text-white/50 font-bold tracking-[0.3em] uppercase text-center animate-pulse drop-shadow-[0_0_4px_rgba(255,255,255,0.2)]">
                {isInitialized ? "Ready" : "Initializing System"}
              </p>
            </div>
          ) : (
            <div className="h-1" />
          )}
        </div>
      </div>
    </div>
  );
}

