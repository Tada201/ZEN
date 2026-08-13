import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/motion";
import { motionDurations, motionEasings } from "@/lib/motion";
import { WorkspaceBackground } from "@/components/workbench/WorkspaceBackground";

export type WorkspaceView = "openui" | "loading" | "welcome" | "chat";

interface WorkspaceViewTransitionProps {
  view: WorkspaceView;
  /** Changes only when the visible workspace scene should be replaced. */
  transitionKey?: string | null;
  children: ReactNode;
}

interface WorkspaceTransitionState {
  isTransitioning: boolean;
  isLeavingWelcome: boolean;
}

const WorkspaceTransitionContext = createContext<WorkspaceTransitionState>({
  isTransitioning: false,
  isLeavingWelcome: false,
});

export function useWorkspaceTransitioning() {
  return useContext(WorkspaceTransitionContext).isTransitioning;
}

export function useWorkspaceLeavingWelcome() {
  return useContext(WorkspaceTransitionContext).isLeavingWelcome;
}

/**
 * Moves the user between the workspace setup surface and the live chat without
 * changing the chat's identity when only the active session changes.
 */
export function WorkspaceViewTransition({ view, transitionKey, children }: WorkspaceViewTransitionProps) {
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

  const sceneKey = `${view}:${transitionKey ?? ""}`;

  const transitionState = {
    isTransitioning,
    isLeavingWelcome: view !== "welcome",
  };

  return (
    <WorkspaceTransitionContext.Provider value={transitionState}>
      <div className="relative h-full min-h-0 overflow-hidden">
        <WorkspaceBackground />
        <LayoutGroup id="workspace-view">
          <AnimatePresence initial={false} mode="sync">
            <motion.div
              onAnimationStart={handleAnimationStart}
              onAnimationComplete={handleAnimationComplete}
            key={sceneKey}
            className="absolute inset-0 h-full w-full origin-center"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -22 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { duration: motionDurations.shared, ease: motionEasings.shared }
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
