import React, { useState, useRef, useEffect, useCallback } from "react";
import { StatusBar } from "@/components/Zen/StatusBar";
import { useUIStore } from "@/lib/stores/useUIStore";
import { 
  SIDEBAR_EXPANDED_WIDTH 
} from "@/lib/constants/design";
import { GripVertical } from "lucide-react";
import { ZenTitleBar } from "@/components/workbench/ZenTitleBar";

interface WorkspaceLayoutProps {
  sidebar?: React.ReactNode;
  main: React.ReactNode;
  rightPanel?: React.ReactNode;
  windowHeader?: React.ReactNode;
  showStatusBar?: boolean;
}

/**
 * Unified Workspace Layout for Zen Workbench.
 * Supports Left Sidebar, Main Content Area, and Right System Panel.
 * Synchronized with UI store for panel visibility.
 * 
 * NOTE: The primary (left) Activity Bar has been intentionally removed per design 
 * requirements to prevent redundancy with the Session Sidebar. 
 * PLEASE DO NOT RE-ADD A LEFT-SIDE ACTIVITY RAIL.
 */
export function WorkspaceLayout({ 
  sidebar, 
  main, 
  rightPanel,
  windowHeader,
  showStatusBar = true,
}: WorkspaceLayoutProps) {
  const { sidebarOpen, rightPanelOpen, setSidebarOpen } = useUIStore();
  const [isMobile, setIsMobile] = useState(false);
  
  // Custom right panel resizer state
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("zen_right_panel_width");
      return saved ? parseInt(saved, 10) : 320;
    }
    return 320;
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync saved width to localStorage
  useEffect(() => {
    localStorage.setItem("zen_right_panel_width", String(rightPanelWidth));
  }, [rightPanelWidth]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const syncMobileLayout = () => {
      const nextIsMobile = media.matches;
      setIsMobile(nextIsMobile);
      if (nextIsMobile) setSidebarOpen(false);
    };

    syncMobileLayout();
    media.addEventListener("change", syncMobileLayout);
    return () => media.removeEventListener("change", syncMobileLayout);
  }, [setSidebarOpen]);

  // Header overlays are rendered through a portal, so publish the same live
  // panel geometry globally. This keeps anchored status surfaces clear of the
  // resizable right workbench without coupling the header to this layout.
  const rightPanelVisible = !isMobile && rightPanelOpen && Boolean(rightPanel);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--zen-right-panel-offset",
      rightPanelVisible ? `${rightPanelWidth}px` : "0px",
    );

    return () => {
      root.style.removeProperty("--zen-right-panel-offset");
    };
  }, [rightPanelVisible, rightPanelWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Secondary activity bar is exactly 48px wide
      const secondaryBarWidth = 48;
      
      // Calculate new width relative to the viewport edge
      const newWidth = window.innerWidth - e.clientX - secondaryBarWidth;
      
      // Boundary constraints: Min 240px, Max 60% of window width
      const minWidth = 240;
      const maxWidth = window.innerWidth * 0.6;
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden text-foreground font-sans" ref={containerRef}>
      <ZenTitleBar>{windowHeader}</ZenTitleBar>
      <div className="flex-1 flex overflow-hidden relative">
        {/* 
          DANGER: DO NOT ADD A LEFT ACTIVITY BAR HERE. 
          The Session Sidebar handles all primary left-side navigation.
        */}

        {/* Sidebar Area: Rail or Expanded */}
        {sidebar && isMobile && sidebarOpen && (
          <>
            <button
              type="button"
              aria-label="Close sidebar"
              className="fixed inset-0 z-[59] bg-background/60 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <aside
              className="fixed inset-y-0 left-0 z-[60] w-[min(82vw,260px)] border-r border-border bg-card overflow-hidden md:hidden"
            >
              {React.cloneElement(sidebar as React.ReactElement<any>, {
              })}
            </aside>
          </>
        )}

        {sidebar && sidebarOpen && (
          <aside 
            className="hidden h-full border-r border-border bg-card shrink-0 overflow-hidden z-50 md:block"
            style={{ width: `${SIDEBAR_EXPANDED_WIDTH}px` }}
          >
            {React.cloneElement(sidebar as React.ReactElement<any>, {})}
          </aside>
        )}

        {/* Main Content Area: Stays permanently mounted to preserve DOM state/scrolls */}
        <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
          {main}
        </div>

        {/* Resizer Handle */}
        {rightPanelVisible && (
          <div 
            onMouseDown={handleMouseDown}
            className={`w-1 cursor-col-resize bg-transparent hover:bg-muted transition-colors duration-200 z-50 relative flex items-center justify-center select-none group ${isResizing ? "bg-muted" : ""}`}
            style={{ touchAction: "none" }}
          >
            <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-border bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <GripVertical className="h-2.5 w-2.5" />
            </div>
          </div>
        )}

        {/* Right Sidebar Panel: Mounted conditionally to prevent background render cycles */}
        <div 
          style={{ width: rightPanelVisible ? `${rightPanelWidth}px` : "0px" }}
          className={`h-full relative overflow-hidden shrink-0 ${isResizing ? "transition-none" : "transition-[width] duration-300 ease-in-out"}`}
        >
          <div className="h-full" style={{ width: `${rightPanelWidth}px` }}>
            {rightPanelVisible && rightPanel}
          </div>
        </div>

      </div>

      {/* Status Bar Footer */}
      {showStatusBar && (
        <footer className="hidden h-7 border-t border-border bg-card shrink-0 z-50 sm:block">
          <StatusBar />
        </footer>
      )}
    </div>
  );
}



