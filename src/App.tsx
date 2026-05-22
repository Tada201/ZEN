import { useEffect } from "react";
import { useUIStore } from "./lib/stores/useUIStore";
import { ZenProvider } from "./atlas/ZenContext";
import { WorkspaceApp } from "./atlas/sections/WorkspaceSection";
import { Toaster } from "sonner";
import { useGlobalStreamListener } from "./atlas/hooks/useGlobalStreamListener";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Root Application Component.
 * Assembles the Integrated Workbench Shell using Zen.
 */
function App() {
  // Mount the global Tauri event listeners so they survive chat session transitions
  useGlobalStreamListener();

  // Tick the global app uptime timer every second
  useEffect(() => {
    const timer = setInterval(() => {
      useUIStore.setState((state) => ({ appUptimeSecs: state.appUptimeSecs + 1 }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <ZenProvider>
      <TooltipProvider>
        <WorkspaceApp />
      </TooltipProvider>
      <Toaster position="bottom-right" richColors theme="dark" />
    </ZenProvider>
  );
}

export default App;



