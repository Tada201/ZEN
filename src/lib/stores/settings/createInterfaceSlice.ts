import type { StateCreator } from "zustand";
import type { SettingsState } from "./types";
import { DEFAULT_WIDGET_SETTINGS, type WidgetSettings } from "./types";

export interface InterfaceSlice {
  themeId: string;
  customThemeSource: string;
  animationsEnabled: boolean;
  lowResourceMode: boolean;
  bootEnabled: boolean;
  bootDuration: number;
  bootDurationMs: number;
  widgetSettings: WidgetSettings;
  reducedMotion: boolean;
  customCssPath: string;
  customCssEnabled: boolean;
  sidebarPosition: "left" | "right";
  activityBarStyle: "icons" | "icons-text";

  setAnimationsEnabled: (enabled: boolean) => void;
  setLowResourceMode: (enabled: boolean) => void;

  handleWidgetToggle: (widgetId: string) => void;
  handleWidgetReorder: (widgetId: string, direction: "up" | "down") => void;
  handleWidgetReset: () => void;
}

export const createInterfaceSlice: StateCreator<SettingsState, [], [], InterfaceSlice> = (_set, get) => ({
  themeId: "neon-grid",
  customThemeSource: "",
  animationsEnabled: true,
  lowResourceMode: false,
  bootEnabled: true,
  bootDuration: 2500,
  bootDurationMs: 2500,
  widgetSettings: DEFAULT_WIDGET_SETTINGS,
  reducedMotion: false,
  customCssPath: "",
  customCssEnabled: false,
  sidebarPosition: "left",
  activityBarStyle: "icons",

  setAnimationsEnabled: (enabled: boolean) => {
    get().updateSetting("animationsEnabled", enabled);
  },

  setLowResourceMode: (enabled: boolean) => {
    get().updateSetting("lowResourceMode", enabled);
  },

  handleWidgetToggle: (widgetId: string) => {
    const { widgetSettings } = get();
    const enabled = widgetSettings.enabled.includes(widgetId)
      ? widgetSettings.enabled.filter((id) => id !== widgetId)
      : [...widgetSettings.enabled, widgetId];

    get().updateSetting("widgetSettings", {
      ...widgetSettings,
      enabled,
    });
  },

  handleWidgetReorder: (widgetId: string, direction: "up" | "down") => {
    const { widgetSettings } = get();
    const order = [...widgetSettings.order];
    const idx = order.indexOf(widgetId);
    if (idx === -1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= order.length) return;

    [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
    get().updateSetting("widgetSettings", { ...widgetSettings, order });
  },

  handleWidgetReset: () => {
    get().updateSetting("widgetSettings", DEFAULT_WIDGET_SETTINGS);
  },
});
