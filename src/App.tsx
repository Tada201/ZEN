import { Component, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { ZenProvider } from "./atlas/ZenContext";
import { Toaster } from "sonner";
import { useGlobalStreamListener } from "./atlas/hooks/useGlobalStreamListener";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useFullscreen } from "./lib/hooks/useFullscreen";
import { useUpdateStore } from "./lib/stores/updateStore";
import { useGTSMStore } from "./lib/stores/useGTSMStore";
import { BootScreen } from "./components/bootscreen";

import { WorkspaceApp } from "./atlas/sections/WorkspaceSection";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[App] Uncaught render error:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#0d0d11] text-zinc-400">
          <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
            <span className="text-zinc-600 text-xs font-mono uppercase tracking-widest">FATAL SYSTEM PANIC</span>
            <p className="text-sm font-sans tracking-wide text-zinc-300">
              An unrecoverable exception occurred in Zen UI.
            </p>
            <pre className="p-4 bg-black/40 rounded border border-white/[0.04] text-[10px] font-mono text-zinc-500 overflow-auto w-full max-h-[160px] text-left">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="px-4 py-2 text-xs uppercase tracking-widest border border-zinc-700 rounded hover:bg-zinc-800 transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <ErrorBoundary>
      <ZenProvider>
        <TooltipProvider>
          {!bootFinished && <BootScreen onComplete={() => setBootFinished(true)} />}
          <Suspense fallback={<div className="fixed inset-0 bg-[#0d0d11]" />}>
            <WorkspaceApp />
          </Suspense>
        </TooltipProvider>
        <Toaster position="bottom-right" richColors theme="dark" />
      </ZenProvider>
    </ErrorBoundary>
  );
}

export default App;
