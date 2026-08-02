import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkbenchHeaderCoreProps {
  children: ReactNode;
  className?: string;
}

/**
 * Shared alignment boundary for the workspace context and right workbench
 * headers. The owning surfaces keep their semantic header and local controls;
 * this primitive owns only the repeated spacing contract.
 */
export function WorkbenchHeaderCore({ children, className }: WorkbenchHeaderCoreProps) {
  return (
    <div className={cn("flex w-full min-w-0 items-center justify-between gap-3", className)}>
      {children}
    </div>
  );
}
