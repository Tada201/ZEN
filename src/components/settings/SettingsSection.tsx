import React from "react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({ title, icon: Icon, description, children, className }: SettingsSectionProps) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="px-1">
        <div className="flex items-center gap-2 mb-0.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-zinc-500" />}
          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.15em]">
            {title}
          </h3>
        </div>
        {description && (
          <p className="text-[10px] text-zinc-600 mt-1 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="border-t border-white/[0.06] mb-1" />
      <div className="space-y-0.5">
        {children}
      </div>
    </section>
  );
}
