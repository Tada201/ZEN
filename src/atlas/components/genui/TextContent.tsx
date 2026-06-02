import { cn } from "@/lib/utils";

interface TextContentProps {
  content: string;
  variant?: "body" | "heading" | "label";
  className?: string;
}

export function TextContent({ content, variant = "body", className }: TextContentProps) {
  return (
    <div className={cn(
      "leading-relaxed",
      variant === "body" && "text-[13px] text-foreground/90",
      variant === "heading" && "text-sm font-semibold tracking-tight text-foreground",
      variant === "label" && "text-[11px] font-medium text-muted-foreground uppercase tracking-widest",
      className
    )}>
      {content}
    </div>
  );
}
