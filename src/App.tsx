import { ZenProvider } from "./atlas/ZenContext";
import { WorkspaceApp } from "./atlas/sections/WorkspaceSection";
import { Toaster } from "sonner";

/**
 * Root Application Component.
 * Assembles the Integrated Workbench Shell using Zen.
 */
function App() {
  return (
    <ZenProvider>
      <WorkspaceApp />
      <Toaster position="bottom-right" richColors theme="dark" />
    </ZenProvider>
  );
}

export default App;


