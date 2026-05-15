export type InspectorSelection = {
  id: string;
  name: string;
  category: string;
  variants: string[];
  jsx: string;
};

export type ThemePreset = {
  id: string;
  name: string;
  mode: "light" | "dark";
  vars: Record<string, string>;
};

export const RADIUS_PRESETS = {
  sharp: "0rem",
  smooth: "0.5rem",
  round: "0.875rem",
  pill: "1.5rem",
} as const;

export type RadiusPreset = keyof typeof RADIUS_PRESETS;
export type StyleMode = "flat" | "subtle" | "bordered" | "glass";

export const ACCENT_SWATCHES: { name: string; hsl: string; glow: string }[] = [
  { name: "Violet", hsl: "262 83% 58%", glow: "280 90% 70%" },
  { name: "Indigo", hsl: "239 84% 60%", glow: "250 90% 72%" },
  { name: "Emerald", hsl: "160 84% 39%", glow: "152 76% 50%" },
  { name: "Rose", hsl: "346 77% 50%", glow: "340 90% 65%" },
  { name: "Amber", hsl: "32 95% 50%", glow: "42 95% 60%" },
  { name: "Sky", hsl: "199 89% 48%", glow: "190 90% 60%" },
  { name: "Slate", hsl: "222 47% 25%", glow: "222 30% 40%" },
];

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "default-dark",
    name: "Default Dark",
    mode: "dark",
    vars: {
      "--background": "240 10% 6%",
      "--foreground": "0 0% 98%",
      "--card": "240 8% 9%",
      "--muted": "240 6% 14%",
      "--muted-foreground": "240 5% 64%",
      "--border": "240 6% 18%",
      "--border-strong": "240 6% 28%",
      "--primary": "262 83% 65%",
      "--primary-glow": "280 90% 75%",
      "--ring": "262 83% 65%",
    },
  },
  {
    id: "default-light",
    name: "Default Light",
    mode: "light",
    vars: {
      "--background": "0 0% 100%",
      "--foreground": "240 10% 8%",
      "--card": "0 0% 100%",
      "--muted": "240 5% 96%",
      "--muted-foreground": "240 4% 46%",
      "--border": "240 6% 90%",
      "--border-strong": "240 6% 80%",
      "--primary": "262 83% 58%",
      "--primary-glow": "280 90% 70%",
      "--ring": "262 83% 58%",
    },
  },
  {
    id: "ocean-depth",
    name: "Ocean Depth",
    mode: "dark",
    vars: {
      "--background": "215 50% 8%",
      "--foreground": "200 30% 96%",
      "--card": "215 40% 11%",
      "--muted": "215 30% 16%",
      "--muted-foreground": "210 20% 65%",
      "--border": "215 30% 20%",
      "--border-strong": "215 30% 30%",
      "--primary": "199 89% 55%",
      "--primary-glow": "186 95% 60%",
      "--ring": "199 89% 55%",
    },
  },
  {
    id: "rose-garden",
    name: "Rose Garden",
    mode: "light",
    vars: {
      "--background": "350 50% 99%",
      "--foreground": "340 30% 12%",
      "--card": "0 0% 100%",
      "--muted": "350 40% 96%",
      "--muted-foreground": "340 10% 45%",
      "--border": "350 30% 90%",
      "--border-strong": "350 30% 80%",
      "--primary": "346 77% 50%",
      "--primary-glow": "340 90% 65%",
      "--ring": "346 77% 50%",
    },
  },
  {
    id: "forest-canopy",
    name: "Forest Canopy",
    mode: "dark",
    vars: {
      "--background": "150 25% 7%",
      "--foreground": "140 20% 95%",
      "--card": "150 20% 10%",
      "--muted": "150 15% 15%",
      "--muted-foreground": "140 10% 65%",
      "--border": "150 15% 19%",
      "--border-strong": "150 15% 28%",
      "--primary": "152 76% 45%",
      "--primary-glow": "168 76% 55%",
      "--ring": "152 76% 45%",
    },
  },
  {
    id: "warm-earth",
    name: "Warm Earth",
    mode: "dark",
    vars: {
      "--background": "25 30% 8%",
      "--foreground": "30 20% 95%",
      "--card": "25 25% 11%",
      "--muted": "25 20% 16%",
      "--muted-foreground": "30 15% 65%",
      "--border": "25 20% 20%",
      "--border-strong": "25 20% 30%",
      "--primary": "28 85% 55%",
      "--primary-glow": "35 90% 65%",
      "--ring": "28 85% 55%",
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    mode: "dark",
    vars: {
      "--background": "260 40% 6%",
      "--foreground": "280 30% 96%",
      "--card": "260 35% 9%",
      "--muted": "260 30% 14%",
      "--muted-foreground": "280 20% 65%",
      "--border": "260 30% 20%",
      "--border-strong": "260 30% 30%",
      "--primary": "320 100% 60%",
      "--primary-glow": "280 100% 70%",
      "--ring": "320 100% 60%",
    },
  },
  {
    id: "startup-fresh",
    name: "Startup Fresh",
    mode: "light",
    vars: {
      "--background": "210 40% 98%",
      "--foreground": "210 30% 12%",
      "--card": "0 0% 100%",
      "--muted": "210 30% 96%",
      "--muted-foreground": "210 15% 45%",
      "--border": "210 20% 90%",
      "--border-strong": "210 20% 80%",
      "--primary": "210 100% 50%",
      "--primary-glow": "190 100% 60%",
      "--ring": "210 100% 50%",
    },
  },
  {
    id: "corporate-navy",
    name: "Corporate Navy",
    mode: "light",
    vars: {
      "--background": "220 20% 98%",
      "--foreground": "220 30% 12%",
      "--card": "0 0% 100%",
      "--muted": "220 15% 96%",
      "--muted-foreground": "220 10% 45%",
      "--border": "220 15% 90%",
      "--border-strong": "220 15% 80%",
      "--primary": "220 60% 35%",
      "--primary-glow": "210 50% 50%",
      "--ring": "220 60% 35%",
    },
  },
  {
    id: "minimal-mono",
    name: "Minimal Mono",
    mode: "light",
    vars: {
      "--background": "0 0% 100%",
      "--foreground": "0 0% 8%",
      "--card": "0 0% 100%",
      "--muted": "0 0% 96%",
      "--muted-foreground": "0 0% 45%",
      "--border": "0 0% 90%",
      "--border-strong": "0 0% 78%",
      "--primary": "0 0% 12%",
      "--primary-glow": "0 0% 30%",
      "--ring": "0 0% 12%",
    },
  },
];
