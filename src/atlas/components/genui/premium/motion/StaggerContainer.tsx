import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  /** Delay between each child's entrance animation in seconds. */
  staggerDelay?: number;
  /** Initial delay before the first child animates in. */
  delay?: number;
}

/**
 * Container that staggers the entrance animations of its direct children.
 *
 * Wrap a list of cards with this component to get a sequential fade-up effect.
 * Each child should be a `motion` element (or wrapped in `StaggerItem`) that
 * responds to the parent's `variants`.
 *
 * Reduced motion is respected automatically.
 */
export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.08,
  delay = 0,
}: StaggerContainerProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={cn("flex flex-col gap-4", className)}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            delayChildren: delay,
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={cn("flex flex-col gap-4", className)}
    >
      {children}
    </motion.div>
  );
}

export interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper for a single item inside a `StaggerContainer`.
 *
 * The item inherits the parent's stagger variants and fades up when the
 * container enters the viewport.
 */
export function StaggerItem({ children, className }: StaggerItemProps) {
  return (
    <motion.div variants={staggerItemVariants} className={className}>
      {children}
    </motion.div>
  );
}

/** Variants for children inside a `StaggerContainer`. */
export const staggerItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};
