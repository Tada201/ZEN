import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { IS_TAURI } from "@/api/tauriClient";
import { motionDurations, motionEasings, useReducedMotion } from "@/lib/motion";
import { WelcomeBlackHoleSvg } from "@/atlas/components/chat/WelcomeBlackHoleSvg";

const bootLogoUrl = "/logo-white-lines.svg";

/** Main-window handoff screen, separate from the native Tauri startup splash. */
export function BootScreen({ onComplete }: { onComplete: () => void }) {
  const onCompleteRef = useRef(onComplete);
  const bootEnabled = useSettingsStore((state) => state.bootEnabled ?? true);
  const bootDurationMs = useSettingsStore((state) => state.bootDurationMs ?? 3200);
  const reducedMotion = useReducedMotion();
  const [isLeaving, setIsLeaving] = useState(false);
  const [handoffReady, setHandoffReady] = useState(!IS_TAURI);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // The native splash owns the cold-start handoff. Do not spend the React
  // reveal while the main window is still hidden behind it.
  useEffect(() => {
    if (!IS_TAURI) return;

    let active = true;
    let unlisten: (() => void) | undefined;
    void listen("zen:main-visible", () => {
      if (active) setHandoffReady(true);
    }).then((cleanup) => {
      if (!active) cleanup();
      else unlisten = cleanup;
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const complete = useCallback(() => onCompleteRef.current(), []);

  useEffect(() => {
    if (!bootEnabled || reducedMotion) {
      complete();
      return;
    }
    if (!handoffReady) return;

    // This timer controls only the cosmetic overlay; initialization continues
    // independently underneath it and is not artificially delayed by motion.
    const duration = Math.min(5000, Math.max(3200, bootDurationMs));
    const fadeTimer = window.setTimeout(() => setIsLeaving(true), Math.max(0, duration - 220));
    const completeTimer = window.setTimeout(complete, duration);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(completeTimer);
    };
  }, [bootEnabled, bootDurationMs, complete, handoffReady, reducedMotion]);

  if (!bootEnabled || reducedMotion) return null;

  const revealTransition = {
    duration: motionDurations.shared,
    ease: motionEasings.shared,
  } as const;

  return (
    <motion.main
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#08080b] text-foreground"
      animate={{ opacity: isLeaving ? 0 : 1 }}
      transition={{ duration: isLeaving ? motionDurations.surface : 0, ease: motionEasings.standard }}
      role="status"
      aria-label="Loading Zen"
    >
      {/* Draw the black-hole geometry path-by-path; no directional wipe. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: motionDurations.shared, ease: motionEasings.standard }}
      >
        <WelcomeBlackHoleSvg draw className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.78]" />
      </motion.div>

      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute h-[min(52vw,58vh)] w-[min(52vw,58vh)] rounded-full bg-primary/10 blur-[100px]"
        initial={{ opacity: 0, scale: 0.72 }}
        animate={{ opacity: 0.2, scale: 1 }}
        transition={{ duration: 1.15, ease: motionEasings.shared }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          className="relative flex h-80 w-80 items-center justify-center bg-transparent"
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...revealTransition, delay: 0.32 }}
        >
          {/* Render the packaged mark as-is: no hue, blend mode, frame, or
              artificial color layers are applied to the logo. */}
          <motion.img
            src={bootLogoUrl}
            alt=""
            className="relative h-80 w-80 object-contain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...revealTransition, delay: 0.5 }}
          />
        </motion.div>
      </div>

      <span className="sr-only">Restoring your workspace</span>
    </motion.main>
  );
}
