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
      variant === "body" && "text-sm text-foreground",
      variant === "heading" && "text-xl font-bold tracking-tight",
      variant === "label" && "text-xs font-bold uppercase tracking-widest text-muted-foreground",
      className
    )}>
      {content}
    </div>
  );
}
