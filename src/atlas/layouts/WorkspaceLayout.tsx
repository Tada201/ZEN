import React from "react";
import { 
  Group as PanelGroup, 
  Panel, 
  Separator as PanelResizeHandle 
} from "react-resizable-panels";
import { ActivityBar } from "@/components/Zen/ActivityBar";
import { SecondaryActivityBar } from "@/components/Zen/SecondaryActivityBar";
import { StatusBar } from "@/components/Zen/StatusBar";
import { useUIStore } from "@/lib/stores/useUIStore";
import { cn } from "@/lib/utils";
import { 
  ACTIVITY_BAR_WIDTH, 
  SIDEBAR_COLLAPSED_WIDTH, 
  SIDEBAR_EXPANDED_WIDTH 
} from "@/lib/constants/design";

interface WorkspaceLayoutProps {
  sidebar?: React.ReactNode;
  main: React.ReactNode;
  rightPanel?: React.ReactNode;
  showActivityBar?: boolean;
  showStatusBar?: boolean;
}

/**
 * Unified Workspace Layout for Zen Workbench.
 * Supports Activity Bar, Left Sidebar, Main Content Area, and Right System Panel.
 * Synchronized with UI store for panel visibility.
 */
export function WorkspaceLayout({ 
  sidebar, 
  main, 
  rightPanel,
  showActivityBar = true,
  showStatusBar = true
}: WorkspaceLayoutProps) {
  const { sidebarOpen, rightPanelOpen } = useUIStore();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#050506] text-foreground font-sans">
      <div className="flex-1 flex overflow-hidden relative">
        {/* Activity Bar Rail - Optional */}
        {showActivityBar && (
          <aside className="w-[var(--activity-bar-width)] border-r border-white/5 bg-[#050506] flex flex-col py-4 z-50 shrink-0">
            <ActivityBar />
          </aside>
        )}

        {/* Sidebar Area: Rail or Expanded */}
        {sidebar && (
          <aside 
            className="h-full border-r border-white/5 bg-[#050506] shrink-0 overflow-hidden z-50 transition-all duration-300 ease-in-out"
            style={{ width: sidebarOpen ? `${SIDEBAR_EXPANDED_WIDTH}px` : `${SIDEBAR_COLLAPSED_WIDTH}px` }}
          >
            {React.cloneElement(sidebar as React.ReactElement<any>, { isCollapsed: !sidebarOpen })}
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 h-full overflow-hidden bg-background relative z-10 flex flex-col min-w-0">
          {main}
        </main>

        {/* Right Panel Area */}
        {rightPanel && rightPanelOpen && (
          <aside className="w-[350px] h-full border-l border-white/5 bg-[#050506] shrink-0 overflow-hidden z-40">
            {rightPanel}
          </aside>
        )}

        {/* Secondary Activity Bar Rail (Far Right) */}
        <aside className="w-[var(--activity-bar-width)] border-l border-white/5 bg-[#050506] flex flex-col py-4 z-50 shrink-0">
          <SecondaryActivityBar />
        </aside>
      </div>

      {/* Status Bar Footer */}
      {showStatusBar && (
        <footer className="h-7 border-t border-white/5 bg-[#050506] shrink-0 z-50">
          <StatusBar />
        </footer>
      )}
    </div>
  );
}



