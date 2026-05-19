import React from "react";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils/style";

export interface WorkbenchIconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * WorkbenchIcon - A unified icon component powered by Iconify.
 * Supports various icon sets (e.g., lucide, simple-icons, solar, codicon).
 */
export function WorkbenchIcon({ name, size = 16, className, style }: WorkbenchIconProps) {
  return (
    <Icon
      icon={name}
      width={size}
      height={size}
      className={cn("flex-shrink-0 inline-block", className)}
      style={style}
    />
  );
}
