import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface StackProps {
  children: ReactNode;
  direction?: "row" | "column";
  gap?: number;
  className?: string;
}

export function Stack({ children, direction = "column", gap = 4, className }: StackProps) {
  return (
    <div 
      className={cn(
        "flex",
        direction === "column" ? "flex-col" : "flex-row",
        className
      )}
      style={{ gap: `${gap * 0.25}rem` }}
    >
      {children}
    </div>
  );
}
