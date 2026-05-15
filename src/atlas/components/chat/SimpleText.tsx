import { cn } from "@/lib/utils";

interface SimpleTextProps {
  text: string;
  className?: string;
}

/**
 * SimpleText - Lightweight text renderer for user messages.
 * Clean, minimal text display without markdown processing.
 * Uses ZEN's shadcn design tokens for consistent theming.
 */
export function SimpleText({ text, className }: SimpleTextProps) {
  if (!text) return null;

  return (
    <span
      className={cn(
        "text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words font-sans selection:bg-primary/20",
        className
      )}
    >
      {text}
    </span>
  );
}
