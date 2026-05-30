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
    <div className={cn("flex flex-col gap-3 py-2", className)}>
      {/* Shimmer lines */}
      <div className="flex flex-col gap-2 animate-pulse">
        <div className={cn(
          "h-3 rounded bg-muted/40 w-[90%]",
          compact && "h-2"
        )} />
        <div className={cn(
          "h-3 rounded bg-muted/40 w-[75%]",
          compact && "h-2"
        )} />
        <div className={cn(
          "h-3 rounded bg-muted/40 w-[85%]",
          compact && "h-2"
        )} />
        <div className={cn(
          "h-3 rounded bg-muted/40 w-[40%]",
          compact && "h-2"
        )} />
      </div>

      {/* Animated dots indicator */}
      <div className="mt-3 flex items-center gap-2 opacity-40">
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" />
        </div>
        <span className="text-[10px] font-mono tracking-widest text-muted-foreground/50 uppercase">
          {label}
        </span>
      </div>
    </div>
  );
}
