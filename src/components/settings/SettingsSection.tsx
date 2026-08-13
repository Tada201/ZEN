import React from "react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { WorkbenchIcon } from "@/components/ui/WorkbenchIcon";

interface SettingsSectionProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: string | ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({
  title,
  subtitle,
  icon,
  description,
  children,
  className
}: SettingsSectionProps) {
  return (
    <section className={cn(
      "min-w-0",
      className
    )}>
      <div className="flex items-start gap-2.5 border-b border-border/70 pb-2.5">
        {icon && (
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
            {typeof icon === "string" ? (
              <WorkbenchIcon name={icon} size={16} className="text-primary" />
            ) : (
              React.createElement(icon, { className: "h-4 w-4 text-primary" })
            )}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          {subtitle && (
            <span className="text-xs font-medium text-primary">
              {subtitle}
            </span>
          )}
          <h3 className="text-sm font-semibold text-foreground">
            {title}
          </h3>
          {description && (
            <p className="max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="divide-y divide-border/70">
        {children}
      </div>
    </section>
  );
}
