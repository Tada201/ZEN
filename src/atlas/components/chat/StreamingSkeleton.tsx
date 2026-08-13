import { cn } from "@/lib/utils";

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
  return (
    <div className={cn("flex flex-col gap-3 py-2", className)} aria-live="polite">
      {/* Shimmer lines */}
      <div className="flex flex-col gap-2">
        <div className={cn(
          "h-3 rounded bg-muted w-[90%] animate-pulse motion-reduce:animate-none",
          compact && "h-2"
        )} />
        <div className={cn(
          "h-3 rounded bg-muted w-[75%] animate-pulse motion-reduce:animate-none [animation-delay:150ms]",
          compact && "h-2"
        )} />
        <div className={cn(
          "h-3 rounded bg-muted w-[85%] animate-pulse motion-reduce:animate-none [animation-delay:300ms]",
          compact && "h-2"
        )} />
        <div className={cn(
          "h-3 rounded bg-muted w-[40%] animate-pulse motion-reduce:animate-none [animation-delay:450ms]",
          compact && "h-2"
        )} />
      </div>

      {/* Animated dots indicator */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-[execution-status-pulse_1.4s_ease-in-out_infinite] motion-reduce:animate-none" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-[execution-status-pulse_1.4s_ease-in-out_infinite] [animation-delay:200ms] motion-reduce:animate-none" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-[execution-status-pulse_1.4s_ease-in-out_infinite] [animation-delay:400ms] motion-reduce:animate-none" />
        </div>
        <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
          {label}
        </span>
      </div>
    </div>
  );
}
