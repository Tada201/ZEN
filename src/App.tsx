import { ZenProvider } from "./atlas/ZenContext";
import { WorkspaceApp } from "./atlas/sections/WorkspaceSection";
import { Toaster } from "sonner";
import { useGlobalStreamListener } from "./atlas/hooks/useGlobalStreamListener";

/**
 * Root Application Component.
 * Assembles the Integrated Workbench Shell using Zen.
 */
function App() {
  // Mount the global Tauri event listeners so they survive chat session transitions
  useGlobalStreamListener();

  return (
    <ZenProvider>
      <WorkspaceApp />
      <Toaster position="bottom-right" richColors theme="dark" />
    </ZenProvider>
  );
}

export default App;


