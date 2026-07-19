/**
 * `PermissionModeMenu` — the permission-mode dropdown chip + DropdownMenu
 * extracted from `PremiumChatInput.tsx` so the input file stays a thin
 * composition layer.
 *
 * Drive by reading `toolPermissionMode` from `useSettingsStore`; selecting a
 * mode here:
 *   * Toggles `toolPermissionMode` + the related `toolYoloMode`,
 *     `toolAutoApproveLowRisk`, and `toolGlobalDefault` store fields so
 *     downstream consumers (e.g. `permission.rs` decisions) stay in sync.
 *   * Prompts for explicit YOLO confirmation — flipping into YOLO without
 *     a confirm is a UX hazard the inline `window.confirm` keeps gated.
 *   * Persists via `applyChanges()` and surfaces a `sonner` toast on success.
 *
 * The four entries' copy is what changed in C1: `auto_edit` no longer
 * advertises silent acceptance of HIGH-risk operations. Per the
 * permission/mode × risk matrix in `tools::permission::PermissionDecision`,
 * `auto_edit` ALLOWS Low/Medium and CONFIRMS High/Critical, so the
 * description now reads that out instead of the legacy "Prompt only for
 * terminal commands" wording.
 */

import { useCallback, useMemo } from "react";
import { Hand, ShieldAlert, ShieldCheck, FileText, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/style";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SafetyMode = "plan_mode" | "ask" | "auto_edit" | "yolo";

interface PermissionInfo {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  border: string;
  bg: string;
}

const PERMISSION_INFO: Record<SafetyMode, PermissionInfo> = {
  ask: {
    label: "Ask before changes",
    icon: Hand,
    color: "text-primary",
    border: "border-border",
    bg: "bg-muted/20",
  },
  auto_edit: {
    label: "Edit automatically",
    icon: ShieldCheck,
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-success/5",
  },
  plan_mode: {
    label: "Plan mode",
    icon: FileText,
    color: "text-muted-foreground",
    border: "border-border",
    bg: "bg-muted/10",
  },
  yolo: {
    label: "Full access",
    icon: ShieldAlert,
    color: "text-rose-400",
    border: "border-orange-500/25",
    bg: "bg-warning/5",
  },
};

export const PermissionModeMenu = () => {
  const permissionMode = useSettingsStore(
    (state) => (state.toolPermissionMode as SafetyMode) || "ask",
  );

  const info = useMemo(() => PERMISSION_INFO[permissionMode] ?? PERMISSION_INFO.ask, [
    permissionMode,
  ]);

  const handleSelectPermissionMode = useCallback(async (mode: SafetyMode) => {
    if (mode === "yolo") {
      const confirmed = window.confirm(
        "Enable YOLO mode? All permitted tools will execute automatically without confirmation. Hardcoded security blocks still apply.",
      );
      if (!confirmed) return;
    }
    try {
      const yoloVal = mode === "yolo";
      const lowRiskVal = mode !== "ask";
      const globalDefault = mode === "yolo" ? "always_allow" : "confirm";

      useSettingsStore.setState({
        toolPermissionMode: mode,
        toolYoloMode: yoloVal,
        toolAutoApproveLowRisk: lowRiskVal,
        toolGlobalDefault: globalDefault as any,
      });

      const store = useSettingsStore.getState();
      store.updateSetting("toolPermissionMode", mode);
      store.updateSetting("toolYoloMode", yoloVal);
      store.updateSetting("toolAutoApproveLowRisk", lowRiskVal);
      store.updateSetting("toolGlobalDefault", globalDefault as any);

      await store.applyChanges();
      toast.success(`Permission mode updated to: ${mode.replace("_", " ")}`);
    } catch (e) {
      console.warn("[PermissionModeMenu] Failed to update permission mode:", e);
    }
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs cursor-pointer transition-colors select-none focus:outline-none focus-visible:ring-0 focus-visible:outline-none",
            info.border,
            info.bg,
            info.color,
          )}
        >
          <info.icon className="w-3.5 h-3.5" />
          <span className="max-w-28 truncate">{info.label}</span>
          {permissionMode === "yolo" && (
            <span className="sr-only">YOLO mode is enabled</span>
          )}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 p-1 rounded-xl bg-card border border-border/80 shadow-2xl z-30"
      >
        <DropdownMenuItem
          onClick={() => handleSelectPermissionMode("ask")}
          className={cn(
            "flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-foreground focus:bg-muted/50",
            permissionMode === "ask" ? "bg-muted" : "hover:bg-muted/50",
          )}
        >
          <div className="flex items-center gap-2 font-semibold text-xs text-primary">
            <Hand className="w-3.5 h-3.5" />
            Ask before changes
          </div>
          <span className="text-[10px] text-muted-foreground leading-relaxed pl-5.5">
            Ask before file changes or terminal writes.
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSelectPermissionMode("auto_edit")}
          className={cn(
            "flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-foreground mt-0.5 focus:bg-muted/50",
            permissionMode === "auto_edit" ? "bg-muted" : "hover:bg-muted/50",
          )}
        >
          <div className="flex items-center gap-2 font-semibold text-xs text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            Edit automatically
          </div>
          <span className="text-[10px] text-muted-foreground leading-relaxed pl-5.5">
            Auto-allow low/medium risk. Confirm file patches + shell commands.
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSelectPermissionMode("plan_mode")}
          className={cn(
            "flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-foreground mt-0.5 focus:bg-muted/50",
            permissionMode === "plan_mode" ? "bg-muted" : "hover:bg-muted/50",
          )}
        >
          <div className="flex items-center gap-2 font-semibold text-xs text-muted-foreground">
            <FileText className="w-3.5 h-3.5" />
            Plan mode
          </div>
          <span className="text-[10px] text-muted-foreground leading-relaxed pl-5.5">
            Read-only. Planning phase only. Write/terminal blocked.
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSelectPermissionMode("yolo")}
          className={cn(
            "flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-foreground mt-0.5 focus:bg-muted/50",
            permissionMode === "yolo" ? "bg-muted" : "hover:bg-muted/50",
          )}
        >
          <div className="flex items-center gap-2 font-semibold text-xs text-rose-400">
            <ShieldAlert className="w-3.5 h-3.5" />
            Full access
          </div>
          <span className="text-[10px] text-muted-foreground leading-relaxed pl-5.5">
            YOLO. All tools execute automatically without prompts.
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PermissionModeMenu;
