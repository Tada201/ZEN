import React from "react";
import { Icon } from "@iconify/react";
import { DynamicIcon } from "lucide-react/dynamic";
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
  if (name.startsWith("lucide:")) {
    return (
      <DynamicIcon
        name={name.slice("lucide:".length) as never}
        size={size}
        className={cn("flex-shrink-0 inline-block", className)}
        style={style}
        fallback={() => <span aria-hidden="true" style={{ width: size, height: size }} />}
      />
    );
  }

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
