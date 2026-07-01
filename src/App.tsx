import { Component, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { ZenProvider } from "./atlas/ZenContext";
import { Toaster } from "sonner";
import { useGlobalStreamListener } from "./atlas/hooks/useGlobalStreamListener";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useFullscreen } from "./lib/hooks/useFullscreen";
import { useUpdateStore } from "./lib/stores/updateStore";
import { useGTSMStore } from "./lib/stores/useGTSMStore";
import { useSettingsStore } from "./lib/stores/useSettingsStore";
import { normalizeThemeId } from "./atlas/theme";
import { BootScreen } from "./components/bootscreen";
import { useAppInit } from "./hooks/useAppInit";

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
        <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground">
          <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
            <span className="text-muted-foreground/70 text-xs font-mono uppercase tracking-widest">FATAL SYSTEM PANIC</span>
            <p className="text-sm font-sans tracking-wide text-foreground">
              An unrecoverable exception occurred in Zen UI.
            </p>
            <pre className="p-4 bg-muted/40 rounded border border-border text-[10px] font-mono text-muted-foreground overflow-auto w-full max-h-[160px] text-left">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="px-4 py-2 text-xs uppercase tracking-widest border border-border rounded hover:bg-muted transition-colors"
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
  const themeId = useSettingsStore((state) => state.themeId);
  const toastTheme = ["default-light", "rose-garden", "startup-fresh", "corporate-navy", "minimal-mono"].includes(normalizeThemeId(themeId)) ? "light" : "dark";

  // Mount the global Tauri event listeners so they survive chat session transitions
  useGlobalStreamListener();
  useFullscreen();

  // Run the frontend init hook at App root so it survives BootScreen
  // unmounting. This is the single source of the `setComplete("frontend")`
  // signal that pairs with Rust's `backend_ready` to fire the splash →
  // main handoff. Without this call at the App root, the BootScreen
  // unmounts at its 4.4s reveal boundary and the frontend_ready flag
  // is never set, leaving the splash stuck forever.
  useAppInit();

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
          {bootFinished ? (
            <Suspense fallback={<div className="fixed inset-0 bg-background" />}>
              <WorkspaceApp />
            </Suspense>
          ) : (
            <BootScreen onComplete={() => setBootFinished(true)} />
          )}
        </TooltipProvider>
        <Toaster position="bottom-right" richColors theme={toastTheme} />
      </ZenProvider>
    </ErrorBoundary>
  );
}

export default App;
