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
      "space-y-4",
      className
    )}>
      <div className="flex items-start gap-3 mb-4">
        {icon && (
          <div className="h-9 w-9 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0">
            {typeof icon === "string" ? (
              <WorkbenchIcon name={icon} size={16} className="text-primary" />
            ) : (
              React.createElement(icon, { className: "h-4 w-4 text-primary" })
            )}
          </div>
        )}
        <div className="flex flex-col gap-1 min-w-0">
          {subtitle && (
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-primary/80">
              {subtitle}
            </span>
          )}
          <h3 className="text-[13px] font-bold text-white uppercase tracking-tight">
            {title}
          </h3>
          {description && (
            <p className="text-[11px] text-zinc-500 leading-relaxed max-w-3xl">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </section>
  );
}
