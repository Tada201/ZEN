import { useEffect } from "react";
import { IS_TAURI } from "@/api/tauriClient";

/**
 * Global F11 fullscreen toggle for the Tauri window.
 * Mount once at the app root — persists across all views.
 */
export function useFullscreen() {
  useEffect(() => {
    if (!IS_TAURI) return;

    // Dynamic import so the module-level getCurrentWindow() call
    // doesn't execute when IS_TAURI is false.
    let cleanup: (() => void) | undefined;

    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
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
      cleanup = () => document.removeEventListener("keydown", handler, true);
    }).catch((err) => {
      console.warn("[useFullscreen] Tauri window API unavailable:", err);
    });

    return () => cleanup?.();
  }, []);
}

