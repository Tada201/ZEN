/**
 * `PermissionModeMenu` — the execution-mode selector in the chat composer.
 *
 * The mode registry owns user-facing copy and the settings projection. This
 * component only handles interaction, confirmation, and presentation.
 */

import { useCallback, useMemo, type ComponentType } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/style";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import {
  getSafetyModeDefinition,
  getSafetyModeSettings,
  isSafetyMode,
  SAFETY_MODE_DEFINITIONS,
  SAFETY_MODE_TONE_CLASSES,
  type SafetyMode,
} from "@/lib/constants/permissionModes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  FileText,
  Hand,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

const MODE_ICONS: Record<SafetyMode, ComponentType<{ className?: string }>> = {
  ask: Hand,
  auto_edit: ShieldCheck,
  plan_mode: FileText,
  yolo: ShieldAlert,
};

export const PermissionModeMenu = () => {
  const permissionMode = useSettingsStore((state) =>
    isSafetyMode(state.toolPermissionMode) ? state.toolPermissionMode : "ask",
  );
  const info = useMemo(() => getSafetyModeDefinition(permissionMode), [permissionMode]);
  const ActiveIcon = MODE_ICONS[info.id];

  const handleSelectPermissionMode = useCallback(async (mode: SafetyMode) => {
    if (mode === "yolo") {
      const confirmed = window.confirm(
        "Enable Full Access? Permitted tools will execute without confirmation. Hard security blocks still apply.",
      );
      if (!confirmed) return;
    }

    const store = useSettingsStore.getState();
    const previous = {
      toolPermissionMode: store.toolPermissionMode,
      toolYoloMode: store.toolYoloMode,
      toolAutoApproveLowRisk: store.toolAutoApproveLowRisk,
      toolGlobalDefault: store.toolGlobalDefault,
      activeSettings: store.activeSettings,
      isDirty: store.isDirty,
    };

    try {
      store.batchUpdate(getSafetyModeSettings(mode));
      const { syncFailed } = await store.applyChanges();
      if (syncFailed) {
        useSettingsStore.setState(previous);
        toast.error("Could not sync execution mode; the previous mode was restored.");
        return;
      }
      toast.success(`Execution mode: ${getSafetyModeDefinition(mode).label}`);
    } catch (error) {
      useSettingsStore.setState(previous);
      toast.error("Could not update execution mode; the previous mode was restored.");
      console.warn("[PermissionModeMenu] Failed to update permission mode:", error);
    }
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Execution mode: ${info.label}. Open mode options`}
          aria-haspopup="menu"
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs cursor-pointer transition-colors select-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            SAFETY_MODE_TONE_CLASSES[info.tone],
          )}
        >
          <ActiveIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="max-w-28 truncate">{info.label}</span>
          <span className="sr-only">Current execution mode</span>
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        aria-label="Execution mode options"
        className="z-30 w-64 rounded-xl border border-border bg-card p-1 shadow-2xl"
      >
        {SAFETY_MODE_DEFINITIONS.map((mode) => {
          const Icon = MODE_ICONS[mode.id];
          const selected = permissionMode === mode.id;
          return (
            <DropdownMenuItem
              key={mode.id}
              aria-current={selected ? "true" : undefined}
              onClick={() => handleSelectPermissionMode(mode.id)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-foreground transition-colors focus:bg-muted",
                selected ? "bg-muted" : "hover:bg-muted",
              )}
            >
              <div className={cn("flex items-center gap-2 text-xs font-semibold", SAFETY_MODE_TONE_CLASSES[mode.tone])}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {mode.label}
              </div>
              <span className="pl-5 text-[10px] leading-relaxed text-muted-foreground">
                {mode.description}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PermissionModeMenu;
