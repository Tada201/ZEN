import { Minus, PanelLeft, PanelLeftClose, Shrink, Square, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useUIStore } from "@/lib/stores/useUIStore";
// The packaged app icon is the single source of truth for Zen's mark. Importing
// it keeps the title bar in step with the taskbar/installer icon instead of
// pointing at a `public/` copy that has to be kept in sync by hand.
import appIconUrl from "../../../src-tauri/icons/128x128.png";

interface ZenTitleBarProps {
  children?: ReactNode;
}

async function withWindow(action: (window: Awaited<ReturnType<typeof import("@tauri-apps/api/window").getCurrentWindow>>) => Promise<void>) {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await action(getCurrentWindow());
  } catch {
    // The web preview has no native window API. The controls remain visible
    // for visual QA but are intentionally inert outside the Tauri shell.
  }
}

/**
 * `deep` makes the whole bar a drag surface while Tauri's own drag script still
 * lets buttons, links, and inputs inside it take their clicks — matching how a
 * native title bar behaves. Double-click to maximize is handled by the same
 * script, so no local handler is needed.
 */
export function ZenTitleBar({ children }: ZenTitleBarProps = {}) {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const [isMaximized, setIsMaximized] = useState(false);
  const SidebarIcon = sidebarOpen ? PanelLeftClose : PanelLeft;

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const currentWindow = getCurrentWindow();
        const syncMaximized = async () => {
          try {
            const next = await currentWindow.isMaximized();
            if (active) setIsMaximized(next);
          } catch {
            // The browser preview has no native maximize state.
          }
        };

        await syncMaximized();
        unlisten = await currentWindow.onResized(() => void syncMaximized());
      })
      .catch(() => {
        // The browser preview has no native window event bridge.
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const toggleMaximize = () => {
    void withWindow(async (window) => {
      await window.toggleMaximize();
      try {
        setIsMaximized(await window.isMaximized());
      } catch {
        // The resize event will update native state when available.
      }
    });
  };

  return (
    <header
      data-tauri-drag-region="deep"
      className="zen-titlebar flex h-11 shrink-0 items-center border-b border-border bg-card text-foreground select-none"
    >
      {/* The app mark doubles as the sidebar toggle. Hover or keyboard focus
          swaps it for the panel glyph so the action is discoverable without
          spending a second slot in the title bar. */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={`${sidebarOpen ? "Collapse" : "Expand"} sidebar`}
        aria-expanded={sidebarOpen}
        title={`${sidebarOpen ? "Collapse" : "Expand"} sidebar · Ctrl+B`}
        className="group titlebar-control codex-focus relative mx-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted"
      >
        <img
          src={appIconUrl}
          alt=""
          className="h-5 w-5 rounded object-contain transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0 motion-reduce:transition-none"
        />
        <SidebarIcon
          className="absolute h-4 w-4 text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </button>

      <div className="flex h-full min-w-0 flex-1 items-center">
        {children}
      </div>

      <div className="titlebar-controls flex h-full shrink-0 items-center">
        <button type="button" onClick={() => void withWindow((window) => window.minimize())} aria-label="Minimize window" title="Minimize" className="titlebar-control flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground">
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={toggleMaximize}
          aria-label={isMaximized ? "Restore window" : "Maximize window"}
          title={isMaximized ? "Restore" : "Maximize"}
          className="titlebar-control flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {isMaximized ? (
            <Shrink className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Square className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
        <button type="button" onClick={() => void withWindow((window) => window.close())} aria-label="Close window" title="Close" className="titlebar-control flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
