
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ACCENT_SWATCHES, normalizeThemeId, RADIUS_PRESETS, THEME_PRESETS, type RadiusPreset, type StyleMode } from "../theme";
import { useSettingsStore } from "@/lib/stores/useSettingsStore";

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
  pressEnabled: boolean;
  setPressEnabled: (b: boolean) => void;
  density: Density;
  setDensity: (d: Density) => void;
  exportCSS: () => string;
  resetPreferences: () => void;
};

const Ctx = createContext<ThemeState | null>(null);
const MOTION_STORAGE_KEY = "ui-Zen-motion-enabled";
const PRESS_STORAGE_KEY = "ui-Zen-press-enabled";
const DENSITY_STORAGE_KEY = "ui-Zen-density";

function applyThemeVariables(vars: Record<string, string>) {
  const root = document.documentElement;
  // Write the raw HSL triples directly. The @theme block in index.css points
  // Tailwind utilities at these via `hsl(var(--token))`, so writing here flips
  // both `hsl(var(--token))` references AND Tailwind utility classes (bg-background,
  // text-foreground, border-border, ...) at runtime. No duplicate --color-* writes
  // are needed — the @theme pointers handle that bridge.
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
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
    "--primary-foreground": "0 0% 100%",
    "--destructive-foreground": "0 0% 100%",
    "--success-foreground": "0 0% 100%",
    "--warning-foreground": "0 0% 100%",
  };
  Object.entries(aliases).forEach(([key, value]) => {
    if (value) root.style.setProperty(key, value);
  });
}

function getInitialMotion(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(MOTION_STORAGE_KEY);
  if (stored !== null) return stored === "true";
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getInitialPress(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(PRESS_STORAGE_KEY);
  if (stored !== null) return stored === "true";
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getInitialDensity(): Density {
  if (typeof window === "undefined") return "cozy";
  const stored = localStorage.getItem(DENSITY_STORAGE_KEY);
  return stored === "compact" || stored === "cozy" ? stored : "cozy";
}

export function ZenThemeProvider({ children }: { children: ReactNode }) {
  const configuredThemeId = useSettingsStore((state) => state.themeId);
  const configuredAccentHsl = useSettingsStore((state) => state.accentHsl);
  const configuredAccentGlow = useSettingsStore((state) => state.accentGlow);
  const configuredRadiusPreset = useSettingsStore((state) => state.radiusPreset);
  const configuredStyleMode = useSettingsStore((state) => state.styleMode);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const [mode, setModeState] = useState<"light" | "dark">("dark");
  const [preset, setPreset] = useState("default-dark");
  const [accent, setAccentState] = useState(ACCENT_SWATCHES[0].hsl);
  const [accentGlow, setAccentGlow] = useState(ACCENT_SWATCHES[0].glow);
  const [radius, setRadiusState] = useState<RadiusPreset>("smooth");
  const [styleMode, setStyleModeState] = useState<StyleMode>("subtle");
  const [motionEnabled, setMotionEnabledState] = useState(getInitialMotion);
  const [pressEnabled, setPressEnabledState] = useState(getInitialPress);
  const [density, setDensityState] = useState<Density>(getInitialDensity);

  const setMotionEnabled = useCallback((b: boolean) => {
    setMotionEnabledState(b);
    localStorage.setItem(MOTION_STORAGE_KEY, String(b));
    document.documentElement.dataset.motion = String(b);
  }, []);

  const setPressEnabled = useCallback((b: boolean) => {
    setPressEnabledState(b);
    localStorage.setItem(PRESS_STORAGE_KEY, String(b));
    document.documentElement.dataset.press = String(b);
  }, []);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    localStorage.setItem(DENSITY_STORAGE_KEY, d);
    document.documentElement.dataset.density = d;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = String(motionEnabled);
    document.documentElement.dataset.press = String(pressEnabled);
    document.documentElement.dataset.density = density;
  }, [motionEnabled, pressEnabled, density]);

  const resetPreferences = useCallback(() => {
    setMotionEnabled(true);
    setPressEnabled(true);
    setDensity("cozy");
  }, [setMotionEnabled, setPressEnabled, setDensity]);

  const setMode = useCallback((m: "light" | "dark") => {
    setModeState(m);
    document.documentElement.classList.toggle("dark", m === "dark");
  }, []);

  const applyPreset = useCallback((id: string) => {
    const resolvedId = normalizeThemeId(id);
    const p = THEME_PRESETS.find((theme) => theme.id === resolvedId) ?? THEME_PRESETS[0];
    setPreset(p.id);
    setMode(p.mode);
    const root = document.documentElement;
    applyThemeVariables(p.vars);
    root.dataset.theme = p.id;
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
    }

    const nextStyleMode = configuredStyleMode || "subtle";
    setStyleModeState(nextStyleMode);
    root.dataset.style = nextStyleMode;
  }, [configuredAccentGlow, configuredAccentHsl, configuredRadiusPreset, configuredStyleMode, setDensity, setMode]);

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
    motionEnabled, setMotionEnabled, pressEnabled, setPressEnabled,
    density, setDensity, exportCSS, resetPreferences,
  }), [mode, setMode, preset, applyPreset, accent, accentGlow, setAccent, radius, setRadius, styleMode, setStyleMode, motionEnabled, setMotionEnabled, pressEnabled, setPressEnabled, density, setDensity, exportCSS, resetPreferences]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useZenTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useZenTheme must be used inside ZenThemeProvider");
  return v;
}

