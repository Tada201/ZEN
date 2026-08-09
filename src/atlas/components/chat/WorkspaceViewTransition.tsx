import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/motion";

export type WorkspaceView = "openui" | "loading" | "welcome" | "chat";

interface WorkspaceViewTransitionProps {
  view: WorkspaceView;
  children: ReactNode;
}

const WorkspaceTransitionContext = createContext(false);

export function useWorkspaceTransitioning() {
  return useContext(WorkspaceTransitionContext);
}

/**
 * Moves the user between the workspace setup surface and the live chat without
 * changing the chat's identity when only the active session changes.
 */
export function WorkspaceViewTransition({ view, children }: WorkspaceViewTransitionProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const activeAnimations = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = () => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  const handleAnimationStart = () => {
    clearWatchdog();
    activeAnimations.current += 1;
    setIsTransitioning(true);
    watchdogRef.current = setTimeout(() => {
      activeAnimations.current = 0;
      watchdogRef.current = null;
      setIsTransitioning(false);
    }, prefersReducedMotion ? 50 : 1_000);
  };
  const handleAnimationComplete = () => {
    activeAnimations.current = Math.max(0, activeAnimations.current - 1);
    if (activeAnimations.current === 0) {
      clearWatchdog();
      setIsTransitioning(false);
    }
  };

  useEffect(() => clearWatchdog, []);

  return (
    <WorkspaceTransitionContext.Provider value={isTransitioning}>
      <div className="relative h-full min-h-0 overflow-hidden">
        <LayoutGroup id="workspace-view">
          <AnimatePresence initial={false} mode="sync">
            <motion.div
              onAnimationStart={handleAnimationStart}
              onAnimationComplete={handleAnimationComplete}
            key={view}
            className="absolute inset-0 h-full w-full origin-center will-change-[opacity,transform]"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -22, scale: 1.015 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { duration: 0.72, ease: [0.22, 1, 0.36, 1] }
            }
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </WorkspaceTransitionContext.Provider>
  );
}
