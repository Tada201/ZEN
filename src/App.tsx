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



