import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GridProps {
  children: ReactNode;
  cols?: number;
  gap?: number;
  className?: string;
}

export function Grid({ children, cols = 1, gap = 4, className }: GridProps) {
  return (
    <div 
      className={cn("grid", className)}
      style={{ 
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: `${gap * 0.25}rem` 
      }}
    >
      {children}
    </div>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-row flex-wrap gap-4", className)}>
      {children}
    </div>
  );
}

export function Col({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {children}
    </div>
  );
}
