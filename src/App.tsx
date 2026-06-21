import { useEffect, useState } from "react";
import { ZenProvider } from "./atlas/ZenContext";
import { WorkspaceApp } from "./atlas/sections/WorkspaceSection";
import { Toaster } from "sonner";
import { useGlobalStreamListener } from "./atlas/hooks/useGlobalStreamListener";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BootScreen } from "./components/BootScreen";
import { useFullscreen } from "./lib/hooks/useFullscreen";
import { useUpdateStore } from "./lib/stores/updateStore";

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
