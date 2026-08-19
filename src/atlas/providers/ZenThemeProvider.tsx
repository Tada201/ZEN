
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { ACCENT_SWATCHES, normalizeThemeId, RADIUS_PRESETS, THEME_PRESETS, type RadiusPreset, type StyleMode } from "../theme";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";
import { useReducedMotion } from "@/lib/motion";

export type Density = "compact" | "cozy";

export type ThemeState = {
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
  motionEnabled: boolean;
  setMotionEnabled: (b: boolean) => void;
  density: Density;
  setDensity: (d: Density) => void;
  exportCSS: () => string;
  resetPreferences: () => void;
};

const Ctx = createContext<ThemeState | null>(null);
const DENSITY_STORAGE_KEY = "ui-Zen-density";

function applyThemeVariables(vars: Record<string, string>) {
  const root = document.documentElement;
  // Tailwind utilities at these via `hsl(var(--token))`, so writing here flips
  // both `hsl(var(--token))` references AND Tailwind utility classes (bg-background,
  // text-foreground, border-border, ...) at runtime. No duplicate --color-* writes
  // are needed — the @theme pointers handle that bridge.
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  // Contrast foreground for the primary fill. A light primary (grayscale OLED
  // theme uses --primary ≈ 0 0% 98%) needs a dark label or a primary button
  // renders white-on-white. Derive from the primary's lightness.
  const primaryL = Number.parseFloat(vars["--primary"]?.split(" ")[2] ?? "0");
  const primaryFg = primaryL >= 55 ? "0 0% 6%" : "0 0% 100%";
  // Semantic aliases for tokens the presets don't define explicitly. These map
  // to existing preset values so components can rely on a complete token set.
  const aliases: Record<string, string | undefined> = {
    "--popover": vars["--card"],
    "--popover-foreground": vars["--foreground"],
    "--accent": vars["--muted"],
    "--accent-foreground": vars["--foreground"],
    "--sidebar": vars["--card"],
    "--sidebar-foreground": vars["--foreground"],
    "--sidebar-border": vars["--border"],
    "--sidebar-accent": vars["--muted"],
    "--sidebar-accent-foreground": vars["--foreground"],
    "--sidebar-primary": vars["--primary"],
    "--sidebar-ring": vars["--ring"],
    "--primary-foreground": primaryFg,
    "--destructive-foreground": "0 0% 100%",
    "--success-foreground": "0 0% 100%",
    "--warning-foreground": "0 0% 100%",
  };
  Object.entries(aliases).forEach(([key, value]) => {
    if (value) root.style.setProperty(key, value);
  });
}

function getInitialDensity(): Density {
  if (typeof window === "undefined") return "cozy";
  const stored = localStorage.getItem(DENSITY_STORAGE_KEY);
  return stored === "compact" || stored === "cozy" ? stored : "cozy";
}

export function ZenThemeProvider({ children }: { children: ReactNode }) {
  const configuredThemeId = useSettingsStore((state) => state.themeId);
  const configuredCompactMode = useSettingsStore((state) => state.compactMode);
  const configuredAccentHsl = useSettingsStore((state) => state.accentHsl);
  const configuredAccentGlow = useSettingsStore((state) => state.accentGlow);
  const configuredRadiusPreset = useSettingsStore((state) => state.radiusPreset);
  const configuredStyleMode = useSettingsStore((state) => state.styleMode);
  const animationsEnabled = useSettingsStore((state) => state.animationsEnabled);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const [mode, setModeState] = useState<"light" | "dark">("dark");
  const [preset, setPreset] = useState("default-dark");
  const [accent, setAccentState] = useState(ACCENT_SWATCHES[0].hsl);
  const [accentGlow, setAccentGlow] = useState(ACCENT_SWATCHES[0].glow);
  const [radius, setRadiusState] = useState<RadiusPreset>("smooth");
  const [styleMode, setStyleModeState] = useState<StyleMode>("subtle");
  const [density, setDensityState] = useState<Density>(getInitialDensity);
  const [systemMode, setSystemMode] = useState<"light" | "dark">("dark");
  const shouldReduceMotion = useReducedMotion();
  const motionEnabled = animationsEnabled;

  // Track OS prefers-color-scheme media matches
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemMode(e.matches ? "dark" : "light");
    };
    setSystemMode(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Synchronize compactMode setting to document density dataset
  useEffect(() => {
    if (configuredCompactMode !== undefined) {
      setDensity(configuredCompactMode ? "compact" : "cozy");
    }
  }, [configuredCompactMode]);

  const setMotionEnabled = useCallback((b: boolean) => {
    updateSetting("animationsEnabled", b);
  }, [updateSetting]);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    localStorage.setItem(DENSITY_STORAGE_KEY, d);
    document.documentElement.dataset.density = d;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = motionEnabled ? "on" : "off";
    document.documentElement.dataset.density = density;
  }, [motionEnabled, density]);

  const resetPreferences = useCallback(() => {
    setMotionEnabled(true);
    setDensity("cozy");
  }, [setMotionEnabled, setDensity]);

  const setMode = useCallback((m: "light" | "dark") => {
    setModeState(m);
    document.documentElement.classList.toggle("dark", m === "dark");
  }, []);

  const applyPreset = useCallback((id: string) => {
    const resolvedId = id === "system"
      ? (systemMode === "dark" ? "default-dark" : "default-light")
      : normalizeThemeId(id);
    const p = THEME_PRESETS.find((theme) => theme.id === resolvedId) ?? THEME_PRESETS[0];
    setPreset(id);
    setMode(p.mode);
    const root = document.documentElement;
    applyThemeVariables(p.vars);
    root.dataset.theme = id; // Store system in data-theme so CSS can inspect it
    root.dataset.vibe = p.vibe ?? "standard";
    root.dataset.themeFont = p.font ?? "sans";

    const nextRadius = configuredRadiusPreset || p.radius;
    if (nextRadius) {
      setRadiusState(nextRadius);
      root.style.setProperty("--radius", RADIUS_PRESETS[nextRadius]);
    }

    if (p.density) {
      setDensity(p.density);
    }

    const nextAccent = configuredAccentHsl || p.vars["--primary"];
    const nextGlow = configuredAccentGlow || p.vars["--primary-glow"] || nextAccent;
    if (nextAccent) {
      setAccentState(nextAccent);
      setAccentGlow(nextGlow);
      root.style.setProperty("--primary", nextAccent);
      root.style.setProperty("--primary-glow", nextGlow);
      root.style.setProperty("--ring", nextAccent);
      root.style.setProperty("--sidebar-primary", nextAccent);
      root.style.setProperty("--sidebar-ring", nextAccent);
      const l = Number.parseFloat(nextAccent.split(" ")[2] ?? "0");
      root.style.setProperty("--primary-foreground", l >= 55 ? "0 0% 6%" : "0 0% 100%");
    }

    const nextStyleMode = configuredStyleMode || "subtle";
    setStyleModeState(nextStyleMode);
    root.dataset.style = nextStyleMode;
  }, [configuredAccentGlow, configuredAccentHsl, configuredRadiusPreset, configuredStyleMode, setDensity, setMode, systemMode]);

  const setAccent = useCallback((hsl: string, glow: string) => {
    setAccentState(hsl);
    setAccentGlow(glow);
    updateSetting({ accentHsl: hsl, accentGlow: glow });
    const root = document.documentElement;
    root.style.setProperty("--primary", hsl);
    root.style.setProperty("--primary-glow", glow);
    root.style.setProperty("--ring", hsl);
    root.style.setProperty("--sidebar-primary", hsl);
    root.style.setProperty("--sidebar-ring", hsl);
    const l = Number.parseFloat(hsl.split(" ")[2] ?? "0");
    root.style.setProperty("--primary-foreground", l >= 55 ? "0 0% 6%" : "0 0% 100%");
  }, [updateSetting]);

  const setRadius = useCallback((r: RadiusPreset) => {
    setRadiusState(r);
    updateSetting({ radiusPreset: r });
    document.documentElement.style.setProperty("--radius", RADIUS_PRESETS[r]);
  }, [updateSetting]);

  const setStyleMode = useCallback((s: StyleMode) => {
    setStyleModeState(s);
    updateSetting({ styleMode: s });
    document.documentElement.dataset.style = s;
  }, [updateSetting]);

  useEffect(() => {
    applyPreset(configuredThemeId || "default-dark");
  }, [applyPreset, configuredThemeId]);

  // Re-apply theme variables when system light/dark mode transitions
  useEffect(() => {
    if (preset === "system") {
      applyPreset("system");
    }
  }, [systemMode, preset, applyPreset]);

  const exportCSS = useCallback(() => {
    const root = document.documentElement;
    const keys = [
      "--background", "--foreground", "--card", "--muted", "--muted-foreground",
      "--border", "--border-strong", "--primary", "--primary-glow", "--ring", "--radius",
    ];
    const lines = keys.map((k) => `  ${k}: ${getComputedStyle(root).getPropertyValue(k).trim()};`);
    return ":root {\n" + lines.join("\n") + "\n}";
  }, []);

  const value = useMemo<ThemeState>(() => ({
    mode, setMode, preset, applyPreset, accent, accentGlow, setAccent,
    radius, setRadius, styleMode, setStyleMode,
    motionEnabled, setMotionEnabled,
    density, setDensity, exportCSS, resetPreferences,
  }), [mode, setMode, preset, applyPreset, accent, accentGlow, setAccent, radius, setRadius, styleMode, setStyleMode, motionEnabled, setMotionEnabled, density, setDensity, exportCSS, resetPreferences]);

  return (
    <MotionConfig reducedMotion={shouldReduceMotion ? "always" : "never"}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </MotionConfig>
  );
}

export function useZenTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useZenTheme must be used inside ZenThemeProvider");
  return v;
}

