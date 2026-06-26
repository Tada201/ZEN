import { useEffect, useState } from "react";
import { ZenProvider } from "./atlas/ZenContext";
import { WorkspaceApp } from "./atlas/sections/WorkspaceSection";
import { Toaster } from "sonner";
import { useGlobalStreamListener } from "./atlas/hooks/useGlobalStreamListener";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BootScreen } from "./components/bootscreen";
import { useFullscreen } from "./lib/hooks/useFullscreen";
import { useUpdateStore } from "./lib/stores/updateStore";
import { useGTSMStore } from "./lib/stores/useGTSMStore";

/**
 * Root Application Component.
 * Assembles the Integrated Workbench Shell using Zen.
 */
function App() {
  const [bootFinished, setBootFinished] = useState(false);
  const initializeVersion = useUpdateStore((state) => state.init);

  // Mount the global Tauri event listeners so they survive chat session transitions
  useGlobalStreamListener();
  useFullscreen();

  useEffect(() => {
    void initializeVersion();
  }, [initializeVersion]);

  // Ctrl+B / Cmd+B → toggle FavoritesPanel visibility
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        useGTSMStore.getState().togglePanel("favorites");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <ZenProvider>
      <TooltipProvider>
        {!bootFinished && <BootScreen onComplete={() => setBootFinished(true)} />}
        <WorkspaceApp />
      </TooltipProvider>
      <Toaster position="bottom-right" richColors theme="dark" />
    </ZenProvider>
  );
}

export default App;
