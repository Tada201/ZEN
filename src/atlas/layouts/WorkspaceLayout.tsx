import React, { useState, useRef, useEffect, useCallback } from "react";
import { StatusBar } from "@/components/Zen/StatusBar";
import { useUIStore } from "@/lib/stores/useUIStore";
import { 
  SIDEBAR_EXPANDED_WIDTH 
} from "@/lib/constants/design";
import { GripVertical } from "lucide-react";
import { ZenTitleBar } from "@/components/workbench/ZenTitleBar";
import { motion } from "framer-motion";
import { motionCssEasings, motionDurations, motionEasings, useReducedMotion } from "@/lib/motion";

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
  const reducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarPeekOpen, setSidebarPeekOpen] = useState(false);
  
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

  // A peek is a transient desktop affordance. Once the user explicitly opens
  // the sidebar, the normal flow owns its geometry again.
  useEffect(() => {
    if (sidebarOpen || isMobile) setSidebarPeekOpen(false);
  }, [sidebarOpen, isMobile]);

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

        {/* Desktop sidebar keeps its layout slot mounted so collapse is a
            reversible width transition instead of an unmount/remount snap. */}
        {sidebar && (
          <motion.aside
            aria-hidden={!sidebarOpen}
            data-motion-surface="left-sidebar-shell"
            className="hidden h-full shrink-0 overflow-hidden border-r border-border bg-card md:block"
            animate={{
              width: sidebarOpen ? SIDEBAR_EXPANDED_WIDTH : 0,
              opacity: sidebarOpen ? 1 : 0,
            }}
            transition={reducedMotion
              ? { duration: 0 }
              : { duration: motionDurations.surface, ease: motionEasings.standard }}
          >
            <div className="h-full w-[260px]">
              {React.cloneElement(sidebar as React.ReactElement<any>, {})}
            </div>
          </motion.aside>
        )}

        {/* Edge-triggered peek never participates in flex layout. It floats
            over the chat surface and closes as soon as the pointer leaves it. */}
        {sidebar && !isMobile && (
          <>
            {!sidebarOpen && (
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 z-[55] w-3"
                onPointerEnter={() => setSidebarPeekOpen(true)}
              />
            )}
            <motion.aside
              initial={false}
              animate={sidebarPeekOpen && !sidebarOpen
                ? { x: 0, opacity: 1 }
                : { x: -SIDEBAR_EXPANDED_WIDTH - 8, opacity: 0 }}
              transition={reducedMotion
                ? { duration: 0 }
                : { duration: motionDurations.surface, ease: motionEasings.shared }}
              onPointerLeave={() => setSidebarPeekOpen(false)}
              aria-hidden={!sidebarPeekOpen || sidebarOpen}
              data-motion-surface="left-sidebar-peek"
              className="pointer-events-none absolute inset-y-0 left-0 z-[60] hidden w-[260px] overflow-hidden border-r border-border bg-card shadow-[18px_0_42px_rgba(0,0,0,0.28)] md:block"
              style={{ pointerEvents: sidebarPeekOpen && !sidebarOpen ? "auto" : "none" }}
            >
              <div className="h-full w-[260px]">
                {React.cloneElement(sidebar as React.ReactElement<any>, {})}
              </div>
            </motion.aside>
          </>
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
          className="h-full relative overflow-hidden shrink-0"
          data-motion-surface="right-panel-shell"
          style={{
            width: rightPanelVisible ? `${rightPanelWidth}px` : "0px",
            transition: isResizing || reducedMotion
              ? "none"
              : `width ${motionDurations.surface * 1000}ms ${motionCssEasings.standard}`,
          }}
        >
          <div className="h-full" style={{ width: `${rightPanelWidth}px` }}>
            {rightPanelVisible && (
              <motion.div
                key="right-workbench-surface"
                initial={reducedMotion ? false : { opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={reducedMotion ? { duration: 0 } : { duration: motionDurations.surface, ease: motionEasings.standard }}
                className="h-full w-full"
              >
                {rightPanel}
              </motion.div>
            )}
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



