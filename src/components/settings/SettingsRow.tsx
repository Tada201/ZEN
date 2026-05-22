import React from "react";
import type { ReactNode, ComponentType } from "react";
import { cn } from "@/lib/utils";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

interface SettingsRowProps {
  label: string;
  description?: string;
  control?: ReactNode;
  icon?: string | ComponentType<{ className?: string }>;
  className?: string;
  id?: string;
}

export function SettingsRow({
  label,
  description,
  control,
  icon,
  className,
  id
}: SettingsRowProps) {
  return (
    <div
      id={id}
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border border-white/[0.04] bg-zinc-900/15 px-4 py-3 hover:bg-white/[0.04] transition-colors group",
        className
      )}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {icon && (
          <div className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
            {typeof icon === "string" ? (
              <WorkbenchIcon name={icon} size={15} />
            ) : (
              React.createElement(icon, { className: "h-4 w-4" })
            )}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-white group-hover:text-zinc-100 transition-colors truncate">
            {label}
          </p>
          {description && (
            <p className="text-[10px] text-zinc-500 leading-relaxed truncate">
              {description}
            </p>
          )}
        </div>
      </div>
      {control && <div className="shrink-0">{control}</div>}
    </div>
  );
}
