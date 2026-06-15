import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Global F11 fullscreen toggle for the Tauri window.
 * Mount once at the app root — persists across all views.
 */
export function useFullscreen() {
  useEffect(() => {
    const win = getCurrentWindow();

    const handler = async (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        e.stopPropagation();
        try {
          const isFull = await win.isFullscreen();
          await win.setFullscreen(!isFull);
        } catch (err) {
          console.error("[useFullscreen] toggle failed:", err);
        }
      }
    };

    // Use capture phase to intercept before anything else
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);
}
