import { useCallback, useEffect, useState } from "react";

const LS_KEY = "zen_pinned_actions";
const DEFAULT: string[] = ["thinking"];
const MAX_PINS = 3;

/**
 * `usePinnedActions` — owns the array of pinned action IDs rendered
 * in the footer pinned bar. Persisted to `localStorage` so the user's
 * pin order survives reloads. Capped at 3 entries; when the user
 * pins a 4th, the oldest rotates out to preserve the most recent
 * picks.
 *
 * Carved out of `PremiumChatInput.tsx` so the composer stays well
 * under the 350-line warning limit.
 */

function safeReadLs(): string[] {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return DEFAULT;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? (parsed as string[]) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function usePinnedActions(): readonly [
  string[],
  (id: string) => void,
] {
  const [pinned, setPinned] = useState<string[]>(safeReadLs);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(pinned));
  }, [pinned]);

  const toggle = useCallback((id: string) => {
    setPinned((prev) => {
      if (prev.includes(id)) return prev.filter((a) => a !== id);
      if (prev.length >= MAX_PINS) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }, []);

  return [pinned, toggle] as const;
}

export default usePinnedActions;
