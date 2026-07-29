import { type ReactNode, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export interface CardMotionProps {
  children: ReactNode;
  className?: string;
  /** Renders a mouse-tracking radial-gradient spotlight on hover. */
  spotlight?: boolean;
  /** Applies a 3D tilt effect that follows the cursor. */
  tilt?: boolean;
  /** Entrance animation delay in seconds. */
  entranceDelay?: number;
  /** Maximum 3D tilt rotation in degrees. */
  maxTilt?: number;
}

/**
 * Reusable motion wrapper for premium GenUI cards.
 *
 * Features:
 * - Fade-up entrance animation (disabled when reduced motion is preferred)
 * - Optional mouse-tracking spotlight glow
 * - Optional 3D tilt effect
 *
 * The component is intentionally unopinionated about the card's visual
 * chrome; it only adds motion behavior. Use it inside `CardShell` or wrap
 * `CardShell` with it.
 *
 * Implementation note: CardMotion writes CSS custom properties directly to the
 * DOM during mousemove to avoid React re-renders. The standalone
 * `useCardSpotlight` and `useCardTilt` hooks are provided for cards that need
 * granular control or a different DOM structure.
 */
export function CardMotion({
  children,
  className,
  spotlight = false,
  tilt = false,
  entranceDelay = 0,
  maxTilt = 8,
}: CardMotionProps) {
  const shouldReduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  // Disable interactive effects globally for a clean 2D chatbot interface.
  const enableSpotlight = false && spotlight;
  const enableTilt = false && tilt;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const xPct = (x / rect.width) * 100;
      const yPct = (y / rect.height) * 100;

      if (enableSpotlight) {
        ref.current.style.setProperty("--card-spotlight-x", `${xPct}%`);
        ref.current.style.setProperty("--card-spotlight-y", `${yPct}%`);
        ref.current.style.setProperty("--card-spotlight-opacity", "1");
      }

      if (enableTilt) {
        const rotateX = (y / rect.height - 0.5) * -maxTilt;
        const rotateY = (x / rect.width - 0.5) * maxTilt;
        ref.current.style.setProperty("--card-tilt-x", `${rotateX}deg`);
        ref.current.style.setProperty("--card-tilt-y", `${rotateY}deg`);
      }
    },
    [enableSpotlight, enableTilt, maxTilt]
  );

  const handleMouseLeave = useCallback(() => {
    if (!ref.current) return;
    if (enableSpotlight) {
      ref.current.style.setProperty("--card-spotlight-opacity", "0");
    }
    if (enableTilt) {
      ref.current.style.setProperty("--card-tilt-x", "0deg");
      ref.current.style.setProperty("--card-tilt-y", "0deg");
    }
  }, [enableSpotlight, enableTilt]);

  return (
    <motion.div
      ref={ref}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.45,
        delay: entranceDelay,
        ease: [0.16, 1, 0.3, 1],
      }}
      onMouseMove={enableSpotlight || enableTilt ? handleMouseMove : undefined}
      onMouseLeave={enableSpotlight || enableTilt ? handleMouseLeave : undefined}
      className={cn("relative", className)}
    >
      {enableSpotlight && <CardSpotlightOverlay />}
      <div
        className={cn(
          "relative",
          enableTilt &&
            "[transform:perspective(1000px)_rotateX(var(--card-tilt-x,0deg))_rotateY(var(--card-tilt-y,0deg))] [transform-style:preserve-3d]"
        )}
        style={{ willChange: enableTilt ? "transform" : undefined }}
      >
        {children}
      </div>
    </motion.div>
  );
}

function CardSpotlightOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 rounded-2xl opacity-[var(--card-spotlight-opacity,0)] transition-opacity duration-200"
      style={{
        background:
          "radial-gradient(600px circle at var(--card-spotlight-x,50%) var(--card-spotlight-y,50%), hsl(var(--primary) / 0.14), transparent 40%)",
      }}
    />
  );
}
