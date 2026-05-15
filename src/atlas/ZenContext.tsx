
import { useMemo } from "react";
import type { ReactNode } from "react";
import { ZenThemeProvider, useZenTheme } from "./providers/ZenThemeProvider";
import { UIStateProvider, useUIState } from "./providers/UIStateProvider";
import { InspectorProvider, useInspector } from "./providers/InspectorProvider";
import type { RadiusPreset, StyleMode, InspectorSelection } from "./theme";

export type ViewMode = "list" | "page";

export type ZenState = {
  mode: "light" | "dark";
  setMode: (m: "light" | "dark") => void;
  preset: string;
  applyPreset: (id: string) => void;
  accent: string;
  accentGlow: string;
  setAccent: (hsl: string, glow: string) => void;
  radius: RadiusPreset;
  setRadius: (r: RadiusPreset) => void;
  styleMode: StyleMode;
  setStyleMode: (s: StyleMode) => void;
  selection: InspectorSelection | null;
  select: (s: InspectorSelection | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (b: boolean) => void;
  exportCSS: () => string;
  motionEnabled: boolean;
  setMotionEnabled: (b: boolean) => void;
  liveLabOpen: boolean;
  setLiveLabOpen: (b: boolean) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  activePage: string;
  setActivePage: (id: string) => void;
  renderCount: number;
};

export function ZenProvider({ children }: { children: ReactNode }) {
  return (
    <ZenThemeProvider>
      <UIStateProvider>
        <InspectorProvider>
          {children}
        </InspectorProvider>
      </UIStateProvider>
    </ZenThemeProvider>
  );
}

export function useZen(): ZenState {
  const theme = useZenTheme();
  const ui = useUIState();
  const inspector = useInspector();

  return useMemo<ZenState>(() => ({
    mode: theme.mode,
    setMode: theme.setMode,
    preset: theme.preset,
    applyPreset: theme.applyPreset,
    accent: theme.accent,
    accentGlow: theme.accentGlow,
    setAccent: theme.setAccent,
    radius: theme.radius,
    setRadius: theme.setRadius,
    styleMode: theme.styleMode,
    setStyleMode: theme.setStyleMode,
    selection: ui.selection,
    select: ui.select,
    paletteOpen: ui.paletteOpen,
    setPaletteOpen: ui.setPaletteOpen,
    exportCSS: theme.exportCSS,
    motionEnabled: theme.motionEnabled,
    setMotionEnabled: theme.setMotionEnabled,
    liveLabOpen: inspector.liveLabOpen,
    setLiveLabOpen: inspector.setLiveLabOpen,
    viewMode: ui.viewMode,
    setViewMode: ui.setViewMode,
    activePage: ui.activePage,
    setActivePage: ui.setActivePage,
    renderCount: inspector.renderCount,
  }), [theme, ui, inspector]);
}

// Re-export atomic hooks for direct consumption
export { useZenTheme } from "./providers/ZenThemeProvider";
export { useUIState } from "./providers/UIStateProvider";
export { useInspector } from "./providers/InspectorProvider";

