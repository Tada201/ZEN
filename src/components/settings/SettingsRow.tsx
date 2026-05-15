import { type ReactNode, type ComponentType } from "react";
import { cn } from "@/lib/utils";

interface SettingsRowProps {
  label: string;
  description?: string;
  control?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
  id?: string;
}

export function SettingsRow({ label, description, control, icon: Icon, className, id }: SettingsRowProps) {
  return (
    <div
      id={id}
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-white/[0.03] group",
        className
      )}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />}
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors truncate">
            {label}
          </p>
          {description && (
            <p className="text-[10px] text-zinc-500 truncate">{description}</p>
          )}
        </div>
      </div>
      {control && <div className="flex-shrink-0">{control}</div>}
    </div>
  );
}
