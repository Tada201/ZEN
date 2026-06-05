import { useEffect } from "react";
import { listenAppEvent } from "@/api/events";
import { useSessionStore } from "@/lib/stores/sessionStore";
import { useUIStore } from "@/lib/stores/useUIStore";

export function useGraphSessionEvents() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      const unlistenFeedback = await listenAppEvent("graph:session:feedback", (event) => {
        useSessionStore.getState().applyFeedback(event.payload);
        const ui = useUIStore.getState();
        ui.setActiveRightTab("drawing");
        ui.setRightPanelCanvasMode("mathplot");
        ui.setRightPanelOpen(true);
      });

      const unlistenVision = await listenAppEvent("graph:session:vision_capture", () => {
        const ui = useUIStore.getState();
        ui.setActiveRightTab("drawing");
        ui.setRightPanelCanvasMode("mathplot");
        ui.setRightPanelOpen(true);
      });

      cleanup = () => {
        unlistenFeedback();
        unlistenVision();
      };
    };

    void setup();

    return () => {
      cleanup?.();
    };
  }, []);
}
