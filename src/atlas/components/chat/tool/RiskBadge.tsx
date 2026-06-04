import React from "react";
import { ShieldAlert, AlertTriangle, Info, Skull } from "lucide-react";
import { cn } from "@/lib/utils";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskBadgeConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  classes: string;
}

export const RISK_BADGE_CONFIG: Record<RiskLevel, RiskBadgeConfig> = {
  low: {
    label: "Low risk",
    icon: Info,
    classes: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  medium: {
    label: "Medium risk",
    icon: AlertTriangle,
    classes: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  high: {
    label: "High risk",
    icon: AlertTriangle,
    classes: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  },
  critical: {
    label: "Critical risk",
    icon: ShieldAlert,
    classes: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  },
};

export function getRiskToneClasses(level: RiskLevel): string {
  return RISK_BADGE_CONFIG[level].classes;
}

export interface RiskBadgeProps {
  level: RiskLevel;
  size?: "sm" | "md";
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
  labelOverride?: string;
}

export function RiskBadge({
  level,
  size = "sm",
  className,
  iconClassName,
  showIcon = true,
  labelOverride,
}: RiskBadgeProps) {
  const config = RISK_BADGE_CONFIG[level] ?? RISK_BADGE_CONFIG.medium;
  const Icon = config.icon;
  const sizeClasses =
    size === "sm"
      ? "h-4 px-1.5 text-[9px] gap-1"
      : "h-5 px-2 text-[10px] gap-1.5";
  const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <span
      role="status"
      aria-label={labelOverride ?? config.label}
      title={config.label}
      className={cn(
        "inline-flex items-center rounded border font-mono font-semibold uppercase tracking-widest",
        config.classes,
        sizeClasses,
        className,
      )}
      data-risk-level={level}
    >
      {showIcon ? <Icon className={cn(iconSize, iconClassName)} /> : null}
      <span>{labelOverride ?? config.label}</span>
    </span>
  );
}

export function SkullRiskBadge({
  size = "sm",
  className,
  labelOverride,
}: Omit<RiskBadgeProps, "level" | "showIcon" | "iconClassName">) {
  const sizeClasses =
    size === "sm"
      ? "h-4 px-1.5 text-[9px] gap-1"
      : "h-5 px-2 text-[10px] gap-1.5";
  const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <span
      role="status"
      aria-label={labelOverride ?? "Catastrophic risk"}
      title="Catastrophic risk"
      className={cn(
        "inline-flex items-center rounded border border-rose-600/60 bg-rose-600/20 font-mono font-semibold uppercase tracking-widest text-rose-100",
        sizeClasses,
        className,
      )}
    >
      <Skull className={iconSize} />
      <span>{labelOverride ?? "Catastrophic"}</span>
    </span>
  );
}
