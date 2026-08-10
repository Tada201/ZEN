import { useSettingsStore } from "./stores/useSettingsStore";

export const motionDurations = {
  fast: 0.16,
  standard: 0.24,
  surface: 0.32,
  shared: 0.72,
} as const;

export const motionEasings = {
  standard: [0.2, 0, 0, 1] as const,
  shared: [0.22, 1, 0.36, 1] as const,
} as const;

export const motionCssEasings = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  shared: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

/** Shared entrance choreography for transient execution surfaces. */
export const executionCardMotion = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
} as const;

/**
 * The single motion policy used by every animation consumer.
 *
 * Motion is deliberately controlled by the app preference only. The product
 * owns this decision so the welcome screen, loaders, transitions, and chat
 * effects remain predictable across environments.
 */
export function useReducedMotion(): boolean {
  const animationsEnabled = useSettingsStore((state) => state.animationsEnabled);
  return !animationsEnabled;
}

export function useAnimationsEnabled(): boolean {
  return useSettingsStore((state) => state.animationsEnabled);
}
