import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useReducedMotion } from "@/lib/motion";

export type WorkspaceView = "openui" | "loading" | "welcome" | "chat";

interface WorkspaceViewTransitionProps {
  view: WorkspaceView;
  children: ReactNode;
}

/**
 * Moves the user between the workspace setup surface and the live chat without
 * changing the chat's identity when only the active session changes.
 */
export function WorkspaceViewTransition({ view, children }: WorkspaceViewTransitionProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <LayoutGroup id="workspace-view">
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={view}
            className="absolute inset-0 h-full w-full will-change-[opacity,transform]"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12, scale: 0.994 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -8, scale: 1.004 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
            }
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}
