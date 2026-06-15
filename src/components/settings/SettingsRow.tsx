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
        "group flex flex-col gap-3 border-b border-border/50 px-1 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
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
          <p className="text-sm font-medium text-foreground">
            {label}
          </p>
          {description && (
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {control && <div className="w-full min-w-0 shrink-0 sm:w-auto [&>*]:max-w-full">{control}</div>}
    </div>
  );
}
