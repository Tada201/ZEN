import { useSettingsStore } from "./stores/useSettingsStore";

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
