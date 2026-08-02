/**
 * User-facing execution modes and their canonical settings projection.
 *
 * The string mode is the backend policy source of truth. The three legacy
 * fields remain part of the projection while older tool paths still read them.
 * UI surfaces should consume this module rather than defining their own mode
 * labels, descriptions, or mapping rules.
 */

export type SafetyMode = "plan_mode" | "ask" | "auto_edit" | "yolo";

export type SafetyModeTone = "neutral" | "primary" | "success" | "warning";

export interface SafetyModeDefinition {
  id: SafetyMode;
  label: string;
  description: string;
  detail: string;
  icon: "file-text" | "hand" | "shield-check" | "shield-alert";
  tone: SafetyModeTone;
}

export interface SafetyModeSettings {
  toolPermissionMode: SafetyMode;
  toolYoloMode: boolean;
  toolAutoApproveLowRisk: boolean;
  toolGlobalDefault: "confirm" | "always_allow" | "always_deny";
}

export const SAFETY_MODE_SETTING_KEYS = {
  toolPermissionMode: "tools.permission-mode",
  toolYoloMode: "tools.yolo-mode",
  toolAutoApproveLowRisk: "tools.auto-approve-low-risk",
  toolGlobalDefault: "tools.global-default",
} as const;

export const SAFETY_MODE_DEFINITIONS: readonly SafetyModeDefinition[] = [
  {
    id: "plan_mode",
    label: "Plan mode",
    description: "Plan before editing. Disallows file modifications and terminal commands.",
    detail: "Read-only access, safest mode for analyzing code.",
    icon: "file-text",
    tone: "neutral",
  },
  {
    id: "ask",
    label: "Ask before changes",
    description: "Confirm file changes and commands before execution.",
    detail: "Ask before file edits or terminal writes.",
    icon: "hand",
    tone: "primary",
  },
  {
    id: "auto_edit",
    label: "Edit automatically",
    description: "Auto-allow low/medium risk. Ask before high-impact changes.",
    detail: "Low/medium risk runs automatically; writes and shell prompt.",
    icon: "shield-check",
    tone: "success",
  },
  {
    id: "yolo",
    label: "Full access",
    description: "Run permitted tools and scripts without confirmation.",
    detail: "Use only in a trusted workspace; hard security blocks still apply.",
    icon: "shield-alert",
    tone: "warning",
  },
] as const;

export function isSafetyMode(value: unknown): value is SafetyMode {
  return SAFETY_MODE_DEFINITIONS.some((mode) => mode.id === value);
}

export function getSafetyModeDefinition(value: unknown): SafetyModeDefinition {
  return (
    SAFETY_MODE_DEFINITIONS.find((mode) => mode.id === value) ??
    SAFETY_MODE_DEFINITIONS.find((mode) => mode.id === "ask")!
  );
}

/** Return the complete settings projection required by the backend policy. */
export function getSafetyModeSettings(mode: SafetyMode): SafetyModeSettings {
  switch (mode) {
    case "yolo":
      return {
        toolPermissionMode: mode,
        toolYoloMode: true,
        toolAutoApproveLowRisk: true,
        toolGlobalDefault: "always_allow",
      };
    case "auto_edit":
      return {
        toolPermissionMode: mode,
        toolYoloMode: false,
        toolAutoApproveLowRisk: true,
        toolGlobalDefault: "confirm",
      };
    case "plan_mode":
      return {
        toolPermissionMode: mode,
        toolYoloMode: false,
        toolAutoApproveLowRisk: true,
        toolGlobalDefault: "confirm",
      };
    case "ask":
    default:
      return {
        toolPermissionMode: "ask",
        toolYoloMode: false,
        toolAutoApproveLowRisk: false,
        toolGlobalDefault: "confirm",
      };
  }
}

/** Return the projection as the flat keys used by the settings tab bridge. */
export function getSafetyModeSettingEntries(mode: SafetyMode): Array<[string, string]> {
  const settings = getSafetyModeSettings(mode);
  return (Object.keys(SAFETY_MODE_SETTING_KEYS) as Array<keyof SafetyModeSettings>).map((field) => [
    SAFETY_MODE_SETTING_KEYS[field],
    String(settings[field]),
  ]);
}

export const SAFETY_MODE_TONE_CLASSES: Record<SafetyModeTone, string> = {
  neutral: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
};
