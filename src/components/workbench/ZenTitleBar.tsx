import { Minus, PanelLeft, PanelLeftClose, Square, X } from "lucide-react";
import type { ReactNode } from "react";
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
  const SidebarIcon = sidebarOpen ? PanelLeftClose : PanelLeft;

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
        <button type="button" onClick={() => void withWindow((window) => window.toggleMaximize())} aria-label="Maximize window" title="Maximize" className="titlebar-control flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground">
          <Square className="h-3 w-3" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => void withWindow((window) => window.close())} aria-label="Close window" title="Close" className="titlebar-control flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
