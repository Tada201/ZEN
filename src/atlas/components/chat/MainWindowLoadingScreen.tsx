import { motion } from "framer-motion";
import appIconUrl from "../../../../src-tauri/icons/128x128.png";
import { motionDurations, motionEasings, useReducedMotion } from "@/lib/motion";

/**
 * App-shell loading state used while the workspace session index hydrates.
 *
 * This is intentionally not a content skeleton: there is no stable layout to
 * represent until the workspace has been restored. The logo reveal gives the
 * user a quiet, branded signal without inventing a fake delay or competing
 * with the actual chat surface once it is ready.
 */
export function MainWindowLoadingScreen() {
  const reducedMotion = useReducedMotion();

  return (
    <div
      className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[#09090b]"
      role="status"
      aria-label="Loading workspace"
    >
      <div className="relative flex h-24 w-24 items-center justify-center">
        <motion.svg
          aria-hidden="true"
          viewBox="0 0 96 96"
          className="absolute inset-0 h-full w-full"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.standard, ease: motionEasings.standard }}
        >
          <motion.path
            d="M14 30H82"
            pathLength={1}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeLinecap="round"
            strokeWidth="1.5"
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0.2 }}
            animate={{ pathLength: 1, opacity: 0.72 }}
            transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.shared, ease: motionEasings.shared }}
          />
          <motion.path
            d="M14 66H82"
            pathLength={1}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeLinecap="round"
            strokeWidth="1.5"
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0.2 }}
            animate={{ pathLength: 1, opacity: 0.72 }}
            transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.shared, delay: 0.08, ease: motionEasings.shared }}
          />
        </motion.svg>

        <motion.div
          className="relative flex h-16 w-16 items-center justify-center rounded-[20px] border border-primary/40 bg-[#111114] shadow-[0_0_28px_hsl(var(--primary)/0.14)]"
          initial={reducedMotion ? false : { opacity: 0, scale: 0.82, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.surface, delay: 0.14, ease: motionEasings.shared }}
        >
          <motion.img
            src={appIconUrl}
            alt=""
            className="h-10 w-10 rounded-xl object-cover"
            initial={reducedMotion ? false : { opacity: 0, clipPath: "inset(0 100% 0 0)" }}
            animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
            transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.surface, delay: 0.28, ease: motionEasings.shared }}
          />
        </motion.div>
      </div>
      <span className="sr-only">Restoring your workspace</span>
    </div>
  );
}
