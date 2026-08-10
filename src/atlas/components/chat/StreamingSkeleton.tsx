import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/motion";

interface StreamingSkeletonProps {
  className?: string;
  compact?: boolean;
  label?: string;
}

/**
 * StreamingSkeleton - Animated loading skeleton shown while the assistant
 * is preparing tokens before any content is delivered.
 *
 * Uses ZEN's existing shadcn design tokens for consistent theming.
 */
export function StreamingSkeleton({
  className,
  compact,
  label = "Waiting for first token",
}: StreamingSkeletonProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div className={cn("flex flex-col gap-3 py-2", className)}>
      {/* Shimmer lines */}
      <div className={cn("flex flex-col gap-2", !reducedMotion && "animate-pulse")}>
        <div className={cn(
          "h-3 rounded bg-muted w-[90%]",
          compact && "h-2"
        )} />
        <div className={cn(
          "h-3 rounded bg-muted w-[75%]",
          compact && "h-2"
        )} />
        <div className={cn(
          "h-3 rounded bg-muted w-[85%]",
          compact && "h-2"
        )} />
        <div className={cn(
          "h-3 rounded bg-muted w-[40%]",
          compact && "h-2"
        )} />
      </div>

      {/* Animated dots indicator */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex gap-1">
          <div className={cn("w-1.5 h-1.5 rounded-full bg-primary", !reducedMotion && "animate-bounce [animation-delay:-0.3s]")} />
          <div className={cn("w-1.5 h-1.5 rounded-full bg-primary", !reducedMotion && "animate-bounce [animation-delay:-0.15s]")} />
          <div className={cn("w-1.5 h-1.5 rounded-full bg-primary", !reducedMotion && "animate-bounce")} />
        </div>
        <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
          {label}
        </span>
      </div>
    </div>
  );
}
