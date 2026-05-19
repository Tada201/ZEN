import type { StateCreator } from "zustand";
import type { SettingsState, InterfaceSlice } from "./types";
import { DEFAULT_WIDGET_SETTINGS } from "./types";

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
  backgroundImageUrl: "",
  backgroundOpacity: 0.15,
  backgroundBlur: 0,

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

  setBackgroundImageUrl: (url: string) => {
    get().updateSetting("backgroundImageUrl", url);
  },

  setBackgroundOpacity: (opacity: number) => {
    get().updateSetting("backgroundOpacity", opacity);
  },

  setBackgroundBlur: (blur: number) => {
    get().updateSetting("backgroundBlur", blur);
  },
});
