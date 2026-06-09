import { useEffect } from "react";
import { listenAppEvent } from "@/api/events";
import { useSessionStore } from "@/lib/stores/sessionStore";
import { useUIStore } from "@/lib/stores/useUIStore";

export function useGraphSessionEvents() {
  useEffect(() => {
    let mounted = true;
    let unlistenFeedback: (() => void) | undefined;
    let unlistenVision: (() => void) | undefined;
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      unlistenFeedback = await listenAppEvent("graph:session:feedback", (event) => {
        useSessionStore.getState().applyFeedback(event.payload);
        const ui = useUIStore.getState();
        ui.setActiveRightTab("drawing");
        ui.setRightPanelCanvasMode("mathplot");
        ui.setRightPanelOpen(true);
      });

      if (!mounted) {
        unlistenFeedback();
        unlistenFeedback = undefined;
        return;
      }

      unlistenVision = await listenAppEvent("graph:session:vision_capture", () => {
        const ui = useUIStore.getState();
        ui.setActiveRightTab("drawing");
        ui.setRightPanelCanvasMode("mathplot");
        ui.setRightPanelOpen(true);
      });

      cleanup = () => {
        unlistenFeedback?.();
        unlistenVision?.();
        unlistenFeedback = undefined;
        unlistenVision = undefined;
      };
      if (!mounted) cleanup();
    };

    void setup();

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, []);
}
