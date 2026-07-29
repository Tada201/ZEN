import { useEffect, useState } from "react";

/**
 * Detects the user's `prefers-reduced-motion` preference.
 *
 * Returns `true` when the user has requested reduced motion. This should be
 * respected by any component that runs entrance, hover, or ambient
 * animations.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return reducedMotion;
}
