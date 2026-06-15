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
      "space-y-2",
      className
    )}>
      <div className="mb-2 flex items-start gap-3">
        {icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {typeof icon === "string" ? (
              <WorkbenchIcon name={icon} size={16} className="text-primary" />
            ) : (
              React.createElement(icon, { className: "h-4 w-4 text-primary" })
            )}
          </div>
        )}
        <div className="flex flex-col gap-1 min-w-0">
          {subtitle && (
            <span className="text-xs font-medium text-primary">
              {subtitle}
            </span>
          )}
          <h3 className="text-base font-semibold text-foreground">
            {title}
          </h3>
          {description && (
            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      <div>
        {children}
      </div>
    </section>
  );
}
