import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn("rounded-2xl border border-border/40 bg-card p-6 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-bold tracking-tight">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
